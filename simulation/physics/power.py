"""
Power Subsystem Model — Solar generation, battery storage, and physical accounting.

Models:
- Solar panel power generation with solar irradiance, panel area, cell efficiency,
  sun incidence angle, solar cell degradation, and conical/cylindrical eclipse.
- Battery energy accounting: charge/discharge energy balance, round-trip efficiency,
  usable capacity, charge/discharge power limits, state of charge (SoC),
  depth of discharge (DoD), and safe reserves.
- Battery cycle accounting: tracks Equivalent Full Cycles (EFC) and battery state of
  health (SOH). Explicitly does NOT count each LEO orbit as one complete battery cycle!
- Spacecraft electrical loads: baseline avionics bus, science instruments/payload,
  on-board computer workload, comms transmitter, reaction wheels, and thermal heaters.

REFERENCE constants:
- Solar constant S0 = 1361.0 W/m² (NASA published average)
- Multi-junction solar cell efficiency ~0.30
- Battery charge efficiency ~0.92, discharge efficiency ~0.95
- Minimum safe battery SoC fraction = 0.10 (10%)
- Battery safe reserve threshold = 0.20 (20%)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Optional


# ── Reference Physical Constants ─────────────────────────────────────────────

SOLAR_CONSTANT_W_M2 = 1361.0        # Solar constant at 1 AU (NASA)
CELL_EFFICIENCY = 0.30              # Typical multi-junction GaAs space solar cells
BATTERY_CHARGE_EFFICIENCY = 0.92    # Electrochemical coulombic & thermal charge efficiency
BATTERY_DISCHARGE_EFFICIENCY = 0.95  # Internal resistance discharge efficiency
MIN_SOC_FRACTION = 0.10             # Critical shutdown threshold (10% SoC)
SAFE_RESERVE_FRACTION = 0.20        # Safe reserve threshold (20% SoC, triggers warning)
MAX_CHARGE_POWER_W = 1200.0         # Max power the battery charge controller accepts
MAX_DISCHARGE_POWER_W = 1500.0      # Max power the bus battery can deliver


@dataclass
class PowerConfig:
    """Spacecraft power subsystem configuration."""
    solar_panel_area_m2: float = 6.0
    cell_efficiency: float = CELL_EFFICIENCY
    solar_irradiance_w_m2: float = SOLAR_CONSTANT_W_M2
    panel_degradation_per_year: float = 0.0075    # ~0.75% per year from radiation
    battery_capacity_wh: float = 2000.0           # Nominal rated battery capacity
    min_soc_fraction: float = MIN_SOC_FRACTION
    safe_reserve_fraction: float = SAFE_RESERVE_FRACTION
    max_charge_power_w: float = MAX_CHARGE_POWER_W
    max_discharge_power_w: float = MAX_DISCHARGE_POWER_W
    # SOH degradation: fractional capacity loss per Equivalent Full Cycle (EFC)
    # e.g., 20% loss after 4000 EFC -> 0.20 / 4000 = 0.00005 per EFC
    efc_wear_factor: float = 0.00005


@dataclass
class PowerLoad:
    """A prioritized electrical power consumer on the spacecraft bus."""
    name: str
    power_w: float
    priority: int = 5                  # 1=critical (avionics), 10=shed first (payload/heaters)
    active: bool = True


@dataclass
class PowerState:
    """Power subsystem state at a discrete simulation step."""
    solar_output_w: float = 0.0
    solar_irradiance_w_m2: float = SOLAR_CONSTANT_W_M2
    sun_incidence_angle_deg: float = 0.0
    panel_degradation_factor: float = 1.0
    total_load_w: float = 0.0
    net_power_w: float = 0.0                    # positive = surplus/charging, negative = deficit/discharging
    battery_soc_wh: float = 2000.0
    battery_capacity_wh: float = 2000.0         # Current effective rated capacity (adjusted for SOH)
    battery_usable_capacity_wh: float = 1800.0  # Usable energy above critical threshold
    battery_soc_pct: float = 100.0              # State of charge (0% to 100%)
    battery_dod_pct: float = 0.0                # Depth of discharge (100% - SoC)
    battery_equivalent_full_cycles: float = 0.0 # EFC: NOT 1 cycle per orbit!
    battery_soh_pct: float = 100.0              # State of Health (100% down to 80%)
    in_eclipse: bool = False
    sunlight_fraction: float = 1.0              # 1.0 in full sun, 0.0 in umbra, (0,1) in penumbra
    low_power_warning: bool = False             # SoC < safe reserve (20%)
    power_critical: bool = False                # SoC < min survival threshold (10%)
    load_breakdown_w: dict[str, float] = field(default_factory=dict)


@dataclass
class PowerModel:
    """
    Deterministic Spacecraft Power Subsystem Model.

    Calculates:
    - Photovoltaic generation: P_gen = S * A * eta_cell * eta_deg * cos(theta) * sunlight_fraction
    - Bus load aggregation across avionics, instruments, CPU, transmitter, and heaters
    - Battery charge/discharge energy accounting with limits and efficiencies
    - Physical battery aging via Equivalent Full Cycles (EFC) instead of orbit counts.
    """
    config: PowerConfig = field(default_factory=PowerConfig)
    state: PowerState = field(default_factory=PowerState)
    loads: list[PowerLoad] = field(default_factory=list)

    # Internal trackers for battery cycling and degradation
    _cumulative_discharged_wh: float = 0.0
    _panel_degradation: float = 1.0

    def __post_init__(self):
        if not self.loads:
            # Baseline power loads for Earth observation / science satellite
            self.loads = [
                PowerLoad("bus_avionics", 30.0, priority=1, active=True),
                PowerLoad("attitude_control", 15.0, priority=2, active=True),
                PowerLoad("comms_receiver", 5.0, priority=2, active=True),
                PowerLoad("data_processing", 20.0, priority=4, active=True),
                PowerLoad("thermal_heaters", 25.0, priority=5, active=False),
                PowerLoad("comms_transmitter", 20.0, priority=6, active=False),
                PowerLoad("payload", 80.0, priority=7, active=True),
            ]
        self.state.battery_capacity_wh = self.config.battery_capacity_wh
        self.state.battery_usable_capacity_wh = self.config.battery_capacity_wh * (1.0 - self.config.min_soc_fraction)
        self.state.battery_soc_wh = self.config.battery_capacity_wh
        self.state.battery_soc_pct = 100.0
        self.state.battery_dod_pct = 0.0
        self.state.battery_soh_pct = 100.0
        self.state.battery_equivalent_full_cycles = 0.0
        self.state.load_breakdown_w = {l.name: l.power_w for l in self.loads if l.active}
        self.state.total_load_w = sum(self.state.load_breakdown_w.values())

    def solar_output(
        self,
        in_eclipse: bool,
        sun_angle_deg: float = 0.0,
        solar_irradiance_w_m2: Optional[float] = None,
        sunlight_fraction: Optional[float] = None,
    ) -> float:
        """
        Calculate solar array electrical power generation.

        Args:
            in_eclipse: True if spacecraft is fully in Earth's shadow.
            sun_angle_deg: Sun incidence angle to solar panel normal (0 deg = optimal normal illumination).
            solar_irradiance_w_m2: Incident solar flux (defaults to 1361.0 W/m²).
            sunlight_fraction: Fractional illumination (0.0 to 1.0) taking penumbra into account.
        """
        if in_eclipse:
            return 0.0

        flux = solar_irradiance_w_m2 if solar_irradiance_w_m2 is not None else self.config.solar_irradiance_w_m2
        illumination = sunlight_fraction if sunlight_fraction is not None else 1.0
        if illumination <= 0.0:
            return 0.0

        if abs(sun_angle_deg) >= 89.9999:
            cos_angle = 0.0
        else:
            cos_angle = max(0.0, math.cos(math.radians(sun_angle_deg)))
        return (
            flux
            * self.config.solar_panel_area_m2
            * self.config.cell_efficiency
            * self._panel_degradation
            * cos_angle
            * illumination
        )

    def total_load(self) -> float:
        """Sum of all currently active power loads in Watts."""
        return sum(l.power_w for l in self.loads if l.active)

    def set_load_power(self, load_name: str, power_w: float) -> bool:
        """Dynamically update power consumption of an existing load."""
        for load in self.loads:
            if load.name == load_name:
                load.power_w = max(0.0, power_w)
                return True
        return False

    def shed_load(self, load_name: str) -> bool:
        """Deactivate a load by name."""
        for load in self.loads:
            if load.name == load_name and load.active:
                load.active = False
                return True
        return False

    def restore_load(self, load_name: str) -> bool:
        """Reactivate a load by name."""
        for load in self.loads:
            if load.name == load_name and not load.active:
                load.active = True
                return True
        return False

    def auto_shed_lowest_priority(self) -> Optional[str]:
        """Shed the lowest-priority active load (highest priority number)."""
        active_sheddable = [l for l in self.loads if l.active and l.priority > 1]
        if not active_sheddable:
            return None
        target = max(active_sheddable, key=lambda l: l.priority)
        target.active = False
        return target.name

    def step(
        self,
        dt_seconds: float,
        in_eclipse: bool,
        sun_angle_deg: float = 0.0,
        solar_irradiance_w_m2: Optional[float] = None,
        sunlight_fraction: Optional[float] = None,
        mission_elapsed_days: float = 0.0,
    ) -> PowerState:
        """
        Advance power subsystem simulation by dt_seconds.

        Performs:
        1. Solar generation with degradation and incidence geometry.
        2. Load accounting across all active subsystems.
        3. Battery charge/discharge energy balance with power limits and efficiency losses.
        4. Equivalent Full Cycle (EFC) wear accounting (does not count each orbit as 1 cycle).
        5. Warning and critical safety threshold checks.
        """
        # 1. Update solar panel degradation from cumulative mission duration
        if mission_elapsed_days > 0.0:
            years = mission_elapsed_days / 365.25
            self._panel_degradation = max(0.60, (1.0 - self.config.panel_degradation_per_year) ** years)

        # 2. Solar generation
        solar_w = self.solar_output(
            in_eclipse=in_eclipse,
            sun_angle_deg=sun_angle_deg,
            solar_irradiance_w_m2=solar_irradiance_w_m2,
            sunlight_fraction=sunlight_fraction,
        )

        # 3. Electrical load
        active_loads = {l.name: l.power_w for l in self.loads if l.active}
        load_w = sum(active_loads.values())
        net_w = solar_w - load_w
        dt_hours = dt_seconds / 3600.0

        # Current effective battery capacity derated by SOH
        soh_factor = self.state.battery_soh_pct / 100.0
        effective_capacity_wh = self.config.battery_capacity_wh * soh_factor
        usable_capacity_wh = effective_capacity_wh * (1.0 - self.config.min_soc_fraction)

        soc = self.state.battery_soc_wh

        if net_w > 0.0:
            # ── Charging mode ────────────────────────────────────────────────
            # Power into battery is clamped by charge controller limit
            charge_power_w = min(net_w, self.config.max_charge_power_w)
            energy_in_wh = charge_power_w * dt_hours * BATTERY_CHARGE_EFFICIENCY
            soc = min(soc + energy_in_wh, effective_capacity_wh)
        else:
            # ── Discharging mode ─────────────────────────────────────────────
            deficit_w = abs(net_w)
            discharge_power_w = min(deficit_w, self.config.max_discharge_power_w)
            energy_out_wh = (discharge_power_w / BATTERY_DISCHARGE_EFFICIENCY) * dt_hours
            soc = max(0.0, soc - energy_out_wh)

            # Cumulative discharge tracking for physical cycle calculation
            self._cumulative_discharged_wh += energy_out_wh

        # 4. Equivalent Full Cycles (EFC) and State of Health (SOH)
        # Explicitly does NOT count each LEO orbit as one full cycle!
        # EFC = cumulative discharged energy / nominal battery capacity
        efc = self._cumulative_discharged_wh / max(1.0, self.config.battery_capacity_wh)
        soh_pct = max(70.0, 100.0 - (efc * self.config.efc_wear_factor * 100.0))

        # 5. State of Charge (SoC) and Depth of Discharge (DoD)
        soc_pct = (soc / effective_capacity_wh) * 100.0 if effective_capacity_wh > 0 else 0.0
        dod_pct = max(0.0, 100.0 - soc_pct)

        # Warning thresholds
        low_power = soc_pct < (self.config.safe_reserve_fraction * 100.0)
        power_critical = soc_pct < (self.config.min_soc_fraction * 100.0)

        flux_val = solar_irradiance_w_m2 if solar_irradiance_w_m2 is not None else self.config.solar_irradiance_w_m2
        illum_val = 0.0 if in_eclipse else (sunlight_fraction if sunlight_fraction is not None else 1.0)

        self.state = PowerState(
            solar_output_w=solar_w,
            solar_irradiance_w_m2=flux_val,
            sun_incidence_angle_deg=sun_angle_deg,
            panel_degradation_factor=self._panel_degradation,
            total_load_w=load_w,
            net_power_w=net_w,
            battery_soc_wh=soc,
            battery_capacity_wh=effective_capacity_wh,
            battery_usable_capacity_wh=usable_capacity_wh,
            battery_soc_pct=soc_pct,
            battery_dod_pct=dod_pct,
            battery_equivalent_full_cycles=efc,
            battery_soh_pct=soh_pct,
            in_eclipse=in_eclipse,
            sunlight_fraction=illum_val,
            low_power_warning=low_power,
            power_critical=power_critical,
            load_breakdown_w=active_loads,
        )
        return self.state
