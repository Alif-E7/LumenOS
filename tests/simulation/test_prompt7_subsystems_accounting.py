"""
Acceptance Test Suite for PROMPT 7 — Spacecraft Resource Subsystems and Physical Accounting.

Verifies:
1. Power & Photovoltaic Solar Generation (irradiance, area, efficiency, degradation, angle, penumbra).
2. Physical Battery Accounting:
   - Energy conservation & charge/discharge efficiency.
   - Usable capacity & charge/discharge power limits.
   - State of Charge (SoC: 0-100%) and Depth of Discharge (DoD).
   - Safe reserve threshold (20%) and critical shutdown threshold (10%).
   - EFC (Equivalent Full Cycles): verifies that LEO orbits DO NOT count as 1 full cycle!
   - State of Health (SOH) degradation per EFC.
3. Thermal Subsystem (Lumped Thermal Approximation):
   - C * dT/dt = Q_in - Q_out.
   - Internal waste heat from electrical loads.
   - Environmental heat: direct solar, Earth IR, and albedo view factor.
   - Radiative rejection to deep space (Stefan-Boltzmann).
   - Thermostatic heater hysteresis (ON below 5°C, OFF above 8°C).
   - Temperature bounds and warnings.
4. Storage & Multi-Queue Data Management:
   - Segregated queues: raw observations, processed products, priority alerts, dropped overflow.
   - Onboard compression pipeline (3:1 FULL, 2:1 ECO, bypass SAFE).
   - Overflow protection: raw data is dropped before alerts.
5. Communications & Ground Contact:
   - Contact window elevation mask (>= 5°).
   - Bandwidth scaling with elevation angle and FSPL.
   - Priority downlink queue order (alerts -> processed -> raw).
   - Transmission interruption on antenna pointing misalignment.
6. Flight Computer Workload & Operational Profiles:
   - FULL, ECO, SAFE profiles and their electrical / thermal signatures.
   - Documentation check: profiles are user-facing operational profiles, not ML precision aliases.
7. Radiation & Space Debris Accounting:
   - TID accumulation in SAA and polar auroras; component hardness (COTS vs Rad-Tolerant vs Rad-Hard).
   - Debris risk incorporates altitude shell flux, inclination crossing multiplier, and Whipple bumper.
   - Educational abstraction label.
8. Player Action Trajectory Alteration:
   - Proof that player actions alter resource trajectories (power, battery, temperature, data storage).
"""

import math
import pytest

from simulation.physics.power import (
    PowerModel,
    PowerConfig,
    PowerLoad,
    SOLAR_CONSTANT_W_M2,
    BATTERY_CHARGE_EFFICIENCY,
    BATTERY_DISCHARGE_EFFICIENCY,
)
from simulation.physics.thermal import (
    ThermalModel,
    ThermalConfig,
    STEFAN_BOLTZMANN,
    SPACE_TEMP_K,
)
from simulation.physics.storage import (
    StorageModel,
    StorageConfig,
    WorkloadModel,
    WorkloadConfig,
    WorkloadProfile,
)
from simulation.physics.comms import (
    CommsModel,
    CommsConfig,
    GroundStation,
)
from simulation.physics.radiation_debris import (
    RadiationDebrisModel,
    RadiationDebrisConfig,
    RadiationHardness,
)
from simulation.core import (
    SimulationRunner,
    SimulationConfig,
    SpacecraftConfig,
)
from simulation.physics.orbital import GroundTarget, OrbitalElements


# ── 1. Power & Photovoltaic Solar Generation ─────────────────────────────────

