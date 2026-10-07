"""Workload Profiler — which AI jobs exist, and what do they cost in watts and heat?

Each workload has a power draw (what the solar array/battery must supply) and a
heat generation (what the radiator must reject — typically ~90 % of power draw).

Task selection (``get_next_task``) uses the LumenOS category rules:

=========  ===================================================
Category   May START only while the server is below
=========  ===================================================
HEAVY      60 °C  (NOMINAL)
MEDIUM     80 °C  (NOMINAL / WARNING)
COLD       95 °C  (anything except SHUTDOWN)
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


@dataclass(frozen=True)
class AIWorkload:
    """One AI job with its power and thermal profile."""

    name: str
    category: str  # "HEAVY", "MEDIUM", "COLD"
    power_draw_watts: float
    heat_generation_watts: float  # usually ~90% of power_draw becomes heat
    duration_minutes: float
    priority: int  # 1 = highest, 5 = lowest

    def __post_init__(self) -> None:
        """Validate field values."""
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
