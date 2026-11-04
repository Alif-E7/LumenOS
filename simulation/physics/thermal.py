"""
Thermal Subsystem Model — Spacecraft heat balance simulation.

Models heat inputs (solar, albedo, Earth IR, internal dissipation) and
heat rejection (radiator radiation to space) to compute spacecraft
temperature over time.

REFERENCE constants:
- Stefan-Boltzmann constant σ = 5.670374419 × 10⁻⁸ W/(m²·K⁴)
- Space sink temperature ≈ 3 K (cosmic microwave background)
- Earth albedo ≈ 0.3 (NASA)
- Earth IR emission ≈ 237 W/m² (NASA)
"""

from __future__ import annotations

from dataclasses import dataclass, field

# ── REFERENCE constants ─────────────────────────────────────────────────────

STEFAN_BOLTZMANN = 5.670374419e-8    # W/(m²·K⁴)
SPACE_TEMP_K = 3.0                    # Cosmic background
SOLAR_CONSTANT_W_M2 = 1361.0         # NASA published
EARTH_ALBEDO = 0.3                    # NASA average
EARTH_IR_W_M2 = 237.0                # NASA average


@dataclass
class ThermalConfig:
    """Spacecraft thermal subsystem configuration."""
    radiator_area_m2: float = 2.0
    radiator_emissivity: float = 0.85        # Typical white paint / OSR
    absorptivity: float = 0.25               # Solar absorptivity
    spacecraft_area_m2: float = 4.0          # Exposed surface area
    thermal_mass_j_per_k: float = 50000.0    # Effective thermal mass (J/K)
    heater_power_w: float = 20.0             # Available heater power
    safe_temp_min_k: float = 263.15          # -10°C
    safe_temp_max_k: float = 323.15          # +50°C


@dataclass
class ThermalState:
    """Thermal subsystem state."""
    temperature_k: float = 293.15        # Start at 20°C
    temperature_c: float = 20.0
    heat_input_w: float = 0.0
    heat_rejected_w: float = 0.0
    internal_dissipation_w: float = 0.0
    net_heat_w: float = 0.0
    heater_active: bool = False
    overtemp_warning: bool = False
    undertemp_warning: bool = False


@dataclass
class ThermalModel:
    """
    Single-node thermal model for spacecraft temperature.
    
    Deterministic — temperature evolution depends only on config,
    environmental inputs, and internal power dissipation.
    """
    config: ThermalConfig = field(default_factory=ThermalConfig)
    state: ThermalState = field(default_factory=ThermalState)

    def _solar_heat(self, in_eclipse: bool) -> float:
        """Direct solar heat absorbed."""
        if in_eclipse:
            return 0.0
        return (
            SOLAR_CONSTANT_W_M2
            * self.config.absorptivity
            * self.config.spacecraft_area_m2
            * 0.25  # average projection factor
        )

    def _albedo_heat(self, in_eclipse: bool, altitude_km: float) -> float:
        """Earth albedo reflected solar heat."""
        if in_eclipse:
            return 0.0
        # View factor decreases with altitude
        view_factor = (6371.0 / (6371.0 + altitude_km)) ** 2
        return (
            SOLAR_CONSTANT_W_M2
            * EARTH_ALBEDO
            * self.config.absorptivity
            * self.config.spacecraft_area_m2
            * view_factor
            * 0.25
        )

    def _earth_ir_heat(self, altitude_km: float) -> float:
        """Earth infrared heat input."""
        view_factor = (6371.0 / (6371.0 + altitude_km)) ** 2
        return (
            EARTH_IR_W_M2
            * self.config.radiator_emissivity
            * self.config.spacecraft_area_m2
            * view_factor
            * 0.5  # bottom hemisphere only
        )

    def _radiator_rejection(self, temp_k: float) -> float:
        """Heat rejected by radiators (Stefan-Boltzmann)."""
        return (
            STEFAN_BOLTZMANN
            * self.config.radiator_emissivity
            * self.config.radiator_area_m2
            * (temp_k**4 - SPACE_TEMP_K**4)
        )

    def step(
        self,
        dt_seconds: float,
        in_eclipse: bool,
        altitude_km: float,
        internal_power_w: float,
    ) -> ThermalState:
        """
        Advance thermal model by dt_seconds.
        
        Args:
            dt_seconds: Time step in seconds
            in_eclipse: Whether spacecraft is in eclipse
            altitude_km: Current orbital altitude
            internal_power_w: Internal power dissipation (waste heat from loads)
        """
        T = self.state.temperature_k

        q_solar = self._solar_heat(in_eclipse)
        q_albedo = self._albedo_heat(in_eclipse, altitude_km)
        q_earth_ir = self._earth_ir_heat(altitude_km)
        q_internal = internal_power_w

        # Heater control
        heater_active = T < self.config.safe_temp_min_k + 5  # 5K hysteresis
        q_heater = self.config.heater_power_w if heater_active else 0.0

        q_in = q_solar + q_albedo + q_earth_ir + q_internal + q_heater
        q_out = self._radiator_rejection(T)
        q_net = q_in - q_out

        # Temperature change: dT = Q_net * dt / C_thermal
        dT = q_net * dt_seconds / self.config.thermal_mass_j_per_k
        T_new = T + dT

        self.state = ThermalState(
            temperature_k=T_new,
            temperature_c=T_new - 273.15,
            heat_input_w=q_in,
            heat_rejected_w=q_out,
            internal_dissipation_w=q_internal,
            net_heat_w=q_net,
            heater_active=heater_active,
            overtemp_warning=T_new > self.config.safe_temp_max_k,
            undertemp_warning=T_new < self.config.safe_temp_min_k,
        )
        return self.state

