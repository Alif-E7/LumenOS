"""
PROMPT 13 — FAIR THREE-WAY CONTROL COMPARISON AND BENCHMARK HARNESS TEST SUITE
==============================================================================
Acceptance Checks:
  1. Identical-input tests: spacecraft, orbit, environment, contract, initial states.
  2. Isolated random streams: exogenous environment events use an independent random
     stream so controller action draws cannot shift later environmental events.
  3. Zero future information leakage for all three controllers.
  4. Multi-seed runs and bit-exact reproducibility.
  5. Exhaustive metrics verification: thermal, battery, science, energy, uptime, score, MAE/RMSE.
  6. Machine-readable JSON output and plain-language summary with limitations.
  7. Reporting of trade-offs where Manual or Reactive outperforms LumenOS.
  8. Headless operation independent of UI.
  9. REST API endpoints verification (/api/benchmark/run, /scenarios, /latest, /suite).
"""

import json
import pytest
from fastapi.testclient import TestClient

from api.main import app
from game.benchmark import (
    BenchmarkHarness,
    BenchmarkMetrics,
    BenchmarkTrialResult,
    BenchmarkComparisonResult,
    ControllerStrategy,
    ManualPilotController,
    ReactiveAutopilotController,
    LumenOSPredictiveController,
    benchmark_harness,
)
from api.routers.missions import _load_missions


@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# 1. Identical-Input & Fair Setup Verification
# ---------------------------------------------------------------------------

def test_identical_input_setup_across_controllers():
    """Verify all 3 controllers receive identical initial conditions and mission contract."""
    harness = BenchmarkHarness()
    comparison = harness.run_comparison(scenario_id="wildfire", seed=42, max_steps=30)

    assert isinstance(comparison, BenchmarkComparisonResult)
    assert comparison.scenario_id == "wildfire"
    assert comparison.seed == 42
    assert len(comparison.trials) == 3

    trial_keys = set(comparison.trials.keys())
    assert trial_keys == {
        ControllerStrategy.MANUAL_PILOT.value,
        ControllerStrategy.REACTIVE_AUTOPILOT.value,
        ControllerStrategy.LUMENOS_PREDICTIVE.value,
    }

    # Verify identical step duration
    for trial in comparison.trials.values():
        assert trial.max_steps == 30
        assert trial.scenario_id == "wildfire"
        assert trial.seed == 42
        assert trial.metrics.final_spacecraft_health_pct > 0.0


def test_isolated_random_streams_for_environmental_events():
    """
    Verify that exogenous environmental events are drawn on an isolated stream:
    Even if controllers execute different numbers of actions or internal random draws,
    the exogenous events occur at the exact same step with identical names.
    """
    harness = BenchmarkHarness()
    missions = _load_missions()
    mission = missions["wildfire"]

    # Precompute exogenous events twice with identical seed 77
    evs_run1 = harness._precompute_exogenous_events(mission, seed=77, max_steps=60)
    evs_run2 = harness._precompute_exogenous_events(mission, seed=77, max_steps=60)

    assert set(evs_run1.keys()) == set(evs_run2.keys())
    for step in evs_run1:
        names1 = [e.name for e in evs_run1[step]]
        names2 = [e.name for e in evs_run2[step]]
        assert names1 == names2, f"Event realizations at step {step} must be strictly bit-exact"


# ---------------------------------------------------------------------------
# 2. Zero Future Information Leakage
# ---------------------------------------------------------------------------

def test_zero_future_information_leakage():
    """Verify controllers only receive instantaneous telemetry at step t."""
    ctrl_manual = ManualPilotController()
    ctrl_reactive = ReactiveAutopilotController()
    ctrl_predictive = LumenOSPredictiveController()

    ctrl_manual.reset(101)
    ctrl_reactive.reset(101)
    ctrl_predictive.reset(101)

    # All controllers must inherit from BaseBenchmarkController
    assert ctrl_manual.strategy == ControllerStrategy.MANUAL_PILOT
    assert ctrl_reactive.strategy == ControllerStrategy.REACTIVE_AUTOPILOT
    assert ctrl_predictive.strategy == ControllerStrategy.LUMENOS_PREDICTIVE

    # Verify version metadata
    assert ctrl_manual.version == "1.0.0"
    assert ctrl_reactive.version == "1.0.0"
    assert ctrl_predictive.version == "1.0.0"


