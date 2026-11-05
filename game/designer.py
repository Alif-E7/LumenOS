"""
Spacecraft Designer Model — Real-time engineering budget calculations and trade-off simulation.

Enforces realistic subsystem interdependencies:
- Mass budget vs Launcher payload capacity
- Power balance in sunlight vs continuous electrical load
- Battery Depth of Discharge during eclipse (DoD must remain safe: < 60%)
- Radiator thermal equilibrium (heat rejection vs electrical + environmental heat)
- Storage buffer vs scientific instrument generation rate
- Downlink link throughput vs orbit ground contact windows
- Mission suitability score and science value rating
"""

from __future__ import annotations

import math
from typing import Any, Optional
from pydantic import BaseModel, Field

from game.catalog import (
    ALL_CATALOG_ITEMS,
    CATALOG_BY_ID,
    CatalogItem,
    LAUNCHER_CAPACITIES_KG,
    SubsystemType,
    get_catalog_item,
)
from game.contracts import MissionContract


DEFAULT_MISSION_BUDGETS: dict[str, float] = {
    "wildfire": 10000.0,
    "flood": 18000.0,
    "solar_storm": 12000.0,
    "volcano": 12000.0,
}


class SpacecraftDesign(BaseModel):
    """Player-configured spacecraft blueprint."""
    design_id: str = "design_01"
    name: str = "Orbital Explorer Alpha"
    mission_id: str = "wildfire"
    launcher_id: str = "launcher_dedicated_light"
    orbit_id: str = "orbit_sso_650"
    instrument_ids: list[str] = Field(default_factory=lambda: ["inst_thermal_infrared"])
    computer_id: str = "proc_dual_core_space"
    battery_id: str = "bat_li_ion_standard_2k"
    solar_id: str = "solar_deployable_flat_5m"
    thermal_id: str = "therm_heatpipe_radiator_2m"
    comms_id: str = "comm_xband_horn"
    storage_id: str = "stor_flash_array_256gb"
    shielding_id: str = "shield_standard_aluminum"
    chassis_dry_mass_kg: float = Field(default=120.0, ge=30.0)
    fuel_mass_kg: float = Field(default=35.0, ge=0.0)

    # ── Component Accessors ───────────────────────────────────────────────

    def get_selected_components(self) -> list[CatalogItem]:
        """Return list of all selected catalog items."""
        ids = [
            self.launcher_id,
            self.orbit_id,
            *self.instrument_ids,
            self.computer_id,
            self.battery_id,
            self.solar_id,
            self.thermal_id,
            self.comms_id,
            self.storage_id,
            self.shielding_id,
        ]
        return [CATALOG_BY_ID[cid] for cid in ids if cid in CATALOG_BY_ID]

    def to_spacecraft_config(self) -> Any:
        """
        Convert this high-level design into a physics-engine SpacecraftConfig.
        Ensures that component choices directly drive the simulation engine.
        """
        from simulation.core import SpacecraftConfig
        from simulation.physics.orbital import OrbitalElements
        from simulation.physics.power import PowerConfig
        from simulation.physics.thermal import ThermalConfig
        from simulation.physics.comms import CommsConfig
        from simulation.physics.storage import StorageConfig, WorkloadConfig

        components = self.get_selected_components()

        # Orbit altitude
        altitude_km = 650.0
        inclination_deg = 98.0
        if "leo_400" in self.orbit_id:
            altitude_km = 400.0
            inclination_deg = 51.6
        elif "polar_800" in self.orbit_id:
            altitude_km = 800.0
            inclination_deg = 85.0

        # Solar & Battery
        solar_item = get_catalog_item(self.solar_id)
        solar_area = 5.0
        if solar_item:
            if "2m" in solar_item.id:
                solar_area = 2.0
            elif "8m" in solar_item.id:
                solar_area = 8.5

        battery_item = get_catalog_item(self.battery_id)
        battery_wh = battery_item.battery_capacity_wh if battery_item else 2000.0

        # Thermal
        therm_item = get_catalog_item(self.thermal_id)
        radiator_area = 2.0
        if therm_item:
            if "1m" in therm_item.id:
                radiator_area = 1.0
            elif "4m" in therm_item.id:
                radiator_area = 4.0

        # Comms & Storage
        comm_item = get_catalog_item(self.comms_id)
        gain_dbi = 24.0
        tx_power_w = 10.0
        if comm_item:
            if "sband" in comm_item.id:
                gain_dbi = 6.0
                tx_power_w = 5.0
            elif "kaband" in comm_item.id:
                gain_dbi = 38.0
                tx_power_w = 25.0

        stor_item = get_catalog_item(self.storage_id)
        storage_cap = stor_item.storage_capacity_mb if stor_item else 256000.0

        # Payload totals
        inst_items = [get_catalog_item(iid) for iid in self.instrument_ids]
        payload_power = sum(i.power_draw_w for i in inst_items if i) or 80.0
        data_kbps = sum(i.data_rate_kbps for i in inst_items if i) or 500.0
        data_mb_per_min = (data_kbps * 60.0) / 8000.0

        return SpacecraftConfig(
            name=self.name,
            orbital=OrbitalElements(
                semi_major_axis_km=6371.0 + altitude_km,
                inclination_deg=inclination_deg,
            ),
            power=PowerConfig(
                solar_panel_area_m2=solar_area,
                battery_capacity_wh=battery_wh,
            ),
            thermal=ThermalConfig(
                radiator_area_m2=radiator_area,
            ),
            comms=CommsConfig(
                antenna_gain_dbi=gain_dbi,
                transmit_power_w=tx_power_w,
                data_buffer_capacity_mb=storage_cap,
            ),
            storage=StorageConfig(
                capacity_mb=storage_cap,
            ),
            payload_power_w=payload_power,
            payload_data_rate_mb_per_min=data_mb_per_min,
            payload_active=True,
        )


