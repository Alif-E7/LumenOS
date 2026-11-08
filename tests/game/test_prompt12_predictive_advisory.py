"""
PROMPT 12 — LUMENOS PREDICTIVE MISSION MANAGEMENT TEST SUITE
=============================================================
Comprehensive test verification for:
  1. Interpretable physics/model-based forward forecasting (5-minute horizon, 60s steps).
  2. Zero future information leakage (only uses state at step t, no oracle or RNG peeking).
  3. Epistemic uncertainty bounds (± sigma expanding over time horizon).
  4. Advisory recommendation generation with plain-language explanations, trade-offs, and variables.
  5. Player decision loop: Accept, Reject, and Modify actions.
  6. Player-authorized automation mode (explicit opt-in, 100% auditable).
  7. Continuous forecast evaluation (MAE, RMSE) and threshold accuracy (Precision, Recall, Lead Time).
  8. Authentic fallibility: system is not tuned to always win; unexpected disturbances produce errors.
  9. Runtime checkpoint persistence (advisory state restore).
  10. GameSession & REST API integration.
"""

import pytest
import math
from game.advisory import (
    LumenOSPredictiveScheduler,
    ForecastStepPrediction,
    ForecastWindow,
    AdvisoryRecommendation,
    PredictionAccuracyRecord,
    AdvisoryMetricsSummary,
)
from simulation.core import SpacecraftConfig
from simulation.physics.orbital import OrbitalElements, GroundTarget
from simulation.physics.thermal import ThermalConfig
from simulation.physics.power import PowerConfig
from game.contracts import MissionContract, ObjectiveDefinition, Difficulty
from game.runtime import SimulationRuntime
from api.routers.missions import _load_missions
from api.services.game_session import SessionManager, session_manager


def _create_test_spacecraft() -> SpacecraftConfig:
    sc = SpacecraftConfig()
    sc.orbital = OrbitalElements(
        semi_major_axis_km=6871.0,
        eccentricity=0.001,
        inclination_deg=51.6,
    )
    sc.power = PowerConfig(
        solar_panel_area_m2=2.5,
        cell_efficiency=0.28,
        battery_capacity_wh=400.0,
        min_soc_fraction=0.20,
    )
    sc.thermal = ThermalConfig(
        radiator_area_m2=1.5,
        spacecraft_area_m2=2.0,
        absorptivity=0.6,
        radiator_emissivity=0.7,
        thermal_mass_j_per_k=36000.0,
        safe_temp_min_k=253.15,
        safe_temp_max_k=323.15,
    )
    return sc


@pytest.fixture
def base_spacecraft() -> SpacecraftConfig:
    return _create_test_spacecraft()


def _make_test_runtime(spacecraft: SpacecraftConfig = None, seed: int = 42) -> SimulationRuntime:
    sc = spacecraft or _create_test_spacecraft()
    contract = MissionContract(
        mission_id="wildfire_test",
        mission_name="Wildfire Test Run",
        description="Headless test mission",
        difficulty=Difficulty.ENGINEER,
        deadline_steps=60,
        budget=10000.0,
        objectives=[
            ObjectiveDefinition(
                id="downlink_data",
                description="Downlink science data",
                target_value=200.0,
                unit="MB",
                weight=1.0,
                is_primary=True,
            )
        ],
        seed=seed,
    )
    return SimulationRuntime(
        session_id=f"test_adv_{seed}",
        mission_id="wildfire",
        contract=contract,
        spacecraft_config=sc,
        seed=seed,
        player_ids=["director_1", "systems_1"],
    )


# ---------------------------------------------------------------------------
# 1. Physics/Model-Based Forward Forecasting Tests
# ---------------------------------------------------------------------------

