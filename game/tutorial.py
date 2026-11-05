"""
Sunrise Orbit Tutorial — Educational onboarding path for orbital mechanics and spacecraft operations.

Teaches:
1. Orbital insertion & Keplerian mechanics (altitude, velocity, orbital period)
2. Solar power generation & solar flux
3. Earth shadow & umbra eclipse transition
4. Battery depth-of-discharge (DoD) & non-essential load shedding
5. Re-entering sunlight & battery recharging

Dual-Mode Support:
- Explorer Mode: Guided choices, simplified terminology, safety tips, step-by-step assistance.
- Engineer Mode: Raw telemetry channels, explicit physical equations, watt-hour calculations.

Treat this strictly as an educational tutorial, NOT a 5th mission scenario.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field

from game.contracts import (
    MissionContract,
    ObjectiveDefinition,
    Difficulty,
    OutcomeType,
    WinCondition,
    FailCondition,
)
from game.scoring import Grade, ScoreBreakdown, CategoryScore, ScoringCategory


class TutorialMode(str, Enum):
    """Player interaction mode for the tutorial."""
    EXPLORER = "explorer"   # Guided, gentle onboarding for ages 10-15
    ENGINEER = "engineer"   # Advanced telemetry, physical assumptions, raw numbers


class TutorialStage(str, Enum):
    """The 5 pedagogical stages of the Sunrise Orbit tutorial."""
    ORBIT_BASICS = "orbit_basics"
    SUNLIGHT_POWER = "sunlight_power"
    ECLIPSE_ENTRY = "eclipse_entry"
    BATTERY_MANAGEMENT = "battery_management"
    SUNRISE_RECHARGE = "sunrise_recharge"


class TutorialStep(BaseModel):
    """A single guided lesson step in the tutorial."""
    id: str
    stage: TutorialStage
    title: str
    concept: str
    explorer_guidance: str
    engineer_telemetry_focus: str
    required_action: str
    hint: str
    expected_state: dict[str, Any] = Field(default_factory=dict)


TUTORIAL_STEPS: list[TutorialStep] = [
    TutorialStep(
        id="tut_step_1_orbit",
        stage=TutorialStage.ORBIT_BASICS,
        title="Orbital Mechanics — Staying in Space",
        concept=(
            "An orbit is not zero gravity! Gravity is still ~90% as strong at 400 km. "
            "A spacecraft stays in orbit because it moves forward so fast (~7.67 km/s) "
            "that the curve of its fall matches the curve of Earth."
        ),
        explorer_guidance=(
            "Welcome Cadet! Your satellite 'Sunrise Scout' is in Low Earth Orbit at 400 km. "
            "Notice how your speed keeps you from falling into the atmosphere."
        ),
        engineer_telemetry_focus=(
            "Radius r = 6378.137 + 400.0 = 6778.137 km. Velocity v = sqrt(GM/r) = 7.67 km/s. "
            "Orbital period T = 2*pi*sqrt(a^3/GM) = 5554 s (~92.5 minutes)."
        ),
        required_action="verify_orbit",
        hint="Check the orbital altitude meter. Confirm altitude is ~400 km and velocity is ~7.67 km/s.",
        expected_state={"altitude_km": 400.0, "velocity_km_s": 7.67},
    ),
    TutorialStep(
        id="tut_step_2_sunlight",
        stage=TutorialStage.SUNLIGHT_POWER,
        title="Sunlight & Power Generation",
        concept=(
            "In sunlight, the solar arrays convert solar radiation (solar flux: 1361 W/m²) "
            "into electricity. A 4 m² panel at 28% efficiency generates ~1524 W of power, "
            "which powers bus avionics and charges the onboard battery."
        ),
        explorer_guidance=(
            "Look at your Solar Power meter! The Sun is shining on your solar panels, "
            "generating plenty of electricity. Your battery is fully charging up."
        ),
        engineer_telemetry_focus=(
            "P_gen = Solar_Flux * Area * Efficiency * cos(theta_sun). "
            "Net power P_net = P_gen - P_load. Surplus energy flows into Li-ion battery bank."
        ),
        required_action="observe_charging",
        hint="Confirm your power generation is positive and battery state of charge is increasing.",
        expected_state={"is_in_eclipse": False, "solar_output_w": 600.0},
    ),
    TutorialStep(
        id="tut_step_3_eclipse",
        stage=TutorialStage.ECLIPSE_ENTRY,
        title="Entering Earth's Shadow (Eclipse)",
        concept=(
            "Because Earth is an opaque sphere, roughly 35 minutes of every 90-minute Low Earth Orbit "
            "is spent in total darkness (umbra eclipse). Solar power drops instantly to 0 W."
        ),
        explorer_guidance=(
            "Night has fallen! Earth is blocking the Sun. Your solar panels produce 0 Watts. "
            "Your satellite must now rely entirely on stored battery energy to survive."
        ),
        engineer_telemetry_focus=(
            "Eclipse geometry: cylindrical shadow cylinder. Shadow fraction ~0.38 per orbit. "
            "P_gen = 0.0 W. Subsystem draw P_load must be supplied entirely by battery discharge."
        ),
        required_action="enter_eclipse",
        hint="Notice the eclipse warning flag and monitor battery drain rate.",
        expected_state={"is_in_eclipse": True, "solar_output_w": 0.0},
    ),
    TutorialStep(
        id="tut_step_4_battery",
        stage=TutorialStage.BATTERY_MANAGEMENT,
        title="Battery Management & Load Shedding",
        concept=(
            "If battery Depth of Discharge (DoD) exceeds safe limits (State of Charge < 20%), "
            "the spacecraft risks a critical brownout. Turning off high-power payloads "
            "conserves energy until orbital sunrise."
        ),
        explorer_guidance=(
            "Warning: Battery level is dropping! Turn off non-essential instruments to conserve "
            "power so the computer and thermal heaters stay alive."
        ),
        engineer_telemetry_focus=(
            "dE/dt = -P_load. State of Charge SoC(t) = E_remaining / E_capacity. "
            "Execute 'shed_load' command to reduce P_load from 350 W to 120 W essential bus power."
        ),
        required_action="shed_load",
        hint="Click 'Shed Non-Essential Loads' or power down the payload.",
        expected_state={"power_draw_w": 120.0},
    ),
    TutorialStep(
        id="tut_step_5_sunrise",
        stage=TutorialStage.SUNRISE_RECHARGE,
        title="Orbital Sunrise & Full Restoration",
        concept=(
            "Emerging from eclipse into sunlight restores full solar panel power. "
            "Batteries begin recharging immediately, and normal observation science can resume."
        ),
        explorer_guidance=(
            "Sunrise! Golden sunlight hits your solar arrays again. Power is back, your battery "
            "is refilling, and you successfully navigated your first orbital cycle!"
        ),
        engineer_telemetry_focus=(
            "P_gen restored to nominal (>600 W). P_net = +480 W. Charging rate C/3. "
            "Thermal equilibrium re-established. All systems nominal."
        ),
        required_action="restore_payload",
        hint="Re-enable payload and confirm battery state of charge is recovering.",
        expected_state={"is_in_eclipse": False, "battery_soc_pct": 85.0},
    ),
]


class TutorialContractFactory:
    """Creates the pedagogical Sunrise Orbit tutorial contract."""

    @staticmethod
    def create_contract(mode: TutorialMode = TutorialMode.EXPLORER) -> MissionContract:
        """
        Build the tutorial contract.
        Explicitly marked with tutorial flag and educational objectives.
        """
        objectives = [
            ObjectiveDefinition(
                id="tut_survive_eclipse",
                description="Survive the 35-minute orbital eclipse without battery exhaustion",
                target_value=1.0,
                unit="cycles",
                weight=1.0,
                is_primary=True,
                partial_threshold=0.5,
            ),
            ObjectiveDefinition(
                id="tut_manage_battery",
                description="Maintain battery State of Charge above 40% throughout eclipse",
                target_value=40.0,
                unit="%",
                weight=0.8,
                is_primary=True,
                partial_threshold=0.5,
            ),
            ObjectiveDefinition(
                id="tut_recharge_sunrise",
                description="Recharge battery to at least 80% upon re-entering sunlight",
                target_value=80.0,
                unit="%",
                weight=0.5,
                is_primary=False,
                partial_threshold=0.5,
            ),
        ]

        return MissionContract(
            mission_id="sunrise_orbit_tutorial",
            mission_name="Sunrise Orbit (Flight Academy)",
            description=(
                "A guided onboarding flight covering orbital motion, solar generation, "
                "eclipse survival, and battery management."
            ),
            difficulty=Difficulty.CADET,
            deadline_steps=120,  # ~2 hours (approx 1.3 orbits)
            budget=5000.0,
            objectives=objectives,
            win_condition=WinCondition(
                min_primary_completion_pct=1.0,
                min_overall_score_pct=0.7,
            ),
            fail_condition=FailCondition(
                budget_exceeded=False,
                spacecraft_destroyed=True,
                min_health_pct=0.0,
                deadline_exceeded=True,
            ),
            seed=101,
        )


class TutorialSession(BaseModel):
    """State tracking for a player's tutorial progress."""
    mode: TutorialMode = TutorialMode.EXPLORER
    current_step_index: int = 0
    completed_steps: list[str] = Field(default_factory=list)
    is_completed: bool = False
    notes: list[str] = Field(default_factory=list)

    @property
    def current_step(self) -> Optional[TutorialStep]:
        if 0 <= self.current_step_index < len(TUTORIAL_STEPS):
            return TUTORIAL_STEPS[self.current_step_index]
        return None

    def advance_step(self, action_taken: str) -> tuple[bool, str]:
        """Advance to the next tutorial step if action matches requirement."""
        step = self.current_step
        if not step:
            self.is_completed = True
            return True, "Tutorial already completed!"

        if action_taken == step.required_action:
            self.completed_steps.append(step.id)
            self.current_step_index += 1
            if self.current_step_index >= len(TUTORIAL_STEPS):
                self.is_completed = True
                return True, "Congratulations! You have completed the Sunrise Orbit tutorial!"
            next_step = self.current_step
            return True, f"Step completed! Next: {next_step.title if next_step else 'Finish'}"
        else:
            return False, f"Action '{action_taken}' does not match required action '{step.required_action}'. Hint: {step.hint}"

