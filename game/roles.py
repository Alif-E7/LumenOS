"""
Roles & Permissions — Data-driven role definitions and permission matrix.

Four roles map to the four key disciplines of space mission operations:
  MissionDirector, SystemsEngineer, ScienceOfficer, FlightController.

The permission matrix is a simple data structure (dict-of-sets) — no
if/else chains. Role bundling supports 1-4 players.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

from game.actions import ActionType


# ── Role definitions ─────────────────────────────────────────────────────────


class RoleName(str, Enum):
    """The four crew roles."""
    MISSION_DIRECTOR = "mission_director"
    SYSTEMS_ENGINEER = "systems_engineer"
    SCIENCE_OFFICER = "science_officer"
    FLIGHT_CONTROLLER = "flight_controller"


class RoleDefinition(BaseModel):
    """Full definition of a crew role."""
    name: RoleName
    display_name: str
    description: str
    color: str = "#FFFFFF"
    icon: str = "👤"


# ── Role catalog ─────────────────────────────────────────────────────────────

ROLE_DEFINITIONS: dict[RoleName, RoleDefinition] = {
    RoleName.MISSION_DIRECTOR: RoleDefinition(
        name=RoleName.MISSION_DIRECTOR,
        display_name="Mission Director",
        description="Oversees the entire mission: budget, priorities, event responses, and AI consultations.",
        color="#FFD700",
        icon="🎖️",
    ),
    RoleName.SYSTEMS_ENGINEER: RoleDefinition(
        name=RoleName.SYSTEMS_ENGINEER,
        display_name="Systems Engineer",
        description="Manages spacecraft subsystems: power, thermal, repairs, and hardware configuration.",
        color="#00BFFF",
        icon="🔧",
    ),
    RoleName.SCIENCE_OFFICER: RoleDefinition(
        name=RoleName.SCIENCE_OFFICER,
        display_name="Science Officer",
        description="Plans observations, collects science data, and manages downlink scheduling.",
        color="#32CD32",
        icon="🔬",
    ),
    RoleName.FLIGHT_CONTROLLER: RoleDefinition(
        name=RoleName.FLIGHT_CONTROLLER,
        display_name="Flight Controller",
        description="Controls orbital manoeuvres, thruster burns, and spacecraft attitude.",
        color="#FF6347",
        icon="🚀",
    ),
}


# ── Permission matrix (data-driven) ─────────────────────────────────────────
#
# Each role has a set of ActionTypes it is allowed to perform.
# SET_CONTROL_MODE is shared across all roles.

PERMISSION_MATRIX: dict[RoleName, set[ActionType]] = {
    RoleName.MISSION_DIRECTOR: {
        ActionType.ALLOCATE_BUDGET,
        ActionType.SET_PRIORITY,
        ActionType.RESPOND_TO_EVENT,
        ActionType.REQUEST_AI_PREDICTION,
        ActionType.SET_CONTROL_MODE,
    },
    RoleName.SYSTEMS_ENGINEER: {
        ActionType.TOGGLE_SUBSYSTEM,
        ActionType.SET_POWER_MODE,
        ActionType.ADJUST_THERMAL,
        ActionType.REPAIR_SUBSYSTEM,
        ActionType.SET_CONTROL_MODE,
    },
    RoleName.SCIENCE_OFFICER: {
        ActionType.COLLECT_DATA,
        ActionType.SCHEDULE_OBSERVATION,
        ActionType.DOWNLINK_DATA,
        ActionType.SET_CONTROL_MODE,
    },
    RoleName.FLIGHT_CONTROLLER: {
        ActionType.ADJUST_ORBIT,
        ActionType.FIRE_THRUSTER,
        ActionType.SET_ATTITUDE,
        ActionType.SET_CONTROL_MODE,
    },
}


def has_permission(role: RoleName, action_type: ActionType) -> bool:
    """Check if a role is permitted to perform an action type."""
    allowed = PERMISSION_MATRIX.get(role, set())
    return action_type in allowed


def get_allowed_actions(role: RoleName) -> set[ActionType]:
    """Return the set of action types allowed for a role."""
    return PERMISSION_MATRIX.get(role, set()).copy()


# ── Role bundling for 1-4 players ────────────────────────────────────────────

# Ordered list of all roles for deterministic assignment
_ALL_ROLES = [
    RoleName.MISSION_DIRECTOR,
    RoleName.FLIGHT_CONTROLLER,
    RoleName.SYSTEMS_ENGINEER,
    RoleName.SCIENCE_OFFICER,
]


class RoleAssignment(BaseModel):
    """Maps player IDs to their assigned roles."""
    player_roles: dict[str, list[RoleName]] = Field(default_factory=dict)

    @property
    def all_assigned_roles(self) -> set[RoleName]:
        roles: set[RoleName] = set()
        for role_list in self.player_roles.values():
            roles.update(role_list)
        return roles

    def can_perform(self, player_id: str, action_type: ActionType) -> bool:
        """Check if a specific player can perform an action based on their roles."""
        roles = self.player_roles.get(player_id, [])
        return any(has_permission(r, action_type) for r in roles)

    def get_player_actions(self, player_id: str) -> set[ActionType]:
        """Return the union of all actions a player can perform across their roles."""
        roles = self.player_roles.get(player_id, [])
        actions: set[ActionType] = set()
        for r in roles:
            actions.update(get_allowed_actions(r))
        return actions


def assign_roles(player_ids: list[str]) -> RoleAssignment:
    """
    Assign roles to 1-4 players, bundling extra roles when fewer than 4 players.

    - 4 players: one role each
    - 3 players: player 1 gets MissionDirector + ScienceOfficer
    - 2 players: each gets two roles
    - 1 player: all four roles

    Raises ValueError if player count is not 1-4.
    """
    n = len(player_ids)
    if n < 1 or n > 4:
        raise ValueError(f"Player count must be 1-4, got {n}")

    assignment: dict[str, list[RoleName]] = {}

    if n == 4:
        for pid, role in zip(player_ids, _ALL_ROLES):
            assignment[pid] = [role]
    elif n == 3:
        # Director + Science, Flight, Systems
        assignment[player_ids[0]] = [RoleName.MISSION_DIRECTOR, RoleName.SCIENCE_OFFICER]
        assignment[player_ids[1]] = [RoleName.FLIGHT_CONTROLLER]
        assignment[player_ids[2]] = [RoleName.SYSTEMS_ENGINEER]
    elif n == 2:
        # Director + Science, Flight + Systems
        assignment[player_ids[0]] = [RoleName.MISSION_DIRECTOR, RoleName.SCIENCE_OFFICER]
        assignment[player_ids[1]] = [RoleName.FLIGHT_CONTROLLER, RoleName.SYSTEMS_ENGINEER]
    elif n == 1:
        assignment[player_ids[0]] = list(_ALL_ROLES)

    return RoleAssignment(player_roles=assignment)