def test_generate_forecast_physics_projections(base_spacecraft):
    scheduler = LumenOSPredictiveScheduler()
    runtime = _make_test_runtime(base_spacecraft, seed=42)

    # Advance 1 step and grab telemetry
    step_res = runtime.step(1)[0]
    snapshot = step_res["telemetry"]
    snapshot["step"] = 0
    forecast = scheduler.generate_forecast(snapshot, horizon_steps=5, step_seconds=60.0)

    assert isinstance(forecast, ForecastWindow)
    assert forecast.current_step == 0
    assert len(forecast.steps) == 5
    assert forecast.model_provenance == "MODEL_PREDICTION"

    # Step numbers and time horizons check
    for idx, step_pred in enumerate(forecast.steps):
        expected_step = idx + 1
        expected_time = expected_step * 60.0
        assert step_pred.step == expected_step
        assert step_pred.time_seconds == pytest.approx(expected_time)
        assert -100.0 < step_pred.temperature_c < 100.0
        assert 0.0 <= step_pred.battery_soc <= 100.0
        assert step_pred.power_demand_w > 0.0
        assert step_pred.storage_used_mb >= 0.0

    # Epistemic uncertainty bounds expand monotonically over the horizon
    temp_sigmas = [s.uncertainty_temperature_c for s in forecast.steps]
    soc_sigmas = [s.uncertainty_battery_soc for s in forecast.steps]

    for i in range(len(temp_sigmas) - 1):
        assert temp_sigmas[i] < temp_sigmas[i + 1], "Temperature uncertainty must grow with forecast horizon"
        assert soc_sigmas[i] < soc_sigmas[i + 1], "Battery SoC uncertainty must grow with forecast horizon"


def test_zero_future_information_leakage(base_spacecraft):
    """
    Zero information leakage test:
    Verify that the predictor strictly reads the snapshot dictionary and constants,
    without referencing stochastic event pools, future failures, or random generators.
    """
    scheduler = LumenOSPredictiveScheduler()

    # Create two identical telemetry snapshots
    snap_a = {
        "step": 10,
        "sim_time": 600.0,
        "sunlit": True,
        "eclipse_fraction": 0.0,
        "solar_flux_w_m2": 1361.0,
        "position_eci_km": [6871.0, 0.0, 0.0],
        "velocity_eci_km_s": [0.0, 7.6, 0.0],
        "true_anomaly_deg": 45.0,
        "solar_power_w": 280.0,
        "total_power_draw_w": 85.0,
        "net_power_w": 195.0,
        "battery_soc": 85.0,
        "battery_charge_wh": 340.0,
        "battery_capacity_wh": 400.0,
        "temp_c": 22.5,
        "temp_min_c": -20.0,
        "temp_max_c": 50.0,
        "thermal_margin_c": 27.5,
        "cpu_usage_pct": 35.0,
        "storage_used_mb": 120.0,
        "storage_capacity_mb": 32768.0,
        "comms_active": False,
        "instruments_active": 1,
    }

    snap_b = dict(snap_a)  # Exact clone

    forecast_a = scheduler.generate_forecast(snap_a, horizon_steps=5, step_seconds=60.0)
    forecast_b = scheduler.generate_forecast(snap_b, horizon_steps=5, step_seconds=60.0)

    # Identical state inputs must generate strictly identical forecasts (deterministic ODE)
    for s_a, s_b in zip(forecast_a.steps, forecast_b.steps):
        assert s_a.temperature_c == pytest.approx(s_b.temperature_c, abs=1e-6)
        assert s_a.battery_soc == pytest.approx(s_b.battery_soc, abs=1e-6)
        assert s_a.power_demand_w == pytest.approx(s_b.power_demand_w, abs=1e-6)
        assert s_a.storage_used_mb == pytest.approx(s_b.storage_used_mb, abs=1e-6)


# ---------------------------------------------------------------------------
# 2. Recommendation Generation & Semantic Honesty Tests
# ---------------------------------------------------------------------------

