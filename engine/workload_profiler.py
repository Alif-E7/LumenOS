"""Workload Profiler — scientific instruments & AI payloads vs. limited resources.

NASA Space Apps 2026 — "Space Mission Design Game"
===================================================
A central challenge in space mission design is balancing competing demands:
mission objectives demand high-throughput data processing and AI inference,
while spacecraft design imposes rigid constraints on available power and heat
dissipation.

Each computational payload / workload in this catalogue represents a mission
task with distinct resource demands:
* **Power draw (W)** — what the solar arrays or battery must supply.
* **Heat generation (W)** — thermal dissipation that the radiator must reject
  into space (~90% of electrical power converts directly into heat).

Thermal-aware quantization (AI + systems co-design)
---------------------------------------------------
On a spacecraft the scarce resource is *cooling*, so the OS can co-design the
AI stack with the thermal budget instead of just throttling it:

============  ==============  =======================  ==========
Precision     When it applies  Heat vs FP32             Accuracy
============  ==============  =======================  ==========
``FP32``      below 60 °C     full (1.0x)              100 %
``INT8``      60–80 °C        ~50 % of FP32 heat       ~98 %
``TINY``      80 °C and above  ~25 % of FP32 heat       ~90 %
============  ==============  =======================  ==========

A quantized model runs cooler *and* draws less power, so a HEAVY job that the
scheduler would otherwise pause can keep producing results at lower accuracy —
that trade-off is the whole point of thermal-aware quantization.

Task selection (``get_next_task``) manages these competing demands using
LumenOS's thermodynamics-aware category rules:

=========  ===================================================
Category   May START only while the spacecraft is below
=========  ===================================================
HEAVY      60 °C  (NOMINAL — maximum cooling capacity available)
MEDIUM     80 °C  (NOMINAL / WARNING — throttled compute)
COLD       95 °C  (CRITICAL — minimal battery-safe survival tasks)
=========  ===================================================
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

HEAVY = "HEAVY"
MEDIUM = "MEDIUM"
COLD = "COLD"
CATEGORIES: tuple[str, ...] = (HEAVY, MEDIUM, COLD)

#: Highest server temperature (°C, exclusive) at which each category may start.
CATEGORY_MAX_START_TEMP_CELSIUS: dict[str, float] = {
    HEAVY: 60.0,
    MEDIUM: 80.0,
    COLD: 95.0,
}

#: Default thermal mass of the server block (15 kg aluminium x 900 J/kg.K),
#: matching ThermalEngine defaults.
DEFAULT_HEAT_CAPACITY_J_PER_K: float = 15 * 900

# --------------------------------------------------------------------------- #
# Precision levels (thermal-aware quantization)
# --------------------------------------------------------------------------- #
FP32 = "FP32"
INT8 = "INT8"
TINY = "TINY"
AUTO = "AUTO"

#: All concrete precision levels (``AUTO`` is a policy that resolves to one of these).
PRECISION_LEVELS: tuple[str, ...] = (FP32, INT8, TINY)

#: Temperature (°C) at or above which AUTO downgrades FP32 -> INT8.
AUTO_INT8_ABOVE_CELSIUS: float = 60.0
#: Temperature (°C) at or above which AUTO downgrades INT8 -> TINY.
AUTO_TINY_ABOVE_CELSIUS: float = 80.0

#: How much a full category downgrade relaxes the start-temperature ceiling:
#: a HEAVY job at INT8 may start as hot as MEDIUM would, at TINY as COLD would.
PRECISION_CATEGORY_RELAX_CELSIUS: float = 20.0


@dataclass(frozen=True)
class PrecisionProfile:
    """Resource & quality envelope of one model precision level."""

    level: str
    label: str
    power_scale: float      # electrical draw multiplier vs FP32
    heat_scale: float       # default thermal multiplier vs FP32
    rate_scale: float       # effective TFLOP/s multiplier vs FP32
    accuracy: float         # output quality, 0-1


PRECISION_PROFILES: dict[str, PrecisionProfile] = {
    FP32: PrecisionProfile(FP32, "FP32 · full precision", 1.0, 1.0, 1.0, 1.0),
    INT8: PrecisionProfile(INT8, "INT8 · quantized tensor cores", 0.65, 0.50, 0.90, 0.98),
    TINY: PrecisionProfile(TINY, "TINY · lookup-table inference", 0.40, 0.25, 0.45, 0.90),
}


def resolve_precision(current_temp_celsius: float) -> str:
    """Map an AUTO policy to a concrete precision from the current temperature."""
    if current_temp_celsius >= AUTO_TINY_ABOVE_CELSIUS:
        return TINY
    if current_temp_celsius >= AUTO_INT8_ABOVE_CELSIUS:
        return INT8
    return FP32


def relaxed_start_ceiling(category: str, precision: str) -> float:
    """Highest temperature (°C) at which ``category`` may start at ``precision``.

    Running quantized cuts the heat load, so a downgraded HEAVY job may start
    in the range normally reserved for MEDIUM, and so on.
    """
    ceiling = CATEGORY_MAX_START_TEMP_CELSIUS[category]
    tiers = {FP32: 0, INT8: 1, TINY: 2}.get(precision, 0)
    return min(95.0, ceiling + PRECISION_CATEGORY_RELAX_CELSIUS * tiers)


@dataclass(frozen=True)
class AIWorkload:
    """One AI job with its power and thermal profile."""

    name: str
    category: str  # "HEAVY", "MEDIUM", "COLD"
    power_draw_watts: float
    heat_generation_watts: float  # usually ~90% of power_draw becomes heat
    duration_minutes: float
    priority: int  # 1 = highest, 5 = lowest
    thermal_cost_fp32: Optional[float] = None  # defaults to heat_generation_watts
    thermal_cost_int8: Optional[float] = None   # defaults to 50 % of FP32 heat
    thermal_cost_tiny: Optional[float] = None   # defaults to 25 % of FP32 heat

    def __post_init__(self) -> None:
        """Validate field values and materialize the precision heat table."""
        if self.category not in CATEGORIES:
            raise ValueError(f"category must be one of {CATEGORIES}, got {self.category!r}")
        if not 1 <= self.priority <= 5:
            raise ValueError("priority must be between 1 (highest) and 5 (lowest)")
        if self.power_draw_watts < 0 or self.heat_generation_watts < 0:
            raise ValueError("power and heat must be non-negative")
        if self.heat_generation_watts > self.power_draw_watts:
            raise ValueError("heat_generation_watts cannot exceed power_draw_watts (energy conservation)")
        if self.duration_minutes <= 0:
            raise ValueError("duration_minutes must be positive")

        heat = self.heat_generation_watts
        if self.thermal_cost_fp32 is None:
            object.__setattr__(self, "thermal_cost_fp32", heat)
        if self.thermal_cost_int8 is None:
            object.__setattr__(
                self, "thermal_cost_int8", round(heat * PRECISION_PROFILES[INT8].heat_scale, 1)
            )
        if self.thermal_cost_tiny is None:
            object.__setattr__(
                self, "thermal_cost_tiny", round(heat * PRECISION_PROFILES[TINY].heat_scale, 1)
            )

    def heat_for_precision(self, level: str) -> float:
        """Heat this workload generates when run at ``level`` (watts)."""
        return {
            FP32: self.thermal_cost_fp32,
            INT8: self.thermal_cost_int8,
            TINY: self.thermal_cost_tiny,
        }.get(level, self.thermal_cost_fp32)

    def power_for_precision(self, level: str) -> float:
        """Electrical draw of this workload at ``level`` (watts)."""
        scale = PRECISION_PROFILES.get(level, PRECISION_PROFILES[FP32]).power_scale
        return round(self.power_draw_watts * scale, 1)

    def rate_scale_for_precision(self, level: str) -> float:
        """Effective TFLOP/s multiplier vs FP32 at ``level``."""
        return PRECISION_PROFILES.get(level, PRECISION_PROFILES[FP32]).rate_scale

    def accuracy_for_precision(self, level: str) -> float:
        """Output quality (0-1) of this workload at ``level``."""
        return PRECISION_PROFILES.get(level, PRECISION_PROFILES[FP32]).accuracy


def _default_workloads() -> list[AIWorkload]:
    """The standard LumenOS demo task queue."""
    return [
        # HEAVY
        AIWorkload("LLM_Fine_Tuning", HEAVY, 1000, 900, 30, 1),
        AIWorkload("Satellite_Image_Segmentation", HEAVY, 500, 450, 20, 2),
        AIWorkload("Climate_Model_Inference", HEAVY, 400, 360, 15, 2),
        # MEDIUM
        AIWorkload("Object_Detection", MEDIUM, 150, 135, 10, 3),
        AIWorkload("Data_Validation", MEDIUM, 100, 90, 8, 3),
        # COLD (small enough to run on battery in eclipse)
        AIWorkload("Data_Sorting", COLD, 34, 30, 5, 4),
        AIWorkload("Log_Compression", COLD, 28, 25, 3, 5),
    ]


class WorkloadProfiler:
    """Holds the AI task queue and picks the best task for current conditions."""

    def __init__(self) -> None:
        """Create the default task queue (3 HEAVY, 2 MEDIUM, 2 COLD)."""
        self.tasks: list[AIWorkload] = _default_workloads()

    def get_all_tasks(self) -> list[AIWorkload]:
        """Return all tasks sorted by priority (1 first; ties keep queue order)."""
        return sorted(self.tasks, key=lambda task: task.priority)

    def get_next_task(
        self,
        available_power: float,
        available_cooling: float,
        max_temp_allowed: float,
        current_temp_celsius: Optional[float] = None,
        heat_capacity_j_per_k: float = DEFAULT_HEAT_CAPACITY_J_PER_K,
    ) -> Optional[AIWorkload]:
        """Return the highest-priority task that fits current limits, or ``None``.

        A task fits when:

        1. **Power:** ``power_draw_watts <= available_power``.
        2. **Cooling / temperature:**

           * If ``current_temp_celsius`` is *not* given, the task must not
             out-heat the radiator: ``heat_generation_watts <= available_cooling``.
           * If it *is* given, the server must be cool enough to start the
             task's category (see ``CATEGORY_MAX_START_TEMP_CELSIUS``), and the
             predicted temperature at the end of the task must stay
             ``<= max_temp_allowed``. This lets a task briefly exceed the
             cooling capacity if there is enough thermal headroom.

        Args:
            available_power: Power available for workloads, in watts.
            available_cooling: Radiator cooling capacity, in watts.
            max_temp_allowed: Temperature ceiling (°C) the task must not push
                the server beyond.
            current_temp_celsius: Current server temperature (°C), if known.
            heat_capacity_j_per_k: Server thermal mass ``m * Cp``, used for the
                end-of-task temperature prediction.

        Returns:
            The chosen :class:`AIWorkload`, or ``None`` if nothing fits.
        """
        for task in self.get_all_tasks():
            if task.power_draw_watts > available_power:
                continue
            if self._fits_thermally(
                task,
                available_cooling,
                max_temp_allowed,
                current_temp_celsius,
                heat_capacity_j_per_k,
            ):
                return task
        return None

    @staticmethod
    def _fits_thermally(
        task: AIWorkload,
        available_cooling: float,
        max_temp_allowed: float,
        current_temp_celsius: Optional[float],
        heat_capacity_j_per_k: float,
    ) -> bool:
        """Check the cooling/temperature condition for one task."""
        if current_temp_celsius is None:
            return task.heat_generation_watts <= available_cooling

        if current_temp_celsius >= CATEGORY_MAX_START_TEMP_CELSIUS[task.category]:
            return False

        net_heat = task.heat_generation_watts - available_cooling
        predicted_end_temp = (
            current_temp_celsius
            + net_heat / heat_capacity_j_per_k * task.duration_minutes * 60.0
        )
        return predicted_end_temp <= max_temp_allowed
