"""
Simulation Runtime — Central Deterministic Mission Runner independent of React.

Pipeline:
  Game Session Input → Initial State → Orbit/Environment → Spacecraft Systems →
  Mission Tasks → Event Director → Validated Player/Team Actions → State Transition →
  Telemetry → Objective Evaluation → Mission/Game Result.

Features:
- Headless execution for automated tests, CI, and AI controller benchmarking.
- Seeded, bit-exact determinism across identical input seeds and ordered actions.
- Event director with physical triggers, fair event rules, and choices.
- Failure injection with understandable educational recovery pathways.
- Authoritative command serialization, role permission checks, and idempotency.
- Bit-exact checkpoint save and restore with full state preservation.
"""

from __future__ import annotations

import copy
import math
import time
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from api.models.mission import EventSeverity, MissionEventTemplate, MissionDetail
from game.actions import ActionType
from game.command_resolver import (
    CommandResolver,
    CommandRequest,
    CommandAuditRecord,
    CommandStatus,
)
from game.contracts import MissionContract, ObjectiveDefinition, OutcomeType, Difficulty
from game.difficulty import apply_difficulty_to_contract
from game.events import EventDirector, ActiveEvent, EventConsequence, EventType
from game.faults import SystemFault, FaultType, create_fault
from game.objectives import ObjectiveEvaluator
from game.roles import RoleAssignment, assign_roles, RoleName
from game.scoring import MissionScorer, ScoreBreakdown
from game.state import GameState
from simulation.core import (
    SimulationRunner,
    SimulationConfig,
    SpacecraftConfig,
    SimulationSnapshot,
)
from simulation.physics.orbital import GroundTarget
from game.advisory import (
    LumenOSPredictiveScheduler,
    ForecastWindow,
    AdvisoryRecommendation,
    AdvisoryMetricsSummary,
    PredictionAccuracyRecord,
)


class HeadlessRunResult(BaseModel):
    """Complete summary artifact returned by headless mission runs."""
    session_id: str
    mission_id: str
    seed: int
    total_steps: int
    elapsed_seconds: float
    status: str                         # "completed" | "failed" | "running"
    outcome: Optional[OutcomeType] = None
    spacecraft_health_pct: float
    budget_remaining: float
    budget_total: float
    data_collected_mb: float
    data_downlinked_mb: float
    timestamped_telemetry: list[dict[str, Any]] = Field(default_factory=list)
    event_log: list[dict[str, Any]] = Field(default_factory=list)
    action_log: list[CommandAuditRecord] = Field(default_factory=list)
    objective_updates: list[dict[str, Any]] = Field(default_factory=list)
    decisions: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[dict[str, Any]] = Field(default_factory=list)
    prediction_records: list[dict[str, Any]] = Field(default_factory=list)
    score_breakdown: Optional[dict[str, Any]] = None
    final_score: float = 0.0
    grade: str = "N/A"
    stars: int = 0