def test_recommendation_generation_high_thermal():
    """Predictive scheduler flags approaching thermal limit before violation."""
    scheduler = LumenOSPredictiveScheduler()

    # Spacecraft near upper thermal boundary (48 C, max is 50 C) under high power draw
    near_overheat_snapshot = {
        "step": 20,
        "sim_time": 1200.0,
        "sunlit": True,
        "eclipse_fraction": 0.0,
        "solar_flux_w_m2": 1361.0,
        "position_eci_km": [6871.0, 0.0, 0.0],
        "velocity_eci_km_s": [0.0, 7.6, 0.0],
        "true_anomaly_deg": 90.0,
        "solar_power_w": 250.0,
        "total_power_draw_w": 180.0,
        "net_power_w": 70.0,
        "battery_soc": 70.0,
        "battery_charge_wh": 280.0,
        "battery_capacity_wh": 400.0,
        "temp_c": 47.8,
        "temp_min_c": -20.0,
        "temp_max_c": 50.0,
        "thermal_margin_c": 2.2,
        "cpu_usage_pct": 85.0,
        "storage_used_mb": 500.0,
        "storage_capacity_mb": 32768.0,
        "comms_active": False,
        "instruments_active": 2,
    }

    forecast = scheduler.generate_forecast(near_overheat_snapshot, horizon_steps=5, step_seconds=60.0)
    assert len(forecast.recommendations) > 0

    rec = forecast.recommendations[0]
    assert rec.category == "thermal"
    assert rec.action_type in ("reduce_workload", "delay_noncritical_processing")
    assert rec.lead_time_seconds > 0
    # Semantic honesty checks
    assert rec.explanation != ""
    assert rec.expected_benefit != ""
    assert rec.cost_tradeoff != ""
    assert len(rec.influencing_variables) > 0
    assert "temp_c" in rec.influencing_variables or "total_power_draw_w" in rec.influencing_variables


def test_recommendation_generation_battery_depletion():
    """Predictive scheduler flags battery depletion in eclipse."""
    scheduler = LumenOSPredictiveScheduler()

    # Satellite entering eclipse with high discharge draw
    depletion_snapshot = {
        "step": 40,
        "sim_time": 2400.0,
        "sunlit": False,
        "eclipse_fraction": 1.0,
        "solar_flux_w_m2": 0.0,
        "position_eci_km": [-6871.0, 0.0, 0.0],
        "velocity_eci_km_s": [0.0, -7.6, 0.0],
        "true_anomaly_deg": 180.0,
        "solar_power_w": 0.0,
        "total_power_draw_w": 220.0,
        "net_power_w": -220.0,
        "battery_soc": 24.0,  # Near 20% limit
        "battery_charge_wh": 96.0,
        "battery_capacity_wh": 400.0,
        "temp_c": 5.0,
        "temp_min_c": -20.0,
        "temp_max_c": 50.0,
        "thermal_margin_c": 25.0,
        "cpu_usage_pct": 60.0,
        "storage_used_mb": 100.0,
        "storage_capacity_mb": 32768.0,
        "comms_active": True,
        "instruments_active": 1,
    }

    forecast = scheduler.generate_forecast(depletion_snapshot, horizon_steps=5, step_seconds=60.0)
    power_recs = [r for r in forecast.recommendations if r.category == "power"]
    assert len(power_recs) > 0
    rec = power_recs[0]
    assert rec.action_type in ("reduce_instrument_activity", "enter_safe_mode")
    assert rec.severity in ("warning", "critical")
    assert "battery_soc" in rec.influencing_variables


# ---------------------------------------------------------------------------
# 3. Decision Loop: Accept, Reject, Modify Tests
# ---------------------------------------------------------------------------

def test_decision_loop_accept_recommendation(base_spacecraft):
    scheduler = LumenOSPredictiveScheduler()
    runtime = _make_test_runtime(base_spacecraft, seed=42)

    # Force a mock recommendation
    rec = AdvisoryRecommendation(
        recommendation_id="rec_test_101",
        step_created=1,
        time_created=60.0,
        action_type="reduce_workload",
        parameters={"target_cpu_pct": 30.0},
        severity="warning",
        category="thermal",
        title="Predictive Load Throttle",
        explanation="Thermal margin predicted to drop in 180s.",
        expected_benefit="Averts thermal throttling and protects sensor stability.",
        cost_tradeoff="Slows background science processing tasks by 25%.",
        influencing_variables=["temp_c", "cpu_usage_pct"],
        horizon_seconds=180.0,
        lead_time_seconds=180.0,
    )
    scheduler.active_recommendations[rec.recommendation_id] = rec

    # Accept recommendation
    resp = scheduler.respond_to_recommendation(
        runtime=runtime,
        recommendation_id="rec_test_101",
        action="accept",
        player_id="operator_1",
    )

    assert resp["success"] is True
    assert resp["action"] == "accept"
    assert rec.status == "accepted"
    assert rec.resolved_by == "operator_1"
    assert rec.resolved_step == 0


