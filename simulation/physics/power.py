"""
Power Subsystem Model — Solar generation, battery storage, load management.

Models:
- Solar panel power output based on area, efficiency, sun angle, and eclipse
- Battery state of charge (SOC) with charge/discharge dynamics
- Load management with prioritized consumers

REFERENCE constants:
- Solar constant = 1361 W/m² (NASA)
- Typical cell efficiency ~0.30 (multi-junction GaAs)
- Battery round-trip efficiency ~0.90
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


# ── REFERENCE constants ─────────────────────────────────────────────────────

SOLAR_CONSTANT_W_M2 = 1361.0   # NASA published value
CELL_EFFICIENCY = 0.30          # Typical multi-junction solar cell
BATTERY_CHARGE_EFFICIENCY = 0.90
BATTERY_DISCHARGE_EFFICIENCY = 0.95
MIN_SOC_FRACTION = 0.10         # Never discharge below 10%


@dataclass
class PowerConfig:
    """Spacecraft power subsystem configuration."""
    solar_panel_area_m2: float = 6.0
    cell_efficiency: float = CELL_EFFICIENCY
    battery_capacity_wh: float = 2000.0
    min_soc_fraction: float = MIN_SOC_FRACTION


@dataclass
class PowerState:
    """Power subsystem state at a point in time."""
    solar_output_w: float = 0.0
    total_load_w: float = 0.0
    net_power_w: float = 0.0           # positive = surplus, negative = deficit
    battery_soc_wh: float = 2000.0
    battery_soc_pct: float = 100.0
    in_eclipse: bool = False
    low_power_warning: bool = False
    power_critical: bool = False


@dataclass
class PowerLoad:
    """A power consumer on the spacecraft."""
    name: str
    power_w: float
    priority: int = 5              # 1=critical (never shed), 10=lowest priority
    active: bool = True


@dataclass
class PowerModel:
    """
    Power subsystem simulation model.
    
    Deterministic — output depends only on config, loads, and eclipse state.
    """
    config: PowerConfig = field(default_factory=PowerConfig)
    state: PowerState = field(default_factory=PowerState)
    loads: list[PowerLoad] = field(default_factory=list)

    def __post_init__(self):
        if not self.loads:
            # Default loads for a typical Earth observation satellite
            self.loads = [
                PowerLoad("bus_avionics", 30.0, priority=1),
                PowerLoad("attitude_control", 15.0, priority=2),
                PowerLoad("thermal_heaters", 20.0, priority=3),
                PowerLoad("comms_receiver", 5.0, priority=2),
                PowerLoad("comms_transmitter", 10.0, priority=4),
                PowerLoad("payload", 80.0, priority=6),
                PowerLoad("data_processing", 15.0, priority=5),
            ]
        self.state.battery_soc_wh = self.config.battery_capacity_wh

    def solar_output(self, in_eclipse: bool, sun_angle_deg: float = 0.0) -> float:
        """
        Calculate solar panel electrical output.
        
        Args:
            in_eclipse: True if spacecraft is in Earth's shadow
            sun_angle_deg: Angle between sun vector and panel normal (0=direct)
        """
        if in_eclipse:
            return 0.0
        cos_angle = max(0.0, math.cos(math.radians(sun_angle_deg)))
        return (
            SOLAR_CONSTANT_W_M2
            * self.config.solar_panel_area_m2
            * self.config.cell_efficiency
            * cos_angle
        )

    def total_load(self) -> float:
        """Sum of all active load power draws."""
        return sum(l.power_w for l in self.loads if l.active)

    def step(self, dt_seconds: float, in_eclipse: bool, sun_angle_deg: float = 0.0) -> PowerState:
        """
        Advance power model by dt_seconds.
        
        Updates battery SOC based on generation vs consumption.
        """
        solar_w = self.solar_output(in_eclipse, sun_angle_deg)
        load_w = self.total_load()
        net_w = solar_w - load_w

        dt_h = dt_seconds / 3600.0
        soc = self.state.battery_soc_wh

        if net_w > 0:
            # Charging
            charge_wh = net_w * dt_h * BATTERY_CHARGE_EFFICIENCY
            soc = min(soc + charge_wh, self.config.battery_capacity_wh)
        else:
            # Discharging
            discharge_wh = abs(net_w) * dt_h / BATTERY_DISCHARGE_EFFICIENCY
            soc = max(soc - discharge_wh, 0.0)

        soc_pct = (soc / self.config.battery_capacity_wh) * 100.0
        low_power = soc_pct < 30.0
        power_critical = soc_pct < self.config.min_soc_fraction * 100.0

        self.state = PowerState(
            solar_output_w=solar_w,
            total_load_w=load_w,
            net_power_w=net_w,
            battery_soc_wh=soc,
            battery_soc_pct=soc_pct,
            in_eclipse=in_eclipse,
            low_power_warning=low_power,
            power_critical=power_critical,
        )
        return self.state

    def shed_load(self, load_name: str) -> bool:
        """Deactivate a load by name. Returns True if found and deactivated."""
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

    def auto_shed_lowest_priority(self) -> str | None:
        """Shed the lowest-priority active load. Returns name or None."""
        active = [l for l in self.loads if l.active and l.priority > 1]
        if not active:
            return None
        target = max(active, key=lambda l: l.priority)
        target.active = False
        return target.name