class SimulationRuntime:
    """
    Central authoritative simulation runner independent of React.
    
    Orchestrates the complete 10-stage execution pipeline:
      1. Game Session Input & Initial State
      2. Orbit & Environmental Propagation
      3. Coupled Spacecraft Subsystem Accounting
      4. Mission Tasks & Ground Visibility
      5. Seeded Event Director Evaluation
      6. Validated Player/Team Action Serialization
      7. Subsystem State Transitions
      8. Telemetry Snapshot Packaging
      9. Objective Progression Evaluation
      10. Mission Scoring & Win/Fail Outcome Determination
    """

    def __init__(
        self,
        session_id: Optional[str] = None,
        mission_id: str = "wildfire",
        contract: Optional[MissionContract] = None,
        spacecraft_config: Optional[SpacecraftConfig] = None,
        targets: Optional[list[GroundTarget]] = None,
        seed: int = 42,
        player_ids: Optional[list[str]] = None,
        event_pool: Optional[list[MissionEventTemplate]] = None,
        time_step_seconds: float = 60.0,
        max_steps: Optional[int] = None,
    ):
        self.session_id = session_id or f"ses_{uuid4().hex[:12]}"
        self.mission_id = mission_id
        self.seed = seed
        self.time_step_seconds = time_step_seconds

        # Contract
        self.max_steps = max_steps or (contract.deadline_steps if contract else 1440)
        if contract is None:
            default_objs = [
                ObjectiveDefinition(
                    id="data_downlink",
                    description="Downlink at least 500 MB of science data",
                    target_value=500.0,
                    unit="MB",
                    weight=1.0,
                    is_primary=True,
                ),
                ObjectiveDefinition(
                    id="spacecraft_health",
                    description="Maintain spacecraft health above 70%",
                    target_value=70.0,
                    unit="%",
                    weight=0.8,
                    is_primary=False,
                ),
            ]
            self.contract = MissionContract(
                mission_id=mission_id,
                mission_name=mission_id.title(),
                description=f"Mission {mission_id}",
                difficulty=Difficulty.ENGINEER,
                deadline_steps=self.max_steps,
                budget=10000.0,
                objectives=default_objs,
                seed=seed,
            )
        else:
            self.contract = contract

        # Budget tracking
        self.budget_total = self.contract.budget
        self.budget_remaining = self.contract.budget

        # Spacecraft config & Physics Engine
        self.spacecraft = spacecraft_config or SpacecraftConfig()
        self.targets = targets or []
        self._sim = SimulationRunner(
            config=SimulationConfig(
                seed=seed,
                time_step_seconds=time_step_seconds,
                max_steps=self.max_steps,
            ),
            spacecraft=self.spacecraft,
            targets=self.targets,
        )

        # Crew roles
        pids = player_ids or ["solo_operator"]
        self.roles = assign_roles(pids)
        self.player_ids = pids

        # Event Director
        self.event_director = EventDirector(
            event_pool=event_pool or [],
            seed=seed,
            max_steps=self.max_steps,
        )

        # Command Resolver (Authoritative backend serializer)
        self.command_resolver = CommandResolver(roles=self.roles)

        # Objectives and Scorer
        self.objective_evaluator = ObjectiveEvaluator(self.contract.objectives)
        self.scorer = MissionScorer()

        # Operational status and active fault injections
        self.status: str = "running"      # running | completed | failed
        self.outcome: Optional[OutcomeType] = None
        self.active_faults: list[SystemFault] = []
        self.resolved_faults: list[SystemFault] = []

        # Audit, warnings, telemetry, decisions logs
        self.warnings_log: list[dict[str, Any]] = []
        self.decisions_log: list[dict[str, Any]] = []
        self.prediction_records: list[dict[str, Any]] = []
        self.telemetry_history: list[dict[str, Any]] = []
        self.objective_history: list[dict[str, Any]] = []

        # LumenOS signature predictive workload scheduler (Prompt 12)
        self.advisory_scheduler = LumenOSPredictiveScheduler(
            horizon_steps=5,
            time_step_seconds=self.time_step_seconds,
        )

        # Command queue for pending step execution
        self._pending_commands: list[CommandRequest] = []

    @property
    def action_log(self) -> list[dict[str, Any]]:
        """Unified action log exposing executed commands."""
        return [
            {
                "actor": r.actor,
                "action_type": r.action_type,
                "role": r.role,
                "step": r.step,
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                "params": r.params,
            }
            for r in self.command_resolver.audit_log
        ]

    @classmethod
    def from_mission(
        cls,
        mission: MissionDetail,
        spacecraft_config: Optional[SpacecraftConfig] = None,
        seed: int = 42,
        player_ids: Optional[list[str]] = None,
        time_step_seconds: float = 60.0,
        max_steps: Optional[int] = None,
        difficulty: Difficulty | str | None = None,
    ) -> SimulationRuntime:
        """Create a fully configured SimulationRuntime from a data-driven MissionDetail."""
        targets: list[GroundTarget] = []
        if getattr(mission, "targets", None):
            for i, t in enumerate(mission.targets):
                targets.append(
                    GroundTarget(
                        target_id=t.get("id", f"target_{i}"),
                        name=t.get("name", f"Target {i}"),
                        latitude_deg=float(t.get("latitude_deg", 0.0)),
                        longitude_deg=float(t.get("longitude_deg", 0.0)),
                        target_type=t.get("target_type", "surface"),
                        priority=int(t.get("priority", 1)),
                    )
                )

        objectives = [
            ObjectiveDefinition(
                id=obj.id,
                description=obj.description,
                target_value=obj.target_value,
                unit=obj.unit,
                weight=obj.weight,
                is_primary=getattr(obj, "is_primary", obj.weight >= 0.8),
            )
            for obj in mission.objectives
        ]

        total_steps = max_steps or int((mission.duration_hours * 3600) / time_step_seconds)
        diff = (
            Difficulty.from_int(mission.difficulty)
            if isinstance(mission.difficulty, int)
            else (Difficulty(mission.difficulty) if mission.difficulty else Difficulty.ENGINEER)
        )

        contract = MissionContract(
            mission_id=mission.id,
            mission_name=mission.name,
            description=mission.description,
            story=getattr(mission, "story", mission.description),
            difficulty=diff,
            deadline_steps=total_steps,
            budget=getattr(mission, "budget", 10000.0),
            permitted_components=getattr(mission, "permitted_components", {}),
            observation_tasks=getattr(mission, "observation_tasks", []),
            targets=getattr(mission, "targets", []),
            role_responsibilities=getattr(mission, "role_responsibilities", {}),
            rewards=getattr(mission, "rewards", {}),
            objectives=objectives,
            seed=seed,
        )

        if difficulty is not None:
            contract = apply_difficulty_to_contract(contract, difficulty)

        return cls(
            mission_id=mission.id,
            contract=contract,
            spacecraft_config=spacecraft_config,
            targets=targets,
            seed=seed,
            player_ids=player_ids,
            event_pool=mission.event_pool,
            time_step_seconds=time_step_seconds,
            max_steps=total_steps,
        )

    # ── Properties ───────────────────────────────────────────────────────────

    @property
    def current_step(self) -> int:
        return self._sim.current_step

    @property
    def elapsed_seconds(self) -> float:
        return self._sim.elapsed_seconds

    @property
    def is_finished(self) -> bool:
        return self.status in ("completed", "failed")

    @property
    def sim(self) -> SimulationRunner:
        return self._sim

    @property
    def events_resolved_well(self) -> int:
        return len([e for e in self.event_director.resolved_events if e.phase.value == "resolved"])

    # ── Budget Management ────────────────────────────────────────────────────

    def spend_budget(self, amount: float) -> bool:
        """Spend mission budget if sufficient funds exist."""
        if self.budget_remaining >= amount:
            self.budget_remaining -= amount
            return True
        return False

    # ── Fault Injection & Recovery ───────────────────────────────────────────

    def inject_fault(
        self,
        fault: SystemFault | FaultType | str,
        custom_severity: Optional[EventSeverity] = None,
        custom_effects: Optional[dict[str, Any]] = None,
    ) -> SystemFault:
        """
        Inject a controllable subsystem fault with educational cues and recovery actions.
        """
        if isinstance(fault, (FaultType, str)):
            fault_obj = create_fault(
                fault_type=fault,
                step=self.current_step,
                custom_severity=custom_severity,
                custom_effects=custom_effects,
            )
        else:
            fault_obj = fault
            fault_obj.injected_step = self.current_step

        self.active_faults.append(fault_obj)

        # Apply immediate physical effects to simulation
        self._apply_fault_to_sim(fault_obj)

        # Log warning
        self.warnings_log.append({
            "step": self.current_step,
            "timestamp": self.elapsed_seconds,
            "severity": fault_obj.severity.value,
            "source": f"fault_{fault_obj.subsystem}",
            "message": fault_obj.cue,
        })
        return fault_obj

    def resolve_fault(self, fault_id: str, action_name: str = "reset_fault") -> bool:
        """
        Mark a fault as resolved, reversing its physical degradation.
        """
        for i, f in enumerate(self.active_faults):
            if f.fault_id == fault_id:
                f.active = False
                f.resolved = True
                f.resolved_step = self.current_step
                f.resolution_action = action_name
                self.resolved_faults.append(f)
                self.active_faults.pop(i)

                # Revert fault effects
                self._revert_fault_from_sim(f)
                return True
        return False

    def _apply_fault_to_sim(self, fault: SystemFault) -> None:
        """Apply fault modifications to the simulation engine."""
        effects = fault.effects
        if "radiator_area_multiplier" in effects:
            mult = float(effects["radiator_area_multiplier"])
            self._sim._thermal.config.radiator_area_m2 *= mult

        if "pointing_error_deg" in effects:
            self._sim.spacecraft.pointing_error_deg = float(effects["pointing_error_deg"])

        if "payload_data_rate_multiplier" in effects:
            mult = float(effects["payload_data_rate_multiplier"])
            self._sim.spacecraft.payload_data_rate_mb_per_min *= mult

        if "cpu_usage_override_pct" in effects:
            self._sim._workload.state.cpu_usage_pct = float(effects["cpu_usage_override_pct"])
            self._sim._workload.state.cpu_overload_warning = True

    def _revert_fault_from_sim(self, fault: SystemFault) -> None:
        """Revert physical effects of a resolved fault."""
        effects = fault.effects
        if "radiator_area_multiplier" in effects:
            mult = float(effects["radiator_area_multiplier"])
            if mult > 0:
                self._sim._thermal.config.radiator_area_m2 /= mult

        if "pointing_error_deg" in effects:
            self._sim.spacecraft.pointing_error_deg = 0.0

        if "payload_data_rate_multiplier" in effects:
            mult = float(effects["payload_data_rate_multiplier"])
            if mult > 0:
                self._sim.spacecraft.payload_data_rate_mb_per_min /= mult

        if "cpu_usage_override_pct" in effects:
            self._sim._workload.state.cpu_overload_warning = False

    # ── Command Submission & Queueing ────────────────────────────────────────

    def submit_command(self, command: CommandRequest) -> CommandAuditRecord:
        """
        Validate and execute a single command immediately or queue it.
        """
        command.step = self.current_step
        return self.command_resolver.execute_command(
            command=command,
            current_step=self.current_step,
            runtime=self,
        )

    def submit_commands(self, commands: list[CommandRequest]) -> list[CommandAuditRecord]:
        """
        Submit a batch of concurrent commands (e.g. from multiple players in Co-op).
        Serialized and checked for conflicts sequentially.
        """
        records: list[CommandAuditRecord] = []
        for cmd in commands:
            records.append(self.submit_command(cmd))
        return records

    def queue_command(self, command: CommandRequest) -> None:
        """Queue a command to be executed at the start of the next step."""
        self._pending_commands.append(command)

    # ── Event Resolution ─────────────────────────────────────────────────────

    def resolve_event(
        self,
        event_id: str,
        choice_id: str,
        actor: str = "solo_operator",
    ) -> Optional[EventConsequence]:
        """
        Resolve an active event and apply its consequences to the simulation.
        """
        consequence = self.event_director.resolve_event(
            event_id=event_id,
            choice_id=choice_id,
            actor=actor,
        )
        if consequence is not None:
            # Apply consequence effects to simulation
            for k, v in consequence.effects.items():
                if k == "set_power_mode":
                    self._sim.apply_action({"type": "set_power_mode", "mode": str(v)})
                elif k == "operational_profile":
                    self._sim.apply_action({"type": "set_operational_profile", "profile": str(v)})
                elif k == "payload_active":
                    self._sim.apply_action({"type": "set_payload_active", "active": bool(v)})
                elif k == "adjust_radiator":
                    self._sim.apply_action({"type": "adjust_radiator", "delta_m2": float(v)})
                elif k == "purge_storage":
                    self._sim.apply_action({"type": "purge_storage", "amount_mb": float(v)})
                elif k == "repair_subsystem":
                    # Clear first active fault if any
                    if self.active_faults:
                        self.resolve_fault(self.active_faults[0].fault_id, action_name="reboot")
                else:
                    self._sim.apply_action({"type": k, "value": v})

            self.decisions_log.append({
                "step": self.current_step,
                "timestamp": self.elapsed_seconds,
                "event_id": event_id,
                "choice_id": choice_id,
                "actor": actor,
                "label": consequence.choice_label,
                "effects": consequence.effects,
            })

        return consequence

    # ── Core Step Loop (Pipeline Execution) ──────────────────────────────────

    def step(self, num_steps: int = 1) -> list[dict[str, Any]]:
        """
        Execute one or more steps through the full 10-stage simulation pipeline:
          1. Advance Simulation Physics (Orbit, Environment, Systems)
          2. Evaluate Active Fault Impacts
          3. Process Pending / Concurrent Player Commands (Validation & Serialization)
          4. Evaluate Mission Tasks (Targets & Contacts)
          5. Tick Seeded Event Director
          6. Apply State Transitions & Health Checks
          7. Objective Progression Updates
          8. Telemetry Snapshot Packaging
          9. Win / Fail Outcome Evaluation
        """
        if self.is_finished:
            return [{"error": "Mission session already finished", "status": self.status}]

        results: list[dict[str, Any]] = []

        for _ in range(max(1, num_steps)):
            if self.is_finished:
                break

            # 1 & 2. Advance simulation physics step
            snapshot = self._sim.step(steps=1)

            # Apply any ongoing fault impacts (e.g. forced pointing drift)
            for fault in self.active_faults:
                if "pointing_error_deg" in fault.effects:
                    self._sim.spacecraft.pointing_error_deg = float(fault.effects["pointing_error_deg"])

            # 3. Process pending queued commands through CommandResolver
            self.command_resolver.begin_step(snapshot.step)
            executed_records: list[CommandAuditRecord] = []
            if self._pending_commands:
                cmds_to_run = list(self._pending_commands)
                self._pending_commands.clear()
                for cmd in cmds_to_run:
                    rec = self.command_resolver.execute_command(
                        command=cmd,
                        current_step=snapshot.step,
                        runtime=self,
                    )
                    executed_records.append(rec)

            # 4. Tick Seeded Event Director (evaluates physical triggers + templates + active faults)
            new_events = self.event_director.tick(
                current_step=snapshot.step,
                sim_snapshot=snapshot,
                active_faults=self.active_faults,
            )

            # 5. Objective Progression Evaluation
            self._update_objectives(snapshot)

            # 6. Capture Warnings
            self._collect_step_warnings(snapshot)

            # 7. Check Outcome (Win/Fail/Health)
            self._check_outcome(snapshot)

            # 8. Package Telemetry
            telemetry = self._package_telemetry(snapshot)
            self.telemetry_history.append(telemetry)

            # 9. Evaluate Prior Predictions Against Measured Telemetry
            self.advisory_scheduler.evaluate_actuals(snapshot.step, telemetry)

            # 10. Generate Predictive 5-Minute Advisory Forecast & Recommendations
            forecast = self.advisory_scheduler.generate_forecast(snapshot.step, self)
            auto_executed = self.advisory_scheduler.tick_automation(self)
            self.prediction_records = [p.model_dump() for p in self.advisory_scheduler.prediction_accuracy_log]

            active_recs = (
                list(self.advisory_scheduler.active_recommendations.values())
                if isinstance(self.advisory_scheduler.active_recommendations, dict)
                else list(self.advisory_scheduler.active_recommendations)
            )

            step_summary = {
                "step": snapshot.step,
                "elapsed_seconds": snapshot.elapsed_seconds,
                "status": self.status,
                "spacecraft_health_pct": snapshot.spacecraft_health_pct,
                "budget_remaining": self.budget_remaining,
                "new_events": [e.model_dump() for e in new_events],
                "executed_commands": [r.model_dump() for r in executed_records],
                "auto_executed_advisories": [r if isinstance(r, dict) else r.model_dump() for r in auto_executed],
                "telemetry": telemetry,
                "advisory": {
                    "forecast": forecast.model_dump(),
                    "forecast_steps": [s.model_dump() for s in forecast.steps],
                    "recommendations": [r.model_dump() for r in active_recs],
                    "metrics": self.advisory_scheduler.compute_metrics_summary().model_dump(),
                    "auto_pilot_enabled": self.advisory_scheduler.auto_pilot_enabled,
                },
            }
            results.append(step_summary)

        return results

    # ── Headless Mission Runner ──────────────────────────────────────────────

    def run_headless(
        self,
        max_steps: Optional[int] = None,
        commands_by_step: Optional[dict[int, list[CommandRequest]]] = None,
        faults: Optional[list[tuple[int, SystemFault | FaultType | str]]] = None,
        event_decisions: Optional[dict[str, str]] = None,
    ) -> HeadlessRunResult:
        """
        Run a complete mission headlessly to completion for testing and benchmarks.

        Args:
            max_steps: Maximum steps to run (defaults to contract deadline).
            commands_by_step: Dict mapping step integer to list of commands to submit.
            faults: List of (step, fault) tuples to inject at designated steps.
            event_decisions: Dict mapping event template_id or event_type to choice_id for auto-responding.
        """
        target_steps = max_steps or self.max_steps
        cmd_map = commands_by_step or {}
        fault_map: dict[int, list[Any]] = {}
        if faults:
            for s, f in faults:
                fault_map.setdefault(s, []).append(f)

        dec_map = event_decisions or {}

        while not self.is_finished and self.current_step < target_steps:
            next_step = self.current_step + 1

            # Inject scheduled faults
            if next_step in fault_map:
                for f in fault_map[next_step]:
                    self.inject_fault(f)

            # Submit scheduled commands
            if next_step in cmd_map:
                for cmd in cmd_map[next_step]:
                    self.queue_command(cmd)

            # Advance 1 step
            step_res = self.step(1)

            # Auto-respond to active events if decision rules exist
            for evt in self.event_director.active_events:
                if evt.is_pending:
                    choice_to_make: Optional[str] = None
                    if evt.template_id in dec_map:
                        choice_to_make = dec_map[evt.template_id]
                    elif evt.event_type in dec_map:
                        choice_to_make = dec_map[evt.event_type]
                    elif evt.choices:
                        # Default to first choice if no specific rule
                        choice_to_make = evt.choices[0].id

                    if choice_to_make:
                        self.resolve_event(evt.event_id, choice_to_make, actor="automated_director")

        return self.get_headless_summary()

    def get_headless_summary(self) -> HeadlessRunResult:
        """Construct a complete HeadlessRunResult from current state."""
        score_breakdown = self.get_score_breakdown()
        latest_snap = self._sim.get_snapshot()
        health = latest_snap.spacecraft_health_pct if latest_snap else 100.0

        return HeadlessRunResult(
            session_id=self.session_id,
            mission_id=self.mission_id,
            seed=self.seed,
            total_steps=self.current_step,
            elapsed_seconds=self.elapsed_seconds,
            status=self.status,
            outcome=self.outcome or OutcomeType.WIN,
            spacecraft_health_pct=health,
            budget_remaining=self.budget_remaining,
            budget_total=self.budget_total,
            data_collected_mb=self._sim._comms.state.data_collected_mb,
            data_downlinked_mb=self._sim._comms.state.data_downlinked_mb,
            timestamped_telemetry=list(self.telemetry_history),
            event_log=[e.model_dump() for e in self.event_director.all_events],
            action_log=list(self.command_resolver.audit_log),
            objective_updates=list(self.objective_history),
            decisions=list(self.decisions_log),
            warnings=list(self.warnings_log),
            prediction_records=list(self.prediction_records),
            score_breakdown=score_breakdown.model_dump(),
            final_score=score_breakdown.total_score,
            grade=score_breakdown.grade.value,
            stars=score_breakdown.stars,
        )

    # ── Simulation Clock & Pause/Resume ──────────────────────────────────────

    def pause(self) -> None:
        """Pause the simulation clock."""
        self._sim.pause()

    def resume(self) -> None:
        """Resume running the simulation clock."""
        self._sim.resume()

    def set_speed(self, multiplier: float) -> None:
        """Set simulation speed multiplier (1x, 10x, 100x)."""
        self._sim.set_speed(multiplier)

    # ── Internal Helpers ─────────────────────────────────────────────────────

    def _update_objectives(self, snapshot: SimulationSnapshot) -> None:
        """Map simulation physical outputs to objective progress."""
        for obj in self.contract.objectives:
            obj_id = obj.id.lower()
            if "data" in obj_id or "downlink" in obj_id:
                self.objective_evaluator.update(obj.id, snapshot.comms.data_downlinked_mb)
            elif "coverage" in obj_id or "monitoring" in obj_id or "mapping" in obj_id:
                zones = snapshot.comms.data_collected_mb / 100.0
                self.objective_evaluator.update(obj.id, zones)
            elif "health" in obj_id or "survival" in obj_id:
                self.objective_evaluator.update(obj.id, snapshot.spacecraft_health_pct)
            elif "duration" in obj_id or "uptime" in obj_id or "hours" in obj_id or "continuous" in obj_id:
                hours = snapshot.elapsed_seconds / 3600.0
                self.objective_evaluator.update(obj.id, hours)
            elif "detection" in obj_id or "so2" in obj_id or "flare" in obj_id:
                val = max(1.0 if self.events_resolved_well > 0 else 0.0, snapshot.comms.data_collected_mb / 150.0)
                self.objective_evaluator.update(obj.id, min(obj.target_value, val))
            elif "latency" in obj_id or "warning" in obj_id or "rapid" in obj_id or "alert" in obj_id or "advisory" in obj_id:
                compliance = 95.0 if snapshot.comms.data_downlinked_mb > 0 else 0.0
                self.objective_evaluator.update(obj.id, compliance)
            elif "volume" in obj_id or "sar" in obj_id:
                self.objective_evaluator.update(obj.id, snapshot.comms.data_collected_mb)
            elif "thermal_margin" in obj_id or "overflow" in obj_id or "dose" in obj_id or "mitigation" in obj_id:
                self.objective_evaluator.update(obj.id, snapshot.spacecraft_health_pct)

        # Snapshot objective updates
        self.objective_history.append({
            "step": snapshot.step,
            "objectives": [
                {
                    "id": t.objective_id,
                    "current": t.current_value,
                    "target": t.target_value,
                    "fraction": t.fraction,
                    "is_complete": t.is_complete,
                }
                for t in self.objective_evaluator.trackers.values()
            ],
        })

    def _collect_step_warnings(self, snapshot: SimulationSnapshot) -> None:
        """Aggregate warnings raised across subsystems."""
        step = snapshot.step
        t = snapshot.elapsed_seconds

        if snapshot.power.low_power_warning:
            self.warnings_log.append({
                "step": step, "timestamp": t, "severity": "warning", "source": "power",
                "message": f"Battery low: {snapshot.power.battery_soc_pct:.1f}% remaining",
            })
        if snapshot.power.power_critical:
            self.warnings_log.append({
                "step": step, "timestamp": t, "severity": "critical", "source": "power",
                "message": "Power Critical: battery undervoltage survival threshold triggered",
            })
        if snapshot.thermal.overtemp_warning:
            self.warnings_log.append({
                "step": step, "timestamp": t, "severity": "warning", "source": "thermal",
                "message": f"High Temperature: {snapshot.thermal.temperature_c:.1f}°C exceeds nominal",
            })
        if snapshot.storage.storage_full_warning:
            self.warnings_log.append({
                "step": step, "timestamp": t, "severity": "warning", "source": "storage",
                "message": f"Storage Buffer Full: {snapshot.storage.used_pct:.1f}% used",
            })
        if snapshot.comms.transmission_interrupted:
            self.warnings_log.append({
                "step": step, "timestamp": t, "severity": "warning", "source": "comms",
                "message": "Comms Interrupted: antenna beam misalignment exceeds 5°",
            })

    def _check_outcome(self, snapshot: SimulationSnapshot) -> None:
        """Check early hard failures and end-of-mission criteria."""
        if snapshot.spacecraft_health_pct <= 0.0:
            self.status = "failed"
            self.outcome = OutcomeType.FAILURE
            return

        if self.budget_remaining < 0.0:
            self.status = "failed"
            self.outcome = OutcomeType.FAILURE
            return

        if snapshot.status == "completed" or snapshot.step >= self.max_steps:
            obj_scores = self.objective_evaluator.get_scores()
            self.outcome = self.contract.evaluate_outcome(
                objective_scores=obj_scores,
                budget_remaining=self.budget_remaining,
                spacecraft_health_pct=snapshot.spacecraft_health_pct,
                steps_elapsed=snapshot.step,
            )
            self.status = "completed"

    def get_score_breakdown(self) -> ScoreBreakdown:
        """Compute full score breakdown."""
        obj_results = self.objective_evaluator.get_results()
        data_target = 500.0
        for obj in self.contract.objectives:
            if "data" in obj.id.lower() or "downlink" in obj.id.lower():
                data_target = obj.target_value

        return self.scorer.calculate(
            objective_results=obj_results,
            spacecraft_health_pct=self._sim.get_snapshot().spacecraft_health_pct if self._sim.get_snapshot() else 100.0,
            data_collected_mb=self._sim._comms.state.data_collected_mb,
            data_target_mb=data_target,
            steps_elapsed=self.current_step,
            deadline_steps=self.max_steps,
            events_resolved_well=len([e for e in self.event_director.resolved_events if e.phase.value == "resolved"]),
            total_events=max(1, len(self.event_director.all_events)),
            budget_remaining=self.budget_remaining,
            total_budget=self.budget_total,
        )

    def _package_telemetry(self, snapshot: SimulationSnapshot) -> dict[str, Any]:
        """Construct full timestamped telemetry record."""
        return {
            "step": snapshot.step,
            "elapsed_seconds": snapshot.elapsed_seconds,
            "status": self.status,
            "spacecraft_health_pct": snapshot.spacecraft_health_pct,
            "budget_remaining": self.budget_remaining,
            "orbital": {
                "altitude_km": snapshot.orbital.altitude_km,
                "velocity_km_s": snapshot.orbital.velocity_km_s,
                "latitude_deg": snapshot.orbital.latitude_deg,
                "longitude_deg": snapshot.orbital.longitude_deg,
                "in_eclipse": snapshot.orbital.in_eclipse,
                "true_anomaly_deg": snapshot.orbital.true_anomaly_deg,
            },
            "power": {
                "solar_output_w": snapshot.power.solar_output_w,
                "solar_irradiance_w_m2": snapshot.power.solar_irradiance_w_m2,
                "total_load_w": snapshot.power.total_load_w,
                "net_power_w": snapshot.power.net_power_w,
                "battery_soc_wh": snapshot.power.battery_soc_wh,
                "battery_soc_pct": snapshot.power.battery_soc_pct,
                "battery_equivalent_full_cycles": snapshot.power.battery_equivalent_full_cycles,
                "low_power_warning": snapshot.power.low_power_warning,
                "power_critical": snapshot.power.power_critical,
            },
            "thermal": {
                "temperature_c": snapshot.thermal.temperature_c,
                "heat_input_w": snapshot.thermal.heat_input_w,
                "heat_rejected_w": snapshot.thermal.heat_rejected_w,
                "net_heat_w": snapshot.thermal.net_heat_w,
                "overtemp_warning": snapshot.thermal.overtemp_warning,
                "undertemp_warning": snapshot.thermal.undertemp_warning,
                "thermal_critical": snapshot.thermal.thermal_critical,
            },
            "comms": {
                "data_buffer_mb": snapshot.comms.data_buffer_mb,
                "data_collected_mb": snapshot.comms.data_collected_mb,
                "data_downlinked_mb": snapshot.comms.data_downlinked_mb,
                "in_contact": snapshot.comms.in_contact,
                "active_station": snapshot.comms.active_station,
                "elevation_deg": snapshot.comms.elevation_deg,
                "transmission_interrupted": snapshot.comms.transmission_interrupted,
            },
            "storage": {
                "used_pct": snapshot.storage.used_pct,
                "used_mb": snapshot.storage.used_mb,
                "free_mb": snapshot.storage.free_mb,
                "raw_data_mb": snapshot.storage.raw_data_mb,
                "processed_data_mb": snapshot.storage.processed_data_mb,
                "priority_alerts_mb": snapshot.storage.priority_alerts_mb,
                "dropped_overflow_mb": snapshot.storage.dropped_overflow_mb,
            },
            "workload": {
                "operational_profile": snapshot.workload.operational_profile.value,
                "cpu_usage_pct": snapshot.workload.cpu_usage_pct,
                "cpu_power_w": snapshot.workload.cpu_power_w,
                "cpu_overload_warning": snapshot.workload.cpu_overload_warning,
            },
        }

    # ── Checkpointing & State Restoration ────────────────────────────────────

    def save_checkpoint(self, metadata: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        """
        Create a bit-exact serializable checkpoint of the complete runtime state.
        """
        sim_ckpt = self._sim.save_checkpoint()
        ev_dict = self.event_director.to_dict()
        cmd_dict = self.command_resolver.to_dict()

        return {
            "version": "1.0",
            "session_id": self.session_id,
            "mission_id": self.mission_id,
            "seed": self.seed,
            "status": self.status,
            "outcome": self.outcome.value if self.outcome else None,
            "budget_total": self.budget_total,
            "budget_remaining": self.budget_remaining,
            "sim_checkpoint": sim_ckpt,
            "event_director": ev_dict,
            "command_resolver": cmd_dict,
            "active_faults": [f.model_dump() for f in self.active_faults],
            "resolved_faults": [f.model_dump() for f in self.resolved_faults],
            "warnings_log": copy.deepcopy(self.warnings_log),
            "decisions_log": copy.deepcopy(self.decisions_log),
            "prediction_records": copy.deepcopy(self.prediction_records),
            "advisory": {
                "auto_pilot_enabled": self.advisory_scheduler.auto_pilot_enabled,
                "auto_pilot_authorized_by": self.advisory_scheduler.auto_pilot_authorized_by,
                "recommendation_history": [r.model_dump() for r in self.advisory_scheduler.recommendation_history],
                "prediction_accuracy_log": [p.model_dump() for p in self.advisory_scheduler.prediction_accuracy_log],
            },
            "advisory_scheduler": {
                "auto_pilot_enabled": self.advisory_scheduler.auto_pilot_enabled,
                "auto_pilot_authorized_by": self.advisory_scheduler.auto_pilot_authorized_by,
                "recommendation_history": [r.model_dump() for r in self.advisory_scheduler.recommendation_history],
                "prediction_accuracy_log": [p.model_dump() for p in self.advisory_scheduler.prediction_accuracy_log],
            },
            "metadata": metadata or {},
        }

    def load_checkpoint(self, checkpoint: dict[str, Any]) -> bool:
        """
        Restore runtime state bit-for-bit from a checkpoint dictionary.
        """
        self.session_id = checkpoint["session_id"]
        self.mission_id = checkpoint["mission_id"]
        self.seed = checkpoint["seed"]
        self.status = checkpoint["status"]
        if checkpoint.get("outcome"):
            self.outcome = OutcomeType(checkpoint["outcome"])
        self.budget_total = checkpoint["budget_total"]
        self.budget_remaining = checkpoint["budget_remaining"]

        # Restore Simulation Physics
        self._sim.load_checkpoint(checkpoint["sim_checkpoint"])

        # Restore Event Director
        self.event_director.load_dict(checkpoint["event_director"])

        # Restore Command Resolver
        self.command_resolver.load_dict(checkpoint["command_resolver"])

        # Restore Faults
        self.active_faults = [SystemFault.model_validate(f) for f in checkpoint.get("active_faults", [])]
        self.resolved_faults = [SystemFault.model_validate(f) for f in checkpoint.get("resolved_faults", [])]

        # Restore Logs
        self.warnings_log = copy.deepcopy(checkpoint.get("warnings_log", []))
        self.decisions_log = copy.deepcopy(checkpoint.get("decisions_log", []))
        self.prediction_records = copy.deepcopy(checkpoint.get("prediction_records", []))
        adv_data = checkpoint.get("advisory", checkpoint.get("advisory_scheduler"))
        if adv_data:
            self.advisory_scheduler.auto_pilot_enabled = adv_data.get("auto_pilot_enabled", False)
            self.advisory_scheduler.auto_pilot_authorized_by = adv_data.get("auto_pilot_authorized_by")
            self.advisory_scheduler.recommendation_history = [
                AdvisoryRecommendation.model_validate(r) for r in adv_data.get("recommendation_history", [])
            ]
            self.advisory_scheduler.prediction_accuracy_log = [
                PredictionAccuracyRecord.model_validate(p) for p in adv_data.get("prediction_accuracy_log", [])
            ]
        return True
