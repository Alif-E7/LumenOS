"""
LumenOS Game Layer — Mission contracts, roles, events, scoring, and progression.

This package sits between the simulation engine and the API/UI layers,
providing the game mechanics that turn a physics simulation into an
educational strategy game.
"""

from game.contracts import MissionContract
from game.roles import RoleName
from game.state import GameState

__all__ = ["MissionContract", "RoleName", "GameState"]
