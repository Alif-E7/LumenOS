"""Mission Report Card — LumenOS vs. Naive Scheduler (Space Mission Design Game).

This test module validates the core claim of the LumenOS project: that a
thermodynamics-aware OS makes better engineering decisions than a power-only
scheduler, directly shaping mission success by avoiding thermal shutdowns.

NASA Space Apps 2026 — "Space Mission Design Game"

Run directly for a printed Mission Report Card + assertions:
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
    """Run both schedulers (LumenOS and Naive) once and share the results.
    
    Simulates one full 90-minute LEO orbit to compare mission outcomes:
    LumenOS (thermodynamics-aware) vs. Naive (power-only, thermally blind).
    """
    scheduler = LumenScheduler(OrbitalEngine(), ThermalEngine(), WorkloadProfiler())
    lumen = scheduler.run_simulation(SIM_MINUTES)
    naive = scheduler.compare_with_naive_scheduler(SIM_MINUTES)
    return lumen, naive


def print_comparison(lumen: dict[str, Any], naive: dict[str, Any]) -> None:
    """Print the Mission Report Card: LumenOS (AI-Aware) vs. Naive Scheduler (Legacy)."""
    print("=" * 65)
    print("  MISSION REPORT CARD — Space Mission Design Game")
    print("=" * 65)
    print(
        f"LumenOS (AI-Aware):  {lumen['total_tasks_completed']} tasks completed, "
        f"peak temp {lumen['max_temperature_reached']:.1f}°C, "
        f"{lumen['thermal_shutdowns_avoided']} shutdown(s) avoided — MISSION PROTECTED"
    )
    print(
        f"Naive (Legacy):      {naive['total_tasks_completed']} tasks completed, "
        f"peak temp {naive['max_temperature_reached']:.1f}°C, "
        f"{naive['thermal_shutdowns']} thermal shutdown(s) — MISSION AT RISK"
    )
    print(
        f"\nNaive lost {naive['lost_compute_seconds'] / 60:.1f} min of compute to thermal shutdowns "
        f"({naive['shutdown_minutes']:.1f} min sat dark waiting for recovery)."
    )
    print("\nEach engineering decision you make shapes this outcome.")
    print("=" * 65)


def test_lumen_runs_cooler_than_naive() -> None:
    """LumenOS must keep the spacecraft cooler than the Naive Scheduler.
    
    Validates the core mission engineering decision: a thermodynamics-aware OS
    (LumenOS) produces better thermal outcomes than a power-only scheduler, 
    demonstrating that the OS choice shapes mission success.
    """
    lumen, naive = _results()
    assert lumen["max_temperature_reached"] < naive["max_temperature_reached"]


def test_naive_hits_shutdown() -> None:
    """The Naive Scheduler (Legacy) must reach SHUTDOWN at least once.
    
    Validates that without thermodynamics-aware engineering decisions, the 
    spacecraft hardware crosses the 95°C safety threshold — demonstrating
    the cost of thermally-blind resource management.
    """
    _, naive = _results()
    assert naive["thermal_shutdowns"] >= 1
    assert any(row["thermal_status"] == "SHUTDOWN" for row in naive["timeline"])


def test_lumen_never_shuts_down() -> None:
    """LumenOS must never let the spacecraft reach SHUTDOWN.
    
    Validates that LumenOS's 5-minute thermal look-ahead successfully manages
    competing resource demands (thermal budget + power budget + compute budget),
    keeping the hardware below the 95°C mission-critical limit throughout.
    """
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
    print("\nAll mission engineering checks passed. LumenOS is mission-ready.")
