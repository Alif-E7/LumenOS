"""
Prompt 5 Acceptance Test Suite — Spacecraft Catalog, Designer and Pre-Launch Engineering Review.

Comprehensive acceptance checks for:
1. Data-driven catalog validation (10 subsystems, educational notes, assumptions & units)
2. Live engineering metric calculations (mass, budget, power, battery DoD, thermal, storage, comms)
3. Trade-off enforcement (heavy vs light, high-power vs energy efficiency)
4. Pre-launch engineering review: 10 discrete validation checks
5. Error and warning detection with beginner-friendly explanations and revision paths
6. Launch readiness decisions (FLIGHT_READY, EXPERIMENTAL_LAUNCH, GROUNDED)
7. Active risk preservation for experimental launches
8. At least two viable builds per scenario (tested on Wildfire, Flood, Solar Storm, Volcano)
9. Proof that component choices directly alter simulation engine state and physics outcomes
"""

import pytest

from game.catalog import (
    ALL_CATALOG_ITEMS,
    CATALOG_BY_ID,
    SubsystemType,
    CatalogItem,
    LAUNCHERS,
    ORBIT_OPTIONS,
    INSTRUMENTS,
    COMPUTERS,
    BATTERIES,
    SOLAR_ARRAYS,
    THERMAL_SYSTEMS,
    COMMS_SYSTEMS,
    STORAGE_SYSTEMS,
    SHIELDING_SYSTEMS,
    LAUNCHER_CAPACITIES_KG,
    get_catalog_item,
    get_items_by_subsystem,
)
from game.designer import SpacecraftDesign, LiveEngineeringMetrics, DesignerEngine
from game.engineering_review import (
    ReviewStatus,
    LaunchReadiness,
    EngineeringCheckResult,
    PreLaunchReviewReport,
    PreLaunchReviewer,
    PRESET_BUILDS,
)
from simulation.core import SimulationRunner, SimulationConfig


# ═══════════════════════════════════════════════════════════════════════════
# 1. CATALOG VALIDATION & EDUCATIONAL ASSUMPTIONS
# ═══════════════════════════════════════════════════════════════════════════

class TestSpacecraftCatalog:
    def test_all_ten_subsystems_present(self):
        subsystems = {item.subsystem for item in ALL_CATALOG_ITEMS}
        expected = {
            SubsystemType.LAUNCHER,
            SubsystemType.ORBIT,
            SubsystemType.INSTRUMENT,
            SubsystemType.COMPUTER,
            SubsystemType.BATTERY,
            SubsystemType.SOLAR,
            SubsystemType.THERMAL,
            SubsystemType.COMMS,
            SubsystemType.STORAGE,
            SubsystemType.SHIELDING,
        }
        assert expected.issubset(subsystems)
        assert len(ALL_CATALOG_ITEMS) >= 28

    def test_catalog_entries_have_educational_assumptions_and_units(self):
        for item in ALL_CATALOG_ITEMS:
            assert len(item.id) > 0
            assert len(item.name) > 0
            assert item.mass_kg >= 0.0
            assert item.cost_credits >= 0.0
            assert 0.80 <= item.reliability <= 1.0
            assert len(item.educational_notes) > 15, f"{item.id} missing educational notes"
            assert len(item.assumptions_and_units) > 10, f"{item.id} missing assumptions/units"

    def test_filter_by_subsystem(self):
        instruments = get_items_by_subsystem(SubsystemType.INSTRUMENT)
        assert len(instruments) >= 5
        assert any(i.id == "inst_thermal_infrared" for i in instruments)
        assert any(i.id == "inst_sar_radar" for i in instruments)

        launchers = get_items_by_subsystem("launcher")
        assert len(launchers) >= 4
        assert any(l.id == "launcher_smallsat_rideshare" for l in launchers)


# ═══════════════════════════════════════════════════════════════════════════
# 2 & 3. LIVE ENGINEERING METRICS & TRADE-OFF ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════════════

