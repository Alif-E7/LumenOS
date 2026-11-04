"""
Scoring — Transparent, explainable score calculation and grade assignment.

Every point is accounted for and can be traced back to a specific category.
The scoring system produces a full breakdown so players understand exactly
how their grade was determined.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

from game.objectives import ObjectiveResult


# ── Grade scale ──────────────────────────────────────────────────────────────


class Grade(str, Enum):
    """Letter grades from A+ through F."""
    A_PLUS = "A+"
    A = "A"
    A_MINUS = "A-"
    B_PLUS = "B+"
    B = "B"
    B_MINUS = "B-"
    C_PLUS = "C+"
    C = "C"
    C_MINUS = "C-"
    D = "D"
    F = "F"


# Threshold mapping: minimum score fraction → grade
_GRADE_THRESHOLDS: list[tuple[float, Grade]] = [
    (0.97, Grade.A_PLUS),
    (0.93, Grade.A),
    (0.90, Grade.A_MINUS),
    (0.87, Grade.B_PLUS),
    (0.83, Grade.B),
    (0.80, Grade.B_MINUS),
    (0.77, Grade.C_PLUS),
    (0.73, Grade.C),
    (0.70, Grade.C_MINUS),
    (0.60, Grade.D),
    (0.00, Grade.F),
]


def score_to_grade(score_fraction: float) -> Grade:
    """Convert a score fraction (0-1) to a letter grade."""
    for threshold, grade in _GRADE_THRESHOLDS:
        if score_fraction >= threshold:
            return grade
    return Grade.F


# ── Scoring categories ───────────────────────────────────────────────────────


class ScoringCategory(str, Enum):
    """Categories that contribute to the total score."""
    OBJECTIVES = "objectives"
    HEALTH = "health"
    DATA = "data"
    TIME = "time"
    EVENTS = "events"
    BUDGET = "budget"


class CategoryScore(BaseModel):
    """Score contribution from a single category."""
    category: ScoringCategory
    raw_score: float = Field(description="Unnormalised points in this category")
    weight: float = Field(description="Category weight (0-1)")
    weighted_score: float = Field(description="raw_score * weight")
    max_possible: float = Field(description="Maximum achievable in this category")
    explanation: str = ""


class ScoreBreakdown(BaseModel):
    """Full transparent scoring breakdown."""
    total_score: float
    max_score: float
    score_fraction: float = Field(ge=0.0, le=1.0)
    grade: Grade
    categories: list[CategoryScore] = Field(default_factory=list)
    objective_results: list[ObjectiveResult] = Field(default_factory=list)

    @property
    def explanation(self) -> str:
        lines = [f"Grade: {self.grade.value} — {self.total_score:.1f}/{self.max_score:.1f} ({self.score_fraction:.0%})"]
        lines.append("")
        for cat in self.categories:
            lines.append(f"  {cat.category.value:12s}: {cat.weighted_score:6.1f} / {cat.max_possible * cat.weight:6.1f}  ({cat.explanation})")
        return "\n".join(lines)


# ── Score configuration ──────────────────────────────────────────────────────


class ScoringConfig(BaseModel):
    """Weights for each scoring category."""
    max_score: float = 100.0
    objectives_weight: float = 0.35
    health_weight: float = 0.20
    data_weight: float = 0.15
    time_weight: float = 0.10
    events_weight: float = 0.10
    budget_weight: float = 0.10


# ── Scorer ───────────────────────────────────────────────────────────────────


class MissionScorer:
    """
    Calculates transparent, explainable mission scores.

    All calculations are pure — no hidden state, no random factors.
    """

    def __init__(self, config: ScoringConfig | None = None):
        self.config = config or ScoringConfig()

    def calculate(
        self,
        objective_results: list[ObjectiveResult],
        spacecraft_health_pct: float,
        data_collected_mb: float,
        data_target_mb: float,
        steps_elapsed: int,
        deadline_steps: int,
        events_resolved_well: int,
        total_events: int,
        budget_remaining: float,
        total_budget: float,
    ) -> ScoreBreakdown:
        """
        Calculate the full score breakdown.

        Every input contributes transparently to the final score.
        """
        categories: list[CategoryScore] = []
        max_score = self.config.max_score

        # 1. Objectives score
        if objective_results:
            obj_fraction = sum(r.fraction for r in objective_results) / len(objective_results)
        else:
            obj_fraction = 0.0
        obj_raw = obj_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.OBJECTIVES,
            raw_score=obj_raw,
            weight=self.config.objectives_weight,
            weighted_score=obj_raw * self.config.objectives_weight,
            max_possible=max_score,
            explanation=f"{obj_fraction:.0%} of objectives achieved",
        ))

        # 2. Health score
        health_fraction = min(max(spacecraft_health_pct / 100.0, 0.0), 1.0)
        health_raw = health_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.HEALTH,
            raw_score=health_raw,
            weight=self.config.health_weight,
            weighted_score=health_raw * self.config.health_weight,
            max_possible=max_score,
            explanation=f"Spacecraft health at {spacecraft_health_pct:.0f}%",
        ))

        # 3. Data score
        data_fraction = min(data_collected_mb / data_target_mb, 1.0) if data_target_mb > 0 else 1.0
        data_raw = data_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.DATA,
            raw_score=data_raw,
            weight=self.config.data_weight,
            weighted_score=data_raw * self.config.data_weight,
            max_possible=max_score,
            explanation=f"{data_collected_mb:.0f}/{data_target_mb:.0f} MB collected",
        ))

        # 4. Time bonus (finishing early is rewarded)
        if deadline_steps > 0:
            time_fraction = max(1.0 - (steps_elapsed / deadline_steps), 0.0)
        else:
            time_fraction = 1.0
        time_raw = time_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.TIME,
            raw_score=time_raw,
            weight=self.config.time_weight,
            weighted_score=time_raw * self.config.time_weight,
            max_possible=max_score,
            explanation=f"Completed in {steps_elapsed}/{deadline_steps} steps",
        ))

        # 5. Events score
        events_fraction = (events_resolved_well / total_events) if total_events > 0 else 1.0
        events_raw = events_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.EVENTS,
            raw_score=events_raw,
            weight=self.config.events_weight,
            weighted_score=events_raw * self.config.events_weight,
            max_possible=max_score,
            explanation=f"{events_resolved_well}/{total_events} events handled well",
        ))

        # 6. Budget score
        budget_fraction = (budget_remaining / total_budget) if total_budget > 0 else 1.0
        budget_fraction = max(min(budget_fraction, 1.0), 0.0)
        budget_raw = budget_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.BUDGET,
            raw_score=budget_raw,
            weight=self.config.budget_weight,
            weighted_score=budget_raw * self.config.budget_weight,
            max_possible=max_score,
            explanation=f"{budget_remaining:.0f}/{total_budget:.0f} credits remaining",
        ))

        # Total
        total = sum(c.weighted_score for c in categories)
        total_max = sum(c.max_possible * c.weight for c in categories)
        fraction = total / total_max if total_max > 0 else 0.0
        fraction = min(max(fraction, 0.0), 1.0)

        return ScoreBreakdown(
            total_score=round(total, 2),
            max_score=round(total_max, 2),
            score_fraction=round(fraction, 4),
            grade=score_to_grade(fraction),
            categories=categories,
            objective_results=objective_results,
        )
