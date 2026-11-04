"""
Orbital Mechanics Model — Keplerian propagation and ground-track computation.

Uses standard Keplerian two-body propagation (REFERENCE: NASA Orbital Mechanics
textbook values). Mean anomaly → eccentric anomaly → true anomaly pipeline.

Constants are REFERENCE data from NASA/IAU:
- μ_Earth = 3.986004418 × 10¹⁴ m³/s²
- R_Earth = 6371.0 km
- J₂ = 1.08263 × 10⁻³ (for RAAN/argument drift)
- Earth angular velocity = 7.2921159 × 10⁻⁵ rad/s
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

# ── REFERENCE constants (NASA/IAU published values) ──────────────────────────

MU_EARTH = 3.986004418e14      # m³/s²  — Earth gravitational parameter
R_EARTH_KM = 6371.0            # km     — Mean Earth radius
R_EARTH_M = R_EARTH_KM * 1e3  # m
J2 = 1.08263e-3                # —      — Earth oblateness coefficient
EARTH_OMEGA = 7.2921159e-5     # rad/s  — Earth rotation rate


@dataclass
class OrbitalElements:
    """Keplerian orbital elements."""
    semi_major_axis_km: float       # a
    eccentricity: float = 0.001     # e (near-circular)
    inclination_deg: float = 98.0   # i
    raan_deg: float = 0.0           # Ω — right ascension of ascending node
    arg_periapsis_deg: float = 0.0  # ω — argument of periapsis
    mean_anomaly_deg: float = 0.0   # M — mean anomaly
    epoch_seconds: float = 0.0      # t₀ — epoch time


@dataclass
class OrbitalState:
    """Computed orbital state at a given time."""
    elements: OrbitalElements
    true_anomaly_deg: float = 0.0
    altitude_km: float = 0.0
    latitude_deg: float = 0.0
    longitude_deg: float = 0.0
    velocity_km_s: float = 0.0
    orbital_period_s: float = 0.0
    in_eclipse: bool = False


@dataclass
class OrbitalModel:
    """
    Keplerian orbital propagator with J₂ perturbation for RAAN and ω drift.
    
    Deterministic — no random component. Given the same elements and time,
    always produces the same result.
    """
    elements: OrbitalElements = field(default_factory=OrbitalElements)

    def orbital_period(self) -> float:
        """Orbital period in seconds (Kepler's third law)."""
        a_m = self.elements.semi_major_axis_km * 1e3
        return 2 * math.pi * math.sqrt(a_m**3 / MU_EARTH)

    def mean_motion(self) -> float:
        """Mean motion n in rad/s."""
        a_m = self.elements.semi_major_axis_km * 1e3
        return math.sqrt(MU_EARTH / a_m**3)

    def _solve_kepler(self, M_rad: float, e: float, tol: float = 1e-10) -> float:
        """Solve Kepler's equation M = E - e·sin(E) via Newton-Raphson."""
        E = M_rad  # initial guess
        for _ in range(50):
            dE = (E - e * math.sin(E) - M_rad) / (1 - e * math.cos(E))
            E -= dE
            if abs(dE) < tol:
                break
        return E

    def _eccentric_to_true(self, E_rad: float, e: float) -> float:
        """Convert eccentric anomaly to true anomaly."""
        nu = 2 * math.atan2(
            math.sqrt(1 + e) * math.sin(E_rad / 2),
            math.sqrt(1 - e) * math.cos(E_rad / 2),
        )
        return nu

    def _j2_raan_drift(self, dt_s: float) -> float:
        """J₂ secular RAAN drift in degrees."""
        a_m = self.elements.semi_major_axis_km * 1e3
        e = self.elements.eccentricity
        i_rad = math.radians(self.elements.inclination_deg)
        n = self.mean_motion()
        p = a_m * (1 - e**2)
        dOmega_dt = -1.5 * n * J2 * (R_EARTH_M / p)**2 * math.cos(i_rad)
        return math.degrees(dOmega_dt * dt_s)

    def _j2_argp_drift(self, dt_s: float) -> float:
        """J₂ secular argument of periapsis drift in degrees."""
        a_m = self.elements.semi_major_axis_km * 1e3
        e = self.elements.eccentricity
        i_rad = math.radians(self.elements.inclination_deg)
        n = self.mean_motion()
        p = a_m * (1 - e**2)
        domega_dt = 1.5 * n * J2 * (R_EARTH_M / p)**2 * (2 - 2.5 * math.sin(i_rad)**2)
        return math.degrees(domega_dt * dt_s)

    def propagate(self, elapsed_seconds: float) -> OrbitalState:
        """
        Propagate orbit to time t = epoch + elapsed_seconds.
        
        Returns complete orbital state including sub-satellite point.
        """
        dt = elapsed_seconds - self.elements.epoch_seconds
        n = self.mean_motion()
        T = self.orbital_period()

        # Mean anomaly at time t
        M_rad = math.radians(self.elements.mean_anomaly_deg) + n * dt
        M_rad = M_rad % (2 * math.pi)

        # Solve Kepler's equation
        e = self.elements.eccentricity
        E_rad = self._solve_kepler(M_rad, e)

        # True anomaly
        nu_rad = self._eccentric_to_true(E_rad, e)
        nu_deg = math.degrees(nu_rad) % 360

        # Radius
        a_m = self.elements.semi_major_axis_km * 1e3
        r_m = a_m * (1 - e * math.cos(E_rad))
        altitude_km = (r_m / 1e3) - R_EARTH_KM

        # Velocity (vis-viva)
        v_m_s = math.sqrt(MU_EARTH * (2 / r_m - 1 / a_m))
        v_km_s = v_m_s / 1e3

        # J₂ perturbations
        raan = self.elements.raan_deg + self._j2_raan_drift(dt)
        argp = self.elements.arg_periapsis_deg + self._j2_argp_drift(dt)

        # Sub-satellite point (latitude, longitude)
        u_rad = math.radians(argp) + nu_rad  # argument of latitude
        i_rad = math.radians(self.elements.inclination_deg)
        lat_rad = math.asin(math.sin(i_rad) * math.sin(u_rad))
        lat_deg = math.degrees(lat_rad)

        # Longitude: RAAN + atan2 projection - Earth rotation
        lon_rad = math.atan2(
            math.cos(i_rad) * math.sin(u_rad),
            math.cos(u_rad),
        ) + math.radians(raan) - EARTH_OMEGA * elapsed_seconds
        lon_deg = math.degrees(lon_rad) % 360
        if lon_deg > 180:
            lon_deg -= 360

        # Eclipse check (simple cylindrical shadow)
        sun_angle = (elapsed_seconds / 86400 * 360) % 360  # approximate sun position
        angle_diff = abs(((lon_deg - sun_angle + 180) % 360) - 180)
        in_eclipse = angle_diff > 90 and abs(lat_deg) < 70

        updated_elements = OrbitalElements(
            semi_major_axis_km=self.elements.semi_major_axis_km,
            eccentricity=e,
            inclination_deg=self.elements.inclination_deg,
            raan_deg=raan % 360,
            arg_periapsis_deg=argp % 360,
            mean_anomaly_deg=math.degrees(M_rad),
            epoch_seconds=self.elements.epoch_seconds,
        )

        return OrbitalState(
            elements=updated_elements,
            true_anomaly_deg=nu_deg,
            altitude_km=altitude_km,
            latitude_deg=lat_deg,
            longitude_deg=lon_deg,
            velocity_km_s=v_km_s,
            orbital_period_s=T,
            in_eclipse=in_eclipse,
        )