class TestDesignerEngineMetrics:
    def test_nominal_metrics_calculation(self):
        design = SpacecraftDesign(
            mission_id="wildfire",
            launcher_id="launcher_dedicated_light",  # 600 kg capacity, 2800 credits
            orbit_id="orbit_sso_650",
            instrument_ids=["inst_thermal_infrared"], # 28 kg, 85 W, 1400 credits
            computer_id="proc_dual_core_space",       # 8.5 kg, 38 W, 900 credits
            battery_id="bat_li_ion_standard_2k",      # 24 kg, 2200 Wh, 950 credits
            solar_id="solar_deployable_flat_5m",      # 24 kg, 850 W gen, 850 credits
            thermal_id="therm_heatpipe_radiator_2m",  # 15 kg, 600 W rej, 650 credits
            comms_id="comm_xband_horn",               # 9 kg, 50 W, 850 credits
            storage_id="stor_flash_array_256gb",      # 6 kg, 12 W, 600 credits
            shielding_id="shield_standard_aluminum",  # 20 kg, 550 credits
            chassis_dry_mass_kg=120.0,
            fuel_mass_kg=35.0,
        )

        metrics = DesignerEngine.calculate_metrics(design, contract_budget=10000.0)

        # Mass checks
        # Chassis (120) + Fuel (35) + Components (28+8.5+24+24+15+9+6+20 = 134.5) = 289.5 kg
        assert metrics.total_mass_kg == pytest.approx(289.5, abs=0.5)
        assert metrics.launcher_capacity_kg == 600.0
        assert metrics.mass_margin_kg > 300.0
        assert metrics.mass_margin_pct > 50.0

        # Budget checks
        # Total cost: 2800 + 200 + 1400 + 900 + 950 + 850 + 650 + 850 + 650 + 550 = 9800
        assert metrics.total_cost_credits == 9800.0
        assert metrics.budget_remaining_credits == 200.0

        # Power checks
        # Generation: 850 W
        assert metrics.power_generation_sunlight_w == 850.0
        # Draw: 30 housekeeping + 85 + 38 + 50 + 12 = 215 W
        assert metrics.power_nominal_load_w == pytest.approx(215.0, abs=1.0)
        assert metrics.net_power_sunlight_w > 600.0

        # Battery & Eclipse checks
        assert metrics.battery_capacity_wh == 2200.0
        # Demand in 35 min eclipse = 215 * (35/60) = 125.4 Wh
        assert metrics.eclipse_energy_demand_wh == pytest.approx(125.4, abs=2.0)
        assert metrics.eclipse_dod_pct < 10.0 # Deeply safe
        assert metrics.eclipse_battery_reserve_pct > 90.0

        # Thermal checks
        assert metrics.heat_rejected_w == 600.0
        assert metrics.thermal_margin_pct > 100.0

    def test_trade_off_enforcement(self):
        """Proof that heavy high-performance components consume mass and budget."""
        light_design = SpacecraftDesign(
            launcher_id="launcher_smallsat_rideshare",
            battery_id="bat_li_ion_compact_1k",
            solar_id="solar_body_mounted_2m",
            thermal_id="therm_passive_paint_1m",
        )
        heavy_design = SpacecraftDesign(
            launcher_id="launcher_medium_lift",
            battery_id="bat_li_sulfur_heavy_4k",
            solar_id="solar_articulated_dual_wing_8m",
            thermal_id="therm_louvered_array_4m",
        )

        m_light = DesignerEngine.calculate_metrics(light_design)
        m_heavy = DesignerEngine.calculate_metrics(heavy_design)

        # Heavy design has substantially higher power and battery, but higher cost and mass
        assert m_heavy.total_mass_kg > m_light.total_mass_kg + 50.0
        assert m_heavy.total_cost_credits > m_light.total_cost_credits + 4000.0
        assert m_heavy.power_generation_sunlight_w > m_light.power_generation_sunlight_w * 3
        assert m_heavy.battery_capacity_wh > m_light.battery_capacity_wh * 4