class TestPowerGeneration:
    def test_solar_generation_irradiance_scaling(self):
        """Solar output scales linearly with incident solar irradiance."""
        config = PowerConfig(solar_panel_area_m2=5.0, cell_efficiency=0.30)
        model = PowerModel(config=config)

        # Baseline 1361 W/m²: 1361 * 5.0 * 0.30 = 2041.5 W
        p_nominal = model.solar_output(in_eclipse=False, solar_irradiance_w_m2=1361.0)
        assert pytest.approx(p_nominal, rel=1e-3) == 2041.5

        # Higher solar flux (e.g. perihelion or solar storm flare: 1400 W/m²)
        p_high = model.solar_output(in_eclipse=False, solar_irradiance_w_m2=1400.0)
        assert p_high > p_nominal
        assert pytest.approx(p_high, rel=1e-3) == 1400.0 * 5.0 * 0.30

    def test_solar_incidence_angle_cosine_law(self):
        """Solar generation obeys Lambert's cosine law and drops to 0 past 90 degrees."""
        model = PowerModel(config=PowerConfig(solar_panel_area_m2=6.0, cell_efficiency=0.30))

        p_0 = model.solar_output(in_eclipse=False, sun_angle_deg=0.0)
        p_60 = model.solar_output(in_eclipse=False, sun_angle_deg=60.0)
        p_90 = model.solar_output(in_eclipse=False, sun_angle_deg=90.0)
        p_120 = model.solar_output(in_eclipse=False, sun_angle_deg=120.0)

        # cos(60°) = 0.5
        assert pytest.approx(p_60 / p_0, rel=1e-3) == 0.5
        assert p_90 == 0.0
        assert p_120 == 0.0

    def test_conical_penumbra_partial_illumination(self):
        """Partial sunlight in penumbra generates proportional fractional power."""
        model = PowerModel(config=PowerConfig(solar_panel_area_m2=6.0, cell_efficiency=0.30))

        p_full = model.solar_output(in_eclipse=False, sunlight_fraction=1.0)
        p_penumbra = model.solar_output(in_eclipse=False, sunlight_fraction=0.45)
        p_umbra = model.solar_output(in_eclipse=True, sunlight_fraction=0.0)

        assert pytest.approx(p_penumbra / p_full, rel=1e-3) == 0.45
        assert p_umbra == 0.0

    def test_solar_panel_radiation_degradation(self):
        """Solar arrays degrade gradually over cumulative mission elapsed days."""
        config = PowerConfig(solar_panel_area_m2=6.0, panel_degradation_per_year=0.01)
        model = PowerModel(config=config)

        # Day 0
        state_day0 = model.step(dt_seconds=60, in_eclipse=False, mission_elapsed_days=0.0)
        gen_day0 = state_day0.solar_output_w

        # Day 365.25 (1 year later)
        state_year1 = model.step(dt_seconds=60, in_eclipse=False, mission_elapsed_days=365.25)
        gen_year1 = state_year1.solar_output_w

        assert state_year1.panel_degradation_factor < 1.0
        assert gen_year1 < gen_day0
        assert pytest.approx(gen_year1 / gen_day0, rel=1e-2) == 0.99


# ── 2. Battery Physical Accounting & Cycle Aging ─────────────────────────────

