"""
Authoritative Command Resolver — Concurrent command serialization, role validation, and idempotency.

Validates and serializes player commands on the authoritative backend.
Prevents duplicate execution (idempotency by command_id) and conflicting state updates.
Maintains a full audit trail of accepted and rejected commands with actor, role,
timestamp, and reason. Solo mode uses this exact same resolver without network participants.
"""

from __future__ import annotations

import copy
import time
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from game.actions import ActionType, ACTION_CATALOG, build_action
from game.roles import RoleName, RoleAssignment


class CommandStatus(str, Enum):
    """Execution status of a player/crew command."""
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    DUPLICATE = "duplicate"


class CommandRequest(BaseModel):
    """Inbound command envelope from player/client."""
    command_id: str = Field(default_factory=lambda: f"cmd_{uuid4().hex[:12]}")
    actor: str = Field(default="solo_operator", description="Player or client ID")
    role: str = Field(default="mission_director", description="RoleName or 'all'")
    action_type: str
    params: dict[str, Any] = Field(default_factory=dict)
    timestamp: float = Field(default_factory=time.time)
    step: Optional[int] = None


class CommandAuditRecord(BaseModel):
    """Immutable audit record of command evaluation and execution."""
    command_id: str
    step: int
    timestamp: float
    actor: str
    role: str
    action_type: str
    params: dict[str, Any] = Field(default_factory=dict)
    status: CommandStatus
    reason: str
    budget_cost: float = 0.0
    effects: list[dict[str, Any]] = Field(default_factory=list)


