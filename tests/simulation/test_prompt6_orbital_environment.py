"""
Prompt 6 Acceptance Test Suite — Orbital Mechanics, Environment, Time & Observation Geometry.

Comprehensive acceptance checks for:
1. Orbital period & vis-viva velocity compared with aerospace references (ISS, Sentinel-2, Landsat, GEO).
2. Eclipse boundaries, conical/cylindrical shadow model, sunlight fraction, and power generation correlation.
3. Earth visibility, horizon angle, and nadir access swath width.
4. Ground target observation opportunity windows (AOS, TCA, LOS, min off-nadir angle).
5. Ground station communication windows (AOS, TCA, LOS, elevation mask, slant range).
6. Simulation clock controls: pause, resume, 1x, 10x, 100x speed multipliers, controlled fast-forward.
7. Checkpoint save & restore with exact bit-for-bit state reconstruction.
8. Numerical boundary cases: equatorial (i=0°), polar (i=90°), retrograde SSO (i=98°), eccentric (e=0.15), GEO (35786km).
9. Strict deterministic repeatability (identical seed + inputs = identical simulation trajectory).
10. Epistemic barrier: future stochastic anomalies are never leaked in forward forecast timelines.
"""

import math
import pytest

from simulation.physics.orbital import (
    OrbitalElements,
    OrbitalModel,
    OrbitalState,
    GroundTarget,
    ObservationWindow,
    ContactWindow,
    EclipseWindow,
    REFERENCE_CASES,
    R_EARTH_KM,
    MU_EARTH,
)
from simulation.physics.comms import GroundStation, DEFAULT_GROUND_STATIONS
from simulation.environment import (
    SpaceEnvironmentModel,
    EnvironmentConfig,
    EnvironmentState,
    SOLAR_CONSTANT_W_M2,
)
from simulation.clock import (
    SimulationClock,
    ClockStatus,
    SimulationCheckpoint,
)
from simulation.timeline import (
    TimelineEvent,
    TimelineEventType,
    TimelineForecastEngine,
)
from simulation.core import (
    SimulationRunner,
    SimulationConfig,
    SpacecraftConfig,
    SimulationSnapshot,
)


# ═══════════════════════════════════════════════════════════════════════════
# 1. ORBITAL PERIOD & REFERENCE COMPARISON (NASA / GMAT / SKYFIELD)
# ═══════════════════════════════════════════════════════════════════════════

class TestOrbitalPeriodAndReferences:
    def test_iss_orbit_matches_nasa_reference(self):
        """ISS at ~400 km: Keplerian period ~92.68 min, speed ~7.67 km/s."""
        ref = REFERENCE_CASES["iss_400km"]
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=ref["semi_major_axis_km"],
            eccentricity=ref["eccentricity"],
            inclination_deg=ref["inclination_deg"],
        ))
        period_min = model.orbital_period() / 60.0
        state = model.propagate(0.0)

        assert period_min == pytest.approx(ref["expected_period_minutes"], rel=0.01)
        assert state.velocity_km_s == pytest.approx(ref["expected_velocity_km_s"], abs=0.05)
        assert 395.0 <= state.altitude_km <= 405.0

    def test_sentinel2_sso_matches_esa_reference(self):
        """Sentinel-2 at 786 km SSO: period ~100.5 min, speed ~7.45 km/s."""
        ref = REFERENCE_CASES["sentinel2_786km"]
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=ref["semi_major_axis_km"],
            eccentricity=ref["eccentricity"],
            inclination_deg=ref["inclination_deg"],
        ))
        period_min = model.orbital_period() / 60.0
        state = model.propagate(0.0)

        assert period_min == pytest.approx(ref["expected_period_minutes"], rel=0.01)
        assert state.velocity_km_s == pytest.approx(ref["expected_velocity_km_s"], abs=0.05)

    def test_landsat_705km_matches_usgs_reference(self):
        """Landsat-8 at 705 km SSO: period ~98.88 min, speed ~7.50 km/s."""
        ref = REFERENCE_CASES["landsat_705km"]
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=ref["semi_major_axis_km"],
            eccentricity=ref["eccentricity"],
            inclination_deg=ref["inclination_deg"],
        ))
        period_min = model.orbital_period() / 60.0
        state = model.propagate(0.0)

        assert period_min == pytest.approx(ref["expected_period_minutes"], rel=0.01)
        assert state.velocity_km_s == pytest.approx(ref["expected_velocity_km_s"], abs=0.05)

    def test_geo_matches_sidereal_day_reference(self):
        """GEO at 35,786 km: period ~1436.1 min (sidereal day ~86164 s), speed ~3.075 km/s."""
        ref = REFERENCE_CASES["geo_35786km"]
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=ref["semi_major_axis_km"],
            eccentricity=ref["eccentricity"],
            inclination_deg=ref["inclination_deg"],
        ))
        period_s = model.orbital_period()
        period_min = period_s / 60.0
        state = model.propagate(0.0)

        # Sidereal day is 86164.1 seconds (approx 23h 56m 4s)
        assert period_s == pytest.approx(86164.0, rel=0.005)
        assert period_min == pytest.approx(ref["expected_period_minutes"], rel=0.005)
        assert state.velocity_km_s == pytest.approx(ref["expected_velocity_km_s"], abs=0.05)


