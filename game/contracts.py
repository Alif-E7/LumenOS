"""
Mission Contracts — Define what a mission asks from the player.

A MissionContract wraps the objectives, budget, deadline, and win/fail conditions
that govern a single play session. Contracts are built from mission YAML configs
and may be modified by difficulty settings.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator


# ── Enums ────────────────────────────────────────────────────────────────────


class Difficulty(str, Enum):
    """Mission difficulty tiers."""
    CADET = "cadet"          # 1
    ENGINEER = "engineer"    # 2
    SPECIALIST = "specialist"  # 3
    COMMANDER = "commander"  # 4
    LEGENDARY = "legendary"  # 5

    @classmethod
    def from_int(cls, level: int) -> Difficulty:
        mapping = {1: cls.CADET, 2: cls.ENGINEER, 3: cls.SPECIALIST,
                   4: cls.COMMANDER, 5: cls.LEGENDARY}
        return mapping.get(level, cls.ENGINEER)


class OutcomeType(str, Enum):
    """Possible mission outcomes."""
    WIN = "win"
    PARTIAL_SUCCESS = "partial_success"
    FAILURE = "failure"


# ── Objective definitions ────────────────────────────────────────────────────


class ObjectiveDefinition(BaseModel):
    """A single objective within a contract."""
    id: str
    description: str
    target_value: float = Field(default=1.0, ge=0.0)
    unit: str = ""
    weight: float = Field(default=1.0, ge=0.0)
    is_primary: bool = True
    partial_threshold: float = Field(
        default=0.5, ge=0.0, le=1.0,
        description="Fraction of target_value for partial credit",
    )


# ── Conditions ───────────────────────────────────────────────────────────────


class WinCondition(BaseModel):
    """Rules that determine a win."""
    min_primary_completion_pct: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="Fraction of primary objectives that must be fully met",
    )
    min_overall_score_pct: float = Field(
        default=0.6, ge=0.0, le=1.0,
        description="Minimum overall score fraction for a win",
    )


class FailCondition(BaseModel):
    """Rules that trigger an outright failure."""
    budget_exceeded: bool = Field(
        default=True, description="Fail if budget is fully exhausted",
    )
    deadline_exceeded: bool = Field(
        default=True, description="Fail if deadline is exceeded with no objectives met",
    )
    spacecraft_destroyed: bool = Field(
        default=True, description="Fail if spacecraft health reaches 0",
    )
    min_health_pct: float = Field(
        default=0.0, ge=0.0, le=100.0,
        description="Health % below which mission auto-fails (0 = only on destruction)",
    )


# ── Contract ─────────────────────────────────────────────────────────────────


class MissionContract(BaseModel):
    """
    The binding agreement for a mission play session.

    Defines objectives, constraints, and the rules for determining
    win / partial-success / failure.
    """
    mission_id: str
    mission_name: str
    description: str = ""
    difficulty: Difficulty = Difficulty.ENGINEER
    deadline_steps: int = Field(
        default=1440, ge=1,
        description="Maximum simulation steps before deadline",
    )
    budget: float = Field(
        default=10000.0, ge=0.0,
        description="Mission budget in Engineering Credits",
    )
    objectives: list[ObjectiveDefinition] = Field(default_factory=list, min_length=1)
    win_condition: WinCondition = Field(default_factory=WinCondition)
    fail_condition: FailCondition = Field(default_factory=FailCondition)
    seed: int = 42

    # ── Derived helpers ──────────────────────────────────────────────────

    @property
    def primary_objectives(self) -> list[ObjectiveDefinition]:
        return [o for o in self.objectives if o.is_primary]

    @property
    def optional_objectives(self) -> list[ObjectiveDefinition]:
        return [o for o in self.objectives if not o.is_primary]

    @property
    def total_weight(self) -> float:
        return sum(o.weight for o in self.objectives)

    # ── Outcome evaluation ───────────────────────────────────────────────

    def evaluate_outcome(
        self,
        objective_scores: dict[str, float],
        budget_remaining: float,
        spacecraft_health_pct: float,
        steps_elapsed: int,
    ) -> OutcomeType:
        """
        Determine the mission outcome given current progress.

        Args:
            objective_scores: mapping of objective_id → achieved fraction (0-1)
            budget_remaining: remaining budget
            spacecraft_health_pct: current health percentage
            steps_elapsed: number of simulation steps elapsed

        Returns:
            OutcomeType — WIN, PARTIAL_SUCCESS, or FAILURE
        """
        # Check hard failure conditions
        if self.fail_condition.spacecraft_destroyed and spacecraft_health_pct <= 0:
            return OutcomeType.FAILURE
        if self.fail_condition.min_health_pct > 0 and spacecraft_health_pct < self.fail_condition.min_health_pct:
            return OutcomeType.FAILURE
        if self.fail_condition.budget_exceeded and budget_remaining < 0:
            return OutcomeType.FAILURE

        # Calculate primary objective completion
        primaries = self.primary_objectives
        if primaries:
            completed_primaries = sum(
                1 for o in primaries
                if objective_scores.get(o.id, 0.0) >= 1.0
            )
            primary_pct = completed_primaries / len(primaries)
        else:
            primary_pct = 1.0

        # Calculate overall score
        if self.total_weight > 0:
            overall_score = sum(
                objective_scores.get(o.id, 0.0) * o.weight
                for o in self.objectives
            ) / self.total_weight
        else:
            overall_score = 0.0

        # Win check
        if (primary_pct >= self.win_condition.min_primary_completion_pct
                and overall_score >= self.win_condition.min_overall_score_pct):
            return OutcomeType.WIN

        # Deadline failure check
        if self.fail_condition.deadline_exceeded and steps_elapsed >= self.deadline_steps:
            # Still give partial credit if some objectives met
            if overall_score > 0:
                return OutcomeType.PARTIAL_SUCCESS
            return OutcomeType.FAILURE

        # In-progress: partial if some objectives are making progress
        if overall_score >= self.win_condition.min_overall_score_pct * 0.5:
            return OutcomeType.PARTIAL_SUCCESS

        return OutcomeType.FAILURE