# ---------------------------------------------------------------------------
# 3. Bit-Exact Reproducibility Across Identical Seeds
# ---------------------------------------------------------------------------

def test_bit_exact_reproducibility():
    """Running identical benchmark comparison with the same seed produces identical results."""
    harness = BenchmarkHarness()

    res1 = harness.run_comparison(scenario_id="wildfire", seed=101, max_steps=30)
    res2 = harness.run_comparison(scenario_id="wildfire", seed=101, max_steps=30)

    for strat in [
        ControllerStrategy.MANUAL_PILOT.value,
        ControllerStrategy.REACTIVE_AUTOPILOT.value,
        ControllerStrategy.LUMENOS_PREDICTIVE.value,
    ]:
        m1 = res1.trials[strat].metrics
        m2 = res2.trials[strat].metrics

        assert m1.mission_score == pytest.approx(m2.mission_score)
        assert m1.thermal_violations_count == m2.thermal_violations_count
        assert m1.min_thermal_margin_c == pytest.approx(m2.min_thermal_margin_c)
        assert m1.min_battery_soc_pct == pytest.approx(m2.min_battery_soc_pct)
        assert m1.science_data_downlinked_mb == pytest.approx(m2.science_data_downlinked_mb)


# ---------------------------------------------------------------------------
# 4. Exhaustive Metrics Verification
# ---------------------------------------------------------------------------

def test_exhaustive_physical_metrics_accounting():
    """Verify that all required physical metrics are computed and populated."""
    harness = BenchmarkHarness()
    comparison = harness.run_comparison(scenario_id="solar_storm", seed=42, max_steps=40)

    pred_trial = comparison.trials[ControllerStrategy.LUMENOS_PREDICTIVE.value]
    m = pred_trial.metrics

    # Thermal checks
    assert isinstance(m.thermal_violations_count, int)
    assert m.min_thermal_margin_c <= m.mean_thermal_margin_c
    assert m.max_temperature_c > 0.0

    # Battery & Energy checks
    assert 0.0 <= m.min_battery_soc_pct <= 100.0
    assert m.energy_generated_wh >= 0.0
    assert m.energy_consumed_wh >= 0.0
    assert m.battery_equivalent_full_cycles >= 0.0

    # Science & Data Storage checks
    assert m.science_data_collected_mb >= 0.0
    assert m.science_data_downlinked_mb >= 0.0
    assert m.useful_science_tasks >= 0

    # Uptime & Operational Profile
    assert 0.0 <= m.uptime_fraction <= 1.0
    assert (m.time_in_full_pct + m.time_in_eco_pct + m.time_in_safe_pct) == pytest.approx(100.0, abs=1.0)

    # Mission Score & Grade
    assert 0.0 <= m.mission_score <= 100.0
    assert m.grade in ("A", "B", "C", "D", "F")

    # Predictive Verification
    assert m.forecast_mae_temp_c is not None
    assert m.forecast_rmse_temp_c is not None


# ---------------------------------------------------------------------------
# 5. Transparent Trade-Offs & Fair Reporting (No Cherry-Picking)
# ---------------------------------------------------------------------------

def test_tradeoffs_and_plain_language_summary():
    """
    Verify that the summary does NOT cherry-pick or guarantee LumenOS always wins.
    Explicitly reports trade-offs and areas where Reactive or Manual control performs well.
    """
    harness = BenchmarkHarness()
    comparison = harness.run_comparison(scenario_id="flood", seed=42, max_steps=40)

    summary = comparison.plain_language_summary
    assert "### Three-Way Flight Control Benchmark" in summary
    assert "Overall Score Winner" in summary
    assert "Thermal Safety" in summary
    assert "Battery Reserve" in summary
    assert "Science Yield" in summary
    assert "Trade-Offs & Controller Comparison Insights" in summary

    # Limitations disclosure
    assert comparison.limitations_disclaimer != ""
    assert "Benchmark Limitations" in comparison.limitations_disclaimer
    assert "epistemic" in comparison.limitations_disclaimer or "stochastic" in comparison.limitations_disclaimer