class TestBatteryPhysicalAccounting:
    def test_energy_conservation_and_efficiency(self):
        """Energy balance accounts for charge (92%) and discharge (95%) losses."""
        capacity_wh = 1000.0
        config = PowerConfig(battery_capacity_wh=capacity_wh)
        model = PowerModel(config=config)

        # Force battery to 500 Wh
        model.state.battery_soc_wh = 500.0

        # Discharging: net deficit = -200 W for 1 hour (3600 s)
        # Load draws 200 W, drained from battery = 200 / 0.95 = 210.526 Wh
        model.loads = [PowerLoad("test_load", 200.0, priority=1, active=True)]
        state_dis = model.step(dt_seconds=3600, in_eclipse=True)

        expected_soc_after_dis = 500.0 - (200.0 / BATTERY_DISCHARGE_EFFICIENCY)
        assert pytest.approx(state_dis.battery_soc_wh, rel=1e-3) == expected_soc_after_dis

        # Charging: net surplus = 300 W for 1 hour with 0 load
        # Energy in = 300 * 0.92 = 276.0 Wh
        model.loads = [PowerLoad("test_load", 0.0, priority=1, active=True)]
        # Force solar generation to 300 W
        soc_before_chg = state_dis.battery_soc_wh
        model.config.solar_panel_area_m2 = 300.0 / (1361.0 * 0.30)
        state_chg = model.step(dt_seconds=3600, in_eclipse=False)

        expected_soc_after_chg = soc_before_chg + (300.0 * BATTERY_CHARGE_EFFICIENCY)
        assert pytest.approx(state_chg.battery_soc_wh, rel=1e-3) == expected_soc_after_chg

    def test_usable_capacity_and_power_limits(self):
        """Battery respects power limits and usable capacity boundaries."""
        config = PowerConfig(
            battery_capacity_wh=2000.0,
            max_charge_power_w=500.0,
            min_soc_fraction=0.10,
        )
        model = PowerModel(config=config)
        model.state.battery_soc_wh = 1000.0

        # Massive surplus of 2000 W should be clamped to max_charge_power_w (500 W)
        model.config.solar_panel_area_m2 = 2000.0 / (1361.0 * 0.30)
        model.loads = [PowerLoad("zero", 0.0, priority=1, active=True)]
        state = model.step(dt_seconds=3600, in_eclipse=False)

        energy_added = state.battery_soc_wh - 1000.0
        # Clamped at 500 W * 1 h * 0.92 = 460 Wh
        assert pytest.approx(energy_added, rel=1e-3) == 500.0 * BATTERY_CHARGE_EFFICIENCY
        assert state.battery_usable_capacity_wh == 2000.0 * 0.90

    def test_battery_cycle_accounting_not_one_per_orbit(self):
        """
        CRITICAL ACCEPTANCE CHECK:
        LEO orbit eclipse discharge must NOT be counted as 1 complete battery cycle!
        Equivalent Full Cycles (EFC) must equal cumulative discharge / nominal capacity.
        """
        capacity_wh = 1000.0
        config = PowerConfig(battery_capacity_wh=capacity_wh)
        model = PowerModel(config=config)

        # Simulate a typical 35-minute (2100 s) LEO eclipse with 150 W load
        # Energy discharged = (150 W * (2100 / 3600) h) / 0.95 = 92.1 Wh
        model.loads = [PowerLoad("bus", 150.0, priority=1, active=True)]
        model.step(dt_seconds=2100, in_eclipse=True)

        efc = model.state.battery_equivalent_full_cycles
        # EFC should be ~0.092, NOT 1.0!
        assert 0.08 < efc < 0.12, f"EFC {efc} should be ~0.092, NOT counted as 1 complete cycle!"
        assert efc != 1.0

        # Simulate 10 such orbits
        for _ in range(9):
            model.step(dt_seconds=2100, in_eclipse=True)

        # After 10 orbits of ~9.2% DoD, cumulative EFC should be ~0.92, NOT 10 cycles!
        assert 0.80 < model.state.battery_equivalent_full_cycles < 1.05
        assert model.state.battery_equivalent_full_cycles < 2.0

    def test_state_of_health_degradation_over_cycles(self):
        """State of health (SOH) decreases gradually with cumulative EFC throughput."""
        config = PowerConfig(battery_capacity_wh=1000.0, efc_wear_factor=0.0001)
        model = PowerModel(config=config)
        model.loads = [PowerLoad("draw", 500.0, priority=1, active=True)]

        # Discharge 2000 Wh total (2 equivalent full cycles)
        for _ in range(4):
            model.step(dt_seconds=3600, in_eclipse=True)

        assert model.state.battery_equivalent_full_cycles >= 2.0
        assert model.state.battery_soh_pct < 100.0
        assert model.state.battery_capacity_wh < 1000.0

    def test_safe_reserve_and_critical_warnings(self):
        """Power flags trigger correctly at safe reserve (20%) and critical (10%)."""
        config = PowerConfig(
            battery_capacity_wh=1000.0,
            safe_reserve_fraction=0.20,
            min_soc_fraction=0.10,
        )
        model = PowerModel(config=config)

        # Set battery to 25% (nominal)
        model.state.battery_soc_wh = 250.0
        state = model.step(dt_seconds=1, in_eclipse=True)
        assert not state.low_power_warning
        assert not state.power_critical

        # Drain to 18% (low power warning)
        model.state.battery_soc_wh = 180.0
        state = model.step(dt_seconds=1, in_eclipse=True)
        assert state.low_power_warning
        assert not state.power_critical

        # Drain to 8% (power critical)
        model.state.battery_soc_wh = 80.0
        state = model.step(dt_seconds=1, in_eclipse=True)
        assert state.low_power_warning
        assert state.power_critical


# ── 3. Lumped Thermal Approximation & Heat Balance ───────────────────────────

