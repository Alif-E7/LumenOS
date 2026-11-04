"""
Player Actions — Typed, validated actions with real simulation effects.

Every action a player can take is modeled here. Actions are validated against
role permissions before being applied to the game/simulation state.
No dead buttons: every action type maps to concrete state changes.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Action type registry ─────────────────────────────────────────────────────


class ActionType(str, Enum):
    """All player action types. Each has real effects — no dead buttons."""
    # Flight Controller actions
    ADJUST_ORBIT = "adjust_orbit"
    FIRE_THRUSTER = "fire_thruster"
    SET_ATTITUDE = "set_attitude"

    # Systems Engineer actions
    TOGGLE_SUBSYSTEM = "toggle_subsystem"
    SET_POWER_MODE = "set_power_mode"
    ADJUST_THERMAL = "adjust_thermal"
    REPAIR_SUBSYSTEM = "repair_subsystem"

    # Science Officer actions
    COLLECT_DATA = "collect_data"
    SCHEDULE_OBSERVATION = "schedule_observation"
    DOWNLINK_DATA = "downlink_data"

    # Mission Director actions
    ALLOCATE_BUDGET = "allocate_budget"
    SET_PRIORITY = "set_priority"
    RESPOND_TO_EVENT = "respond_to_event"
    REQUEST_AI_PREDICTION = "request_ai_prediction"

    # Shared / multi-role
    SET_CONTROL_MODE = "set_control_mode"


# ── Action effects ───────────────────────────────────────────────────────────


class ActionEffect(BaseModel):
    """A single concrete effect that an action has on the game/simulation state."""
    target: str = Field(description="Dot-path to the state field affected, e.g. 'subsystems.power.values.output_w'")
    operation: str = Field(default="set", description="'set', 'add', 'multiply'")
    value: float = 0.0


# ── Action model ─────────────────────────────────────────────────────────────


class PlayerAction(BaseModel):
    """
    A validated player action ready to be applied.

    Every action carries its type, parameters, computed effects,
    and the budget cost (if any).
    """
    action_type: ActionType
    params: dict[str, Any] = Field(default_factory=dict)
    effects: list[ActionEffect] = Field(default_factory=list)
    budget_cost: float = Field(default=0.0, ge=0.0)
    description: str = ""


# ── Action definitions (data-driven) ────────────────────────────────────────

# Maps ActionType → default cost and effect templates.
# This is the single source of truth for what each action does.

ACTION_CATALOG: dict[ActionType, dict[str, Any]] = {
    ActionType.ADJUST_ORBIT: {
        "budget_cost": 500.0,
        "description": "Perform an orbital manoeuvre to adjust altitude/inclination.",
        "param_schema": {"delta_altitude_km": float, "delta_inclination_deg": float},
        "effect_templates": [
            {"target": "orbital.altitude_km", "operation": "add"},
            {"target": "orbital.inclination_deg", "operation": "add"},
        ],
    },
    ActionType.FIRE_THRUSTER: {
        "budget_cost": 200.0,
        "description": "Fire thrusters for a delta-v burn.",
        "param_schema": {"delta_v_ms": float, "direction": str},
        "effect_templates": [
            {"target": "subsystems.propulsion.values.fuel_remaining_kg", "operation": "add"},
        ],
    },
    ActionType.SET_ATTITUDE: {
        "budget_cost": 0.0,
        "description": "Set spacecraft attitude (orientation).",
        "param_schema": {"roll_deg": float, "pitch_deg": float, "yaw_deg": float},
        "effect_templates": [],
    },
    ActionType.TOGGLE_SUBSYSTEM: {
        "budget_cost": 0.0,
        "description": "Enable or disable a subsystem.",
        "param_schema": {"subsystem_name": str, "active": bool},
        "effect_templates": [
            {"target": "subsystems.{subsystem_name}.active", "operation": "set"},
        ],
    },
    ActionType.SET_POWER_MODE: {
        "budget_cost": 0.0,
        "description": "Switch spacecraft power mode (normal/low-power/emergency).",
        "param_schema": {"mode": str},
        "effect_templates": [],
    },
    ActionType.ADJUST_THERMAL: {
        "budget_cost": 50.0,
        "description": "Adjust thermal control parameters.",
        "param_schema": {"heater_setpoint_c": float},
        "effect_templates": [
            {"target": "subsystems.thermal.values.heater_setpoint_c", "operation": "set"},
        ],
    },
    ActionType.REPAIR_SUBSYSTEM: {
        "budget_cost": 1000.0,
        "description": "Attempt to repair a degraded subsystem.",
        "param_schema": {"subsystem_name": str},
        "effect_templates": [
            {"target": "subsystems.{subsystem_name}.health_pct", "operation": "add"},
        ],
    },
    ActionType.COLLECT_DATA: {
        "budget_cost": 0.0,
        "description": "Activate payload to collect science data.",
        "param_schema": {"target_zone": str, "duration_steps": int},
        "effect_templates": [
            {"target": "data_collected_mb", "operation": "add"},
        ],
    },
    ActionType.SCHEDULE_OBSERVATION: {
        "budget_cost": 0.0,
        "description": "Schedule a future observation window.",
        "param_schema": {"target_zone": str, "start_step": int, "end_step": int},
        "effect_templates": [],
    },
    ActionType.DOWNLINK_DATA: {
        "budget_cost": 50.0,
        "description": "Transmit collected data to ground station.",
        "param_schema": {"data_mb": float},
        "effect_templates": [
            {"target": "data_collected_mb", "operation": "add"},
        ],
    },
    ActionType.ALLOCATE_BUDGET: {
        "budget_cost": 0.0,  # meta-action, cost is the allocation itself
        "description": "Allocate Engineering Credits to a subsystem or task.",
        "param_schema": {"target": str, "amount": float},
        "effect_templates": [],
    },
    ActionType.SET_PRIORITY: {
        "budget_cost": 0.0,
        "description": "Set the priority ranking of mission objectives.",
        "param_schema": {"objective_id": str, "priority": int},
        "effect_templates": [],
    },
    ActionType.RESPOND_TO_EVENT: {
        "budget_cost": 0.0,
        "description": "Choose a response to an active mission event.",
        "param_schema": {"event_id": str, "choice_id": str},
        "effect_templates": [],  # effects come from the event choice
    },
    ActionType.REQUEST_AI_PREDICTION: {
        "budget_cost": 100.0,
        "description": "Ask LumenOS AI for a prediction (may be wrong!).",
        "param_schema": {"query": str},
        "effect_templates": [],
    },
    ActionType.SET_CONTROL_MODE: {
        "budget_cost": 0.0,
        "description": "Switch between manual, autopilot, or AI control.",
        "param_schema": {"mode": str},
        "effect_templates": [],
    },
}


def build_action(
    action_type: ActionType,
    params: dict[str, Any],
    budget_override: float | None = None,
) -> PlayerAction:
    """
    Build a validated PlayerAction from type and params.

    Looks up the action catalog for default cost and effect templates,
    then substitutes param values into effect targets.
    """
    catalog_entry = ACTION_CATALOG.get(action_type, {})
    cost = budget_override if budget_override is not None else catalog_entry.get("budget_cost", 0.0)
    desc = catalog_entry.get("description", action_type.value)

    effects: list[ActionEffect] = []
    for tmpl in catalog_entry.get("effect_templates", []):
        target = tmpl["target"]
        # Template substitution: {param_name} → actual value
        for k, v in params.items():
            target = target.replace(f"{{{k}}}", str(v))
        # Determine the value from params
        value = 0.0
        if tmpl["operation"] == "set" and "active" in params:
            value = float(params["active"])
        elif tmpl["operation"] == "add":
            # Use the first numeric param as the delta
            for v in params.values():
                if isinstance(v, (int, float)):
                    value = float(v)
                    break
        effects.append(ActionEffect(
            target=target,
            operation=tmpl["operation"],
            value=value,
        ))

    return PlayerAction(
        action_type=action_type,
        params=params,
        effects=effects,
        budget_cost=cost,
        description=desc,
    )
