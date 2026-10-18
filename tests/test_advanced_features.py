"""Advanced features — multi-orbit, quantization, space weather, battery SoH.

NASA Space Apps 2026 — "Space Mission Design Game"

Validates the four advanced engineering features of the mission OS:

* **Multi-orbit support** — one parameterized physics engine covers LEO, GEO,
  lunar NRHO and Mars transit theaters (``engine.orbital_engine``).
* **Thermal-aware quantization** — LumenOS downgrades precision
  (FP32 → INT8 → TINY) instead of idling when the server warms
  (``engine.workload_profiler`` + ``engine.lumen_scheduler``).
* **Space weather safe mode** — a NOAA SWPC geomagnetic storm grounds heavy
  workloads and reserves battery for comms (``engine.space_weather``).
* **Battery state-of-health** — hot eclipse entries permanently cost discharge
  capability, and aged packs cannot carry heavy work through eclipse
  (``engine.thermal_engine.Battery``).

Run directly for printed checkpoints + assertions:
    python tests/test_advanced_features.py

Also pytest-compatible:
    pytest tests/test_advanced_features.py
"""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.lumen_scheduler import SOH_HEAVY_LOCKOUT, LumenScheduler  # noqa: E402
from engine.orbital_engine import ORBITAL_PROFILES, get_orbital_profile  # noqa: E402
from engine.space_weather import (  # noqa: E402
    STORM_KP_THRESHOLD,
    fetch_space_weather,
    parse_latest_kp,
)
from engine.workload_profiler import FP32, INT8, resolve_precision  # noqa: E402

SIM_MINUTES = 90


# --------------------------------------------------------------------------- #
# Feature 1 — multi-orbit support
# --------------------------------------------------------------------------- #
def test_profile_catalog_and_aliases() -> None:
    """All four theaters exist, with friendly aliases and sane constraints."""
    assert tuple(ORBITAL_PROFILES) == ("LEO", "GEO", "LUNAR", "MARS")
    for alias, expected in [
        ("leo", "LEO"),
        ("iss", "LEO"),
        ("geostationary", "GEO"),
        ("moon", "LUNAR"),
        ("nrho", "LUNAR"),
        ("mars", "MARS"),
    ]:
        assert get_orbital_profile(alias).key == expected

    geo = get_orbital_profile("GEO")
    assert geo.start_phase == "pre_eclipse", "GEO missions open just before eclipse entry"

    mars = get_orbital_profile("MARS")
    assert mars.earth_ir is False, "no warm body in view during interplanetary cruise"
    assert mars.eclipse_enabled is False, "continuous sunlight during transit"
    assert mars.solar_array_max_watts < 1000.0, "43 % flux means a small array"

    lunar = get_orbital_profile("LUNAR")
    assert lunar.solar_scale < 1.0 and lunar.eclipse_note


@lru_cache(maxsize=None)
def _profile_run(key: str) -> dict[str, Any]:
    """Run the LumenOS hypervisor in one theater and share the result."""
    scheduler = LumenScheduler(orbit_profile=key)
    return scheduler.run_simulation()


def test_every_theater_is_survivable_by_lumenos() -> None:
    """LumenOS completes every theater without a thermal shutdown."""
    for key in ORBITAL_PROFILES:
        result = _profile_run(key)
        assert result["thermal_shutdowns"] == 0, key
        assert result["max_temperature_reached"] < 95.0, key
        assert result["profile"] == key


def test_quantization_defaults_off_on_mars_fp32_job() -> None:
    """On Mars the FP32 heavy job no longer fits the array — quantization is
    what keeps the science flowing (INT8 draw 650 W < 860 W array)."""
    profiler_harness = LumenScheduler(orbit_profile="MARS")
    llm = next(
        t for t in profiler_harness.workload_profiler.get_all_tasks()
        if t.name == "LLM_Fine_Tuning"
    )
    array_watts = 860.0
    budget = array_watts - 100.0  # minus base load
    assert llm.power_for_precision(FP32) > budget, "FP32 LLM cannot fit the Mars bus"
    assert llm.power_for_precision(INT8) <= budget, "INT8 is the enabler on Mars"
    assert llm.heat_for_precision(INT8) < llm.heat_for_precision(FP32)


# --------------------------------------------------------------------------- #
# Feature 2 — thermal-aware quantization
# --------------------------------------------------------------------------- #
def test_quantization_used_before_idling() -> None:
    """The LEO hypervisor runs quantized seconds instead of idling in heat."""
    result = _profile_run("LEO")
    quantized = result["precision_seconds"].get(INT8, 0.0) + result["precision_seconds"].get("TINY", 0.0)
    assert quantized > 0.0, "the policy must actually quantize when warm"
    assert 0.0 < result["mean_accuracy"] <= 1.0


def test_quantization_can_be_disabled() -> None:
    """With quantization disabled the policy is the legacy FP32-only doctrine."""
    scheduler = LumenScheduler(orbit_profile="LEO", enable_quantization=False)
    result = scheduler.run_simulation()
    assert result["precision_seconds"].get(INT8, 0.0) == 0.0
    assert result["precision_seconds"].get("TINY", 0.0) == 0.0
    assert result["mean_accuracy"] == 1.0


def test_auto_resolution_matches_downgrade_ladder() -> None:
    """AUTO maps temperature to the documented precision ladder."""
    assert resolve_precision(25.0) == FP32
    assert resolve_precision(59.9) == FP32
    assert resolve_precision(60.0) == INT8
    assert resolve_precision(79.9) == INT8
    assert resolve_precision(80.0) == "TINY"