class LiveEngineeringMetrics(BaseModel):
    """Real-time computed engineering metrics for the designer HUD."""
    # Mass
    total_mass_kg: float
    launcher_capacity_kg: float
    mass_margin_kg: float
    mass_margin_pct: float

    # Cost / Budget
    total_cost_credits: float
    contract_budget_credits: float
    budget_remaining_credits: float
    budget_margin_pct: float

    # Power
    power_generation_sunlight_w: float
    power_nominal_load_w: float
    power_peak_load_w: float
    net_power_sunlight_w: float

    # Battery & Eclipse
    battery_capacity_wh: float
    eclipse_duration_minutes: float
    eclipse_energy_demand_wh: float
    eclipse_dod_pct: float
    eclipse_battery_reserve_pct: float

    # Thermal
    heat_generated_w: float
    heat_rejected_w: float
    thermal_margin_pct: float

    # Comms & Storage
    data_generation_rate_kbps: float
    storage_capacity_mb: float
    storage_hours_to_fill: float
    downlink_rate_kbps: float
    downlink_per_pass_mb: float

    # Scientific Value & Suitability
    science_value_rating: float
    mission_suitability_pct: float
    reliability_rating: float


class DesignerEngine:
    """Calculates engineering budgets, margins, and trade-offs for a spacecraft design."""

    @staticmethod
    def calculate_metrics(
        design: SpacecraftDesign,
        contract_budget: Optional[float] = None,
    ) -> LiveEngineeringMetrics:
        """
        Compute live physics-derived telemetry and margins for the design.
        """
        if contract_budget is None:
            contract_budget = DEFAULT_MISSION_BUDGETS.get(design.mission_id.lower(), 10000.0)

        components = design.get_selected_components()

        # 1. Mass calculation (dry chassis + propellant + onboard hardware)
        hardware_mass = sum(c.mass_kg for c in components if c.subsystem != SubsystemType.LAUNCHER)
        total_mass = round(design.chassis_dry_mass_kg + design.fuel_mass_kg + hardware_mass, 1)

        launcher_cap = LAUNCHER_CAPACITIES_KG.get(design.launcher_id, 600.0)
        mass_margin_kg = round(launcher_cap - total_mass, 1)
        mass_margin_pct = round((mass_margin_kg / launcher_cap) * 100, 1) if launcher_cap > 0 else 0.0

        # 2. Cost calculation
        total_cost = sum(c.cost_credits for c in components)
        budget_remaining = round(contract_budget - total_cost, 1)
        budget_margin_pct = round((budget_remaining / contract_budget) * 100, 1) if contract_budget > 0 else 0.0

        # 3. Power calculation
        # Base housekeeping avionics draw = 30 W
        housekeeping_w = 30.0
        component_draw = sum(c.power_draw_w for c in components)
        nominal_load_w = round(housekeeping_w + component_draw, 1)
        # Peak load = nominal + 35% burst (simultaneous radar pulse or transmitter burst)
        peak_load_w = round(nominal_load_w * 1.35, 1)

        solar_gen_w = sum(c.power_generation_w for c in components)
        net_power_sunlight_w = round(solar_gen_w - nominal_load_w, 1)

        # 4. Battery & Eclipse
        # Standard LEO eclipse duration is ~35 minutes
        eclipse_min = 35.0
        if "polar" in design.orbit_id:
            eclipse_min = 34.0
        elif "leo_400" in design.orbit_id:
            eclipse_min = 36.0

        battery_wh = sum(c.battery_capacity_wh for c in components)
        # Energy demanded during eclipse (Wh) = nominal_load (W) * (eclipse_min / 60)
        eclipse_energy_demand_wh = round(nominal_load_w * (eclipse_min / 60.0), 1)

        if battery_wh > 0:
            eclipse_dod_pct = round((eclipse_energy_demand_wh / battery_wh) * 100, 1)
            eclipse_dod_pct = min(eclipse_dod_pct, 100.0)
            eclipse_reserve_pct = round(100.0 - eclipse_dod_pct, 1)
        else:
            eclipse_dod_pct = 100.0
            eclipse_reserve_pct = 0.0

        # 5. Thermal calculation
        # Heat generated = electrical power dissipated as heat (~90% of nominal load) + solar absorbed
        heat_generated_w = round(nominal_load_w * 0.90 + 50.0, 1)
        heat_rejected_w = sum(c.heat_rejection_w for c in components)

        if heat_generated_w > 0:
            thermal_margin_pct = round(((heat_rejected_w - heat_generated_w) / heat_generated_w) * 100, 1)
        else:
            thermal_margin_pct = 100.0

        # 6. Comms & Storage
        data_gen_kbps = sum(c.data_rate_kbps for c in components)
        storage_mb = sum(c.storage_capacity_mb for c in components)

        # Storage fill rate: data_gen_kbps * 3600 s / (8000 kb/MB) = MB/hour
        mb_per_hour = (data_gen_kbps * 3600.0) / 8000.0
        if mb_per_hour > 0:
            storage_hours = round(storage_mb / mb_per_hour, 1)
        else:
            storage_hours = 999.0

        # Downlink: ground pass duration ~8 minutes (480 seconds)
        contact_s = 480.0
        downlink_kbps = sum(c.data_rate_kbps for c in components if c.subsystem == SubsystemType.COMMS)
        downlink_per_pass_mb = round((downlink_kbps * contact_s) / 8000.0, 1)

        # 7. Science Value & Suitability
        inst_science = sum(c.science_multiplier for c in components if c.subsystem == SubsystemType.INSTRUMENT)
        comp_bonus = 1.25 if design.computer_id == "proc_edge_ai_quad" else 1.0
        shield_bonus = 1.15 if design.shielding_id == "shield_graded_z_heavy" else 1.0
        science_value_rating = round(inst_science * comp_bonus * shield_bonus, 2)

        # Reliability
        rel = 1.0
        for c in components:
            rel *= c.reliability
        reliability_rating = round(rel * 100, 1)

        # Mission suitability match
        suitability = 100.0
        # Check mission instrument alignment
        mission = design.mission_id.lower()
        if mission == "wildfire" and not any(i in design.instrument_ids for i in ["inst_thermal_infrared", "inst_multispectral_imager"]):
            suitability -= 40.0
        elif mission == "flood" and not any(i in design.instrument_ids for i in ["inst_sar_radar"]):
            suitability -= 40.0
        elif mission == "solar_storm" and not any(i in design.instrument_ids for i in ["inst_uv_spectrometer"]):
            suitability -= 40.0
        elif mission == "volcano" and not any(i in design.instrument_ids for i in ["inst_multispectral_imager", "inst_thermal_infrared"]):
            suitability -= 40.0

        # Check penalties for thin margins
        if net_power_sunlight_w < 50.0:
            suitability -= 15.0
        if eclipse_reserve_pct < 25.0:
            suitability -= 15.0
        if thermal_margin_pct < 10.0:
            suitability -= 15.0
        if mass_margin_pct < 5.0:
            suitability -= 20.0
        if budget_remaining < 0:
            suitability -= 30.0

        mission_suitability_pct = max(round(suitability, 1), 0.0)

        return LiveEngineeringMetrics(
            total_mass_kg=total_mass,
            launcher_capacity_kg=launcher_cap,
            mass_margin_kg=mass_margin_kg,
            mass_margin_pct=mass_margin_pct,
            total_cost_credits=total_cost,
            contract_budget_credits=contract_budget,
            budget_remaining_credits=budget_remaining,
            budget_margin_pct=budget_margin_pct,
            power_generation_sunlight_w=solar_gen_w,
            power_nominal_load_w=nominal_load_w,
            power_peak_load_w=peak_load_w,
            net_power_sunlight_w=net_power_sunlight_w,
            battery_capacity_wh=battery_wh,
            eclipse_duration_minutes=eclipse_min,
            eclipse_energy_demand_wh=eclipse_energy_demand_wh,
            eclipse_dod_pct=eclipse_dod_pct,
            eclipse_battery_reserve_pct=eclipse_reserve_pct,
            heat_generated_w=heat_generated_w,
            heat_rejected_w=heat_rejected_w,
            thermal_margin_pct=thermal_margin_pct,
            data_generation_rate_kbps=data_gen_kbps,
            storage_capacity_mb=storage_mb,
            storage_hours_to_fill=storage_hours,
            downlink_rate_kbps=downlink_kbps,
            downlink_per_pass_mb=downlink_per_pass_mb,
            science_value_rating=science_value_rating,
            mission_suitability_pct=mission_suitability_pct,
            reliability_rating=reliability_rating,
        )