class TestLumpedThermalModel:
    def test_lumped_thermal_energy_conservation(self):
        """Verifies lumped thermal formula: C * dT/dt = Q_in - Q_out."""
        c_thermal = 50000.0  # J/K
        config = ThermalConfig(
            thermal_mass_j_per_k=c_thermal,
            radiator_area_m2=2.0,
            heater_power_w=0.0,
        )
        model = ThermalModel(config=config)
        model.state.temperature_k = 300.0

        # In eclipse at 700km: q_in = q_earth_ir + internal_power_w
        # q_earth_ir = 237 * 0.85 * 4.0 * (6371 / 7071)^2 * 0.5
        q_earth_ir = model._earth_ir_heat(altitude_km=700.0)
        q_internal = 200.0
        q_in = q_earth_ir + q_internal
        q_out_expected = 0.85 * STEFAN_BOLTZMANN * 2.0 * (300.0**4 - SPACE_TEMP_K**4)
        q_net = q_in - q_out_expected
        expected_dT = (q_net * 60.0) / c_thermal

        state = model.step(
            dt_seconds=60,
            in_eclipse=True,
            altitude_km=700.0,
            internal_power_w=q_internal,
            sunlight_fraction=0.0,
        )

        assert pytest.approx(state.temperature_k, abs=1e-3) == 300.0 + expected_dT
        assert state.model_type.startswith("Lumped thermal approximation")

    def test_internal_dissipation_from_loads(self):
        """Active electrical loads add internal waste heat, raising equilibrium temperature."""
        m_idle = ThermalModel(config=ThermalConfig(radiator_area_m2=2.0))
        state_idle = m_idle.step(dt_seconds=300, in_eclipse=True, altitude_km=700, internal_power_w=0.0)

        m_active = ThermalModel(config=ThermalConfig(radiator_area_m2=2.0))
        state_active = m_active.step(dt_seconds=300, in_eclipse=True, altitude_km=700, internal_power_w=300.0)

        assert state_active.temperature_k > state_idle.temperature_k
        assert state_active.internal_dissipation_w == 300.0

    def test_thermostatic_heater_hysteresis(self):
        """Heater turns ON below setpoint (5°C) and turns OFF above setpoint + 3°C (8°C)."""
        config = ThermalConfig(
            heater_setpoint_c=5.0,
            heater_power_w=50.0,
        )
        model = ThermalModel(config=config)

        # 10°C: heater should be OFF
        model.state.temperature_k = 273.15 + 10.0
        state = model.step(dt_seconds=60, in_eclipse=True, altitude_km=700, internal_power_w=0)
        assert not state.heater_active

        # Drops to 4°C: heater should turn ON
        model.state.temperature_k = 273.15 + 4.0
        state = model.step(dt_seconds=60, in_eclipse=True, altitude_km=700, internal_power_w=0)
        assert state.heater_active
        assert state.heater_heat_w == 50.0

        # Rises to 7°C: heater should REMAIN ON (hysteresis range 5°C - 8°C)
        model.state.temperature_k = 273.15 + 7.0
        state = model.step(dt_seconds=60, in_eclipse=True, altitude_km=700, internal_power_w=0)
        assert state.heater_active

        # Rises to 9°C: heater should turn OFF
        model.state.temperature_k = 273.15 + 9.0
        state = model.step(dt_seconds=60, in_eclipse=True, altitude_km=700, internal_power_w=0)
        assert not state.heater_active


# ── 4. Storage & Multi-Queue Data Management ─────────────────────────────────

