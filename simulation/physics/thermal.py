"""
Thermal Subsystem Model — Lumped Capacitance Spacecraft Heat Balance.

LUMPED THERMAL APPROXIMATION:
This model employs a single-node lumped thermal capacitance approximation:
    C_thermal * (dT/dt) = Q_in - Q_out
where:
    C_thermal = m * c_p  (Effective heat capacity in J/K, e.g. aluminum structure)
    Q_in = Q_solar + Q_albedo + Q_earth_ir + Q_internal + Q_heater
    Q_out = Q_radiator = epsilon_rad * sigma * A_rad * (T^4 - T_space^4)

This approximation assumes uniform spacecraft internal thermal conduction on orbital
timescales, providing scientifically grounded temperature trajectories suitable for
educational simulation and trade studies.

REFERENCE constants:
- Stefan-Boltzmann constant sigma = 5.670374419e-8 W/(m²·K⁴)
- Deep space cosmic microwave background sink temperature T_space = 2.725 K (~3 K)
- Solar constant S0 = 1361.0 W/m² (NASA published average)
- Earth average bond albedo = 0.30
- Earth average outgoing longwave infrared emission = 237.0 W/m²
- Mean Earth radius R_Earth = 6371.0 km
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

# ── Reference Physical Constants ─────────────────────────────────────────────

STEFAN_BOLTZMANN = 5.670374419e-8    # W/(m²·K⁴)
SPACE_TEMP_K = 2.725                 # Deep space radiation sink temperature (~3 K)
SOLAR_CONSTANT_W_M2 = 1361.0         # Solar constant at 1 AU
EARTH_ALBEDO = 0.30                  # Earth mean diffuse reflectivity
EARTH_IR_W_M2 = 237.0                # Earth outgoing longwave thermal flux
R_EARTH_KM = 6371.0                  # Mean Earth radius


@dataclass
class ThermalConfig:
    """Spacecraft thermal subsystem configuration."""
    radiator_area_m2: float = 2.0
    radiator_emissivity: float = 0.85        # Typical optical solar reflector / white paint
    absorptivity: float = 0.25               # Solar absorptivity (alpha)
    spacecraft_area_m2: float = 4.0          # Projected cross-sectional area
    thermal_mass_j_per_k: float = 50000.0    # Lumped heat capacity C = m * c_p (J/K)
    heater_power_w: float = 30.0             # Available survival heater electrical draw
    heater_setpoint_c: float = 5.0           # Turn ON below this setpoint, OFF at setpoint + 3°C
    safe_temp_min_k: float = 263.15          # Safe lower limit: -10°C
    safe_temp_max_k: float = 323.15          # Safe upper limit: +50°C
    critical_temp_min_k: float = 248.15      # Critical lower survival boundary: -25°C
    critical_temp_max_k: float = 338.15      # Critical upper survival boundary: +65°C


@dataclass
class ThermalState:
    """Thermal subsystem state at a discrete simulation step."""
    temperature_k: float = 293.15            # Temperature in Kelvin (start at 20°C)
    temperature_c: float = 20.0              # Temperature in Celsius
    heat_input_w: float = 0.0                # Total Q_in
    heat_rejected_w: float = 0.0             # Total Q_out
    internal_dissipation_w: float = 0.0      # Waste heat from bus electronics and payload
    solar_absorbed_w: float = 0.0            # Direct solar radiation absorbed
    albedo_absorbed_w: float = 0.0           # Earth-reflected sunlight absorbed
    earth_ir_absorbed_w: float = 0.0         # Earth infrared radiation absorbed
    heater_heat_w: float = 0.0               # Active heater thermal contribution
    net_heat_w: float = 0.0                  # Q_in - Q_out
    heater_active: bool = False              # Whether survival heater is currently firing
    overtemp_warning: bool = False           # T > +50°C
    undertemp_warning: bool = False          # T < -10°C
    thermal_critical: bool = False           # T outside [-25°C, +65°C]
    model_type: str = "Lumped thermal approximation: C * (dT/dt) = Q_in - Q_out"


@dataclass
class ThermalModel:
    """
    Lumped Capacitance Thermal Model.

    Deterministic — temperature evolution depends strictly on configuration,
    environmental thermal flux (solar, albedo, Earth IR), internal dissipation,
    and radiator radiation to deep space.
    """
    config: ThermalConfig = field(default_factory=ThermalConfig)
    state: ThermalState = field(default_factory=ThermalState)

    def _solar_heat(
        self,
        in_eclipse: bool,
        sunlight_fraction: float = 1.0,
        solar_irradiance: float = SOLAR_CONSTANT_W_M2,
    ) -> float:
        """Calculate direct solar thermal energy absorbed by spacecraft body."""
        if in_eclipse or sunlight_fraction <= 0.0:
            return 0.0
        # Projected area factor 0.25 represents spherical / averaged polyhedron geometry
        return (
            solar_irradiance
            * sunlight_fraction
            * self.config.absorptivity
            * self.config.spacecraft_area_m2
            * 0.25
        )

    def _albedo_heat(
        self,
        in_eclipse: bool,
        altitude_km: float,
        sunlight_fraction: float = 1.0,
        solar_irradiance: float = SOLAR_CONSTANT_W_M2,
    ) -> float:
        """Calculate Earth-reflected solar thermal radiation absorbed."""
        if in_eclipse or sunlight_fraction <= 0.0:
            return 0.0
        # Earth view factor decreases with altitude squared
        r_ratio = R_EARTH_KM / (R_EARTH_KM + max(0.0, altitude_km))
        view_factor = r_ratio * r_ratio
        return (
            solar_irradiance
            * sunlight_fraction
            * EARTH_ALBEDO
            * self.config.absorptivity
            * self.config.spacecraft_area_m2
            * view_factor
            * 0.25
        )

    def _earth_ir_heat(self, altitude_km: float) -> float:
        """Calculate planetary infrared thermal radiation absorbed from Earth."""
        r_ratio = R_EARTH_KM / (R_EARTH_KM + max(0.0, altitude_km))
        view_factor = r_ratio * r_ratio
        # Earth IR impinges primarily on Earth-facing hemisphere (0.5 projection)
        return (
            EARTH_IR_W_M2
            * self.config.radiator_emissivity
            * self.config.spacecraft_area_m2
            * view_factor
            * 0.5
        )

    def _radiator_rejection(self, temp_k: float) -> float:
        """Calculate heat radiated into deep space via Stefan-Boltzmann law."""
        t_clamped = max(SPACE_TEMP_K, temp_k)
        return (
            STEFAN_BOLTZMANN
            * self.config.radiator_emissivity
            * self.config.radiator_area_m2
            * (t_clamped**4 - SPACE_TEMP_K**4)
        )

    def step(
        self,
        dt_seconds: float,
        in_eclipse: bool,
        altitude_km: float,
        internal_power_w: float,
        sunlight_fraction: float = 1.0,
        solar_irradiance: float = SOLAR_CONSTANT_W_M2,
    ) -> ThermalState:
        """
        Advance thermal state by dt_seconds using lumped thermal integration.

        Args:
            dt_seconds: Timestep duration in seconds.
            in_eclipse: Boolean eclipse indicator.
            altitude_km: Orbital altitude in km for Earth view factors.
            internal_power_w: Internal waste heat from electrical loads.
            sunlight_fraction: Illumination fraction (0.0 to 1.0).
            solar_irradiance: Incident solar constant in W/m².
        """
        T = self.state.temperature_k
        t_c = T - 273.15

        # 1. External environmental heat inputs
        q_solar = self._solar_heat(in_eclipse, sunlight_fraction, solar_irradiance)
        q_albedo = self._albedo_heat(in_eclipse, altitude_km, sunlight_fraction, solar_irradiance)
        q_earth_ir = self._earth_ir_heat(altitude_km)
        q_internal = max(0.0, internal_power_w)

        # 2. Thermostatic heater controller with 3°C hysteresis
        # Turns ON when temperature drops below heater_setpoint_c
        # Turns OFF when temperature rises above heater_setpoint_c + 3.0°C
        if self.state.heater_active:
            heater_active = t_c < (self.config.heater_setpoint_c + 3.0)
        else:
            heater_active = t_c < self.config.heater_setpoint_c

        q_heater = self.config.heater_power_w if heater_active else 0.0

        # 3. Net thermal energy balance
        q_in = q_solar + q_albedo + q_earth_ir + q_internal + q_heater
        q_out = self._radiator_rejection(T)
        q_net = q_in - q_out

        # 4. Integrate temperature change: dT = (Q_net * dt) / C_thermal
        dT = (q_net * dt_seconds) / max(100.0, self.config.thermal_mass_j_per_k)
        T_new = max(SPACE_TEMP_K + 1.0, T + dT)
        T_new_c = T_new - 273.15

        # 5. Boundary & safety limits
        overtemp = T_new > self.config.safe_temp_max_k
        undertemp = T_new < self.config.safe_temp_min_k
        critical = (T_new > self.config.critical_temp_max_k) or (T_new < self.config.critical_temp_min_k)

        self.state = ThermalState(
            temperature_k=T_new,
            temperature_c=T_new_c,
            heat_input_w=q_in,
            heat_rejected_w=q_out,
            internal_dissipation_w=q_internal,
            solar_absorbed_w=q_solar,
            albedo_absorbed_w=q_albedo,
            earth_ir_absorbed_w=q_earth_ir,
            heater_heat_w=q_heater,
            net_heat_w=q_net,
            heater_active=heater_active,
            overtemp_warning=overtemp,
            undertemp_warning=undertemp,
            thermal_critical=critical,
        )
        return self.state
