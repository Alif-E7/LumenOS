"""Orbital Constraints & Thermal Environment Verification.

NASA Space Apps 2026 — "Space Mission Design Game"
===================================================
Validates the astrodynamic and orbital constraints that define the mission's
operating environment: solar power generation, eclipse duration, and radiative
sink temperatures across orbit.

Run directly for a printed orbital telemetry table + assertions:
    python tests/test_orbital.py

Also pytest-compatible:
    pytest tests/test_orbital.py
"""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.orbital_engine import OrbitalEngine  # noqa: E402

DURATION_MINUTES = 90
STEP_SECONDS = 60


@lru_cache(maxsize=1)
def _states() -> tuple[dict[str, Any], ...]:
    """Simulate one orbit once and share the result across tests."""
    engine = OrbitalEngine(altitude_km=550)
    return tuple(engine.simulate_orbit(duration_minutes=DURATION_MINUTES, step_seconds=STEP_SECONDS))


def print_table(states: tuple[dict[str, Any], ...]) -> None:
    """Print the orbital states as a fixed-width table."""
    header = (
        f"{'Time (UTC)':<10} {'Light':<8} {'Solar (W)':>10} "
        f"{'Radiator Facing':<16} {'Sink (K)':>9} {'Max Cooling (W)':>16}"
    )
    print(header)
    print("-" * len(header))
    for s in states:
        print(
            f"{s['timestamp']:%H:%M:%S}   "
            f"{'Sunlit' if s['is_sunlit'] else 'ECLIPSE':<8} "
            f"{s['solar_power_watts']:>10.1f} "
            f"{s['radiator_facing']:<16} "
            f"{s['sink_temperature_kelvin']:>9.0f} "
            f"{s['max_cooling_capacity_watts']:>16.1f}"
        )


def test_has_eclipse_period() -> None:
    """At least one sample in 90 minutes must be in Earth's shadow."""
    assert any(not s["is_sunlit"] for s in _states()), "No ECLIPSE found in 90 minutes"


def test_no_solar_power_in_eclipse() -> None:
    """Solar power must be exactly zero whenever the satellite is eclipsed."""
    for s in _states():
        if not s["is_sunlit"]:
            assert s["solar_power_watts"] == 0.0, f"Solar power during eclipse at {s['timestamp']}"


def test_deep_space_cools_better_than_earth_day() -> None:
    """Radiator facing deep space (3 K) must out-cool facing day-side Earth (280 K)."""
    states = _states()
    deep = [s["max_cooling_capacity_watts"] for s in states if s["radiator_facing"] == "DEEP_SPACE"]
    day = [s["max_cooling_capacity_watts"] for s in states if s["radiator_facing"] == "EARTH_DAY"]
    assert deep, "No DEEP_SPACE samples in orbit"
    assert day, "No EARTH_DAY samples in orbit"
    assert min(deep) > max(day)


if __name__ == "__main__":
    states = _states()
    print_table(states)

    eclipse_minutes = sum(1 for s in states if not s["is_sunlit"]) * STEP_SECONDS / 60
    print(f"\nSamples: {len(states)}  |  Eclipse: ~{eclipse_minutes:.0f} min\n")

    tests = [
        test_has_eclipse_period,
        test_no_solar_power_in_eclipse,
        test_deep_space_cools_better_than_earth_day,
    ]
    for test in tests:
        test()
        print(f"PASS  {test.__name__}")
    print("\nAll orbital environment checks passed. Constraints verified.")