def test_decision_loop_reject_recommendation(base_spacecraft):
    scheduler = LumenOSPredictiveScheduler()
    runtime = _make_test_runtime(base_spacecraft, seed=42)

    rec = AdvisoryRecommendation(
        recommendation_id="rec_test_102",
        step_created=2,
        time_created=120.0,
        action_type="reduce_instrument_activity",
        parameters={"instrument_id": "thermal_ir"},
        severity="info",
        category="power",
        title="Conserve Battery Reserve",
        explanation="Entering eclipse soon.",
        expected_benefit="Retains 5% additional SoC.",
        cost_tradeoff="Cancels observation pass over target.",
        influencing_variables=["battery_soc"],
        horizon_seconds=120.0,
        lead_time_seconds=120.0,
    )
    scheduler.active_recommendations[rec.recommendation_id] = rec

    resp = scheduler.respond_to_recommendation(
        runtime=runtime,
        recommendation_id="rec_test_102",
        action="reject",
        player_id="science_officer",
    )

    assert resp["success"] is True
    assert resp["action"] == "reject"
    assert rec.status == "rejected"
    assert rec.resolved_by == "science_officer"


def test_decision_loop_modify_recommendation(base_spacecraft):
    scheduler = LumenOSPredictiveScheduler()
    runtime = _make_test_runtime(base_spacecraft, seed=42)

    rec = AdvisoryRecommendation(
        recommendation_id="rec_test_103",
        step_created=3,
        time_created=180.0,
        action_type="reduce_workload",
        parameters={"target_cpu_pct": 20.0},
        severity="warning",
        category="thermal",
        title="Reduce Workload",
        explanation="Thermal throttle forecast.",
        expected_benefit="Drops temperature by 4 deg C.",
        cost_tradeoff="Pauses image compression.",
        influencing_variables=["temp_c"],
        horizon_seconds=180.0,
        lead_time_seconds=180.0,
    )
    scheduler.active_recommendations[rec.recommendation_id] = rec

    # Modify parameters: choose 45% instead of 20%
    resp = scheduler.respond_to_recommendation(
        runtime=runtime,
        recommendation_id="rec_test_103",
        action="modify",
        player_id="systems_engineer",
        modified_parameters={"target_cpu_pct": 45.0},
    )

    assert resp["success"] is True
    assert resp["action"] == "modify"
    assert rec.status == "modified"
    assert rec.parameters["target_cpu_pct"] == 45.0
    assert rec.resolved_by == "systems_engineer"


# ---------------------------------------------------------------------------
# 4. Optional Automation Mode Tests (Auditable Autopilot)
# ---------------------------------------------------------------------------

def test_optional_automation_opt_in_and_execution(base_spacecraft):
    scheduler = LumenOSPredictiveScheduler()
    runtime = _make_test_runtime(base_spacecraft, seed=42)

    # By default, automation is strictly disabled
    assert scheduler.auto_pilot_enabled is False

    # Player authorizes automation
    res = scheduler.set_automation(enabled=True, player_id="mission_director")
    assert res["success"] is True
    assert scheduler.auto_pilot_enabled is True
    assert scheduler.auto_pilot_authorized_by == "mission_director"

    # Add a critical safety recommendation
    rec = AdvisoryRecommendation(
        recommendation_id="rec_critical_001",
        step_created=1,
        time_created=60.0,
        action_type="enter_safe_mode",
        parameters={},
        severity="critical",
        category="power",
        title="Emergency Power Conservation",
        explanation="Critical depletion predicted.",
        expected_benefit="Prevents spacecraft blackout.",
        cost_tradeoff="Disables science operations.",
        influencing_variables=["battery_soc"],
        horizon_seconds=120.0,
        lead_time_seconds=120.0,
    )
    scheduler.active_recommendations[rec.recommendation_id] = rec

    # Tick automation
    actions_taken = scheduler.tick_automation(runtime)
    assert len(actions_taken) == 1
    assert actions_taken[0]["action_type"] == "enter_safe_mode"
    assert rec.status == "auto_executed"
    assert rec.resolved_by == "LumenOS-Autopilot"

    # Verify audit log in runtime
    action_logs = runtime.action_log
    assert any(log.get("actor") == "LumenOS-Autopilot" for log in action_logs)


# ---------------------------------------------------------------------------
# 5. Continuous & Threshold Accuracy Evaluation Tests (Scorecard)
# ---------------------------------------------------------------------------