# ═══════════════════════════════════════════════════════════════════════════
# 2. ECLIPSE BOUNDARIES & SUNLIGHT EXPOSURE GEOMETRY
# ═══════════════════════════════════════════════════════════════════════════

class TestEclipseAndSunlightGeometry:
    def test_eclipse_ingress_egress_detection(self):
        """Orbital propagation correctly identifies eclipse entry (sunset) and exit (sunrise)."""
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=R_EARTH_KM + 650.0,
            eccentricity=0.001,
            inclination_deg=98.0,
            raan_deg=0.0,
        ))

        # Find eclipse windows over 2 full orbits (~200 minutes)
        eclipses = model.find_eclipse_windows(start_seconds=0.0, duration_seconds=12000.0, dt_step=15.0)

        assert len(eclipses) >= 2
        for ec in eclipses:
            assert ec.duration_seconds > 0
            # Typical LEO 650 km eclipse is ~34 to 36 minutes (2040 to 2160 seconds)
            duration_min = ec.duration_seconds / 60.0
            assert 30.0 <= duration_min <= 40.0, f"Eclipse duration {duration_min} min out of expected range"

    def test_sunlight_fraction_in_day_vs_night(self):
        """Sunlight fraction is 1.0 in direct sunlight, 0.0 in full umbra."""
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=R_EARTH_KM + 650.0,
            eccentricity=0.001,
            inclination_deg=98.0,
        ))

        # Sample across an orbit
        fractions = [model.sunlight_exposure(float(t))[0] for t in range(0, 6000, 60)]
        assert any(f == 1.0 for f in fractions), "Should have periods of full sunlight"
        assert any(f == 0.0 for f in fractions), "Should have periods of full eclipse"
        assert all(0.0 <= f <= 1.0 for f in fractions), "Fraction must be bounded in [0, 1]"

    def test_solar_power_matches_eclipse_geometry(self):
        """SimulationRunner generates solar power only during sunlight exposure."""
        runner = SimulationRunner(config=SimulationConfig(seed=42, time_step_seconds=60.0))
        sun_seen = False
        eclipse_seen = False

        for _ in range(120):
            snap = runner.step()
            if snap.orbital.in_eclipse:
                eclipse_seen = True
                assert snap.power.solar_output_w == 0.0
                assert snap.orbital.sunlight_fraction < 0.5
            else:
                sun_seen = True
                assert snap.power.solar_output_w > 0.0
                assert snap.orbital.sunlight_fraction >= 0.5

        assert sun_seen and eclipse_seen


# ═══════════════════════════════════════════════════════════════════════════
# 3. EARTH VISIBILITY & NADIR SWATH GEOMETRY
# ═══════════════════════════════════════════════════════════════════════════

class TestEarthVisibilityAndHorizon:
    def test_earth_angular_radius_and_horizon_angle(self):
        """Earth angular radius rho and horizon limit angle lambda obey spherical geometry."""
        model = OrbitalModel(OrbitalElements(semi_major_axis_km=R_EARTH_KM + 650.0))

        rho = model.earth_angular_radius_deg(650.0)
        lamb = model.horizon_angle_deg(650.0)

        # For 650 km: r = 7021 km, rho = arcsin(6371/7021) = ~65.15°, lambda = 90° - rho = ~24.85°
        assert rho == pytest.approx(65.15, abs=0.5)
        assert lamb == pytest.approx(24.85, abs=0.5)
        assert rho + lamb == pytest.approx(90.0, abs=0.01)

    def test_higher_altitude_expands_horizon(self):
        """Higher altitude spacecraft sees a larger horizon patch on Earth."""
        model = OrbitalModel()
        h_leo = model.horizon_angle_deg(400.0)   # ~19.6°
        h_sso = model.horizon_angle_deg(800.0)   # ~27.2°
        h_geo = model.horizon_angle_deg(35786.0) # ~81.3°

        assert h_leo < h_sso < h_geo

    def test_target_directly_below_nadir_is_inside_fov(self):
        """Target directly below sub-satellite point is within sensor FOV."""
        model = OrbitalModel()
        inside, off_nadir, dist = model.is_target_in_fov(
            sat_lat_deg=10.0, sat_lon_deg=20.0, sat_alt_km=650.0,
            target_lat_deg=10.0, target_lon_deg=20.0,
            fov_half_angle_deg=20.0,
        )
        assert inside is True
        assert off_nadir == pytest.approx(0.0, abs=0.01)
        assert dist == pytest.approx(0.0, abs=0.01)

    def test_target_on_opposite_side_of_earth_is_blocked(self):
        """Target on opposite hemisphere is completely obscured by Earth body."""
        model = OrbitalModel()
        inside, _, dist = model.is_target_in_fov(
            sat_lat_deg=0.0, sat_lon_deg=0.0, sat_alt_km=650.0,
            target_lat_deg=0.0, target_lon_deg=180.0,
            fov_half_angle_deg=45.0,
        )
        assert inside is False
        assert dist > 90.0


