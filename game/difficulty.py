"""
Difficulty Scaling System — Configurable challenge settings that preserve physical realism.

Guiding Principles:
1. Physics are invariant: Gravitational constant (mu), orbital mechanics, Earth geometry,
   solar flux (1361 W/m²), and thermodynamic laws are PHYSICAL REALITIES and never silently scaled.
2. Difficulty modifies operational constraints:
   - Budget margins
   - Deadlines and time pressure
   - Event probabilities and severity weighting
   - Target values for science objectives
   - Health fail thresholds
3. Deterministic: Fixed seed + difficulty level produces identical repeatable sessions.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

from game.contracts import MissionContract, Difficulty, ObjectiveDefinition, WinCondition, FailCondition


@dataclass(frozen=True)
class DifficultyProfile:
    """Multipliers and modifiers for a specific difficulty level."""
    difficulty: Difficulty
    level_int: int
    name: str
    description: str
    budget_multiplier: float
    deadline_multiplier: float
    event_rate_multiplier: float
    objective_target_multiplier: float
    min_health_fail_pct: float
    allow_safety_advisory: bool
    reward_multiplier: float


DIFFICULTY_PROFILES: dict[Difficulty, DifficultyProfile] = {
    Difficulty.CADET: DifficultyProfile(
        difficulty=Difficulty.CADET,
        level_int=1,
        name="Cadet (Explorer)",
        description=(
            "Designed for onboarding and ages 10–15. Generous budget (+50%), "
            "relaxed deadlines (+25%), reduced anomaly frequency, and active safety advisories."
        ),
        budget_multiplier=1.50,
        deadline_multiplier=1.25,
        event_rate_multiplier=0.60,
        objective_target_multiplier=0.85,
        min_health_fail_pct=0.0,  # Fails only on complete 0% destruction
        allow_safety_advisory=True,
        reward_multiplier=0.80,
    ),
    Difficulty.ENGINEER: DifficultyProfile(
        difficulty=Difficulty.ENGINEER,
        level_int=2,
        name="Engineer (Standard)",
        description=(
            "The baseline operational mission profile. Nominal NASA reference budgets, "
            "standard operational windows, and authentic event probabilities."
        ),
        budget_multiplier=1.00,
        deadline_multiplier=1.00,
        event_rate_multiplier=1.00,
        objective_target_multiplier=1.00,
        min_health_fail_pct=0.0,
        allow_safety_advisory=True,
        reward_multiplier=1.00,
    ),
    Difficulty.SPECIALIST: DifficultyProfile(
        difficulty=Difficulty.SPECIALIST,
        level_int=3,
        name="Specialist",
        description=(
            "Tighter resource constraints (-15% budget), slightly higher anomaly rate, "
            "and 15% higher data delivery requirements."
        ),
        budget_multiplier=0.85,
        deadline_multiplier=0.95,
        event_rate_multiplier=1.25,
        objective_target_multiplier=1.15,
        min_health_fail_pct=15.0,
        allow_safety_advisory=False,
        reward_multiplier=1.25,
    ),
    Difficulty.COMMANDER: DifficultyProfile(
        difficulty=Difficulty.COMMANDER,
        level_int=4,
        name="Commander",
        description=(
            "High-stakes mission command. -30% budget, -20% timeline, frequent compound anomalies, "
            "and strict 30% spacecraft health preservation."
        ),
        budget_multiplier=0.70,
        deadline_multiplier=0.80,
        event_rate_multiplier=1.60,
        objective_target_multiplier=1.30,
        min_health_fail_pct=30.0,
        allow_safety_advisory=False,
        reward_multiplier=1.60,
    ),
    Difficulty.LEGENDARY: DifficultyProfile(
        difficulty=Difficulty.LEGENDARY,
        level_int=5,
        name="Legendary (Iron Flight)",
        description=(
            "Extreme survival challenge. Half budget (-50%), aggressive deadline (-35%), "
            "double anomaly rate, and mission fails if spacecraft health drops below 50%."
        ),
        budget_multiplier=0.50,
        deadline_multiplier=0.65,
        event_rate_multiplier=2.00,
        objective_target_multiplier=1.50,
        min_health_fail_pct=50.0,
        allow_safety_advisory=False,
        reward_multiplier=2.20,
    ),
}


def get_difficulty_profile(difficulty: Difficulty | str | int) -> DifficultyProfile:
    """Lookup difficulty profile safely."""
    if isinstance(difficulty, int):
        diff_enum = Difficulty.from_int(difficulty)
    elif isinstance(difficulty, str):
        try:
            diff_enum = Difficulty(difficulty.lower())
        except ValueError:
            diff_enum = Difficulty.ENGINEER
    else:
        diff_enum = difficulty
    return DIFFICULTY_PROFILES.get(diff_enum, DIFFICULTY_PROFILES[Difficulty.ENGINEER])


def apply_difficulty_to_contract(
    base_contract: MissionContract,
    target_difficulty: Difficulty | str | int,
) -> MissionContract:
    """
    Produce a new contract scaled by the chosen difficulty profile.

    Crucially:
    - Base physics constants in environment are UNCHANGED.
    - Contract budget, deadline, objective targets, and fail thresholds are scaled.
    """
    profile = get_difficulty_profile(target_difficulty)

    # Scale budget (rounded to nearest 50 credits)
    scaled_budget = round((base_contract.budget * profile.budget_multiplier) / 50.0) * 50.0

    # Scale deadline steps (at least 60 steps)
    scaled_deadline = max(int(base_contract.deadline_steps * profile.deadline_multiplier), 60)

    # Scale objectives
    scaled_objectives: list[ObjectiveDefinition] = []
    for obj in base_contract.objectives:
        new_target = round(obj.target_value * profile.objective_target_multiplier, 1)
        # Keep non-zero
        if obj.target_value > 0 and new_target <= 0:
            new_target = obj.target_value
        scaled_objectives.append(
            ObjectiveDefinition(
                id=obj.id,
                description=obj.description,
                target_value=new_target,
                unit=obj.unit,
                weight=obj.weight,
                is_primary=obj.is_primary,
                partial_threshold=obj.partial_threshold,
            )
        )

    # Fail conditions
    new_fail = FailCondition(
        budget_exceeded=base_contract.fail_condition.budget_exceeded,
        deadline_exceeded=base_contract.fail_condition.deadline_exceeded,
        spacecraft_destroyed=base_contract.fail_condition.spacecraft_destroyed,
        min_health_pct=max(base_contract.fail_condition.min_health_pct, profile.min_health_fail_pct),
    )

    return MissionContract(
        mission_id=base_contract.mission_id,
        mission_name=base_contract.mission_name,
        description=base_contract.description,
        difficulty=profile.difficulty,
        deadline_steps=scaled_deadline,
        budget=scaled_budget,
        objectives=scaled_objectives,
        win_condition=copy.deepcopy(base_contract.win_condition),
        fail_condition=new_fail,
        seed=base_contract.seed,
    )