# ═══════════════════════════════════════════════════════════════════════════
# 4 & 5. PRE-LAUNCH ENGINEERING REVIEW (10 CHECKS & REVISIONS)
# ═══════════════════════════════════════════════════════════════════════════

class TestPreLaunchReviewer:
    def test_all_ten_checks_executed(self):
        preset = PRESET_BUILDS["wildfire"]["agile_scout"]
        report = PreLaunchReviewer.evaluate(preset, contract_budget=10000.0)

        assert len(report.checks) == 10
        check_ids = [c.check_id for c in report.checks]
        expected_checks = [
            "launcher_payload_limit",
            "mass_margin",
            "power_balance",
            "eclipse_battery_reserve",
            "thermal_margin",
            "storage_capacity",
            "communication_capability",
            "instrument_compatibility",
            "budget_enforcement",
            "mission_objectives_suitability",
        ]
        assert check_ids == expected_checks
        assert report.readiness in [LaunchReadiness.FLIGHT_READY, LaunchReadiness.EXPERIMENTAL_LAUNCH]

    def test_detects_overweight_launcher_violation(self):
        """Check 1: Error when total mass exceeds rocket capacity."""
        overweight_design = SpacecraftDesign(
            launcher_id="launcher_smallsat_rideshare", # Max 250 kg capacity
            chassis_dry_mass_kg=200.0,
            fuel_mass_kg=50.0,
            battery_id="bat_li_sulfur_heavy_4k",      # 44 kg
            solar_id="solar_articulated_dual_wing_8m",# 42 kg
            shielding_id="shield_graded_z_heavy",     # 48 kg
        )
        report = PreLaunchReviewer.evaluate(overweight_design, contract_budget=10000.0)

        assert report.readiness == LaunchReadiness.GROUNDED
        assert report.can_launch is False
        check1 = next(c for c in report.checks if c.check_id == "launcher_payload_limit")
        assert check1.status == ReviewStatus.ERROR
        assert "exceeds the maximum lift capacity" in check1.explanation
        assert "Dedicated Light or Medium Lift" in check1.revision_recommendation

    def test_detects_power_deficit(self):
        """Check 3: Error when solar generation cannot support load."""
        power_starved = SpacecraftDesign(
            instrument_ids=["inst_sar_radar"],      # 310 W draw
            computer_id="proc_edge_ai_quad",         # 110 W draw
            solar_id="solar_body_mounted_2m",        # Only 320 W gen
        )
        report = PreLaunchReviewer.evaluate(power_starved, contract_budget=15000.0)

        assert report.readiness == LaunchReadiness.GROUNDED
        check3 = next(c for c in report.checks if c.check_id == "power_balance")
        assert check3.status == ReviewStatus.ERROR
        assert "Power deficit" in check3.explanation
        assert check3.revision_recommendation is not None

    def test_detects_thermal_runaway(self):
        """Check 5: Error when radiator cannot reject heat."""
        hot_design = SpacecraftDesign(
            instrument_ids=["inst_sar_radar"],     # 310 W draw
            computer_id="proc_edge_ai_quad",        # 110 W draw
            thermal_id="therm_passive_paint_1m",    # Only 240 W heat rejection
            solar_id="solar_articulated_dual_wing_8m",
            launcher_id="launcher_heavy_lift",
        )
        report = PreLaunchReviewer.evaluate(hot_design, contract_budget=20000.0)

        check5 = next(c for c in report.checks if c.check_id == "thermal_margin")
        assert check5.status == ReviewStatus.ERROR
        assert "Thermal runaway" in check5.explanation

    def test_detects_hardware_incompatibility(self):
        """Check 8: Error when SAR radar is paired with micro controller."""
        incompat = SpacecraftDesign(
            instrument_ids=["inst_sar_radar"],
            computer_id="proc_rad_hard_micro", # Incompatible with SAR
            launcher_id="launcher_medium_lift",
        )
        report = PreLaunchReviewer.evaluate(incompat, contract_budget=20000.0)

        check8 = next(c for c in report.checks if c.check_id == "instrument_compatibility")
        assert check8.status == ReviewStatus.ERROR
        assert "requires Dual-Core or Edge AI processor" in check8.explanation

    def test_detects_budget_overrun(self):
        """Check 9: Error when total cost exceeds mission budget."""
        expensive = SpacecraftDesign(
            launcher_id="launcher_heavy_lift", # 9000 credits
            instrument_ids=["inst_sar_radar"], # 2600 credits
            computer_id="proc_edge_ai_quad",    # 1600 credits
        )
        # Budget is 10,000 credits, cost is > 13,000 credits
        report = PreLaunchReviewer.evaluate(expensive, contract_budget=10000.0)

        assert report.readiness == LaunchReadiness.GROUNDED
        check9 = next(c for c in report.checks if c.check_id == "budget_enforcement")
        assert check9.status == ReviewStatus.ERROR
        assert "Budget overrun" in check9.explanation


