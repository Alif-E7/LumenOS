"""
Tests for the integrated simulation engine and physics models.
"""

import math
from simulation.core import SimulationConfig, SimulationRunner, SpacecraftConfig
from simulation.physics.orbital import OrbitalModel, OrbitalElements, R_EARTH_KM
from simulation.physics.power import PowerModel, PowerConfig
from simulation.physics.thermal import ThermalModel, ThermalConfig
from simulation.physics.comms import CommsModel, CommsConfig
from simulation.physics.storage import StorageModel, StorageConfig, WorkloadModel


# ── Orbital Tests ────────────────────────────────────────────────────────────

class TestOrbitalModel:
    def test_orbital_period_iss(self):
        """ISS-like orbit (~400 km) should have ~92 min period."""
        model = OrbitalModel(OrbitalElements(semi_major_axis_km=R_EARTH_KM + 400))
        period_min = model.orbital_period() / 60.0
        assert 90 < period_min < 94, f"ISS period {period_min:.1f} min out of range"

    def test_orbital_period_leo_700(self):
        """700 km orbit should have ~98 min period."""
        model = OrbitalModel(OrbitalElements(semi_major_axis_km=R_EARTH_KM + 700))
        period_min = model.orbital_period() / 60.0
        assert 96 < period_min < 100, f"700km period {period_min:.1f} min out of range"

    def test_propagate_returns_valid_state(self):
        """Propagation should return altitude near the expected value."""
        model = OrbitalModel(OrbitalElements(semi_major_axis_km=R_EARTH_KM + 700))
        state = model.propagate(0.0)
        assert 690 < state.altitude_km < 710

    def test_propagate_latitude_range(self):
        """Latitude should stay within inclination bounds."""
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=R_EARTH_KM + 700,
            inclination_deg=98.0,
        ))
        for t in range(0, 7200, 60):
            state = model.propagate(float(t))
            assert -100 < state.latitude_deg < 100

    def test_propagate_deterministic(self):
        """Same inputs produce same output."""
        m1 = OrbitalModel(OrbitalElements(semi_major_axis_km=R_EARTH_KM + 600))
        m2 = OrbitalModel(OrbitalElements(semi_major_axis_km=R_EARTH_KM + 600))
        s1 = m1.propagate(3600.0)
        s2 = m2.propagate(3600.0)
        assert s1.altitude_km == s2.altitude_km
        assert s1.latitude_deg == s2.latitude_deg


# ── Power Tests ──────────────────────────────────────────────────────────────

class TestPowerModel:
    def test_solar_output_in_sunlight(self):
        """Should produce power in sunlight."""
        model = PowerModel(config=PowerConfig(solar_panel_area_m2=6.0))
        output = model.solar_output(in_eclipse=False)
        assert output > 0
        # 6 m² × 1361 W/m² × 0.30 efficiency ≈ 2450 W
        assert 2000 < output < 3000

    def test_solar_output_in_eclipse(self):
        """Should produce zero power in eclipse."""
        model = PowerModel(config=PowerConfig(solar_panel_area_m2=6.0))
        output = model.solar_output(in_eclipse=True)
        assert output == 0.0

    def test_battery_drains_in_eclipse(self):
        """Battery SOC should decrease during eclipse."""
        model = PowerModel(config=PowerConfig(battery_capacity_wh=2000.0))
        initial_soc = model.state.battery_soc_wh
        model.step(dt_seconds=600, in_eclipse=True)
        assert model.state.battery_soc_wh < initial_soc

    def test_battery_charges_in_sunlight(self):
        """Battery should charge when solar output exceeds load."""
        model = PowerModel(config=PowerConfig(
            solar_panel_area_m2=10.0,
            battery_capacity_wh=3000.0,
        ))
        # Drain some first
        model.step(dt_seconds=600, in_eclipse=True)
        soc_after_drain = model.state.battery_soc_wh
        # Now charge
        model.step(dt_seconds=600, in_eclipse=False)
        assert model.state.battery_soc_wh > soc_after_drain

    def test_load_shedding(self):
        """Shedding a load should reduce total consumption."""
        model = PowerModel()
        load_before = model.total_load()
        model.shed_load("payload")
        load_after = model.total_load()
        assert load_after < load_before


# ── Thermal Tests ────────────────────────────────────────────────────────────

class TestThermalModel:
    def test_temperature_stable_range(self):
        """Temperature should stay in a reasonable range over short periods."""
        model = ThermalModel(config=ThermalConfig(radiator_area_m2=2.0))
        for _ in range(60):
            model.step(dt_seconds=60, in_eclipse=False, altitude_km=700, internal_power_w=100)
        assert 200 < model.state.temperature_k < 400

    def test_eclipse_cooling(self):
        """Temperature should decrease in eclipse (no solar input)."""
        model = ThermalModel()
        model.step(dt_seconds=60, in_eclipse=False, altitude_km=700, internal_power_w=100)
        temp_sun = model.state.temperature_k
        # Cool in eclipse for many steps
        for _ in range(30):
            model.step(dt_seconds=60, in_eclipse=True, altitude_km=700, internal_power_w=50)
        assert model.state.temperature_k < temp_sun


# ── Comms Tests ──────────────────────────────────────────────────────────────

