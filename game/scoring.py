"""
Scoring — Transparent, explainable score calculation and grade assignment.

Every point is accounted for and can be traced back to a specific category.
The scoring system produces a full breakdown so players understand exactly
how their grade was determined.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

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
    display_name: str = ""
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
    stars: int = Field(default=0, ge=0, le=3)
    star_criteria: list[str] = Field(default_factory=list)
    categories: list[CategoryScore] = Field(default_factory=list)
    objective_results: list[ObjectiveResult] = Field(default_factory=list)

    # Prompt 15 deliverables: Objectives, Safety Caps, Plain-language causes, Resources
    primary_objectives_completed: int = 0
    primary_objectives_total: int = 0
    optional_objectives_completed: int = 0
    optional_objectives_total: int = 0
    safety_flags: list[str] = Field(default_factory=list)
    safety_cap_triggered: bool = False
    safety_cap_reason: Optional[str] = None
    missed_tasks: list[str] = Field(default_factory=list)
    success_failure_causes: list[str] = Field(default_factory=list)
    primary_cause: str = ""
    resource_metrics: dict[str, Any] = Field(default_factory=dict)
    team_summary: Optional[dict[str, Any]] = None

    @property
    def explanation(self) -> str:
        star_str = "★" * self.stars + "☆" * (3 - self.stars)
        lines = [
            f"Rating: {star_str} ({self.stars}/3 Stars)",
            f"Grade: {self.grade.value} — {self.total_score:.1f}/{self.max_score:.1f} ({self.score_fraction:.0%})",
        ]
        if self.safety_cap_triggered:
            lines.append(f"SAFETY CAP TRIGGERED: {self.safety_cap_reason}")
        if self.primary_cause:
            lines.append(f"Primary Outcome: {self.primary_cause}")
        if self.star_criteria:
            lines.append("Star Breakdown:")
            for sc in self.star_criteria:
                lines.append(f"  • {sc}")
        lines.append("")
        lines.append("Category Breakdown:")
        for cat in self.categories:
            lines.append(f"  {cat.category.value:12s}: {cat.weighted_score:6.1f} / {cat.max_possible * cat.weight:6.1f}  ({cat.explanation})")
        return "\n".join(lines)


# ── Score configuration ──────────────────────────────────────────────────────


class ScoringConfig(BaseModel):
    """Weights and safety caps for scoring."""
    max_score: float = 100.0
    objectives_weight: float = 0.35  # Science Return / Mission Objectives
    health_weight: float = 0.20      # Safety & Reliability
    data_weight: float = 0.15        # Communication & Data Delivery
    time_weight: float = 0.10        # Resource Efficiency (Operational Timeline)
    events_weight: float = 0.10      # Engineering Reasoning & Coordination
    budget_weight: float = 0.10      # Resource Efficiency (Budget Control)

    # Safety caps
    enable_safety_caps: bool = True
    critical_health_threshold_pct: float = 0.0  # Vehicle loss / destroyed
    severe_health_threshold_pct: float = 20.0
    safety_cap_max_score: float = 40.0          # Critical breach caps max score at 40% (Grade F)
    safety_cap_max_stars: int = 0               # Critical breach caps stars at 0


# ── Scorer ───────────────────────────────────────────────────────────────────


class MissionScorer:
    """
    Calculates transparent, explainable mission scores.

    All calculations are pure — no hidden state, no random factors.
    Enforces critical safety caps: a critical vehicle safety breach cannot
    be masked or excused by high science output.
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
        critical_safety_violation: bool = False,
        safety_violation_details: list[str] | None = None,
        missed_tasks: list[str] | None = None,
        alerts_delivered: int = 0,
        alerts_total: int = 0,
        energy_used_wh: float = 0.0,
        battery_critical_cycles: int = 0,
        team_summary: Optional[dict[str, Any]] = None,
    ) -> ScoreBreakdown:
        """
        Calculate the full score breakdown.

        Every input contributes transparently to the final score.
        Critical safety cap is applied if vehicle health is lost or critical safety violation occurred.
        """
        categories: list[CategoryScore] = []
        max_score = self.config.max_score

        # 1. Objectives score (Mission Objectives / Science Return)
        if objective_results:
            obj_fraction = sum(r.fraction for r in objective_results) / len(objective_results)
        else:
            obj_fraction = 0.0
        obj_raw = obj_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.OBJECTIVES,
            display_name="Mission Objectives / Science Return",
            raw_score=obj_raw,
            weight=self.config.objectives_weight,
            weighted_score=obj_raw * self.config.objectives_weight,
            max_possible=max_score,
            explanation=f"{obj_fraction:.0%} of objectives achieved",
        ))

        # 2. Health score (Safety & Reliability)
        health_fraction = min(max(spacecraft_health_pct / 100.0, 0.0), 1.0)
        health_raw = health_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.HEALTH,
            display_name="Safety & Spacecraft Reliability",
            raw_score=health_raw,
            weight=self.config.health_weight,
            weighted_score=health_raw * self.config.health_weight,
            max_possible=max_score,
            explanation=f"Spacecraft health at {spacecraft_health_pct:.0f}%",
        ))

        # 3. Data score (Communication & Data Delivery)
        data_fraction = min(data_collected_mb / data_target_mb, 1.0) if data_target_mb > 0 else 1.0
        data_raw = data_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.DATA,
            display_name="Communication & Data Delivery",
            raw_score=data_raw,
            weight=self.config.data_weight,
            weighted_score=data_raw * self.config.data_weight,
            max_possible=max_score,
            explanation=f"{data_collected_mb:.0f}/{data_target_mb:.0f} MB collected",
        ))

        # 4. Time bonus (Resource Efficiency - Operational Timeline)
        if deadline_steps > 0:
            time_fraction = max(1.0 - (steps_elapsed / deadline_steps), 0.0)
        else:
            time_fraction = 1.0
        time_raw = time_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.TIME,
            display_name="Resource Efficiency — Timeline",
            raw_score=time_raw,
            weight=self.config.time_weight,
            weighted_score=time_raw * self.config.time_weight,
            max_possible=max_score,
            explanation=f"Completed in {steps_elapsed}/{deadline_steps} steps",
        ))

        # 5. Events score (Engineering Reasoning & Coordination)
        events_fraction = (events_resolved_well / total_events) if total_events > 0 else 1.0
        events_raw = events_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.EVENTS,
            display_name="Engineering Reasoning & Coordination",
            raw_score=events_raw,
            weight=self.config.events_weight,
            weighted_score=events_raw * self.config.events_weight,
            max_possible=max_score,
            explanation=f"{events_resolved_well}/{total_events} events handled well",
        ))

        # 6. Budget score (Resource Efficiency - Fiscal Discipline)
        budget_fraction = (budget_remaining / total_budget) if total_budget > 0 else 1.0
        budget_fraction = max(min(budget_fraction, 1.0), 0.0)
        budget_raw = budget_fraction * max_score
        categories.append(CategoryScore(
            category=ScoringCategory.BUDGET,
            display_name="Resource Efficiency — Budget Control",
            raw_score=budget_raw,
            weight=self.config.budget_weight,
            weighted_score=budget_raw * self.config.budget_weight,
            max_possible=max_score,
            explanation=f"{budget_remaining:.0f}/{total_budget:.0f} credits remaining",
        ))

        # Raw totals
        total = sum(c.weighted_score for c in categories)
        total_max = sum(c.max_possible * c.weight for c in categories)
        fraction = total / total_max if total_max > 0 else 0.0
        fraction = min(max(fraction, 0.0), 1.0)
        grade = score_to_grade(fraction)

        # Star Rating Calculation (0 to 3 stars)
        stars = 0
        star_criteria: list[str] = []

        # Criteria 1: Passing grade / primary objective completion
        if grade != Grade.F and obj_fraction >= 0.5:
            stars += 1
            star_criteria.append("1st Star ★: Minimum mission objective threshold met.")
        else:
            star_criteria.append("No 1st Star: Mission failed to meet minimum objective threshold.")

        # Criteria 2: High score / solid execution
        if stars >= 1 and (fraction >= 0.80 or obj_fraction >= 0.90):
            stars += 1
            star_criteria.append("2nd Star ★: High efficiency execution (Score ≥ 80% or Objectives ≥ 90%).")

        # Criteria 3: Operational mastery
        if (stars >= 2
                and fraction >= 0.90
                and spacecraft_health_pct >= 75.0
                and budget_remaining >= (total_budget * 0.10)):
            stars += 1
            star_criteria.append(
                f"3rd Star ★: Operational Mastery (Score ≥ 90%, Health {spacecraft_health_pct:.0f}% ≥ 75%, Budget preserved)."
            )

        # ── Critical Safety Caps & Flags (Prompt 15) ─────────────────────────
        safety_flags: list[str] = []
        safety_cap_triggered = False
        safety_cap_reason: Optional[str] = None

        if spacecraft_health_pct <= self.config.critical_health_threshold_pct:
            safety_cap_triggered = True
            safety_flags.append("CRITICAL: Total loss of spacecraft health (0.0%). Vehicle decommissioned.")
            safety_cap_reason = "Loss of spacecraft structural/electrical integrity (0% Health)."
        elif critical_safety_violation:
            safety_cap_triggered = True
            safety_cap_reason = "Severe critical safety violation breached operational flight envelope."
            safety_flags.append(f"CRITICAL: {safety_cap_reason}")

        if safety_violation_details:
            safety_flags.extend(safety_violation_details)

        if battery_critical_cycles > 0:
            safety_flags.append(f"WARNING: Battery suffered {battery_critical_cycles} deep critical depletion cycles.")

        # Apply hard safety cap if triggered
        if self.config.enable_safety_caps and safety_cap_triggered:
            total = min(total, self.config.safety_cap_max_score)
            fraction = min(fraction, self.config.safety_cap_max_score / total_max)
            grade = Grade.F
            stars = min(stars, self.config.safety_cap_max_stars)
            star_criteria = [f"Safety Cap Override: {safety_cap_reason} limits rating to 0 Stars and Grade F."]

        # Objective counts
        primary_objs = [r for r in objective_results if getattr(r, "is_primary", True)]
        optional_objs = [r for r in objective_results if not getattr(r, "is_primary", True)]
        primary_completed = sum(1 for r in primary_objs if r.passed)
        optional_completed = sum(1 for r in optional_objs if r.passed)

        # Plain language causes
        causes: list[str] = []
        if safety_cap_triggered:
            causes.append(f"Mission Failed: {safety_cap_reason}")
            primary_cause = f"Critical vehicle failure: {safety_cap_reason}"
        elif grade == Grade.A_PLUS:
            causes.append("Outstanding Mission: All primary & optional objectives executed with nominal bus telemetry.")
            primary_cause = "Flawless orbital execution and payload operations."
        elif grade in (Grade.A, Grade.A_MINUS):
            causes.append("Mission Success: Primary scientific objectives fulfilled with healthy spacecraft reserves.")
            primary_cause = "Objectives successfully met with minor operational compromises."
        elif grade in (Grade.B_PLUS, Grade.B, Grade.B_MINUS):
            causes.append("Mission Passed: Adequate scientific yield achieved; minor resource or scheduling inefficiencies.")
            primary_cause = "Contract fulfilled with noticeable subsystem or deadline strain."
        elif grade in (Grade.C_PLUS, Grade.C, Grade.C_MINUS, Grade.D):
            causes.append("Marginal Performance: Partial objective completion with significant telemetry degradation.")
            primary_cause = "Substantial objective shortfalls and reduced spacecraft health."
        else:
            causes.append("Mission Incomplete: Primary objectives not fulfilled within mission deadline or budget.")
            primary_cause = "Failure to achieve contract science requirements."

        if budget_remaining < 0:
            causes.append("Fiscal Violation: Mission operations exceeded authorized budget constraint.")

        return ScoreBreakdown(
            total_score=round(total, 2),
            max_score=round(total_max, 2),
            score_fraction=round(fraction, 4),
            grade=grade,
            stars=stars,
            star_criteria=star_criteria,
            categories=categories,
            objective_results=objective_results,
            primary_objectives_completed=primary_completed,
            primary_objectives_total=len(primary_objs),
            optional_objectives_completed=optional_completed,
            optional_objectives_total=len(optional_objs),
            safety_flags=safety_flags,
            safety_cap_triggered=safety_cap_triggered,
            safety_cap_reason=safety_cap_reason,
            missed_tasks=missed_tasks or [],
            success_failure_causes=causes,
            primary_cause=primary_cause,
            resource_metrics={
                "data_collected_mb": round(data_collected_mb, 2),
                "data_target_mb": round(data_target_mb, 2),
                "alerts_delivered": alerts_delivered,
                "alerts_total": alerts_total,
                "energy_used_wh": round(energy_used_wh, 2),
                "budget_spent": round(total_budget - budget_remaining, 2),
                "spacecraft_health_pct": round(spacecraft_health_pct, 1),
            },
            team_summary=team_summary,
        )