class CommandResolver:
    """
    Authoritative backend command serializer.

    Features:
    - Idempotency: Duplicate command IDs return cached results without re-executing.
    - Role Permission Verification: Server-side check against assigned roles.
    - Budget Verification: Prevents overspending mission budget.
    - Conflict Prevention: Prevents mutually exclusive or conflicting state mutations
      (e.g., enabling payload in SAFE mode, double attitude slew in same step).
    - Complete Audit Logging: Captures every command attempt.
    """

    def __init__(self, roles: Optional[RoleAssignment] = None):
        self._roles = roles
        self._processed_commands: dict[str, CommandAuditRecord] = {}
        self._audit_log: list[CommandAuditRecord] = []
        # Transient per-step conflict tracking
        self._step_mutations: dict[str, Any] = {}

    @property
    def audit_log(self) -> list[CommandAuditRecord]:
        return list(self._audit_log)

    @property
    def processed_commands(self) -> dict[str, CommandAuditRecord]:
        return dict(self._processed_commands)

    def set_roles(self, roles: RoleAssignment) -> None:
        """Update role assignment mapping."""
        self._roles = roles

    def begin_step(self, step: int) -> None:
        """Clear transient step mutation tracker for new step."""
        self._step_mutations.clear()

    def execute_command(
        self,
        command: CommandRequest,
        current_step: int,
        runtime: Any,
    ) -> CommandAuditRecord:
        """
        Validate, serialize, and apply a command against the mission runtime.
        """
        cmd_id = command.command_id
        timestamp = command.timestamp or time.time()

        # 1. Idempotency Check
        if cmd_id in self._processed_commands:
            cached = self._processed_commands[cmd_id]
            # Create a duplicate record referencing the original
            dup_record = CommandAuditRecord(
                command_id=cmd_id,
                step=current_step,
                timestamp=timestamp,
                actor=command.actor,
                role=command.role,
                action_type=command.action_type,
                params=command.params,
                status=CommandStatus.DUPLICATE,
                reason=f"Duplicate command_id '{cmd_id}' - already executed at step {cached.step}",
                budget_cost=0.0,
                effects=cached.effects,
            )
            self._audit_log.append(dup_record)
            return dup_record

        # 2. Session Finished Check
        if getattr(runtime, "is_finished", False):
            record = self._reject(
                command, current_step, "Session is already finished; no further commands accepted"
            )
            return record

        # 3. Parse Action Type
        try:
            act_type = ActionType(command.action_type)
        except ValueError:
            record = self._reject(
                command, current_step, f"Unknown action type: '{command.action_type}'"
            )
            return record

        # 4. Role Authorization Check
        if self._roles is not None:
            # Check if actor is recognized
            if command.actor not in self._roles.player_roles:
                # Solo mode or direct all-role override
                if command.actor != "solo_operator" and command.role != "all":
                    record = self._reject(
                        command, current_step, f"Actor '{command.actor}' not in session roster"
                    )
                    return record

            if not self._roles.can_perform(command.actor, act_type):
                # Verify specific role claim if passed
                player_roles = self._roles.player_roles.get(command.actor, set())
                role_names = [r.value for r in player_roles]
                record = self._reject(
                    command,
                    current_step,
                    f"Role permission denied: actor '{command.actor}' with roles {role_names} cannot execute '{act_type.value}'",
                )
                return record

        # 5. Build action & check cost
        try:
            player_action = build_action(act_type, command.params)
        except Exception as err:
            record = self._reject(command, current_step, f"Invalid action parameters: {err}")
            return record

        cost = player_action.budget_cost
        budget_remaining = getattr(runtime, "budget_remaining", 0.0)
        if cost > 0.0 and budget_remaining < cost:
            record = self._reject(
                command,
                current_step,
                f"Insufficient budget: requires {cost:.1f}, but only {budget_remaining:.1f} available",
            )
            return record

        # 6. Conflict & State Incompatibility Checks
        conflict_reason = self._check_conflicts(command, act_type, runtime)
        if conflict_reason:
            record = self._reject(command, current_step, conflict_reason)
            return record

        # 7. Apply Action Execution to Runtime
        applied_effects = []
        try:
            sim_result = self._dispatch_to_runtime(act_type, command.params, runtime)
            applied_effects = sim_result.get("changes", [])
            if not sim_result.get("applied", True):
                record = self._reject(
                    command, current_step, f"Execution failed: {sim_result.get('error', 'unknown error')}"
                )
                return record
        except Exception as ex:
            record = self._reject(command, current_step, f"Execution exception: {ex}")
            return record

        # Deduct budget
        if cost > 0.0:
            runtime.spend_budget(cost)

        # 8. Record Acceptance
        record = CommandAuditRecord(
            command_id=cmd_id,
            step=current_step,
            timestamp=timestamp,
            actor=command.actor,
            role=command.role,
            action_type=command.action_type,
            params=command.params,
            status=CommandStatus.ACCEPTED,
            reason="Command validated and applied successfully",
            budget_cost=cost,
            effects=[{"change": c} for c in applied_effects],
        )
        self._processed_commands[cmd_id] = record
        self._audit_log.append(record)
        return record

    def _check_conflicts(
        self,
        command: CommandRequest,
        act_type: ActionType,
        runtime: Any,
    ) -> Optional[str]:
        """Detect mutually exclusive or conflicting state mutations."""
        params = command.params
        spacecraft = getattr(runtime, "spacecraft", None)
        is_safe_mode = False
        if spacecraft:
            profile = getattr(spacecraft, "operational_profile", None)
            is_safe_mode = (profile is not None and getattr(profile, "value", str(profile)) == "SAFE")

        # Did another command in this step batch initiate SAFE mode?
        if self._step_mutations.get("set_safe_mode", False):
            is_safe_mode = True

        # Conflict 1: Cannot activate payload while in SAFE mode
        if is_safe_mode:
            if act_type == ActionType.TOGGLE_SUBSYSTEM and params.get("subsystem_name") == "payload" and params.get("active", True):
                return "Conflicting state: cannot activate payload while spacecraft is in SAFE mode"
            if act_type == ActionType.ADJUST_OBSERVATION_PLAN and params.get("payload_active", True):
                return "Conflicting state: cannot activate payload while spacecraft is in SAFE mode"
            if act_type == ActionType.COLLECT_DATA:
                return "Conflicting state: cannot collect science data while in SAFE mode"

        # Conflict 2: Conflicting attitude slews in same step
        if act_type in (ActionType.SET_ATTITUDE, ActionType.FIRE_THRUSTER):
            if "attitude_slew" in self._step_mutations:
                prior_actor = self._step_mutations["attitude_slew"]
                return f"Conflicting command: attitude orientation already modified in this step by '{prior_actor}'"
            self._step_mutations["attitude_slew"] = command.actor

        # Conflict 3: Conflicting power mode in same step
        if act_type == ActionType.SET_POWER_MODE or act_type == ActionType.ENTER_SAFE_MODE:
            if "power_mode" in self._step_mutations:
                return "Conflicting command: power mode already adjusted in this step"
            self._step_mutations["power_mode"] = command.actor
            if act_type == ActionType.ENTER_SAFE_MODE or params.get("mode") in ("safe", "emergency"):
                self._step_mutations["set_safe_mode"] = True

        return None

    def _dispatch_to_runtime(
        self,
        act_type: ActionType,
        params: dict[str, Any],
        runtime: Any,
    ) -> dict[str, Any]:
        """Translate action to simulation state mutation."""
        sim = getattr(runtime, "sim", getattr(runtime, "_sim", None))
        if sim is None:
            return {"applied": True, "changes": ["No simulation runner attached"]}

        sim_action: dict[str, Any] = {}

        if act_type == ActionType.SET_POWER_MODE:
            sim_action = {"type": "set_power_mode", "mode": params.get("mode", "normal")}

        elif act_type == ActionType.ENTER_SAFE_MODE:
            sim_action = {"type": "set_power_mode", "mode": "safe"}

        elif act_type == ActionType.REDUCE_WORKLOAD:
            profile = params.get("profile", "ECO")
            sim_action = {"type": "set_operational_profile", "profile": profile}

        elif act_type == ActionType.DELAY_NONCRITICAL_PROCESSING:
            # Pauses processing pipeline for requested steps
            sim_action = {"type": "set_operational_profile", "profile": "ECO"}

        elif act_type == ActionType.ADJUST_OBSERVATION_PLAN:
            active = params.get("payload_active", True)
            sim_action = {"type": "set_payload_active", "active": active}

        elif act_type == ActionType.TOGGLE_SUBSYSTEM:
            sub = params.get("subsystem_name", "")
            active = params.get("active", True)
            if sub == "payload":
                sim_action = {"type": "set_payload_active", "active": active}
            elif active:
                sim_action = {"type": "restore_load", "load_name": sub}
            else:
                sim_action = {"type": "shed_load", "load_name": sub}

        elif act_type == ActionType.ADJUST_THERMAL:
            sp = params.get("heater_setpoint_c", 5.0)
            sim_action = {"type": "adjust_heater_setpoint", "heater_setpoint_c": sp}

        elif act_type == ActionType.SET_ATTITUDE:
            mode = params.get("mode", "Nadir (Earth)")
            sim_action = {"type": "set_attitude", "mode": mode}

        elif act_type == ActionType.USE_LATER_PASS:
            # Safely interrupts comms until next window
            sim_action = {"type": "shed_load", "load_name": "comms_transmitter"}

        elif act_type == ActionType.REQUEUE_DATA:
            sim_action = {"type": "requeue_data", "queue": params.get("queue_name", "priority")}

        elif act_type == ActionType.RESET_FAULT:
            fid = params.get("fault_id", "")
            if hasattr(runtime, "resolve_fault"):
                runtime.resolve_fault(fid)
            sim_action = {"type": "restore_load", "load_name": "payload"}

        elif act_type == ActionType.REPAIR_SUBSYSTEM:
            sub = params.get("subsystem_name", "payload")
            sim_action = {"type": "restore_load", "load_name": sub}

        else:
            sim_action = {"type": act_type.value, **params}

        return sim.apply_action(sim_action)

    def _reject(
        self,
        command: CommandRequest,
        step: int,
        reason: str,
    ) -> CommandAuditRecord:
        """Create and log a rejected command record."""
        record = CommandAuditRecord(
            command_id=command.command_id,
            step=step,
            timestamp=command.timestamp or time.time(),
            actor=command.actor,
            role=command.role,
            action_type=command.action_type,
            params=command.params,
            status=CommandStatus.REJECTED,
            reason=reason,
            budget_cost=0.0,
            effects=[],
        )
        self._processed_commands[command.command_id] = record
        self._audit_log.append(record)
        return record

    # ── Checkpoint Serialization ─────────────────────────────────────────────

    def to_dict(self) -> dict[str, Any]:
        """Serialize resolver state for checkpoints."""
        return {
            "processed_commands": {
                k: v.model_dump() for k, v in self._processed_commands.items()
            },
            "audit_log": [r.model_dump() for r in self._audit_log],
        }

    def load_dict(self, data: dict[str, Any]) -> None:
        """Restore resolver state from checkpoint."""
        self._processed_commands = {
            k: CommandAuditRecord.model_validate(v)
            for k, v in data.get("processed_commands", {}).items()
        }
        self._audit_log = [
            CommandAuditRecord.model_validate(r)
            for r in data.get("audit_log", [])
        ]
