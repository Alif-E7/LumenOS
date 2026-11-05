"""
Space & Planetary Environment Model — Solar, Thermal, Atmospheric & Radiation Physics.

Models:
- Solar radiation flux (NASA 1361 W/m² baseline, modulated by Earth shadow and seasonal distance).
- Earth planetary emissions: Earth IR (237 W/m²) and diffuse solar albedo (30%).
- South Atlantic Anomaly (SAA) and Polar Auroral radiation belts.
- Upper atmospheric density & aerodynamic drag (exponential scale height model for LEO).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

# ── REFERENCE Constants ──────────────────────────────────────────────────────

SOLAR_CONSTANT_W_M2 = 1361.0      # W/m² — NASA solar constant at 1 AU
EARTH_IR_W_M2 = 237.0             # W/m² — Earth average infrared emission
EARTH_ALBEDO = 0.30               # —    — Earth average planetary albedo
R_EARTH_KM = 6371.0

# Upper atmosphere reference parameters (US Standard Atmosphere / Jacchia-Roberts approximation)
# Reference level h0 = 400 km: rho0 = 2.8e-12 kg/m³, scale height H = 58.2 km
ATMOS_H0_KM = 400.0
ATMOS_RHO0_KG_M3 = 2.8e-12
ATMOS_SCALE_HEIGHT_KM = 58.2


@dataclass
class EnvironmentConfig:
    """Configuration for environmental modeling."""
    solar_constant_w_m2: float = SOLAR_CONSTANT_W_M2
    earth_ir_w_m2: float = EARTH_IR_W_M2
    albedo: float = EARTH_ALBEDO
    drag_coefficient_cd: float = 2.2      # Standard spacecraft drag coefficient
    cross_sectional_area_m2: float = 4.0  # Projected area for drag
    solar_storm_active: bool = False      # Planetary Kp index elevated


@dataclass
class EnvironmentState:
    """Environmental parameters evaluated at the spacecraft's current position and time."""
    solar_flux_w_m2: float = 1361.0
    earth_ir_w_m2: float = 237.0
    albedo_flux_w_m2: float = 0.0
    radiation_level: str = "NOMINAL"       # NOMINAL | ELEVATED_SAA | AURORAL_STORM
    radiation_flux_multiplier: float = 1.0 # Multiplier over deep-space GCR background
    atmospheric_density_kg_m3: float = 0.0
    drag_force_n: float = 0.0
    in_saa: bool = False
    in_auroral_zone: bool = False


class SpaceEnvironmentModel:
    """
    Deterministic environmental conditions evaluator.
    Computes local solar flux, planetary infrared, albedo, SAA radiation, and aerodynamic drag.
    """
    def __init__(self, config: Optional[EnvironmentConfig] = None):
        self.config = config or EnvironmentConfig()

    def atmospheric_density(self, altitude_km: float) -> float:
        """
        Compute atmospheric density rho in kg/m³ using exponential scale-height model.
        Applicable for 160 km <= h <= 1000 km.
        """
        if altitude_km > 1000.0:
            return 0.0
        if altitude_km < 120.0:
            altitude_km = 120.0

        # Scale height model: rho(h) = rho0 * exp(-(h - h0) / H)
        dh = altitude_km - ATMOS_H0_KM
        rho = ATMOS_RHO0_KG_M3 * math.exp(-dh / ATMOS_SCALE_HEIGHT_KM)
        return max(0.0, rho)

    def aerodynamic_drag(self, altitude_km: float, velocity_km_s: float) -> float:
        """Compute aerodynamic drag force F_drag = 0.5 * rho * v^2 * Cd * A in Newtons."""
        rho = self.atmospheric_density(altitude_km)
        v_m_s = velocity_km_s * 1e3
        drag_n = 0.5 * rho * (v_m_s**2) * self.config.drag_coefficient_cd * self.config.cross_sectional_area_m2
        return drag_n

    def evaluate(
        self,
        altitude_km: float,
        latitude_deg: float,
        longitude_deg: float,
        velocity_km_s: float,
        sunlight_fraction: float,
    ) -> EnvironmentState:
        """
        Evaluate complete environmental state for the given position, velocity, and sunlight exposure.
        """
        # 1. Solar flux
        solar_flux = self.config.solar_constant_w_m2 * sunlight_fraction

        # 2. Earth IR (continuous thermal emission from below)
        earth_ir = self.config.earth_ir_w_m2

        # 3. Albedo: only present when satellite is above dayside Earth
        # Simple view factor: F_view = 0.5 * (1 - sqrt(h*(h+2*R)) / (h+R))
        r = R_EARTH_KM + altitude_km
        view_factor = 0.5 * (1.0 - math.sqrt(max(0.0, altitude_km * (altitude_km + 2.0 * R_EARTH_KM))) / r)
        albedo_flux = self.config.solar_constant_w_m2 * self.config.albedo * view_factor * sunlight_fraction

        # 4. Radiation Environment (SAA & Auroral)
        # South Atlantic Anomaly: -50 <= lat <= 0, -90 <= lon <= 0
        in_saa = (-50.0 <= latitude_deg <= 0.0) and (-90.0 <= longitude_deg <= 0.0)

        # Auroral Zone: |lat| >= 65 deg
        in_auroral = abs(latitude_deg) >= 65.0

        if in_saa:
            radiation_level = "ELEVATED_SAA"
            rad_mult = 25.0
        elif in_auroral and self.config.solar_storm_active:
            radiation_level = "AURORAL_STORM"
            rad_mult = 15.0
        elif in_auroral:
            radiation_level = "AURORAL_ZONE"
            rad_mult = 3.0
        else:
            radiation_level = "NOMINAL"
            rad_mult = 1.0

        # 5. Atmospheric Density and Drag
        density = self.atmospheric_density(altitude_km)
        drag_n = self.aerodynamic_drag(altitude_km, velocity_km_s)

        return EnvironmentState(
            solar_flux_w_m2=round(solar_flux, 1),
            earth_ir_w_m2=round(earth_ir, 1),
            albedo_flux_w_m2=round(albedo_flux, 1),
            radiation_level=radiation_level,
            radiation_flux_multiplier=rad_mult,
            atmospheric_density_kg_m3=density,
            drag_force_n=round(drag_n, 6),
            in_saa=in_saa,
            in_auroral_zone=in_auroral,
        )