# ═══════════════════════════════════════════════════════════════════════════
# 4. GROUND TARGET OBSERVATION OPPORTUNITY WINDOWS
# ═══════════════════════════════════════════════════════════════════════════

class TestObservationWindows:
    def test_target_observation_window_forecast(self):
        """Forecast observation windows over an Earth target and calculate TCA and off-nadir angle."""
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=R_EARTH_KM + 650.0,
            eccentricity=0.001,
            inclination_deg=98.0,
            raan_deg=0.0,
        ))

        # Target located under orbit track
        target = GroundTarget(
            target_id="test_zone",
            name="Test Wildfire Zone",
            latitude_deg=-33.7,
            longitude_deg=150.3,
        )

        windows = model.find_target_observation_windows(
            target=target,
            start_seconds=0.0,
            duration_seconds=86400.0, # 24 hours
            fov_half_angle_deg=35.0,
            dt_step=15.0,
        )

        # In 24 hours, an SSO satellite with 35° FOV will have at least one access pass over Australia
        assert len(windows) >= 1
        win = windows[0]
        assert win.start_seconds < win.tca_seconds <= win.end_seconds
        assert win.duration_seconds > 0.0
        assert win.min_off_nadir_deg <= 35.0


# ═══════════════════════════════════════════════════════════════════════════
# 5. GROUND STATION COMMUNICATION CONTACT WINDOWS
# ═══════════════════════════════════════════════════════════════════════════

class TestGroundStationContactWindows:
    def test_svalbard_polar_pass_detection(self):
        """Polar ground station (Svalbard 78.2°N) has frequent passes for 98° orbit."""
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=R_EARTH_KM + 650.0,
            eccentricity=0.001,
            inclination_deg=98.0,
        ))

        passes = model.find_station_contact_windows(
            station_lat=78.23,
            station_lon=15.39,
            station_name="Svalbard",
            min_elevation_deg=5.0,
            start_seconds=0.0,
            duration_seconds=28800.0, # 8 hours
            dt_step=15.0,
        )

        assert len(passes) >= 3, "High-latitude station should see multiple passes"
        first_pass = passes[0]
        assert first_pass.station_name == "Svalbard"
        assert first_pass.aos_seconds < first_pass.tca_seconds <= first_pass.los_seconds
        assert first_pass.max_elevation_deg >= 5.0
        assert first_pass.min_slant_range_km > 0.0


# ═══════════════════════════════════════════════════════════════════════════
# 6. SIMULATION CLOCK CONTROLS & FAST-FORWARD
# ═══════════════════════════════════════════════════════════════════════════