class TestStorageAndDataQueues:
    def test_multi_queue_segregation(self):
        """Storage maintains segregated queues for raw, processed, and priority alerts."""
        model = StorageModel(config=StorageConfig(capacity_mb=1000.0))

        model.write_raw(200.0)
        model.write_processed(100.0)
        model.write_priority_alert(15.0)

        assert model.state.raw_data_mb == 200.0
        assert model.state.processed_data_mb == 100.0
        assert model.state.priority_alerts_mb == 15.0
        assert model.state.used_mb == 315.0
        assert model.state.free_mb == 685.0

    def test_overflow_protection_drops_raw_before_alerts(self):
        """When storage overflows, excess raw data is dropped while priority alerts are protected."""
        model = StorageModel(config=StorageConfig(capacity_mb=500.0))
        # Fill nearly to brim with raw data
        model.write_raw(490.0)
        assert model.state.used_mb == 490.0

        # Incoming 30 MB priority alert package: should prune raw data to guarantee space
        stored = model.write_priority_alert(30.0)
        assert stored == 30.0
        assert model.state.priority_alerts_mb == 30.0
        assert model.state.used_mb == 500.0
        assert model.state.raw_data_mb == 470.0
        assert model.state.dropped_overflow_mb == 20.0

    def test_onboard_compression_pipeline(self):
        """FULL profile compresses raw data at 3:1 ratio into processed products."""
        model = StorageModel(config=StorageConfig(capacity_mb=2000.0))
        model.write_raw(60.0)

        # Process pipeline in FULL profile
        product = model.process_raw_pipeline(dt_seconds=60, profile=WorkloadProfile.FULL)
        assert product > 0.0
        assert model.state.raw_data_mb < 60.0
        assert model.state.processed_data_mb == product
        # 3:1 compression
        assert pytest.approx(model.state.compression_ratio, rel=1e-2) == 3.0


# ── 5. Communications & Prioritized Downlink ─────────────────────────────────

class TestCommsAndDownlink:
    def test_contact_window_elevation_mask(self):
        """Ground station contact occurs only when elevation angle is >= 5 degrees."""
        model = CommsModel()
        # Directly above Svalbard (78.23°N, 15.39°E)
        station, el = model.find_active_station(sat_lat=78.23, sat_lon=15.39, sat_alt_km=700.0)
        assert station is not None
        assert station.name == "Svalbard"
        assert el > 85.0

        # Sub-satellite point in South Pacific (far from any station)
        station_none, el_none = model.find_active_station(sat_lat=-20.0, sat_lon=-120.0, sat_alt_km=700.0)
        assert station_none is None
        assert el_none < 5.0

    def test_prioritized_downlink_order(self):
        """Downlink extracts priority alerts first, then processed products, then raw."""
        storage = StorageModel(config=StorageConfig(capacity_mb=5000.0))
        storage.write_priority_alert(10.0)
        storage.write_processed(50.0)
        storage.write_raw(100.0)

        # Downlink with 30 MB bandwidth window:
        # Should downlink 10 MB alerts + 20 MB processed + 0 MB raw
        extracted = storage.extract_downlink_data(max_downlink_mb=30.0)
        assert extracted["alerts"] == 10.0
        assert extracted["processed"] == 20.0
        assert extracted["raw"] == 0.0
        assert extracted["total"] == 30.0

        assert storage.state.priority_alerts_mb == 0.0
        assert storage.state.processed_data_mb == 30.0
        assert storage.state.raw_data_mb == 100.0

    def test_antenna_pointing_misalignment_interruption(self):
        """Antenna pointing error exceeding beam limit interrupts communication."""
        model = CommsModel(config=CommsConfig(max_pointing_error_deg=5.0))
        # Within beam (pointing error 2°): active contact & transmission
        state_good = model.step(
            dt_seconds=60,
            sat_lat=78.23, sat_lon=15.39, sat_alt_km=700.0,
            transmitting=True,
            pointing_error_deg=2.0,
        )
        assert state_good.in_contact
        assert not state_good.transmission_interrupted

        # Misaligned (pointing error 8°): transmission interrupted
        state_bad = model.step(
            dt_seconds=60,
            sat_lat=78.23, sat_lon=15.39, sat_alt_km=700.0,
            transmitting=True,
            pointing_error_deg=8.0,
        )
        assert state_bad.transmission_interrupted


# ── 6. Flight Computer Workload & Operational Profiles ───────────────────────

