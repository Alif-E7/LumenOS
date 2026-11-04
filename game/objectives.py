"""
Objective Tracking & Evaluation — Live progress monitoring and partial-success logic.

Each ObjectiveTracker monitors a single objective's progress through the
mission. The ObjectiveEvaluator aggregates trackers and produces scored results.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from game.contracts import ObjectiveDefinition


class ObjectiveProgress(BaseModel):
    """Live progress of a single objective."""
    objective_id: str
    description: str
    target_value: float
    current_value: float = 0.0
    unit: str = ""
    weight: float = 1.0
    is_primary: bool = True
    partial_threshold: float = 0.5

    @property
    def fraction(self) -> float:
        """Completion fraction, clamped to [0, 1]."""
        if self.target_value <= 0:
            return 1.0
        return min(max(self.current_value / self.target_value, 0.0), 1.0)

    @property
    def is_complete(self) -> bool:
        return self.fraction >= 1.0

    @property
    def is_partial(self) -> bool:
        return self.partial_threshold <= self.fraction < 1.0

    @property
    def is_failed(self) -> bool:
        return self.fraction < self.partial_threshold

    @classmethod
    def from_definition(cls, defn: ObjectiveDefinition) -> ObjectiveProgress:
        return cls(
            objective_id=defn.id,
            description=defn.description,
            target_value=defn.target_value,
            unit=defn.unit,
            weight=defn.weight,
            is_primary=defn.is_primary,
            partial_threshold=defn.partial_threshold,
        )


class ObjectiveResult(BaseModel):
    """Final scored result for a single objective."""
    objective_id: str
    description: str
    target_value: float
    achieved_value: float
    fraction: float = Field(ge=0.0, le=1.0)
    weighted_score: float
    passed: bool
    partial: bool


class ObjectiveEvaluator:
    """
    Manages a set of ObjectiveProgress trackers and produces scored results.
    """

    def __init__(self, definitions: list[ObjectiveDefinition]):
        self._trackers: dict[str, ObjectiveProgress] = {}
        for defn in definitions:
            self._trackers[defn.id] = ObjectiveProgress.from_definition(defn)

    @property
    def trackers(self) -> dict[str, ObjectiveProgress]:
        return dict(self._trackers)

    def update(self, objective_id: str, value: float) -> None:
        """Set the current value for an objective."""
        if objective_id in self._trackers:
            self._trackers[objective_id].current_value = value

    def increment(self, objective_id: str, delta: float) -> None:
        """Add delta to an objective's current value."""
        if objective_id in self._trackers:
            self._trackers[objective_id].current_value += delta

    def get_scores(self) -> dict[str, float]:
        """Return objective_id → fraction mapping for contract evaluation."""
        return {oid: t.fraction for oid, t in self._trackers.items()}

    def get_results(self) -> list[ObjectiveResult]:
        """Produce final scored results for all objectives."""
        total_weight = sum(t.weight for t in self._trackers.values())
        results = []
        for t in self._trackers.values():
            w_score = (t.fraction * t.weight / total_weight) if total_weight > 0 else 0.0
            results.append(ObjectiveResult(
                objective_id=t.objective_id,
                description=t.description,
                target_value=t.target_value,
                achieved_value=t.current_value,
                fraction=t.fraction,
                weighted_score=w_score,
                passed=t.is_complete,
                partial=t.is_partial,
            ))
        return results