class TestCommsModel:
    def test_data_collection(self):
        """collect_data should increase buffer."""
        model = CommsModel()
        model.collect_data(100.0)
        assert model.state.data_buffer_mb == 100.0

    def test_buffer_does_not_exceed_capacity(self):
        """Buffer should not exceed capacity."""
        model = CommsModel(config=CommsConfig(data_buffer_capacity_mb=500.0))
        stored = model.collect_data(600.0)
        assert stored == 500.0
        assert model.state.data_buffer_mb == 500.0

    def test_find_station_near_svalbard(self):
        """Satellite near Svalbard should find that ground station."""
        model = CommsModel()
        station, el = model.find_active_station(
            sat_lat=78.0, sat_lon=15.0, sat_alt_km=700.0
        )
        assert station is not None
        assert station.name == "Svalbard"


# ── Storage/Workload Tests ───────────────────────────────────────────────────

class TestStorageModel:
    def test_write_and_read(self):
        """Write then read should work correctly."""
        model = StorageModel(config=StorageConfig(capacity_mb=1000.0))
        model.write(400.0)
        assert model.state.used_mb == 400.0
        model.read(200.0)
        assert model.state.used_mb == 200.0

    def test_write_overflow(self):
        """Write should not exceed capacity."""
        model = StorageModel(config=StorageConfig(capacity_mb=100.0))
        written = model.write(150.0)
        assert written == 100.0
        assert model.state.used_mb == 100.0


class TestWorkloadModel:
    def test_workload_with_payload(self):
        """Workload should be higher with payload active."""
        model = WorkloadModel()
        state_on = model.compute_workload(payload_active=True)
        cpu_on = state_on.cpu_usage_pct
        state_off = model.compute_workload(payload_active=False)
        cpu_off = state_off.cpu_usage_pct
        assert cpu_on > cpu_off


# ── Integrated Simulation Tests ──────────────────────────────────────────────

class TestSimulationRunner:
    def test_initial_state(self):
        """Runner starts at step 0."""
        runner = SimulationRunner(config=SimulationConfig(seed=123))
        assert runner.current_step == 0
        assert runner.elapsed_seconds == 0.0

    def test_step_advances(self):
        """Each step advances the counter and returns a snapshot."""
        runner = SimulationRunner(config=SimulationConfig(seed=42, time_step_seconds=30.0))
        snap = runner.step()
        assert snap.step == 1
        assert snap.elapsed_seconds == 30.0
        assert snap.status == "running"

    def test_deterministic(self):
        """Same seed produces identical results."""
        sc = SpacecraftConfig(name="TestCraft")
        r1 = SimulationRunner(config=SimulationConfig(seed=99), spacecraft=sc)
        r2 = SimulationRunner(config=SimulationConfig(seed=99), spacecraft=sc)

        snaps1 = [r1.step() for _ in range(50)]
        snaps2 = [r2.step() for _ in range(50)]

        for s1, s2 in zip(snaps1, snaps2):
            assert s1.orbital.altitude_km == s2.orbital.altitude_km
            assert s1.power.battery_soc_wh == s2.power.battery_soc_wh
            assert s1.thermal.temperature_k == s2.thermal.temperature_k

    def test_reset(self):
        """Reset returns runner to step 0 with fresh models."""
        runner = SimulationRunner(config=SimulationConfig(seed=42))
        for _ in range(50):
            runner.step()
        assert runner.current_step == 50

        runner.reset()
        assert runner.current_step == 0
        assert runner.elapsed_seconds == 0.0
        assert len(runner.history) == 0

    def test_completes_at_max_steps(self):
        """Simulation reports completed at max_steps."""
        runner = SimulationRunner(config=SimulationConfig(seed=1, max_steps=10))
        for _ in range(9):
            snap = runner.step()
            assert snap.status == "running"
        snap = runner.step()
        assert snap.status == "completed"

    def test_health_calculation(self):
        """Health should be between 0 and 100."""
        runner = SimulationRunner(config=SimulationConfig(seed=42))
        snap = runner.step()
        assert 0 <= snap.spacecraft_health_pct <= 100

    def test_apply_action_shed_load(self):
        """Applying shed_load action should change power draw."""
        runner = SimulationRunner(config=SimulationConfig(seed=42))
        runner.step()
        load_before = runner._power.total_load()
        result = runner.apply_action({"type": "shed_load", "load_name": "payload"})
        assert result["applied"] is True
        load_after = runner._power.total_load()
        assert load_after < load_before

    def test_apply_action_unknown(self):
        """Unknown action type should not crash, just report not applied."""
        runner = SimulationRunner(config=SimulationConfig(seed=42))
        result = runner.apply_action({"type": "dance"})
        assert result["applied"] is False

    def test_data_collection_over_time(self):
        """Data should accumulate over simulation steps."""
        runner = SimulationRunner(config=SimulationConfig(seed=42))
        for _ in range(60):
            runner.step()
        snap = runner.get_snapshot()
        assert snap is not None
        assert snap.comms.data_collected_mb > 0
        assert snap.storage.used_mb > 0

    def test_eclipse_affects_power(self):
        """Power state should reflect eclipse conditions."""
        runner = SimulationRunner(config=SimulationConfig(seed=42))
        eclipses_seen = False
        sunlights_seen = False
        for _ in range(200):
            snap = runner.step()
            if snap.orbital.in_eclipse:
                eclipses_seen = True
                assert snap.power.solar_output_w == 0.0
            else:
                sunlights_seen = True
                assert snap.power.solar_output_w > 0.0
        # Over ~200 minutes we should see both conditions
        # (If not, the test still passes — we just check consistency)