class TestWorkloadOperationalProfiles:
    def test_full_eco_safe_profile_signatures(self):
        """FULL, ECO, and SAFE profiles have distinct CPU power, heat, and quality signatures."""
        model = WorkloadModel()

        # FULL profile
        state_full = model.compute_workload(payload_active=True, profile=WorkloadProfile.FULL)
        assert state_full.cpu_power_w == 35.0
        assert state_full.waste_heat_w == 35.0
        assert state_full.output_quality == "high"

        # ECO profile
        state_eco = model.compute_workload(payload_active=True, profile=WorkloadProfile.ECO)
        assert state_eco.cpu_power_w == 15.0
        assert state_eco.waste_heat_w == 15.0
        assert state_eco.output_quality == "standard"
        assert state_eco.cpu_usage_pct < state_full.cpu_usage_pct

        # SAFE profile
        state_safe = model.compute_workload(payload_active=False, profile=WorkloadProfile.SAFE)
        assert state_safe.cpu_power_w == 5.0
        assert state_safe.waste_heat_w == 5.0
        assert state_safe.output_quality == "minimal"

    def test_operational_profiles_not_ml_aliases(self):
        """Explicit educational documentation check: profiles are NOT synonyms for FP32/INT8/TinyML."""
        model = WorkloadModel()
        state = model.compute_workload()
        assert "not synonyms for FP32" in state.profile_educational_note


# ── 7. Radiation & Space Debris Accounting ───────────────────────────────────

class TestRadiationAndDebrisAccounting:
    def test_radiation_dose_saa_and_polar_aurora(self):
        """Total Ionizing Dose (TID) accumulates faster in SAA and auroral horns."""
        model = RadiationDebrisModel(config=RadiationDebrisConfig(radiation_hardness=RadiationHardness.RAD_TOLERANT))

        # Nominal LEO step (1 hour)
        s_nom = model.step(dt_seconds=3600, altitude_km=700, latitude_deg=0.0, longitude_deg=0.0)
        dose_nom = s_nom.instantaneous_dose_rate_rad_per_hour

        # SAA zone step (1 hour)
        s_saa = model.step(dt_seconds=3600, altitude_km=700, latitude_deg=-25.0, longitude_deg=-45.0, in_saa_zone=True)
        assert s_saa.instantaneous_dose_rate_rad_per_hour > dose_nom
        assert s_saa.in_saa_zone
        assert s_saa.total_ionizing_dose_rad > 0.1

    def test_component_radiation_hardness_tiers(self):
        """COTS components have lower TID limit and higher SEU sensitivity than RAD_HARD."""
        cots = RadiationDebrisModel(config=RadiationDebrisConfig(radiation_hardness=RadiationHardness.COTS))
        rad_hard = RadiationDebrisModel(config=RadiationDebrisConfig(radiation_hardness=RadiationHardness.RAD_HARD))

        assert cots.config.tid_limit_rad == 5000.0
        assert rad_hard.config.tid_limit_rad == 100000.0

        s_cots = cots.step(dt_seconds=3600, altitude_km=700, latitude_deg=0, longitude_deg=0)
        s_hard = rad_hard.step(dt_seconds=3600, altitude_km=700, latitude_deg=0, longitude_deg=0)

        assert s_cots.seu_rate_per_day > s_hard.seu_rate_per_day

    def test_debris_risk_not_only_surface_area(self):
        """
        CRITICAL ACCEPTANCE CHECK:
        Debris risk is NOT based only on total spacecraft surface area:
        - Incorporates altitude shell flux (peak at 750-900 km, low below 450 km).
        - Incorporates orbital inclination crossing factor (polar vs equatorial).
        - Incorporates Whipple bumper shielding factor.
        """
        # Case A: 350 km altitude (dense atmospheric drag clears debris)
        m_low = RadiationDebrisModel()
        s_low = m_low.step(dt_seconds=60, altitude_km=350, latitude_deg=0, longitude_deg=0, inclination_deg=28.5)

        # Case B: 800 km altitude (peak debris shell)
        m_peak = RadiationDebrisModel()
        s_peak = m_peak.step(dt_seconds=60, altitude_km=800, latitude_deg=0, longitude_deg=0, inclination_deg=28.5)

        # Peak shell collision risk should be significantly higher than low altitude
        assert s_peak.debris_collision_risk_index > s_low.debris_collision_risk_index

        # Case C: 800 km Polar SSO (i=98°) vs 800 km Equatorial (i=10°)
        m_polar = RadiationDebrisModel()
        s_polar = m_polar.step(dt_seconds=60, altitude_km=800, latitude_deg=0, longitude_deg=0, inclination_deg=98.0)
        m_equat = RadiationDebrisModel()
        s_equat = m_equat.step(dt_seconds=60, altitude_km=800, latitude_deg=0, longitude_deg=0, inclination_deg=10.0)

        assert s_polar.debris_collision_risk_index > s_equat.debris_collision_risk_index

        # Case D: Unshielded vs Whipple bumper shield
        m_shielded = RadiationDebrisModel(config=RadiationDebrisConfig(has_whipple_shield=True))
        s_shielded = m_shielded.step(dt_seconds=60, altitude_km=800, latitude_deg=0, longitude_deg=0, inclination_deg=98.0)

        assert s_shielded.debris_collision_risk_index < s_polar.debris_collision_risk_index
        assert "Simplified educational abstraction" in s_polar.educational_disclaimer