# ═══════════════════════════════════════════════════════════════════════════
# 6 & 7. EXPERIMENTAL LAUNCH & ACTIVE RISK PRESERVATION
# ═══════════════════════════════════════════════════════════════════════════

class TestExperimentalLaunchAndRisks:
    def test_experimental_launch_allowed_with_warnings(self):
        """When 0 errors exist but warnings are present, EXPERIMENTAL_LAUNCH is granted."""
        # A design with thin thermal margin and small storage buffer
        marginal_design = SpacecraftDesign(
            mission_id="wildfire",
            launcher_id="launcher_dedicated_light",
            orbit_id="orbit_sso_650",
            instrument_ids=["inst_thermal_infrared", "inst_optical_survey_camera"], # High data rate
            computer_id="proc_dual_core_space",
            battery_id="bat_li_ion_standard_2k",
            solar_id="solar_deployable_flat_5m",
            thermal_id="therm_heatpipe_radiator_2m",
            comms_id="comm_sband_patch",            # Slow downlink -> Warning
            storage_id="stor_solid_state_64gb",     # Fills quickly -> Warning
            shielding_id="shield_mylar_blanket",
        )

        report = PreLaunchReviewer.evaluate(marginal_design, contract_budget=10000.0)

        assert report.error_count == 0
        assert report.warning_count > 0
        assert report.readiness == LaunchReadiness.EXPERIMENTAL_LAUNCH
        assert report.can_launch is True
        assert report.is_experimental is True
        assert len(report.active_risks) > 0

        # Active risks are preserved for the in-flight simulation
        risk_text = " ".join(report.active_risks)
        assert "temperature" in risk_text or "Downlink" in risk_text or "Buffer" in risk_text


# ═══════════════════════════════════════════════════════════════════════════
# 8. AT LEAST TWO VIABLE BUILDS PER SCENARIO
# ═══════════════════════════════════════════════════════════════════════════