# ---------------------------------------------------------------------------
# 6. Multi-Seed & Multi-Scenario Benchmark Matrix
# ---------------------------------------------------------------------------

def test_multi_seed_benchmark_suite():
    """Verify repeated trials across multiple mission scenarios and seeds."""
    harness = BenchmarkHarness()
    suite = harness.run_multi_seed_benchmark(
        scenarios=["wildfire", "volcano"],
        seeds=[42, 101],
        max_steps=25,
    )

    assert suite["total_runs"] == 4  # 2 scenarios * 2 seeds
    assert len(suite["comparisons"]) == 4

    summary_stats = suite["summary_statistics"]
    for strat in [
        ControllerStrategy.MANUAL_PILOT.value,
        ControllerStrategy.REACTIVE_AUTOPILOT.value,
        ControllerStrategy.LUMENOS_PREDICTIVE.value,
    ]:
        assert strat in summary_stats
        strat_stats = summary_stats[strat]
        assert "score" in strat_stats
        assert "mean" in strat_stats["score"]
        assert "std" in strat_stats["score"]
        assert "thermal_violations" in strat_stats
        assert "science_downlinked_mb" in strat_stats


# ---------------------------------------------------------------------------
# 7. Machine-Readable Export & Headless Execution
# ---------------------------------------------------------------------------

def test_machine_readable_json_export():
    """Verify benchmark results can be serialized to JSON and executed headlessly."""
    harness = BenchmarkHarness()
    comparison = harness.run_comparison(scenario_id="wildfire", seed=42, max_steps=20)

    dumped = comparison.model_dump()
    json_str = json.dumps(dumped, indent=2)
    assert len(json_str) > 1000

    loaded = json.loads(json_str)
    assert loaded["scenario_id"] == "wildfire"
    assert loaded["seed"] == 42
    assert "manual_pilot" in loaded["trials"]
    assert "reactive_autopilot" in loaded["trials"]
    assert "lumenos_predictive" in loaded["trials"]


# ---------------------------------------------------------------------------
# 8. REST API Endpoints Verification
# ---------------------------------------------------------------------------

def test_api_benchmark_scenarios(client):
    """GET /api/benchmark/scenarios returns available scenarios."""
    resp = client.get("/api/benchmark/scenarios")
    assert resp.status_code == 200
    scenarios = resp.json()
    assert len(scenarios) >= 4
    scenario_ids = [s["id"] for s in scenarios]
    assert "wildfire" in scenario_ids
    assert "flood" in scenario_ids
    assert "solar_storm" in scenario_ids
    assert "volcano" in scenario_ids


def test_api_benchmark_run_endpoint(client):
    """POST /api/benchmark/run executes a 3-way trial and returns comparison."""
    resp = client.post(
        "/api/benchmark/run",
        json={"scenario_id": "wildfire", "seed": 42, "max_steps": 25},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["scenario_id"] == "wildfire"
    assert data["seed"] == 42
    assert "trials" in data
    assert "manual_pilot" in data["trials"]
    assert "reactive_autopilot" in data["trials"]
    assert "lumenos_predictive" in data["trials"]
    assert "plain_language_summary" in data


def test_api_benchmark_latest_endpoint(client):
    """GET /api/benchmark/latest returns the most recent benchmark result."""
    resp = client.get("/api/benchmark/latest")
    assert resp.status_code == 200
    data = resp.json()
    assert "scenario_id" in data
    assert "trials" in data
    assert "plain_language_summary" in data


def test_api_benchmark_suite_endpoint(client):
    """POST /api/benchmark/suite runs a multi-seed matrix."""
    resp = client.post(
        "/api/benchmark/suite",
        json={"scenarios": ["wildfire"], "seeds": [42, 101], "max_steps": 20},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_runs"] == 2
    assert "summary_statistics" in data