def test_accuracy_metrics_continuous_and_threshold():
    scheduler = LumenOSPredictiveScheduler()

    # Simulate predictions made at step 10 targeting steps 11..15
    preds = [
        ForecastStepPrediction(
            step=11,
            time_seconds=660.0,
            horizon_seconds=60.0,
            temperature_c=25.0,
            uncertainty_temperature_c=0.5,
            battery_soc=80.0,
            uncertainty_battery_soc=0.6,
            power_demand_w=80.0,
            power_generation_w=200.0,
            net_power_w=120.0,
            cpu_usage_pct=40.0,
            storage_used_mb=200.0,
            predicted_thermal_hazard=False,
            predicted_battery_hazard=False,
            predicted_storage_hazard=False,
        ),
        ForecastStepPrediction(
            step=12,
            time_seconds=720.0,
            horizon_seconds=120.0,
            temperature_c=26.0,
            uncertainty_temperature_c=1.0,
            battery_soc=78.0,
            uncertainty_battery_soc=1.2,
            power_demand_w=80.0,
            power_generation_w=200.0,
            net_power_w=120.0,
            cpu_usage_pct=40.0,
            storage_used_mb=200.0,
            predicted_thermal_hazard=False,
            predicted_battery_hazard=False,
            predicted_storage_hazard=False,
        ),
        ForecastStepPrediction(
            step=13,
            time_seconds=780.0,
            horizon_seconds=180.0,
            temperature_c=52.0,  # Predicted thermal hazard!
            uncertainty_temperature_c=1.5,
            battery_soc=75.0,
            uncertainty_battery_soc=1.8,
            power_demand_w=180.0,
            power_generation_w=100.0,
            net_power_w=-80.0,
            cpu_usage_pct=80.0,
            storage_used_mb=200.0,
            predicted_thermal_hazard=True,
            predicted_battery_hazard=False,
            predicted_storage_hazard=False,
        ),
    ]

    for p in preds:
        scheduler._future_step_predictions[p.step].append((10, p))

    # Evaluate at step 11 with slight continuous error
    snap_11 = {
        "step": 11,
        "temp_c": 25.4,  # error = +0.4
        "battery_soc": 79.5,  # error = -0.5
        "temp_max_c": 50.0,
        "battery_capacity_wh": 400.0,
        "storage_used_mb": 200.0,
        "storage_capacity_mb": 32768.0,
    }
    scheduler.evaluate_actuals(snap_11)

    # Evaluate at step 12
    snap_12 = {
        "step": 12,
        "temp_c": 25.8,  # error = -0.2
        "battery_soc": 77.8,  # error = -0.2
        "temp_max_c": 50.0,
        "battery_capacity_wh": 400.0,
        "storage_used_mb": 200.0,
        "storage_capacity_mb": 32768.0,
    }
    scheduler.evaluate_actuals(snap_12)

    # Evaluate at step 13: Actual temp crossed limit (51.2 C >= 50.0 C) -> True Positive!
    snap_13 = {
        "step": 13,
        "temp_c": 51.2,  # error = -0.8
        "battery_soc": 74.0,  # error = -1.0
        "temp_max_c": 50.0,
        "battery_capacity_wh": 400.0,
        "storage_used_mb": 200.0,
        "storage_capacity_mb": 32768.0,
    }
    scheduler.evaluate_actuals(snap_13)

    metrics = scheduler.compute_metrics_summary()
    assert isinstance(metrics, AdvisoryMetricsSummary)
    assert metrics.evaluation_records_count == 3
    assert metrics.continuous_forecast_mae_temp_c > 0.0
    assert metrics.continuous_forecast_rmse_temp_c >= metrics.continuous_forecast_mae_temp_c
    assert metrics.continuous_forecast_mae_soc_pct > 0.0

    # Threshold metrics
    assert metrics.true_positive_warnings == 1
    assert metrics.false_positive_warnings == 0
    assert metrics.missed_warnings == 0
    assert metrics.warning_precision == pytest.approx(1.0)
    assert metrics.warning_recall == pytest.approx(1.0)
    assert metrics.average_lead_time_seconds == pytest.approx(180.0)