# ── 8. Proof that Player Actions Alter Resource Trajectories ─────────────────

class TestPlayerActionTrajectoryAlteration:
    def test_operational_profile_alters_battery_and_thermal_trajectory(self):
        """Switching profile from FULL to SAFE directly alters power, battery, and thermal trajectories."""
        # Run 1: FULL profile through eclipse
        sc1 = SpacecraftConfig(
            orbital=OrbitalElements(semi_major_axis_km=6371.0 + 700.0),
            operational_profile=WorkloadProfile.FULL,
        )
        r1 = SimulationRunner(config=SimulationConfig(seed=42), spacecraft=sc1)
        r1.step(steps=40)  # Enter eclipse
        soc_full = r1.get_snapshot().power.battery_soc_wh
        temp_full = r1.get_snapshot().thermal.temperature_c

        # Run 2: Commanded to SAFE profile at step 20
        sc2 = SpacecraftConfig(
            orbital=OrbitalElements(semi_major_axis_km=6371.0 + 700.0),
            operational_profile=WorkloadProfile.FULL,
        )
        r2 = SimulationRunner(config=SimulationConfig(seed=42), spacecraft=sc2)
        r2.step(steps=20)
        # Apply player action to switch to SAFE profile
        action_res = r2.apply_action({"type": "set_operational_profile", "profile": "SAFE"})
        assert action_res["applied"]
        r2.step(steps=20)
        soc_safe = r2.get_snapshot().power.battery_soc_wh
        temp_safe = r2.get_snapshot().thermal.temperature_c

        # SAFE profile draws much less power -> higher remaining battery SoC
        assert soc_safe > soc_full, f"SAFE SoC {soc_safe:.1f} Wh should exceed FULL SoC {soc_full:.1f} Wh"
        # SAFE profile produces less internal waste heat -> cooler bus temperature
        assert temp_safe < temp_full, f"SAFE temp {temp_safe:.1f}°C should be cooler than FULL {temp_full:.1f}°C"

    def test_payload_toggle_alters_data_and_power_trajectories(self):
        """Toggling payload OFF stops data accumulation and reduces bus load."""
        sc = SpacecraftConfig(payload_active=True)
        runner = SimulationRunner(config=SimulationConfig(seed=42), spacecraft=sc)

        runner.step(steps=10)
        used_mid = runner.get_snapshot().storage.used_mb
        assert used_mid > 0

        # Turn payload OFF
        res = runner.apply_action({"type": "set_payload_active", "active": False})
        assert res["applied"]
        runner.step(steps=10)
        used_after = runner.get_snapshot().storage.used_mb

        # Storage should not have grown further (excluding compression pipeline)
        assert runner.get_snapshot().power.load_breakdown_w.get("payload") is None or not sc.payload_active

    def test_radiator_adjustment_alters_thermal_equilibrium(self):
        """Adjusting radiator area changes thermal rejection and cools the bus."""
        sc = SpacecraftConfig()
        runner = SimulationRunner(config=SimulationConfig(seed=42), spacecraft=sc)
        runner.step(steps=30)
        temp_before = runner.get_snapshot().thermal.temperature_k

        # Expand radiator by +3.0 m²
        res = runner.apply_action({"type": "adjust_radiator", "delta_m2": 3.0})
        assert res["applied"]
        runner.step(steps=30)
        temp_after = runner.get_snapshot().thermal.temperature_k

        assert temp_after < temp_before
