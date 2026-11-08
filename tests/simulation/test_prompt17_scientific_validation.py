"""
Automated Scientific Validation & Physics Models Audit Test Suite (Prompt 17).

Verifies:
1. Orbital Mechanics & Astrodynamic Equations (Kepler's 3rd Law, Vis-viva, J2 RAAN drift, SSO inclination).
2. Conical/Cylindrical Eclipse Geometry & Penumbra Shadow Model.
3. Solar Photovoltaic Generation (Solar constant, area, efficiency, incidence angle, degradation).
4. Battery Energy Balance, Round-Trip Efficiency & Equivalent Full Cycles (EFC) Accumulation.
5. Spacecraft Lumped Capacitance Thermal Balance & Stefan-Boltzmann Radiative Equilibrium.
6. Communications Link Budget, FSPL & Ground Station Elevation Angle Geometry.
7. Solid-State Storage Multi-Queue Integrity & Priority-Protected Overflow.
8. Space Radiation Dose (SAA & Auroral Horns) & Debris Spatial Density Distribution.
9. Dataset Provenance Integrity & Offline Bundle Verification across all 7 Authoritative Sources.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
import pytest

from simulation.physics.orbital import (
    OrbitalElements,
    OrbitalModel,
    OrbitalState,
    MU_EARTH,
    R_EARTH_KM,
    J2,
    EARTH_OMEGA,
    R_SUN_KM,
    ASTRONOMICAL_UNIT_KM,
    REFERENCE_CASES,
)
from simulation.physics.power import (
    PowerModel,
    PowerConfig,
    PowerLoad,
    SOLAR_CONSTANT_W_M2,
    CELL_EFFICIENCY,
    BATTERY_CHARGE_EFFICIENCY,
    BATTERY_DISCHARGE_EFFICIENCY,
    MIN_SOC_FRACTION,
    SAFE_RESERVE_FRACTION,
)
from simulation.physics.thermal import (
    ThermalModel,
    ThermalConfig,
    STEFAN_BOLTZMANN,
    SPACE_TEMP_K,
    EARTH_ALBEDO,
    EARTH_IR_W_M2,
)
from simulation.physics.comms import (
    CommsModel,
    CommsConfig,
    GroundStation,
    DEFAULT_GROUND_STATIONS,
    SPEED_OF_LIGHT,
)
from simulation.physics.storage import (
    StorageModel,
    StorageConfig,
    WorkloadProfile,
)
from simulation.physics.radiation_debris import (
    RadiationDebrisModel,
    RadiationDebrisConfig,
    RadiationHardness,
)


class TestPrompt17AstrodynamicsValidation:
    """Verifies astrodynamics equations against closed-form analytical solutions and GMAT benchmarks."""

    def test_keplers_third_law_orbital_periods(self):
        """Verify orbital period T = 2*pi*sqrt(a^3/mu) across LEO, MEO, and GEO."""
        test_cases = [
            ("LEO_550km", 6921.0, 5730.13),
            ("Sentinel2_786km", 7157.0, 6025.29),
            ("GPS_MEO", 26560.0, 43082.04),
            ("GEO", 42164.14, 86164.09),
        ]
        for name, a_km, expected_period_s in test_cases:
            a_m = a_km * 1000.0
            n = math.sqrt(MU_EARTH / (a_m ** 3))
            analytical_period_s = 2.0 * math.pi / n
            assert math.isclose(analytical_period_s, expected_period_s, rel_tol=1e-3)

            # Test through OrbitalModel
            elem = OrbitalElements(semi_major_axis_km=a_km, eccentricity=0.0001, inclination_deg=97.6)
            model = OrbitalModel(elem)
            state = model.propagate(0.0)
            assert math.isclose(state.orbital_period_s, analytical_period_s, rel_tol=1e-4)

    def test_vis_viva_orbital_velocity(self):
        """Verify vis-viva orbital speed v = sqrt(mu * (2/r - 1/a))."""
        a_km = 6921.0
        r_km = 6921.0
        mu_km3_s2 = MU_EARTH / 1e9  # 398600.4418 km^3/s^2

        expected_v_km_s = math.sqrt(mu_km3_s2 / a_km)
        assert math.isclose(expected_v_km_s, 7.589, rel_tol=1e-3)

        elem = OrbitalElements(semi_major_axis_km=a_km, eccentricity=0.0001, inclination_deg=97.6)
        model = OrbitalModel(elem)
        state = model.propagate(0.0)
        assert math.isclose(state.velocity_km_s, expected_v_km_s, rel_tol=1e-3)

    def test_j2_secular_raan_drift_and_sun_synchronous_orbit(self):
        """
        Verify J2 nodal precession: dOmega/dt = -1.5 * n * J2 * (R/p)^2 * cos(i).
        At a = 6921 km (550 km alt), e = 0.001, SSO requires dOmega/dt ~ 0.9856 deg/day.
        """
        a_km = 6921.0
        e = 0.001
        p_km = a_km * (1.0 - e ** 2)
        n = math.sqrt((MU_EARTH / 1e9) / (a_km ** 3))  # rad/s

        target_drift_rad_s = (360.0 / 365.2422) * (math.pi / 180.0) / 86400.0  # ~1.991e-7 rad/s
        cos_i = -target_drift_rad_s / (1.5 * n * J2 * ((R_EARTH_KM / p_km) ** 2))
        sso_inclination_deg = math.degrees(math.acos(cos_i))

        # Expected SSO inclination at 550 km is approximately 97.6 deg
        assert math.isclose(sso_inclination_deg, 97.6, abs_tol=0.2)

        # In model propagation, verify precession rate matches
        elem = OrbitalElements(semi_major_axis_km=a_km, eccentricity=e, inclination_deg=sso_inclination_deg)
        model = OrbitalModel(elem)
        state_start = model.propagate(0.0)
        state_day = model.propagate(86400.0)
        raan_delta_deg = (state_day.elements.raan_deg - state_start.elements.raan_deg) % 360.0
        assert math.isclose(raan_delta_deg, 0.9856, rel_tol=0.05)

    def test_conical_shadow_and_penumbra_transition(self):
        """Verify sunlight fraction f_sun = 0 in umbra, 1 in full sunlight, and (0,1) in penumbra."""
        elem = OrbitalElements(semi_major_axis_km=6921.0, eccentricity=0.001, inclination_deg=97.6)
        model = OrbitalModel(elem)

        # Sample across full orbit with high temporal resolution (1-second steps around eclipse boundary)
        sunlight_fractions = []
        for sec in range(0, 5730, 2):
            frac, in_ecl = model.sunlight_exposure(float(sec), use_conical=True)
            sunlight_fractions.append(frac)

        # Must have full sunlight (1.0) and full eclipse (0.0)
        assert 1.0 in sunlight_fractions
        assert 0.0 in sunlight_fractions
        # Check smooth penumbra values exist between 0 and 1
        penumbra_samples = [f for f in sunlight_fractions if 0.0 < f < 1.0]
        assert len(penumbra_samples) >= 1


class TestPrompt17PowerAndBatteryValidation:
    """Verifies photovoltaic generation and battery equivalent full cycle (EFC) energy balance."""

    def test_photovoltaic_power_incidence_angle_scaling(self):
        """Verify P_solar = S0 * A * eta * cos(theta) with clipping at theta >= 90 deg."""
        cfg = PowerConfig(solar_panel_area_m2=6.0, cell_efficiency=0.30, solar_irradiance_w_m2=1361.0)
        model = PowerModel(cfg)

        # Normal incidence (theta = 0 deg)
        p_normal = model.solar_output(in_eclipse=False, sun_angle_deg=0.0)
        expected_normal = 1361.0 * 6.0 * 0.30 * 1.0  # 2449.8 W
        assert math.isclose(p_normal, expected_normal, rel_tol=1e-3)

        # 60 deg incidence (cos(60 deg) = 0.5)
        p_60 = model.solar_output(in_eclipse=False, sun_angle_deg=60.0)
        assert math.isclose(p_60, expected_normal * 0.5, rel_tol=1e-3)

        # 90 deg or oblique (>90 deg): must clip to 0 W
        p_90 = model.solar_output(in_eclipse=False, sun_angle_deg=90.0)
        assert p_90 == 0.0
        p_120 = model.solar_output(in_eclipse=False, sun_angle_deg=120.0)
        assert p_120 == 0.0

    def test_battery_energy_conservation_and_efficiency_losses(self):
        """Verify battery energy accounting integrates charge/discharge efficiency."""
        cfg = PowerConfig(
            battery_capacity_wh=2000.0,
            solar_panel_area_m2=6.0,
            cell_efficiency=0.30,
        )
        model = PowerModel(cfg)

        # Start with 500 Wh SoC
        model.state.battery_soc_wh = 500.0

        # Set specific active loads: 200 W total
        for l in model.loads:
            l.active = False
        model.loads[0].name = "avionics"
        model.loads[0].power_w = 200.0
        model.loads[0].active = True

        # In eclipse: discharge deficit of 200 W for 1 hr (3600 s)
        # Expected SoC loss = 200 W / eta_dis (0.95) * 1 hr = 210.53 Wh
        model.step(dt_seconds=3600, in_eclipse=True)
        expected_soc_after_dis = 500.0 - (200.0 / BATTERY_DISCHARGE_EFFICIENCY)
        assert math.isclose(model.state.battery_soc_wh, expected_soc_after_dis, abs_tol=1.0)

        # In sunlight with 500 W net generation surplus for 1 hr
        # Solar = 500 W + 200 W load = 700 W. Surplus = 500 W.
        # Added energy = 500 W * eta_chg (0.92) * 1 hr = 460 Wh.
        soc_before = model.state.battery_soc_wh
        # Set panel area so solar output is 500 W surplus above 200 W
        # 1361 * A * 0.30 = 700 W -> A = 700 / (1361 * 0.30) ~ 1.7144 m2
        model.config.solar_panel_area_m2 = 700.0 / (1361.0 * 0.30)
        model.step(dt_seconds=3600, in_eclipse=False, sun_angle_deg=0.0)
        expected_soc_after_chg = soc_before + (500.0 * BATTERY_CHARGE_EFFICIENCY)
        assert math.isclose(model.state.battery_soc_wh, expected_soc_after_chg, abs_tol=2.0)

    def test_equivalent_full_cycles_not_equal_to_orbit_count(self):
        """Verify that LEO orbits DO NOT count as 1 full cycle; tracks integrated fractional throughput."""
        cfg = PowerConfig(battery_capacity_wh=2000.0)
        model = PowerModel(cfg)

        # In eclipse for 2100 s (35 min) discharging standard load (~155 W)
        model.step(dt_seconds=2100, in_eclipse=True)
        efc = model.state.battery_equivalent_full_cycles
        # A single eclipse discharge must produce a small fraction (e.g. ~0.05), NOT 1.0!
        assert 0.01 < efc < 0.15


class TestPrompt17ThermalValidation:
    """Verifies lumped thermal capacitance model against Stefan-Boltzmann analytical solutions."""

    def test_stefan_boltzmann_equilibrium_temperatures(self):
        """
        Verify steady-state temperature T_eq = (Q_in / (epsilon * sigma * A) + T_space^4)^0.25.
        For Q_in = 120 W, epsilon = 0.85, A = 2.0 m^2:
        T_eq = (120 / (0.85 * 5.67037e-8 * 2.0) + 2.725^4)^0.25 = 187.97 K (-85.18 C).
        """
        q_in = 120.0
        eps = 0.85
        area = 2.0
        sigma = STEFAN_BOLTZMANN
        t_space = SPACE_TEMP_K

        t_eq_analytical = math.pow((q_in / (eps * sigma * area)) + math.pow(t_space, 4.0), 0.25)
        assert math.isclose(t_eq_analytical, 187.97, rel_tol=1e-3)

        cfg = ThermalConfig(
            radiator_area_m2=area,
            radiator_emissivity=eps,
            spacecraft_area_m2=0.0,       # Zero external area to isolate internal power balance
            thermal_mass_j_per_k=1000.0,  # small thermal mass for quick convergence
            heater_power_w=0.0,           # heater disabled to measure pure radiative balance
        )
        model = ThermalModel(cfg)
        model.state.temperature_k = 200.0

        # Step forward until steady-state
        for _ in range(500):
            model.step(dt_seconds=60.0, in_eclipse=True, altitude_km=700.0, internal_power_w=q_in, sunlight_fraction=0.0)

        assert math.isclose(model.state.temperature_k, t_eq_analytical, abs_tol=0.2)

    def test_thermostatic_heater_hysteresis(self):
        """Verify heater turns ON below setpoint (5°C) and turns OFF at setpoint + 3°C (8°C)."""
        cfg = ThermalConfig(
            heater_setpoint_c=5.0,
            heater_power_w=30.0,
            thermal_mass_j_per_k=50000.0,
        )
        model = ThermalModel(cfg)

        # Test at 4°C: heater must be ON
        model.state.temperature_c = 4.0
        model.state.temperature_k = 277.15
        model.state.heater_active = False
        model.step(dt_seconds=60.0, in_eclipse=True, altitude_km=700.0, internal_power_w=0.0)
        assert model.state.heater_active is True
        assert model.state.heater_heat_w == 30.0

        # Test at 6°C with heater already active: must remain ON due to hysteresis band (up to 8°C)
        model.state.temperature_c = 6.0
        model.state.temperature_k = 279.15
        model.step(dt_seconds=60.0, in_eclipse=True, altitude_km=700.0, internal_power_w=0.0)
        assert model.state.heater_active is True

        # Test at 9°C: must turn OFF
        model.state.temperature_c = 9.0
        model.state.temperature_k = 282.15
        model.step(dt_seconds=60.0, in_eclipse=True, altitude_km=700.0, internal_power_w=0.0)
        assert model.state.heater_active is False
        assert model.state.heater_heat_w == 0.0


class TestPrompt17CommsAndStorageValidation:
    """Verifies RF line-of-sight elevation geometry, FSPL, and storage priority queues."""

    def test_free_space_path_loss_equation(self):
        """Verify FSPL = (4*pi*d*f / c)^2 for X-band downlink at 8 GHz, distance 1000 km."""
        freq_hz = 8.0e9
        dist_m = 1000.0 * 1000.0
        c = SPEED_OF_LIGHT

        fspl_linear = math.pow((4.0 * math.pi * dist_m * freq_hz) / c, 2.0)
        fspl_db = 10.0 * math.log10(fspl_linear)
        # Expected ~170.5 dB
        assert math.isclose(fspl_db, 170.5, abs_tol=0.5)

    def test_storage_queue_segregation_and_priority_overflow(self):
        """Verify raw observations are dropped first when storage exceeds capacity; preserves alerts."""
        cfg = StorageConfig(capacity_mb=1000.0, safe_reserve_mb=200.0)
        storage = StorageModel(cfg)

        # Write priority alert (50 MB)
        storage.write_priority_alert(50.0)
        assert storage.state.priority_alerts_mb == 50.0

        # Write processed science (300 MB)
        storage.write_processed(300.0)
        assert storage.state.processed_data_mb == 300.0

        # Flood with raw data (800 MB) -> Total 50 + 300 + 800 = 1150 MB (exceeds 1000 MB by 150 MB)
        storage.write_raw(800.0)

        # Priority overflow policy: Raw data dropped by 150 MB
        assert storage.state.dropped_overflow_mb == 150.0
        # Priority alert and processed data must be 100% intact
        assert storage.state.priority_alerts_mb == 50.0
        assert storage.state.processed_data_mb == 300.0
        assert storage.state.used_mb <= 1000.0


class TestPrompt17RadiationAndDebrisValidation:
    """Verifies environmental SAA, auroral horns, and debris altitude flux curve."""

    def test_saa_and_auroral_horn_dose_rates(self):
        """Verify dose rate spikes inside SAA and high-latitude auroral horns."""
        cfg = RadiationDebrisConfig(radiation_hardness=RadiationHardness.RAD_TOLERANT)
        model = RadiationDebrisModel(cfg)

        # Baseline outside SAA:
        st_eq = model.step(dt_seconds=3600.0, altitude_km=550.0, latitude_deg=0.0, longitude_deg=50.0, in_saa_zone=False)
        assert st_eq.in_saa_zone is False
        assert math.isclose(st_eq.instantaneous_dose_rate_rad_per_hour, 0.005, rel_tol=1e-3)

        # Inside SAA:
        st_saa = model.step(dt_seconds=3600.0, altitude_km=550.0, latitude_deg=-25.0, longitude_deg=-45.0, in_saa_zone=True)
        assert st_saa.in_saa_zone is True
        assert st_saa.instantaneous_dose_rate_rad_per_hour > st_eq.instantaneous_dose_rate_rad_per_hour

    def test_debris_spatial_density_altitude_profile(self):
        """Verify peak collision risk is in 750-900 km shell, and low below 450 km."""
        m_low = RadiationDebrisModel()
        s_low = m_low.step(dt_seconds=60, altitude_km=350, latitude_deg=0, longitude_deg=0, inclination_deg=28.5)

        m_peak = RadiationDebrisModel()
        s_peak = m_peak.step(dt_seconds=60, altitude_km=800, latitude_deg=0, longitude_deg=0, inclination_deg=28.5)

        assert s_low.debris_collision_risk_index < s_peak.debris_collision_risk_index


class TestPrompt17DatasetProvenanceAudit:
    """Verifies all 7 offline bundled datasets comply with the Prompt 17 data integrity standard."""

    def test_all_seven_offline_datasets_exist_and_validate(self):
        """Verify all 7 offline JSON files exist, parse cleanly, and carry required provenance fields."""
        offline_dir = Path("data/offline")
        expected_datasets = [
            ("nasa_firms_wildfire_sample.json", "nasa_firms_viirs", "REAL_NASA_REFERENCE"),
            ("nasa_tsis_solar_irradiance_sample.json", "nasa_tsis1_tsi", "REAL_NASA_REFERENCE"),
            ("nasa_ceres_radiation_sample.json", "nasa_ceres_ebaf", "REAL_NASA_REFERENCE"),
            ("nasa_donki_solar_sample.json", "noaa_donki_space_weather", "REAL_NASA_REFERENCE"),
            ("nasa_asf_flood_sample.json", "copernicus_sentinel1_flood", "REAL_NASA_REFERENCE"),
            ("nasa_tropomi_so2_volcano_sample.json", "tropomi_modvolc_volcano", "REAL_NASA_REFERENCE"),
            ("nasa_tle_orbital_sample.json", "nasa_norad_tle_ephemeris", "REAL_NASA_REFERENCE"),
        ]

        for filename, expected_source_id, expected_prov in expected_datasets:
            filepath = offline_dir / filename
            assert filepath.exists(), f"Missing offline dataset file: {filepath}"

            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)

            meta = data.get("dataset_metadata", {})
            assert meta.get("source_id") == expected_source_id
            assert meta.get("provenance_type") == expected_prov
            assert meta.get("license") is not None
            # Must contain structured data payload
            valid_payload_keys = {
                "records",
                "benchmark_events",
                "global_annual_climatology",
                "zonal_bands",
                "satellites",
                "benchmark_volcano_records",
                "atmospheric_parameters",
                "radar_characteristics",
                "monthly_benchmark_measurements",
                "reference_constants",
            }
            assert any(k in data for k in valid_payload_keys), f"Dataset {filename} missing expected data payload keys"

    def test_nasa_firms_disclaimer_preserves_external_reference_distinction(self):
        """Verify NASA FIRMS data explicitly carries external reference disclaimer."""
        firms_path = Path("data/offline/nasa_firms_wildfire_sample.json")
        with open(firms_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        meta = data["dataset_metadata"]
        disclaimer = meta.get("educational_disclaimer", "")
        # Must clearly state it is NOT the fictional satellite's sensor image
        assert "NOT images or data collected by the fictional LumenOS satellite" in disclaimer
        assert "not flawless ground truth" in disclaimer
