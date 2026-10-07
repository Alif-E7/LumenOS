"""LumenOS vs. naive scheduler — the headline comparison.

Run directly for a printed comparison + assertions:
    python tests/test_scheduler.py

Also pytest-compatible:
    pytest tests/test_scheduler.py
"""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.lumen_scheduler import LumenScheduler  # noqa: E402
from engine.orbital_engine import OrbitalEngine  # noqa: E402
from engine.thermal_engine import ThermalEngine  # noqa: E402
from engine.workload_profiler import WorkloadProfiler  # noqa: E402

SIM_MINUTES = 90


@lru_cache(maxsize=1)
def _results() -> tuple[dict[str, Any], dict[str, Any]]:
    """Run both schedulers once and share the results across tests."""
    scheduler = LumenScheduler(OrbitalEngine(), ThermalEngine(), WorkloadProfiler())
    lumen = scheduler.run_simulation(SIM_MINUTES)
    naive = scheduler.compare_with_naive_scheduler(SIM_MINUTES)
    return lumen, naive


def print_comparison(lumen: dict[str, Any], naive: dict[str, Any]) -> None:
    """Print the LumenOS vs. naive summary lines."""
    print(
        f"LumenOS: {lumen['total_tasks_completed']} tasks completed, "
        f"max temp {lumen['max_temperature_reached']:.1f}°C, "
        f"{lumen['thermal_shutdowns_avoided']} shutdowns avoided"
    )
    print(
        f"Naive:   {naive['total_tasks_completed']} tasks completed, "
        f"max temp {naive['max_temperature_reached']:.1f}°C, "
        f"{naive['thermal_shutdowns']} shutdowns"
    )
    print(
        f"\nNaive lost {naive['lost_compute_seconds'] / 60:.1f} min of work to hard shutdowns "
        f"and sat dark for {naive['shutdown_minutes']:.1f} min."
    )


def test_lumen_runs_cooler_than_naive() -> None:
    """LumenOS must keep the peak temperature below the naive scheduler's."""
    lumen, naive = _results()
    assert lumen["max_temperature_reached"] < naive["max_temperature_reached"]


def test_naive_hits_shutdown() -> None:
    """The thermally-blind scheduler must reach SHUTDOWN at least once."""
    _, naive = _results()
    assert naive["thermal_shutdowns"] >= 1
    assert any(row["thermal_status"] == "SHUTDOWN" for row in naive["timeline"])


def test_lumen_never_shuts_down() -> None:
    """LumenOS must never let the hardware reach SHUTDOWN."""
    lumen, _ = _results()
    assert lumen["thermal_shutdowns"] == 0
    assert lumen["max_temperature_reached"] < 95.0


if __name__ == "__main__":
    lumen_result, naive_result = _results()
    print_comparison(lumen_result, naive_result)
    print()
    for test in (test_lumen_runs_cooler_than_naive, test_naive_hits_shutdown, test_lumen_never_shuts_down):
        test()
        print(f"PASS  {test.__name__}")
    print("\nAll scheduler checks passed.")
