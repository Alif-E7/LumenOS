"""
GameState — Unified game state wrapping simulation + game-specific data.

This is the authoritative state container for a running mission session.
It combines:
- Simulation snapshot (physics engine output)
- Objective progress
- Event history
- Budget remaining
- Score-so-far
- Control mode
- Action log

Both solo and multiplayer modes use the same GameState.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from game.contracts import MissionContract, OutcomeType
from game.events import ActiveEvent, EventDirector
from game.objectives import ObjectiveEvaluator, ObjectiveProgress, ObjectiveResult
from game.scoring import MissionScorer, ScoreBreakdown, ScoringConfig


class ActionLogEntry(BaseModel):
    """Record of a player action in the game."""
    step: int
    player_id: str
    action_type: str
    params: dict[str, Any] = Field(default_factory=dict)
    result: str = ""
    budget_cost: float = 0.0


class GameState(BaseModel):
    """
    Complete game state for a running mission.

    This wraps the simulation engine state with game-layer concerns:
    objectives, events, budget, scoring, and action history.
    """
    # Identity
    session_id: str = ""
    mission_id: str = ""
    seed: int = 42

    # Progress
    current_step: int = 0
    elapsed_seconds: float = 0.0
    status: str = "pending"             # pending | running | completed | failed

    # Contract / Budget
    budget_total: float = 10000.0
    budget_remaining: float = 10000.0

    # Objectives (serialised as list for Pydantic)
    objectives: list[ObjectiveProgress] = Field(default_factory=list)

    # Events
    active_events: list[ActiveEvent] = Field(default_factory=list)
    resolved_event_count: int = 0
    well_handled_event_count: int = 0

    # Data
    data_collected_mb: float = 0.0
    data_downlinked_mb: float = 0.0

    # Health
    spacecraft_health_pct: float = 100.0

    # Score
    current_score: float = 0.0
    outcome: Optional[OutcomeType] = None

    # Action log
    action_log: list[ActionLogEntry] = Field(default_factory=list)

    # Control
    control_mode: str = "manual"

    model_config = {"arbitrary_types_allowed": True}

    def spend_budget(self, amount: float) -> bool:
        """Attempt to spend mission budget. Returns True if sufficient funds."""
        if self.budget_remaining >= amount:
            self.budget_remaining -= amount
            return True
        return False

    def log_action(
        self,
        step: int,
        player_id: str,
        action_type: str,
        params: dict[str, Any] | None = None,
        result: str = "",
        budget_cost: float = 0.0,
    ) -> None:
        """Record an action in the log."""
        self.action_log.append(ActionLogEntry(
            step=step,
            player_id=player_id,
            action_type=action_type,
            params=params or {},
            result=result,
            budget_cost=budget_cost,
        ))

    def get_objective_scores(self) -> dict[str, float]:
        """Return objective_id → fraction mapping."""
        return {o.objective_id: o.fraction for o in self.objectives}

    def to_summary(self) -> dict[str, Any]:
        """Produce a concise summary for broadcasting to clients."""
        return {
            "session_id": self.session_id,
            "mission_id": self.mission_id,
            "step": self.current_step,
            "elapsed_seconds": self.elapsed_seconds,
            "status": self.status,
            "budget_remaining": self.budget_remaining,
            "spacecraft_health_pct": self.spacecraft_health_pct,
            "data_collected_mb": self.data_collected_mb,
            "current_score": self.current_score,
            "control_mode": self.control_mode,
            "active_event_count": len(self.active_events),
            "objectives_complete": sum(1 for o in self.objectives if o.is_complete),
            "objectives_total": len(self.objectives),
            "outcome": self.outcome.value if self.outcome else None,
        }

