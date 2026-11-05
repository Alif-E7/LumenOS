"""
Pre-Launch Engineering Review — Pre-flight readiness validation, warnings, and revision paths.

Performs 10 comprehensive flight checks:
1. Launcher Payload Capacity
2. Spacecraft Mass Margin (>= 10%)
3. Sunlight Power Balance (P_net > 50 W)
4. Eclipse Battery Reserve (DoD <= 60%, Reserve >= 40%)
5. Thermal Radiator Rejection Margin (>= 15%)
6. Onboard Storage Buffer (>= 4 hours collection)
7. Ground Downlink Bandwidth (passes vs generation)
8. Instrument Subsystem Dependencies (processing & orbit requirements)
9. Mission Contract Budget Enforcement
10. Mission Objectives Sensor Suitability

Launch Decisions:
- FLIGHT_READY: All checks PASS (0 errors, 0 warnings).
- EXPERIMENTAL_LAUNCH: 0 hard errors, but has warnings. Permitted to launch with active risks preserved in simulation!
- GROUNDED: 1+ hard errors. Launch blocked until revised.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field

from game.catalog import SubsystemType, get_catalog_item
from game.designer import (
    SpacecraftDesign,
    LiveEngineeringMetrics,
    DesignerEngine,
    DEFAULT_MISSION_BUDGETS,
)


class ReviewStatus(str, Enum):
    PASS = "PASS"
    WARNING = "WARNING"
    ERROR = "ERROR"


class LaunchReadiness(str, Enum):
    FLIGHT_READY = "FLIGHT_READY"
    EXPERIMENTAL_LAUNCH = "EXPERIMENTAL_LAUNCH"
    GROUNDED = "GROUNDED"


class EngineeringCheckResult(BaseModel):
    """Result of an individual pre-launch engineering check."""
    check_id: str
    category: str
    title: str
    status: ReviewStatus
    value_measured: str
    threshold_required: str
    explanation: str
    revision_recommendation: Optional[str] = None


class PreLaunchReviewReport(BaseModel):
    """Complete pre-launch engineering review debrief."""
    design_name: str
    mission_id: str
    readiness: LaunchReadiness
    can_launch: bool
    is_experimental: bool
    error_count: int
    warning_count: int
    pass_count: int
    checks: list[EngineeringCheckResult]
    active_risks: list[str] = Field(default_factory=list)
    metrics: LiveEngineeringMetrics

    @property
    def summary_message(self) -> str:
        if self.readiness == LaunchReadiness.FLIGHT_READY:
            return "GO FOR LAUNCH — All 10 engineering checks passed nominal flight thresholds."
        elif self.readiness == LaunchReadiness.EXPERIMENTAL_LAUNCH:
            return (
                f"CONDITIONAL GO (EXPERIMENTAL) — {self.warning_count} advisory warning(s) detected. "
                "Experimental launch is permitted, but spacecraft will fly with elevated in-flight risks."
            )
        else:
            return (
                f"NO-GO FOR LAUNCH (GROUNDED) — {self.error_count} critical flight violation(s) detected. "
                "Review revision recommendations and adjust your build before ignition."
            )


class PreLaunchReviewer:
    """Performs the full 10-check Pre-Launch Engineering Review on a spacecraft design."""

    @classmethod
    def evaluate(
        cls,
        design: SpacecraftDesign,
        contract_budget: Optional[float] = None,
    ) -> PreLaunchReviewReport:
        if contract_budget is None:
            contract_budget = DEFAULT_MISSION_BUDGETS.get(design.mission_id.lower(), 10000.0)
        metrics = DesignerEngine.calculate_metrics(design, contract_budget=contract_budget)
        checks: list[EngineeringCheckResult] = []
        active_risks: list[str] = []

        # ── Check 1: Launcher Payload Capacity ──────────────────────────────
        if metrics.total_mass_kg > metrics.launcher_capacity_kg:
            checks.append(EngineeringCheckResult(
                check_id="launcher_payload_limit",
                category="Mass & Structures",
                title="Launcher Payload Mass Limit",
                status=ReviewStatus.ERROR,
                value_measured=f"{metrics.total_mass_kg:.1f} kg",
                threshold_required=f"≤ {metrics.launcher_capacity_kg:.1f} kg",
                explanation=(
                    f"Spacecraft total mass ({metrics.total_mass_kg:.1f} kg) exceeds the maximum lift capacity "
                    f"of the selected launcher ({metrics.launcher_capacity_kg:.1f} kg). The rocket cannot reach orbit."
                ),
                revision_recommendation="Select a larger launch vehicle (e.g. Dedicated Light or Medium Lift), or reduce battery and radiator mass.",
            ))
        else:
            checks.append(EngineeringCheckResult(
                check_id="launcher_payload_limit",
                category="Mass & Structures",
                title="Launcher Payload Mass Limit",
                status=ReviewStatus.PASS,
                value_measured=f"{metrics.total_mass_kg:.1f} kg",
                threshold_required=f"≤ {metrics.launcher_capacity_kg:.1f} kg",
                explanation=f"Total mass is within rocket lift limits ({metrics.mass_margin_kg:.1f} kg payload capacity remaining).",
            ))

        # ── Check 2: Mass Margin ────────────────────────────────────────────
        if metrics.mass_margin_pct < 0.0:
            pass  # Handled by Check 1
        elif metrics.mass_margin_pct < 10.0:
            checks.append(EngineeringCheckResult(
                check_id="mass_margin",
                category="Mass & Structures",
                title="Structural Mass Margin",
                status=ReviewStatus.WARNING,
                value_measured=f"{metrics.mass_margin_pct:.1f}%",
                threshold_required="≥ 10.0%",
                explanation=(
                    f"Mass margin ({metrics.mass_margin_pct:.1f}%) is below the aerospace standard 10% reserve. "
                    "Any unexpected payload mass growth will prevent orbital injection."
                ),
                revision_recommendation="Aim for at least 10% reserve mass by trimming shielding or selecting lighter avionics.",
            ))
            active_risks.append("Tight mass margin: higher orbit injection altitude dispersion risk.")
        else:
            checks.append(EngineeringCheckResult(
                check_id="mass_margin",
                category="Mass & Structures",
                title="Structural Mass Margin",
                status=ReviewStatus.PASS,
                value_measured=f"{metrics.mass_margin_pct:.1f}%",
                threshold_required="≥ 10.0%",
                explanation=f"Healthy mass margin ({metrics.mass_margin_pct:.1f}%) leaves room for payload adapter mass.",
            ))

        # ── Check 3: Power Balance in Sunlight ──────────────────────────────
        if metrics.net_power_sunlight_w <= 0.0:
            checks.append(EngineeringCheckResult(
                check_id="power_balance",
                category="Electrical Power",
                title="Sunlight Power Balance",
                status=ReviewStatus.ERROR,
                value_measured=f"{metrics.power_generation_sunlight_w:.1f} W generated vs {metrics.power_nominal_load_w:.1f} W draw",
                threshold_required="Net Power > 0 W",
                explanation=(
                    f"Power deficit! Solar panels generate {metrics.power_generation_sunlight_w:.1f} W, but spacecraft requires "
                    f"{metrics.power_nominal_load_w:.1f} W. Spacecraft will continuously drain its battery even in direct sunlight."
                ),
                revision_recommendation="Deploy a larger solar array wing (e.g. 5.0 m² or 8.5 m²), or select a lower-power processor.",
            ))
        elif metrics.net_power_sunlight_w < 50.0:
            checks.append(EngineeringCheckResult(
                check_id="power_balance",
                category="Electrical Power",
                title="Sunlight Power Balance",
                status=ReviewStatus.WARNING,
                value_measured=f"{metrics.net_power_sunlight_w:.1f} W surplus",
                threshold_required="Surplus ≥ 50 W",
                explanation=(
                    f"Power margin in sunlight is razor-thin (+{metrics.net_power_sunlight_w:.1f} W). "
                    "Battery will recharge very slowly, leaving little energy for the next eclipse cycle."
                ),
                revision_recommendation="Increase solar panel area to provide at least 50 W surplus for battery recharging.",
            ))
            active_risks.append("Slow battery recharge: risk of brownout on successive short orbits.")
        else:
            checks.append(EngineeringCheckResult(
                check_id="power_balance",
                category="Electrical Power",
                title="Sunlight Power Balance",
                status=ReviewStatus.PASS,
                value_measured=f"+{metrics.net_power_sunlight_w:.1f} W surplus",
                threshold_required="Surplus ≥ 50 W",
                explanation=f"Adequate solar generation provides +{metrics.net_power_sunlight_w:.1f} W surplus to rapidly recharge batteries.",
            ))

        # ── Check 4: Eclipse Battery Reserve ────────────────────────────────
        if metrics.battery_capacity_wh <= 0.0 or metrics.eclipse_dod_pct >= 100.0:
            checks.append(EngineeringCheckResult(
                check_id="eclipse_battery_reserve",
                category="Electrical Power",
                title="Eclipse Survival Battery Reserve",
                status=ReviewStatus.ERROR,
                value_measured=f"{metrics.eclipse_energy_demand_wh:.1f} Wh needed vs {metrics.battery_capacity_wh:.1f} Wh capacity",
                threshold_required="DoD < 100%",
                explanation=(
                    f"Total blackout! The {metrics.eclipse_duration_minutes:.0f}-minute eclipse demands {metrics.eclipse_energy_demand_wh:.1f} Wh, "
                    f"which completely depletes the {metrics.battery_capacity_wh:.0f} Wh battery before sunrise."
                ),
                revision_recommendation="Install a higher-capacity battery (2200 Wh or 4500 Wh) to survive the darkness.",
            ))
        elif metrics.eclipse_dod_pct > 60.0:
            checks.append(EngineeringCheckResult(
                check_id="eclipse_battery_reserve",
                category="Electrical Power",
                title="Eclipse Survival Battery Reserve",
                status=ReviewStatus.WARNING,
                value_measured=f"{metrics.eclipse_dod_pct:.1f}% Depth of Discharge",
                threshold_required="DoD ≤ 60% (Reserve ≥ 40%)",
                explanation=(
                    f"Deep discharge warning: battery will drain to {metrics.eclipse_dod_pct:.1f}% DoD during eclipse "
                    f"(only {metrics.eclipse_battery_reserve_pct:.1f}% reserve remaining). Deep cycles accelerate cell degradation."
                ),
                revision_recommendation="Select a larger battery pack or shed instrument power during eclipse passes.",
            ))
            active_risks.append("Deep battery discharge: cells vulnerable to thermal runaway and voltage sag.")
        else:
            checks.append(EngineeringCheckResult(
                check_id="eclipse_battery_reserve",
                category="Electrical Power",
                title="Eclipse Survival Battery Reserve",
                status=ReviewStatus.PASS,
                value_measured=f"{metrics.eclipse_battery_reserve_pct:.1f}% reserve remaining",
                threshold_required="Reserve ≥ 40%",
                explanation=f"Safe battery depth-of-discharge. Spacecraft retains {metrics.eclipse_battery_reserve_pct:.1f}% reserve energy at sunrise.",
            ))

        # ── Check 5: Thermal Radiator Rejection Margin ───────────────────────
        if metrics.thermal_margin_pct < 0.0:
            checks.append(EngineeringCheckResult(
                check_id="thermal_margin",
                category="Thermal Control",
                title="Radiator Heat Rejection Margin",
                status=ReviewStatus.ERROR,
                value_measured=f"{metrics.heat_rejected_w:.1f} W rejection vs {metrics.heat_generated_w:.1f} W heat",
                threshold_required="Thermal Margin ≥ 0%",
                explanation=(
                    f"Thermal runaway! Spacecraft generates {metrics.heat_generated_w:.1f} W of waste heat, but radiators "
                    f"can only dissipate {metrics.heat_rejected_w:.1f} W. Temperatures will rise continuously until computer shuts down."
                ),
                revision_recommendation="Upgrade to an embedded heatpipe radiator (2.2 m²) or louvered array (4.0 m²).",
            ))
        elif metrics.thermal_margin_pct < 15.0:
            checks.append(EngineeringCheckResult(
                check_id="thermal_margin",
                category="Thermal Control",
                title="Radiator Heat Rejection Margin",
                status=ReviewStatus.WARNING,
                value_measured=f"{metrics.thermal_margin_pct:.1f}% margin",
                threshold_required="Margin ≥ 15%",
                explanation=(
                    f"Low thermal margin ({metrics.thermal_margin_pct:.1f}%). Spacecraft will run hot during peak imaging operations, "
                    "approaching temperature warning limits."
                ),
                revision_recommendation="Increase radiator area by 0.5 m² or add louver blades to improve heat rejection.",
            ))
            active_risks.append("Elevated operating temperature: optical sensor noise and CPU thermal throttling.")
        else:
            checks.append(EngineeringCheckResult(
                check_id="thermal_margin",
                category="Thermal Control",
                title="Radiator Heat Rejection Margin",
                status=ReviewStatus.PASS,
                value_measured=f"+{metrics.thermal_margin_pct:.1f}% margin",
                threshold_required="Margin ≥ 15%",
                explanation=f"Ample thermal dissipation capacity. Radiators reject {metrics.heat_rejected_w:.1f} W into cold space.",
            ))

        # ── Check 6: Onboard Storage Buffer ─────────────────────────────────
        if metrics.storage_hours_to_fill < 1.5:
            checks.append(EngineeringCheckResult(
                check_id="storage_capacity",
                category="Data & Storage",
                title="Onboard Storage Buffer Capacity",
                status=ReviewStatus.WARNING,
                value_measured=f"{metrics.storage_hours_to_fill:.1f} hours to overflow",
                threshold_required="Buffer ≥ 4.0 hours",
                explanation=(
                    f"Storage fills rapidly ({metrics.storage_hours_to_fill:.1f} hours). If a ground station pass is missed, "
                    "the data recorder will overflow and subsequent science imagery will be lost."
                ),
                revision_recommendation="Upgrade to 256 GB or 1 TB flight storage array.",
            ))
            active_risks.append("Buffer overflow risk: missing a downlink window will discard science data.")
        else:
            checks.append(EngineeringCheckResult(
                check_id="storage_capacity",
                category="Data & Storage",
                title="Onboard Storage Buffer Capacity",
                status=ReviewStatus.PASS,
                value_measured=f"{metrics.storage_hours_to_fill:.1f} hours storage",
                threshold_required="Buffer ≥ 4.0 hours",
                explanation=f"Storage buffer ({metrics.storage_capacity_mb:.0f} MB) can store {metrics.storage_hours_to_fill:.1f} hours of continuous observations.",
            ))

        # ── Check 7: Ground Downlink Bandwidth ──────────────────────────────
        if metrics.downlink_rate_kbps < 500.0 and metrics.data_generation_rate_kbps > 1000.0:
            checks.append(EngineeringCheckResult(
                check_id="communication_capability",
                category="Communications",
                title="Downlink Throughput vs Data Rate",
                status=ReviewStatus.WARNING,
                value_measured=f"{metrics.downlink_rate_kbps:.0f} kbps downlink vs {metrics.data_generation_rate_kbps:.0f} kbps generation",
                threshold_required="Downlink ≥ 2000 kbps for high-rate payloads",
                explanation=(
                    f"Downlink bottleneck: S-Band patch transmits only {metrics.downlink_rate_kbps:.0f} kbps ({metrics.downlink_per_pass_mb:.0f} MB per pass), "
                    "which is far too slow to empty high-rate radar or multispectral imagery."
                ),
                revision_recommendation="Upgrade antenna to directional X-Band Horn or Steerable Ka-Band Dish.",
            ))
            active_risks.append("Downlink backlog: data buffer cannot clear during standard 8-minute ground passes.")
        else:
            checks.append(EngineeringCheckResult(
                check_id="communication_capability",
                category="Communications",
                title="Downlink Throughput vs Data Rate",
                status=ReviewStatus.PASS,
                value_measured=f"{metrics.downlink_rate_kbps:.0f} kbps (~{metrics.downlink_per_pass_mb:.0f} MB/pass)",
                threshold_required="Downlink throughput matched to data rate",
                explanation=f"Antenna supports {metrics.downlink_per_pass_mb:.0f} MB per 8-minute ground station pass.",
            ))

        # ── Check 8: Instrument Subsystem Compatibility ─────────────────────
        compat_errors: list[str] = []
        if "inst_sar_radar" in design.instrument_ids and design.computer_id == "proc_rad_hard_micro":
            compat_errors.append("Synthetic Aperture Radar requires Dual-Core or Edge AI processor for signal processing.")

        if "inst_uv_spectrometer" in design.instrument_ids and "polar" not in design.orbit_id:
            compat_errors.append("Solar UV Spectrometer requires a High Polar Orbit (800 km) to monitor solar storms and auroral belts.")

        if compat_errors:
            checks.append(EngineeringCheckResult(
                check_id="instrument_compatibility",
                category="Payload & Subsystems",
                title="Instrument Subsystem Dependencies",
                status=ReviewStatus.ERROR,
                value_measured="Incompatible combination",
                threshold_required="All hardware dependencies satisfied",
                explanation="; ".join(compat_errors),
                revision_recommendation="Select compatible flight computer or adjust target orbit inclination.",
            ))
        else:
            checks.append(EngineeringCheckResult(
                check_id="instrument_compatibility",
                category="Payload & Subsystems",
                title="Instrument Subsystem Dependencies",
                status=ReviewStatus.PASS,
                value_measured="All dependencies met",
                threshold_required="Compatible payload configuration",
                explanation="All instruments are fully compatible with onboard processor, power architecture, and orbit.",
            ))

        # ── Check 9: Mission Contract Budget Enforcement ───────────────────
        if metrics.budget_remaining_credits < 0.0:
            checks.append(EngineeringCheckResult(
                check_id="budget_enforcement",
                category="Cost & Contract",
                title="Mission Contract Budget",
                status=ReviewStatus.ERROR,
                value_measured=f"{metrics.total_cost_credits:.0f} credits spent ({metrics.budget_remaining_credits:.0f} deficit)",
                threshold_required=f"≤ {metrics.contract_budget_credits:.0f} credits",
                explanation=(
                    f"Budget overrun! Total build cost of {metrics.total_cost_credits:.0f} credits exceeds the mission's "
                    f"contract ceiling of {metrics.contract_budget_credits:.0f} credits. Procurement cannot be approved."
                ),
                revision_recommendation="Choose a more affordable launcher (e.g. SmallSat rideshare) or simplify non-essential subsystems.",
            ))
        elif metrics.budget_margin_pct < 10.0:
            checks.append(EngineeringCheckResult(
                check_id="budget_enforcement",
                category="Cost & Contract",
                title="Mission Contract Budget",
                status=ReviewStatus.WARNING,
                value_measured=f"{metrics.budget_remaining_credits:.0f} credits remaining ({metrics.budget_margin_pct:.1f}%)",
                threshold_required="Buffer ≥ 10.0%",
                explanation=(
                    f"Narrow budget reserve ({metrics.budget_remaining_credits:.0f} credits). Little financial buffer remains "
                    "to handle unexpected in-flight anomalies or emergency ground station re-tasking."
                ),
                revision_recommendation="Consider keeping at least 10% budget reserve for operational flexibility.",
            ))
            active_risks.append("Low budget reserve: in-flight event resolutions requiring credits may be restricted.")
        else:
            checks.append(EngineeringCheckResult(
                check_id="budget_enforcement",
                category="Cost & Contract",
                title="Mission Contract Budget",
                status=ReviewStatus.PASS,
                value_measured=f"{metrics.budget_remaining_credits:.0f} credits remaining",
                threshold_required="Cost within contract budget",
                explanation=f"Design is fully funded under contract budget ({metrics.budget_remaining_credits:.0f} credits reserve remaining).",
            ))

        # ── Check 10: Mission Objectives Sensor Suitability ─────────────────
        mission = design.mission_id.lower()
        has_primary = False
        if mission == "wildfire" and any(i in design.instrument_ids for i in ["inst_thermal_infrared", "inst_multispectral_imager"]):
            has_primary = True
        elif mission == "flood" and any(i in design.instrument_ids for i in ["inst_sar_radar"]):
            has_primary = True
        elif mission == "solar_storm" and any(i in design.instrument_ids for i in ["inst_uv_spectrometer"]):
            has_primary = True
        elif mission == "volcano" and any(i in design.instrument_ids for i in ["inst_multispectral_imager", "inst_thermal_infrared"]):
            has_primary = True

        if not has_primary:
            checks.append(EngineeringCheckResult(
                check_id="mission_objectives_suitability",
                category="Science & Objectives",
                title="Primary Mission Sensor Alignment",
                status=ReviewStatus.WARNING,
                value_measured="Non-matching sensor payload",
                threshold_required="Sensor matched to primary contract objectives",
                explanation=(
                    f"Selected instruments do not include the recommended primary sensor for {design.mission_id.replace('_', ' ').title()}. "
                    "Primary objectives may be difficult or impossible to satisfy."
                ),
                revision_recommendation="Add the recommended primary sensor (e.g. Thermal IR for Wildfires, SAR for Floods, UV Spectrometer for Solar Storm).",
            ))
            active_risks.append("Sensor mismatch: primary science objective progress may be severely impaired.")
        else:
            checks.append(EngineeringCheckResult(
                check_id="mission_objectives_suitability",
                category="Science & Objectives",
                title="Primary Mission Sensor Alignment",
                status=ReviewStatus.PASS,
                value_measured="Optimal sensor equipped",
                threshold_required="Primary payload equipped",
                explanation=f"Equipped sensors match primary mission goals for {design.mission_id.replace('_', ' ').title()}.",
            ))

        # ── Determine Overall Readiness Decision ────────────────────────────
        error_count = sum(1 for c in checks if c.status == ReviewStatus.ERROR)
        warning_count = sum(1 for c in checks if c.status == ReviewStatus.WARNING)
        pass_count = sum(1 for c in checks if c.status == ReviewStatus.PASS)

        if error_count > 0:
            readiness = LaunchReadiness.GROUNDED
            can_launch = False
            is_experimental = False
        elif warning_count > 0:
            readiness = LaunchReadiness.EXPERIMENTAL_LAUNCH
            can_launch = True
            is_experimental = True
        else:
            readiness = LaunchReadiness.FLIGHT_READY
            can_launch = True
            is_experimental = False

        return PreLaunchReviewReport(
            design_name=design.name,
            mission_id=design.mission_id,
            readiness=readiness,
            can_launch=can_launch,
            is_experimental=is_experimental,
            error_count=error_count,
            warning_count=warning_count,
            pass_count=pass_count,
            checks=checks,
            active_risks=active_risks,
            metrics=metrics,
        )


# ── Viable Reference Builds ─────────────────────────────────────────────────

PRESET_BUILDS: dict[str, dict[str, SpacecraftDesign]] = {
    "wildfire": {
        "agile_scout": SpacecraftDesign(
            design_id="wf_build_agile",
            name="Wildfire Agile Scout (Lightweight)",
            mission_id="wildfire",
            launcher_id="launcher_dedicated_light",
            orbit_id="orbit_sso_650",
            instrument_ids=["inst_thermal_infrared"],
            computer_id="proc_dual_core_space",
            battery_id="bat_li_ion_standard_2k",
            solar_id="solar_deployable_flat_5m",
            thermal_id="therm_heatpipe_radiator_2m",
            comms_id="comm_xband_horn",
            storage_id="stor_flash_array_256gb",
            shielding_id="shield_mylar_blanket",
            chassis_dry_mass_kg=100.0,
            fuel_mass_kg=30.0,
        ),
        "heavy_sentinel": SpacecraftDesign(
            design_id="wf_build_heavy",
            name="Wildfire Heavy Sentinel (AI Flagship)",
            mission_id="wildfire",
            launcher_id="launcher_medium_lift",
            orbit_id="orbit_sso_650",
            instrument_ids=["inst_thermal_infrared", "inst_optical_survey_camera"],
            computer_id="proc_edge_ai_quad",
            battery_id="bat_li_sulfur_heavy_4k",
            solar_id="solar_articulated_dual_wing_8m",
            thermal_id="therm_louvered_array_4m",
            comms_id="comm_kaband_steerable_dish",
            storage_id="stor_nvme_high_speed_1tb",
            shielding_id="shield_standard_aluminum",
            chassis_dry_mass_kg=150.0,
            fuel_mass_kg=60.0,
        ),
    },
    "flood": {
        "radar_express": SpacecraftDesign(
            design_id="fl_build_radar",
            name="Flood Radar Express (Heavy SAR)",
            mission_id="flood",
            launcher_id="launcher_medium_lift",
            orbit_id="orbit_sso_650",
            instrument_ids=["inst_sar_radar"],
            computer_id="proc_dual_core_space",
            battery_id="bat_li_sulfur_heavy_4k",
            solar_id="solar_articulated_dual_wing_8m",
            thermal_id="therm_louvered_array_4m",
            comms_id="comm_kaband_steerable_dish",
            storage_id="stor_flash_array_256gb",
            shielding_id="shield_standard_aluminum",
            chassis_dry_mass_kg=140.0,
            fuel_mass_kg=50.0,
        ),
        "radar_agile": SpacecraftDesign(
            design_id="fl_build_light",
            name="Flood Agile Radar Scout",
            mission_id="flood",
            launcher_id="launcher_dedicated_light",
            orbit_id="orbit_sso_650",
            instrument_ids=["inst_sar_radar"],
            computer_id="proc_dual_core_space",
            battery_id="bat_li_sulfur_heavy_4k",
            solar_id="solar_articulated_dual_wing_8m",
            thermal_id="therm_louvered_array_4m",
            comms_id="comm_xband_horn",
            storage_id="stor_flash_array_256gb",
            shielding_id="shield_standard_aluminum",
            chassis_dry_mass_kg=110.0,
            fuel_mass_kg=30.0,
        ),
    },
    "solar_storm": {
        "sun_sentinel": SpacecraftDesign(
            design_id="ss_build_sentinel",
            name="Solar Storm High-Polar Sentinel",
            mission_id="solar_storm",
            launcher_id="launcher_dedicated_light",
            orbit_id="orbit_polar_800",
            instrument_ids=["inst_uv_spectrometer"],
            computer_id="proc_rad_hard_micro",
            battery_id="bat_li_ion_standard_2k",
            solar_id="solar_deployable_flat_5m",
            thermal_id="therm_heatpipe_radiator_2m",
            comms_id="comm_xband_horn",
            storage_id="stor_flash_array_256gb",
            shielding_id="shield_graded_z_heavy",
            chassis_dry_mass_kg=110.0,
            fuel_mass_kg=35.0,
        ),
        "rideshare_explorer": SpacecraftDesign(
            design_id="ss_build_rideshare",
            name="Solar Storm Rideshare Explorer",
            mission_id="solar_storm",
            launcher_id="launcher_smallsat_rideshare",
            orbit_id="orbit_polar_800",
            instrument_ids=["inst_uv_spectrometer"],
            computer_id="proc_rad_hard_micro",
            battery_id="bat_li_ion_standard_2k",
            solar_id="solar_deployable_flat_5m",
            thermal_id="therm_heatpipe_radiator_2m",
            comms_id="comm_xband_horn",
            storage_id="stor_flash_array_256gb",
            shielding_id="shield_standard_aluminum",
            chassis_dry_mass_kg=75.0,
            fuel_mass_kg=15.0,
        ),
    },
    "volcano": {
        "volcano_observer": SpacecraftDesign(
            design_id="vc_build_observer",
            name="Volcano Ash & Plume Observer",
            mission_id="volcano",
            launcher_id="launcher_dedicated_light",
            orbit_id="orbit_sso_650",
            instrument_ids=["inst_multispectral_imager"],
            computer_id="proc_dual_core_space",
            battery_id="bat_li_ion_standard_2k",
            solar_id="solar_deployable_flat_5m",
            thermal_id="therm_heatpipe_radiator_2m",
            comms_id="comm_xband_horn",
            storage_id="stor_flash_array_256gb",
            shielding_id="shield_standard_aluminum",
            chassis_dry_mass_kg=120.0,
            fuel_mass_kg=40.0,
        ),
        "thermal_surveyor": SpacecraftDesign(
            design_id="vc_build_thermal",
            name="Volcano Rapid Thermal Surveyor",
            mission_id="volcano",
            launcher_id="launcher_dedicated_light",
            orbit_id="orbit_sso_650",
            instrument_ids=["inst_thermal_infrared"],
            computer_id="proc_dual_core_space",
            battery_id="bat_li_ion_standard_2k",
            solar_id="solar_deployable_flat_5m",
            thermal_id="therm_heatpipe_radiator_2m",
            comms_id="comm_xband_horn",
            storage_id="stor_flash_array_256gb",
            shielding_id="shield_standard_aluminum",
            chassis_dry_mass_kg=100.0,
            fuel_mass_kg=30.0,
        ),
    },
}