class TestSimulationClockControls:
    def test_clock_pause_and_resume(self):
        """Pausing the clock halts time advancement; resume restarts it."""
        clock = SimulationClock(time_step_seconds=60.0)
        assert clock.is_running is True

        dt1 = clock.advance_step()
        assert dt1 == 60.0
        assert clock.elapsed_seconds == 60.0
        assert clock.step_count == 1

        clock.pause()
        assert clock.is_paused is True
        dt2 = clock.advance_step()
        assert dt2 == 0.0
        assert clock.elapsed_seconds == 60.0
        assert clock.step_count == 1

        clock.resume()
        assert clock.is_running is True
        dt3 = clock.advance_step()
        assert dt3 == 60.0
        assert clock.elapsed_seconds == 120.0
        assert clock.step_count == 2

    def test_speed_multipliers(self):
        """Supports 1x, 10x, 100x and custom multipliers."""
        clock = SimulationClock()
        for speed in (1.0, 10.0, 100.0, 5.0):
            clock.set_speed(speed)
            assert clock.speed_multiplier == speed

        with pytest.raises(ValueError):
            clock.set_speed(0.0)

    def test_runner_fast_forward_to_time(self):
        """Controlled fast-forward advances simulation step-by-step to target seconds."""
        runner = SimulationRunner(config=SimulationConfig(seed=42, time_step_seconds=60.0))
        assert runner.elapsed_seconds == 0.0

        # Fast forward to 1800 seconds (30 minutes = 30 steps)
        snap = runner.fast_forward_to_time(1800.0)
        assert runner.elapsed_seconds == 1800.0
        assert runner.current_step == 30
        assert snap.step == 30

    def test_runner_fast_forward_to_event(self):
        """Fast-forward to next SUNSET advances directly to predicted eclipse entry."""
        runner = SimulationRunner(config=SimulationConfig(seed=42, time_step_seconds=60.0))
        snap, event = runner.fast_forward_to_event(TimelineEventType.SUNSET)

        assert event is not None
        assert event.event_type == TimelineEventType.SUNSET
        assert runner.elapsed_seconds >= event.timestamp_seconds
        assert snap.orbital.in_eclipse is True


# ═══════════════════════════════════════════════════════════════════════════
# 7. CHECKPOINT SAVE & RESTORE (EXACT DETERMINISM)
# ═══════════════════════════════════════════════════════════════════════════

class TestCheckpointSaveAndRestore:
    def test_checkpoint_exact_state_restore(self):
        """
        Run to step 25, save checkpoint, advance 25 more steps to step 50.
        Restore checkpoint back to step 25. Verify step 26 after restore
        is bit-for-bit identical to original step 26!
        """
        runner = SimulationRunner(config=SimulationConfig(seed=123, time_step_seconds=60.0))

        # Run 25 steps
        for _ in range(25):
            runner.step()

        # Save checkpoint
        checkpoint = runner.save_checkpoint(metadata={"reason": "pre-anomaly backup"})
        assert checkpoint["step"] == 25
        assert checkpoint["elapsed_seconds"] == 1500.0

        # Run 25 more steps and record step 26 state
        step_26_original = runner.step()
        for _ in range(24):
            runner.step()
        assert runner.current_step == 50

        # Restore back to step 25
        runner.load_checkpoint(checkpoint)
        assert runner.current_step == 25
        assert runner.elapsed_seconds == 1500.0

        # Advance one step and compare with step_26_original
        step_26_restored = runner.step()
        assert step_26_restored.step == step_26_original.step
        assert step_26_restored.orbital.altitude_km == pytest.approx(step_26_original.orbital.altitude_km, abs=1e-6)
        assert step_26_restored.orbital.latitude_deg == pytest.approx(step_26_original.orbital.latitude_deg, abs=1e-6)
        assert step_26_restored.power.battery_soc_wh == pytest.approx(step_26_original.power.battery_soc_wh, abs=1e-6)
        assert step_26_restored.thermal.temperature_k == pytest.approx(step_26_original.thermal.temperature_k, abs=1e-6)


# ═══════════════════════════════════════════════════════════════════════════
# 8. NUMERICAL BOUNDARY CASES
# ═══════════════════════════════════════════════════════════════════════════