def test_naive_never_quantizes() -> None:
    """The thermally-blind baseline always runs full precision."""
    scheduler = LumenScheduler(orbit_profile="LEO")
    naive = scheduler.compare_with_naive_scheduler()
    assert all(row["precision"] in (None, FP32) for row in naive["timeline"])


# --------------------------------------------------------------------------- #
# Feature 3 — space weather safe mode
# --------------------------------------------------------------------------- #
def test_weather_classification() -> None:
    """Kp classification: quiet stays quiet, storm crosses the G3 threshold."""
    quiet = fetch_space_weather(force="quiet")
    storm = fetch_space_weather(force="storm")
    assert quiet.source == "SIMULATED" and not quiet.safe_mode
    assert storm.safe_mode and storm.kp_index >= STORM_KP_THRESHOLD
    assert storm.storm_level >= 3


def test_storm_triggers_safe_mode() -> None:
    """Under a declared storm the hypervisor grounds heavy work for the run."""
    scheduler = LumenScheduler(orbit_profile="LEO", solar_storm=True)
    result = scheduler.run_simulation()
    assert result["safe_mode_minutes"] > 0.0
    assert any("SAFE MODE" in row["decision"] for row in result["timeline"])
    heavy_rows = [
        row for row in result["timeline"]
        if row["task_running"] and row["decision"].startswith("SAFE MODE")
    ]
    assert not heavy_rows, "no non-COLD workload may run while grounded"


def test_weather_feeds_never_raise() -> None:
    """The SWPC fetch degrades to OFFLINE-quiet instead of raising."""
    original = __import__("urllib.request", fromlist=["urlopen"]).urlopen

    def _boom(*args: Any, **kwargs: Any):  # pragma: no cover - exercised below
        raise OSError("network down")

    import engine.space_weather as sw

    sw.urllib.request.urlopen = _boom
    try:
        status = fetch_space_weather(timeout=0.1)
    finally:
        sw.urllib.request.urlopen = original
    assert status.source == "OFFLINE" and not status.safe_mode


def test_swpc_payload_shapes() -> None:
    """Both JSON shapes of the SWPC product parse to the latest Kp."""
    # Current shape: list of objects.
    objects = [
        {"time_tag": "2026-10-17T09:00:00", "Kp": 2.33},
        {"time_tag": "2026-10-17T12:00:00", "Kp": 6.67},
    ]
    kp, tag = parse_latest_kp(objects)
    assert abs(kp - 6.67) < 1e-9 and tag == "2026-10-17T12:00:00"

    # Legacy shape: header row + value rows.
    rows = [["time_tag", "Kp", "a_running", "station_count"], ["2026-10-17T12:00:00", "7.3", 50, 8]]
    kp, tag = parse_latest_kp(rows)
    assert abs(kp - 7.3) < 1e-9

    # Garbage inputs resolve to "no data" rather than raising.
    assert parse_latest_kp([]) == (None, "")
    assert parse_latest_kp([["time_tag", "Kp"]]) == (None, "")
    assert parse_latest_kp([[None, "oops"]]) == (None, "")
    assert parse_latest_kp("not json") == (None, "")


# --------------------------------------------------------------------------- #
# Feature 4 — battery state-of-health
# --------------------------------------------------------------------------- #
def test_hot_eclipse_entry_degrades_battery() -> None:
    """Entering eclipse warm costs 0.5 % SoH — visible by the end of a mission."""
    result = _profile_run("LEO")
    assert result["battery_eclipse_cycles"] >= 1
    assert result["battery_hot_cycles"] >= 1
    assert result["battery_soh_final"] < 1.0
    soh = result["battery_soh_final"]
    assert soh >= 0.95, "one window may not wreck the pack"


def test_soh_lockout_threshold_is_documented() -> None:
    """The heavy-work eclipse lockout exists at 80 % SoH."""
    assert SOH_HEAVY_LOCKOUT == 0.80


def test_soh_affects_discharge_power() -> None:
    """A degraded pack cannot deliver the same eclipse discharge current."""
    from engine.thermal_engine import Battery

    pack = Battery()
    full = pack.effective_max_discharge_watts
    pack.state_of_health = 0.70
    assert pack.effective_max_discharge_watts < full
    assert abs(pack.effective_max_discharge_watts - full * 0.70) < 1e-6
    pack.reset()
    assert pack.state_of_health == 1.0


# --------------------------------------------------------------------------- #
# Regression — legacy baseline unchanged
# --------------------------------------------------------------------------- #
def test_naive_baseline_legacy_numbers() -> None:
    """The educational baseline still crashes at the validated numbers."""
    scheduler = LumenScheduler(orbit_profile="LEO")
    naive = scheduler.compare_with_naive_scheduler()
    assert naive["thermal_shutdowns"] == 1
    assert abs(naive["max_temperature_reached"] - 95.4) < 0.1
    assert abs(naive["lost_compute_seconds"] - 870.0) < 1e-6


if __name__ == "__main__":
    checks = [
        test_profile_catalog_and_aliases,
        test_every_theater_is_survivable_by_lumenos,
        test_quantization_defaults_off_on_mars_fp32_job,
        test_quantization_used_before_idling,
        test_quantization_can_be_disabled,
        test_auto_resolution_matches_downgrade_ladder,
        test_naive_never_quantizes,
        test_weather_classification,
        test_storm_triggers_safe_mode,
        test_weather_feeds_never_raise,
        test_swpc_payload_shapes,
        test_hot_eclipse_entry_degrades_battery,
        test_soh_lockout_threshold_is_documented,
        test_soh_affects_discharge_power,
        test_naive_baseline_legacy_numbers,
    ]
    for test in checks:
        test()
        print(f"PASS  {test.__name__}")
    print("\nAll advanced-feature checks passed. Mission OS is field-ready.")