class TestViableBuildPresets:
    def test_wildfire_has_two_distinct_viable_builds(self):
        wf_presets = PRESET_BUILDS["wildfire"]
        assert len(wf_presets) >= 2
        agile = wf_presets["agile_scout"]
        heavy = wf_presets["heavy_sentinel"]

        # Distinct hardware configurations
        assert agile.launcher_id != heavy.launcher_id
        assert agile.computer_id != heavy.computer_id
        assert agile.solar_id != heavy.solar_id

        # Both must be launch-eligible
        r_agile = PreLaunchReviewer.evaluate(agile, contract_budget=10000.0)
        assert r_agile.can_launch is True
        assert r_agile.error_count == 0

        r_heavy = PreLaunchReviewer.evaluate(heavy, contract_budget=18000.0)
        assert r_heavy.can_launch is True
        assert r_heavy.error_count == 0

        # Heavy sentinel yields higher science value rating
        assert r_heavy.metrics.science_value_rating > r_agile.metrics.science_value_rating

    def test_flood_scout_has_two_viable_builds(self):
        presets = PRESET_BUILDS["flood"]
        assert len(presets) >= 2
        agile = presets["radar_agile"]
        express = presets["radar_express"]

        r_agile = PreLaunchReviewer.evaluate(agile)
        assert r_agile.can_launch is True
        assert r_agile.error_count == 0
        assert r_agile.metrics.mission_suitability_pct >= 80.0

        r_express = PreLaunchReviewer.evaluate(express)
        assert r_express.can_launch is True
        assert r_express.error_count == 0
        assert r_express.metrics.mission_suitability_pct >= 80.0

    def test_solar_storm_has_two_viable_builds(self):
        presets = PRESET_BUILDS["solar_storm"]
        assert len(presets) >= 2
        sentinel = presets["sun_sentinel"]
        rideshare = presets["rideshare_explorer"]

        r_sentinel = PreLaunchReviewer.evaluate(sentinel)
        assert r_sentinel.can_launch is True
        assert r_sentinel.error_count == 0
        assert r_sentinel.metrics.mission_suitability_pct >= 80.0

        r_rideshare = PreLaunchReviewer.evaluate(rideshare)
        assert r_rideshare.can_launch is True
        assert r_rideshare.error_count == 0

    def test_volcano_watch_has_two_viable_builds(self):
        presets = PRESET_BUILDS["volcano"]
        assert len(presets) >= 2
        observer = presets["volcano_observer"]
        thermal = presets["thermal_surveyor"]

        r_obs = PreLaunchReviewer.evaluate(observer)
        assert r_obs.can_launch is True
        assert r_obs.error_count == 0
        assert r_obs.metrics.mission_suitability_pct >= 80.0

        r_therm = PreLaunchReviewer.evaluate(thermal)
        assert r_therm.can_launch is True
        assert r_therm.error_count == 0


# ═══════════════════════════════════════════════════════════════════════════
# 9. PROOF THAT COMPONENT CHOICES ALTER SIMULATION STATE AND PHYSICS
# ═══════════════════════════════════════════════════════════════════════════

class TestComponentChoicesDriveSimulation:
    def test_battery_and_solar_choices_alter_physics_telemetry(self):
        """
        Run two spacecraft with different components in the SimulationRunner:
        - Design A: Large 8.5 m² solar array, 4500 Wh battery.
        - Design B: Small 2.0 m² solar array, 1000 Wh battery.
        Verify that physics simulation output directly reflects these hardware choices!
        """
        design_a = SpacecraftDesign(
            solar_id="solar_articulated_dual_wing_8m",
            battery_id="bat_li_sulfur_heavy_4k",
        )
        design_b = SpacecraftDesign(
            solar_id="solar_body_mounted_2m",
            battery_id="bat_li_ion_compact_1k",
        )

        cfg_a = design_a.to_spacecraft_config()
        cfg_b = design_b.to_spacecraft_config()

        sim_a = SimulationRunner(config=SimulationConfig(seed=42, max_steps=50), spacecraft=cfg_a)
        sim_b = SimulationRunner(config=SimulationConfig(seed=42, max_steps=50), spacecraft=cfg_b)

        # Step 20 steps
        snap_a = None
        snap_b = None
        for _ in range(20):
            snap_a = sim_a.step()
            snap_b = sim_b.step()

        # Verify simulation physics state differs based on selected components
        assert snap_a.power.battery_soc_wh > snap_b.power.battery_soc_wh
        assert snap_a.power.solar_output_w > snap_b.power.solar_output_w * 2.0