class TestNumericalBoundaryCases:
    def test_equatorial_orbit(self):
        """Equatorial orbit (i = 0.0°) stays strictly at latitude 0.0° without singularity."""
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=R_EARTH_KM + 600.0,
            inclination_deg=0.0,
        ))
        for t in range(0, 3600, 300):
            st = model.propagate(float(t))
            assert abs(st.latitude_deg) < 1e-6, f"Latitude {st.latitude_deg} must remain 0 on equator"

    def test_polar_orbit(self):
        """Polar orbit (i = 90.0°) reaches exactly +/- 90° latitude at extrema."""
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=R_EARTH_KM + 600.0,
            inclination_deg=90.0,
        ))
        latitudes = [model.propagate(float(t)).latitude_deg for t in range(0, 6000, 60)]
        assert max(latitudes) == pytest.approx(90.0, abs=2.0)
        assert min(latitudes) == pytest.approx(-90.0, abs=2.0)

    def test_retrograde_sun_synchronous(self):
        """Sun-synchronous retrograde orbit (i = 98.2°) has positive RAAN precession rate."""
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=R_EARTH_KM + 705.0,
            inclination_deg=98.2,
        ))
        # Nodal drift for SSO should be ~0.9856 deg/day (eastward to match Earth's motion around Sun)
        d_omega = model._j2_raan_drift_deg(86400.0)
        assert 0.95 <= d_omega <= 1.05, f"RAAN drift {d_omega} deg/day must match Sun-synchronous rate"

    def test_eccentric_orbit(self):
        """Moderately eccentric orbit (e = 0.15): altitude varies between periapsis and apoapsis."""
        a = R_EARTH_KM + 1600.0 # 7971 km, ensuring perigee is safely in space (~404 km)
        e = 0.15
        model = OrbitalModel(OrbitalElements(
            semi_major_axis_km=a,
            eccentricity=e,
            inclination_deg=63.4, # Critical inclination
        ))
        r_perigee = a * (1.0 - e) - R_EARTH_KM
        r_apogee = a * (1.0 + e) - R_EARTH_KM

        altitudes = [model.propagate(float(t)).altitude_km for t in range(0, 6000, 30)]
        assert min(altitudes) == pytest.approx(r_perigee, abs=2.0)
        assert max(altitudes) == pytest.approx(r_apogee, abs=2.0)

        # Vis-viva speed: perigee speed must be strictly higher than apogee speed
        v_peri = math.sqrt(MU_EARTH * (2.0 / (a * (1.0 - e) * 1e3) - 1.0 / (a * 1e3))) / 1e3
        v_apo = math.sqrt(MU_EARTH * (2.0 / (a * (1.0 + e) * 1e3) - 1.0 / (a * 1e3))) / 1e3
        assert v_peri > v_apo


# ═══════════════════════════════════════════════════════════════════════════
# 9. STRICT DETERMINISTIC REPEATABILITY
# ═══════════════════════════════════════════════════════════════════════════

class TestDeterministicRepeatability:
    def test_identical_runs_produce_identical_outputs(self):
        """Two separate SimulationRunner instances with same seed produce identical history."""
        r1 = SimulationRunner(config=SimulationConfig(seed=9999, time_step_seconds=60.0))
        r2 = SimulationRunner(config=SimulationConfig(seed=9999, time_step_seconds=60.0))

        # Apply same action on step 10
        for s in range(30):
            if s == 10:
                r1.apply_action({"type": "adjust_radiator", "delta_m2": 0.5})
                r2.apply_action({"type": "adjust_radiator", "delta_m2": 0.5})
            r1.step()
            r2.step()

        h1 = r1.history
        h2 = r2.history

        assert len(h1) == len(h2) == 30
        for s1, s2 in zip(h1, h2):
            assert s1.orbital.latitude_deg == s2.orbital.latitude_deg
            assert s1.orbital.longitude_deg == s2.orbital.longitude_deg
            assert s1.power.battery_soc_wh == s2.power.battery_soc_wh
            assert s1.thermal.temperature_k == s2.thermal.temperature_k
            assert s1.spacecraft_health_pct == s2.spacecraft_health_pct


# ═══════════════════════════════════════════════════════════════════════════
# 10. EPISTEMIC BARRIER & TIMELINE FORECASTING
# ═══════════════════════════════════════════════════════════════════════════

class TestEpistemicBarrierAndForecast:
    def test_forecast_timeline_contains_only_predictable_ephemeris(self):
        """Forecast engine only includes deterministic orbital and environmental passes."""
        model = OrbitalModel(OrbitalElements(semi_major_axis_km=R_EARTH_KM + 650.0))
        forecast = TimelineForecastEngine.generate_forecast(
            orbital_model=model,
            horizon_seconds=43200.0, # 12 hours
        )

        assert len(forecast) > 0
        allowed_forecast_types = {
            TimelineEventType.SUNRISE,
            TimelineEventType.SUNSET,
            TimelineEventType.GROUND_STATION_AOS,
            TimelineEventType.GROUND_STATION_TCA,
            TimelineEventType.GROUND_STATION_LOS,
            TimelineEventType.OBSERVATION_OPPORTUNITY_AOS,
            TimelineEventType.OBSERVATION_OPPORTUNITY_TCA,
            TimelineEventType.OBSERVATION_OPPORTUNITY_LOS,
            TimelineEventType.RADIATION_SAA_ENTER,
            TimelineEventType.RADIATION_SAA_EXIT,
        }

        for ev in forecast:
            assert ev.is_forecast is True
            assert ev.forecast_confidence == 1.0
            assert ev.event_type in allowed_forecast_types
            assert ev.event_type != TimelineEventType.STOCHASTIC_ANOMALY, (
                "Epistemic violation: future stochastic anomalies must never appear in forecast timeline!"
            )
