"""
Radiation and Space Debris Subsystem Model — Environmental Impact and Physical Accounting.

SIMPLIFIED EDUCATIONAL ABSTRACTION DISCLAIMER:
The models in this module represent simplified educational abstractions designed
for gameplay and aerospace systems education. They are NOT flight-grade collision
predictions, space traffic management forecasts, or radiation transport codes.

Models:
1. Space Radiation Environment & Component Sensitivity:
   - Cosmic ray background, South Atlantic Anomaly (SAA) trapped proton flux,
     and polar auroral electron horn crossings.
   - Cumulative Total Ionizing Dose (TID in rad) accumulated over exposure time.
   - Single Event Upset (SEU) hazard rate influenced by component radiation tolerance:
     * COTS (Commercial Off-The-Shelf): TID tolerance ~5 krad, higher SEU sensitivity
     * Rad-Tolerant: TID tolerance ~20 krad, moderate SEU sensitivity
     * Rad-Hard: TID tolerance ~100 krad, triple-modular redundancy protection

2. Space Debris Collision Risk:
   - DEBRIS RISK IS NOT BASED ONLY ON TOTAL SPACECRAFT SURFACE AREA.
   - Models physical orbital density mechanics:
     * Altitude shell spatial flux: Peak collision density at 750–900 km (historic breakups
       such as Cosmos-Iridium and Fengyun-1C), moderate density at 500–700 km, and low
       density below 450 km where upper atmospheric drag actively de-orbits fragments.
     * Orbital inclination crossing factor: Polar and SSO orbits (i ~ 80°–100°) cross through
       converging orbital shells with higher relative velocity and collision probability
       compared to low-inclination equatorial orbits (i < 30°).
     * Structural bumper & shielding factor: Whipple shielding reduces penetration vulnerability.
     * Spacecraft cross-sectional area and cumulative in-orbit exposure time.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum


class RadiationHardness(str, Enum):
    """Component radiation tolerance grade."""
    COTS = "COTS"                   # Commercial off-the-shelf: 5 krad TID limit
    RAD_TOLERANT = "RAD_TOLERANT"   # Space-grade screening / shielding: 20 krad TID limit
    RAD_HARD = "RAD_HARD"           # Radiation-hardened by design (RHBD): 100 krad limit


@dataclass
class RadiationDebrisConfig:
    """Configuration for radiation and space debris environmental accounting."""
    radiation_hardness: RadiationHardness = RadiationHardness.RAD_TOLERANT
    spacecraft_cross_section_m2: float = 3.5      # Physical collision cross section
    has_whipple_shield: bool = False             # Structural Whipple bumper debris shield
    tid_limit_rad: float = 20000.0               # 20 krad for RAD_TOLERANT


@dataclass
class RadiationDebrisState:
    """State of environmental radiation dose and debris risk at a simulation step."""
    in_saa_zone: bool = False
    in_auroral_horn: bool = False
    instantaneous_dose_rate_rad_per_hour: float = 0.005
    total_ionizing_dose_rad: float = 0.0
    tid_pct_of_limit: float = 0.0
    seu_rate_per_day: float = 0.01
    radiation_warning: bool = False
    debris_spatial_density_per_km3: float = 1e-8
    debris_collision_risk_index: float = 0.0     # Educational 0-100 scale
    educational_disclaimer: str = (
        "Simplified educational abstraction, not collision or flight-safety prediction"
    )


@dataclass
class RadiationDebrisModel:
    """
    Radiation and Space Debris Physical Accounting Model.
    """
    config: RadiationDebrisConfig = field(default_factory=RadiationDebrisConfig)
    state: RadiationDebrisState = field(default_factory=RadiationDebrisState)

    def __post_init__(self):
        if self.config.radiation_hardness == RadiationHardness.COTS:
            self.config.tid_limit_rad = 5000.0
        elif self.config.radiation_hardness == RadiationHardness.RAD_HARD:
            self.config.tid_limit_rad = 100000.0
        else:
            self.config.tid_limit_rad = 20000.0

    def _altitude_debris_flux(self, altitude_km: float) -> float:
        """
        Return debris spatial flux (impacts per m² per year) based on altitude shell.
        Models atmospheric drag clearance below 450 km and peak debris shells at 750-900 km.
        """
        if altitude_km < 400.0:
            # Low density: rapid atmospheric cleansing
            return 1.0e-5
        elif altitude_km < 650.0:
            # Moderate density: ISS and low LEO constellation altitude
            return 5.0e-5
        elif altitude_km <= 900.0:
            # Peak density: SSO satellite shells and historical fragmentation debris
            # Gaussian peak around 800 km
            return 3.5e-4
        elif altitude_km <= 1400.0:
            return 1.2e-4
        else:
            return 3.0e-5

    def _inclination_factor(self, inclination_deg: float) -> float:
        """
        Debris crossing velocity and spatial intersection multiplier.
        Polar / retrograde SSO orbits cross orbital planes orthogonally,
        experiencing significantly higher encounter rates than equatorial orbits.
        """
        inc = abs(inclination_deg)
        if inc > 90.0:
            inc = 180.0 - inc

        if inc >= 75.0:
            return 1.8  # Polar / SSO high-flux crossing shell
        elif inc >= 45.0:
            return 1.2  # Mid-inclination orbit
        else:
            return 0.6  # Low-inclination / equatorial orbit (co-planar drift)

    def step(
        self,
        dt_seconds: float,
        altitude_km: float,
        latitude_deg: float,
        longitude_deg: float,
        inclination_deg: float = 98.0,
        in_saa_zone: bool = False,
        in_auroral_horn: bool = False,
    ) -> RadiationDebrisState:
        """
        Advance radiation accumulation and debris encounter index by dt_seconds.
        """
        dt_hours = dt_seconds / 3600.0

        # 1. Radiation dose rate evaluation (rad/hour)
        # Background GCR (Galactic Cosmic Rays) in LEO ~0.005 rad/hour
        dose_rate = 0.005

        if in_saa_zone:
            # SAA trapped proton flux adds ~0.25 rad/hour
            dose_rate += 0.25

        if in_auroral_horn:
            # Auroral precipitating electron flux adds ~0.05 rad/hour
            dose_rate += 0.05

        # Component shielding sensitivity scaling
        if self.config.radiation_hardness == RadiationHardness.COTS:
            effective_dose_rate = dose_rate * 1.5
            seu_base = 0.08
        elif self.config.radiation_hardness == RadiationHardness.RAD_HARD:
            effective_dose_rate = dose_rate * 0.5
            seu_base = 0.002
        else:  # RAD_TOLERANT
            effective_dose_rate = dose_rate * 1.0
            seu_base = 0.015

        dose_increment = effective_dose_rate * dt_hours
        self.state.total_ionizing_dose_rad += dose_increment
        tid_pct = (self.state.total_ionizing_dose_rad / max(1.0, self.config.tid_limit_rad)) * 100.0

        # Single Event Upset rate scales with instantaneous flux
        seu_flux_multiplier = 5.0 if in_saa_zone else (2.0 if in_auroral_horn else 1.0)
        seu_rate = seu_base * seu_flux_multiplier

        # 2. Debris risk modeling
        # NOT based only on total spacecraft surface area:
        # Incorporates altitude shell flux, inclination crossing multiplier,
        # cross-sectional area, and Whipple bumper shielding factor.
        shell_flux = self._altitude_debris_flux(altitude_km)
        inc_factor = self._inclination_factor(inclination_deg)
        shield_factor = 0.25 if self.config.has_whipple_shield else 1.0

        annual_impact_prob = (
            shell_flux
            * inc_factor
            * self.config.spacecraft_cross_section_m2
            * shield_factor
        )

        # Scale into an educational 0 to 100 collision risk index
        # A baseline 1m² unshielded craft in 800km SSO has risk index ~25
        risk_index = min(100.0, annual_impact_prob * 100000.0)

        # Spatial density in particles / km³
        spatial_density = shell_flux / (7.5 * 365.25 * 86400.0)  # ~particles/km³

        self.state = RadiationDebrisState(
            in_saa_zone=in_saa_zone,
            in_auroral_horn=in_auroral_horn,
            instantaneous_dose_rate_rad_per_hour=effective_dose_rate,
            total_ionizing_dose_rad=self.state.total_ionizing_dose_rad,
            tid_pct_of_limit=min(100.0, tid_pct),
            seu_rate_per_day=seu_rate,
            radiation_warning=tid_pct > 80.0 or in_saa_zone,
            debris_spatial_density_per_km3=spatial_density,
            debris_collision_risk_index=risk_index,
        )
        return self.state