def test_authentic_fallibility_unmodeled_disturbance():
    """
    Semantic honesty & authentic fallibility:
    LumenOS is not an omniscient oracle. When an unmodeled sudden power draw occurs,
    actual error spikes and false-negative (missed warning) is recorded honestly.
    """
    scheduler = LumenOSPredictiveScheduler()

    # Predictor at step 5 projected calm operations at step 6
    pred_step_6 = ForecastStepPrediction(
        step=6,
        time_seconds=360.0,
        horizon_seconds=60.0,
        temperature_c=22.0,
        uncertainty_temperature_c=0.5,
        battery_soc=85.0,
        uncertainty_battery_soc=0.5,
        power_demand_w=50.0,
        power_generation_w=200.0,
        net_power_w=150.0,
        cpu_usage_pct=25.0,
        storage_used_mb=100.0,
        predicted_thermal_hazard=False,
        predicted_battery_hazard=False,
        predicted_storage_hazard=False,
    )
    scheduler._future_step_predictions[6].append((5, pred_step_6))

    # Actual step 6 suffered sudden fault injection / extreme payload runaway (temp = 54.0 C)
    disturbed_snapshot = {
        "step": 6,
        "temp_c": 54.0,  # 32 C higher than predicted!
        "battery_soc": 65.0,
        "temp_max_c": 50.0,  # Limit crossed!
        "battery_capacity_wh": 400.0,
        "storage_used_mb": 100.0,
        "storage_capacity_mb": 32768.0,
    }
    scheduler.evaluate_actuals(disturbed_snapshot)

    metrics = scheduler.compute_metrics_summary()
    assert metrics.continuous_forecast_mae_temp_c == pytest.approx(32.0, abs=0.1)
    # The hazard happened, but was not predicted -> missed warning (False Negative)
    assert metrics.missed_warnings == 1
    assert metrics.warning_recall < 1.0


# ---------------------------------------------------------------------------
# 6. Runtime Integration & Checkpoint Persistence Tests
# ---------------------------------------------------------------------------

def test_runtime_advisory_integration_and_checkpoint(base_spacecraft):
    runtime = _make_test_runtime(base_spacecraft, seed=42)

    # Run 5 steps
    for _ in range(5):
        res = runtime.step()
        summary = res[0]
        assert "advisory" in summary
        advisory_sum = summary["advisory"]
        assert "recommendations" in advisory_sum
        assert "forecast_steps" in advisory_sum
        assert "metrics" in advisory_sum
        assert "auto_pilot_enabled" in advisory_sum

    # Authorize automation and accept a recommendation if present or create one
    runtime.advisory_scheduler.set_automation(enabled=True, player_id="host_1")

    # Save checkpoint
    chk = runtime.save_checkpoint({"name": "advisory_checkpoint_1"})
    assert "advisory" in chk

    # Restore in new runtime
    runtime2 = _make_test_runtime(base_spacecraft, seed=42)
    assert runtime2.advisory_scheduler.auto_pilot_enabled is False

    ok = runtime2.load_checkpoint(chk)
    assert ok is True
    assert runtime2.advisory_scheduler.auto_pilot_enabled is True
    assert runtime2.advisory_scheduler.auto_pilot_authorized_by == "host_1"


# ---------------------------------------------------------------------------
# 7. GameSession Integration & Advisory REST Endpoints
# ---------------------------------------------------------------------------

def test_game_session_advisory_methods(base_spacecraft):
    missions = _load_missions()
    wildfire = missions["wildfire"]

    mgr = SessionManager()
    session = mgr.create_session(
        mission=wildfire,
        spacecraft_config=base_spacecraft,
        player_ids=["director_1", "systems_1"],
    )

    # Initial advisory state
    adv_state = session.get_advisory_state()
    assert "forecast" in adv_state
    assert "recommendations" in adv_state
    assert "metrics" in adv_state
    assert "auto_pilot_enabled" in adv_state

    # Step session
    results = session.step(3)
    assert len(results) == 3

    # Toggle automation via session
    auto_res = session.set_advisory_automation(player_id="director_1", enabled=True)
    assert auto_res["success"] is True
    assert session.get_advisory_state()["auto_pilot_enabled"] is True

    # Get metrics
    metrics = session.get_advisory_metrics()
    assert "continuous_mae_temp_c" in metrics
    assert "warning_precision" in metrics
    assert "model_provenance" in metrics
    assert metrics["model_provenance"] == "MODEL_PREDICTION"
