"""
Orbital Mechanics & Observation Geometry Model — Educational Keplerian Propagation.

Scientific Assumptions, Reference Frames, and Documented Equations:
- Reference Frames:
  * ECI (Earth-Centered Inertial / J2000 Equinox): Origin at Earth center. X-axis points
    toward vernal equinox, Z-axis points along Earth's rotation axis north, Y-axis completes
    right-handed system.
  * ECEF (Earth-Centered, Earth-Fixed): Rotates with Earth at angular rate omega_earth.
  * Geodetic Spherical Approximation: Mean spherical Earth radius R_Earth = 6371.0 km.
- Keplerian Two-Body Equations:
  * Kepler's 3rd Law: Orbital period T = 2 * pi * sqrt(a^3 / mu).
  * Vis-viva Equation: Orbital speed v = sqrt(mu * (2/r - 1/a)).
  * Kepler's Equation: M = E - e * sin(E), solved via Newton-Raphson iteration.
  * True Anomaly nu: tan(nu/2) = sqrt((1+e)/(1-e)) * tan(E/2).
  * Radius: r = a * (1 - e * cos(E)).
- J2 Gravitational Perturbation (Oblateness of Earth):
  * Secular nodal precession (RAAN drift): dOmega/dt = -1.5 * n * J2 * (R_Earth/p)^2 * cos(i).
  * Secular apsidal drift (argument of periapsis): domega/dt = 0.75 * n * J2 * (R_Earth/p)^2 * (5*cos(i)^2 - 1).
- Eclipse & Sunlight Geometry:
  * Conical and cylindrical shadow models behind Earth relative to solar illumination vector.
  * Sunlight fraction: 1.0 (full sunlight), 0.0 (full umbra eclipse), (0, 1) in penumbra transition.
- Earth Visibility & Nadir Access Swath:
  * Earth angular radius: rho = arcsin(R_Earth / r).
  * Horizon limit angle: lambda_horizon = arccos(R_Earth / r) = 90° - rho.
  * Sensor access cone half-angle: lambda_access = arcsin((r / R_Earth) * sin(theta_fov)) - theta_fov.
- Limitations:
  * Simplified educational two-body + J2 model. Does not include solar radiation pressure,
    higher-order gravity harmonics (J3, J4), third-body lunar/solar gravitational perturbations,
    or relativistic frame dragging. Not certified for operational spacecraft flight navigation.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

# ── REFERENCE Constants (NASA/IAU standard published values) ─────────────────

MU_EARTH = 3.986004418e14          # m³/s²  — Earth gravitational parameter (G*M)
R_EARTH_KM = 6371.0                # km     — Mean volumetric Earth radius
R_EARTH_M = R_EARTH_KM * 1e3       # m
J2 = 1.08263e-3                    # —      — Earth quadrupole oblateness coefficient
EARTH_OMEGA = 7.2921159e-5         # rad/s  — Earth rotation angular velocity (WGS-84)
ASTRONOMICAL_UNIT_KM = 149597870.7 # km     — Mean Sun-Earth distance (1 AU)
R_SUN_KM = 696340.0                # km     — Solar radius
EARTH_OBLIQUITY_DEG = 23.44        # deg    — Mean ecliptic tilt (axial tilt)
SPEED_OF_LIGHT_KM_S = 299792.458   # km/s


@dataclass
class OrbitalElements:
    """
    Keplerian orbital elements.
    Supported ranges:
    - a (semi-major axis): 6531.0 km (160 km alt) to 42164.0 km (GEO)
    - e (eccentricity): 0.0 <= e < 0.95 (circular to highly elliptical)
    - i (inclination): 0.0 <= i <= 180.0 deg (equatorial, polar, retrograde SSO)
    - raan (right ascension of ascending node): [0, 360) deg
    - arg_periapsis (argument of periapsis): [0, 360) deg
    - mean_anomaly: [0, 360) deg
    - epoch_seconds: simulation time epoch offset (seconds)
    """
    semi_major_axis_km: float
    eccentricity: float = 0.001
    inclination_deg: float = 98.0
    raan_deg: float = 0.0
    arg_periapsis_deg: float = 0.0
    mean_anomaly_deg: float = 0.0
    epoch_seconds: float = 0.0

    def __post_init__(self):
        if self.semi_major_axis_km <= R_EARTH_KM:
            raise ValueError(f"Semi-major axis ({self.semi_major_axis_km} km) must be > Earth radius ({R_EARTH_KM} km).")
        if not (0.0 <= self.eccentricity < 1.0):
            raise ValueError(f"Eccentricity ({self.eccentricity}) must be in [0.0, 1.0).")
        if not (0.0 <= self.inclination_deg <= 180.0):
            raise ValueError(f"Inclination ({self.inclination_deg} deg) must be in [0.0, 180.0].")


@dataclass
class OrbitalState:
    """Complete computed orbital and geometric state at simulation time t."""
    elements: OrbitalElements
    true_anomaly_deg: float = 0.0
    altitude_km: float = 0.0
    latitude_deg: float = 0.0
    longitude_deg: float = 0.0
    velocity_km_s: float = 0.0
    orbital_period_s: float = 0.0
    in_eclipse: bool = False
    sunlight_fraction: float = 1.0
    earth_angular_radius_deg: float = 0.0
    horizon_angle_deg: float = 0.0
    in_saa: bool = False
    position_eci_km: tuple[float, float, float] = (0.0, 0.0, 0.0)
    velocity_eci_km_s: tuple[float, float, float] = (0.0, 0.0, 0.0)


@dataclass
class GroundTarget:
    """A ground observation target on Earth's surface."""
    target_id: str
    name: str
    latitude_deg: float
    longitude_deg: float
    target_type: str = "observation_zone"
    priority: int = 1


@dataclass
class ObservationWindow:
    """Time window during which a ground target is within sensor observation swath."""
    target_id: str
    target_name: str
    start_seconds: float
    end_seconds: float
    duration_seconds: float
    tca_seconds: float
    min_off_nadir_deg: float
    max_elevation_deg: float


@dataclass
class ContactWindow:
    """Time window during which spacecraft is visible above a ground station's elevation mask."""
    station_name: str
    aos_seconds: float
    tca_seconds: float
    los_seconds: float
    duration_seconds: float
    max_elevation_deg: float
    min_slant_range_km: float


@dataclass
class EclipseWindow:
    """Eclipse entry (sunset) to exit (sunrise) interval."""
    ingress_seconds: float
    egress_seconds: float
    duration_seconds: float
    is_umbra: bool = True


@dataclass
class OrbitalModel:
    """
    Deterministic Keplerian Propagator with J2 Oblateness & Observation Geometry.

    Guarantees bit-exact repeatability given identical initial elements and elapsed seconds.
    """
    elements: OrbitalElements = field(default_factory=lambda: OrbitalElements(semi_major_axis_km=R_EARTH_KM + 650.0))

    def orbital_period(self) -> float:
        """Kepler's third law: Orbital period in seconds T = 2*pi*sqrt(a^3 / mu)."""
        a_m = self.elements.semi_major_axis_km * 1e3
        return 2 * math.pi * math.sqrt(a_m**3 / MU_EARTH)

    def mean_motion(self) -> float:
        """Mean motion n in rad/s: n = sqrt(mu / a^3)."""
        a_m = self.elements.semi_major_axis_km * 1e3
        return math.sqrt(MU_EARTH / a_m**3)

    def semi_parameter_km(self) -> float:
        """Semi-latus rectum p = a * (1 - e^2) in km."""
        return self.elements.semi_major_axis_km * (1.0 - self.elements.eccentricity**2)

    def _solve_kepler(self, M_rad: float, e: float, tol: float = 1e-11) -> float:
        """Solve Kepler's equation M = E - e*sin(E) using Newton-Raphson."""
        # Initial guess
        if e < 0.8:
            E = M_rad
        else:
            E = math.pi if M_rad > math.pi else M_rad + 0.85 * e * math.copysign(1.0, math.sin(M_rad))

        for _ in range(60):
            f = E - e * math.sin(E) - M_rad
            f_prime = 1.0 - e * math.cos(E)
            dE = f / f_prime
            E -= dE
            if abs(dE) < tol:
                break
        return E

    def _eccentric_to_true(self, E_rad: float, e: float) -> float:
        """Convert eccentric anomaly E to true anomaly nu."""
        nu = 2.0 * math.atan2(
            math.sqrt(1.0 + e) * math.sin(E_rad / 2.0),
            math.sqrt(max(1.0 - e, 1e-12)) * math.cos(E_rad / 2.0),
        )
        return nu

    def _j2_raan_drift_deg(self, dt_s: float) -> float:
        """J2 secular RAAN drift (nodal precession) in degrees."""
        a_m = self.elements.semi_major_axis_km * 1e3
        e = self.elements.eccentricity
        i_rad = math.radians(self.elements.inclination_deg)
        n = self.mean_motion()
        p_m = a_m * (1.0 - e**2)
        dOmega_dt = -1.5 * n * J2 * (R_EARTH_M / p_m)**2 * math.cos(i_rad)
        return math.degrees(dOmega_dt * dt_s)

    def _j2_argp_drift_deg(self, dt_s: float) -> float:
        """J2 secular argument of periapsis drift in degrees."""
        a_m = self.elements.semi_major_axis_km * 1e3
        e = self.elements.eccentricity
        i_rad = math.radians(self.elements.inclination_deg)
        n = self.mean_motion()
        p_m = a_m * (1.0 - e**2)
        domega_dt = 0.75 * n * J2 * (R_EARTH_M / p_m)**2 * (5.0 * math.cos(i_rad)**2 - 1.0)
        return math.degrees(domega_dt * dt_s)

    def position_eci(self, elapsed_seconds: float) -> tuple[float, float, float]:
        """Compute 3D position vector in Earth-Centered Inertial (ECI) frame in km."""
        state = self.propagate(elapsed_seconds)
        return state.position_eci_km

    def velocity_eci(self, elapsed_seconds: float) -> tuple[float, float, float]:
        """Compute 3D velocity vector in ECI frame in km/s."""
        state = self.propagate(elapsed_seconds)
        return state.velocity_eci_km_s

    def sun_vector_eci(self, elapsed_seconds: float) -> tuple[float, float, float]:
        """
        Approximate Sun direction unit vector in ECI frame.
        Models annual ecliptic motion and 23.44° Earth axial obliquity.
        """
        # Solar mean anomaly / ecliptic longitude at elapsed time
        # 365.2422 days orbital period
        t_years = elapsed_seconds / (365.2422 * 86400.0)
        lambda_sun = 2.0 * math.pi * t_years  # Start at vernal equinox (t=0)
        obliq = math.radians(EARTH_OBLIQUITY_DEG)

        sx = math.cos(lambda_sun)
        sy = math.cos(obliq) * math.sin(lambda_sun)
        sz = math.sin(obliq) * math.sin(lambda_sun)
        norm = math.sqrt(sx*sx + sy*sy + sz*sz)
        return (sx / norm, sy / norm, sz / norm)

    def sunlight_exposure(
        self,
        elapsed_seconds: float,
        use_conical: bool = True,
    ) -> tuple[float, bool]:
        """
        Compute sunlight exposure fraction [0.0, 1.0] and eclipse boolean flag.
        - fraction 1.0: direct sunlight
        - fraction 0.0: total eclipse (umbra)
        - fraction (0, 1): penumbra twilight transition zone
        """
        pos = self.position_eci(elapsed_seconds)
        sun_hat = self.sun_vector_eci(elapsed_seconds)

        # Dot product: projection of satellite position along Earth-Sun vector
        s_parallel = pos[0] * sun_hat[0] + pos[1] * sun_hat[1] + pos[2] * sun_hat[2]

        # If satellite is on day side (sunward hemisphere), full sunlight
        if s_parallel >= 0.0:
            return 1.0, False

        # Perpendicular distance from Earth-Sun axis
        r_mag_sq = pos[0]**2 + pos[1]**2 + pos[2]**2
        d_perp_sq = max(0.0, r_mag_sq - s_parallel**2)
        d_perp = math.sqrt(d_perp_sq)

        x_dist = abs(s_parallel)

        if not use_conical:
            # Cylindrical shadow model (R = R_Earth)
            if d_perp <= R_EARTH_KM:
                return 0.0, True
            return 1.0, False

        # Conical shadow model with solar and terrestrial radii
        # Umbra cone half-angle: sin(alpha_u) = (R_Sun - R_Earth) / 1 AU
        tan_alpha_u = (R_SUN_KM - R_EARTH_KM) / ASTRONOMICAL_UNIT_KM
        tan_alpha_p = (R_SUN_KM + R_EARTH_KM) / ASTRONOMICAL_UNIT_KM

        r_umbra = max(0.0, R_EARTH_KM - x_dist * tan_alpha_u)
        r_penumbra = R_EARTH_KM + x_dist * tan_alpha_p

        if d_perp <= r_umbra:
            return 0.0, True
        elif d_perp >= r_penumbra:
            return 1.0, False
        else:
            # Linear penumbral transition
            frac = (d_perp - r_umbra) / (r_penumbra - r_umbra)
            frac = max(0.0, min(1.0, frac))
            return frac, (frac < 0.5)

    def earth_angular_radius_deg(self, altitude_km: float) -> float:
        """Angular radius of Earth rho = arcsin(R_Earth / r) as seen from satellite."""
        r = R_EARTH_KM + max(0.0, altitude_km)
        arg = max(-1.0, min(1.0, R_EARTH_KM / r))
        return math.degrees(math.asin(arg))

    def horizon_angle_deg(self, altitude_km: float) -> float:
        """Angular radius of visible circular horizon patch on Earth lambda = 90° - rho."""
        rho_deg = self.earth_angular_radius_deg(altitude_km)
        return max(0.0, 90.0 - rho_deg)

    def is_target_in_fov(
        self,
        sat_lat_deg: float,
        sat_lon_deg: float,
        sat_alt_km: float,
        target_lat_deg: float,
        target_lon_deg: float,
        fov_half_angle_deg: float = 30.0,
    ) -> tuple[bool, float, float]:
        """
        Check if a ground target is inside the sensor's nadir-pointing field of view.
        Returns: (is_inside, off_nadir_angle_deg, great_circle_distance_deg)
        """
        phi1 = math.radians(sat_lat_deg)
        lam1 = math.radians(sat_lon_deg)
        phi2 = math.radians(target_lat_deg)
        lam2 = math.radians(target_lon_deg)

        # Great circle central angle sigma
        cos_sigma = (
            math.sin(phi1) * math.sin(phi2)
            + math.cos(phi1) * math.cos(phi2) * math.cos(lam2 - lam1)
        )
        cos_sigma = max(-1.0, min(1.0, cos_sigma))
        sigma_rad = math.acos(cos_sigma)
        sigma_deg = math.degrees(sigma_rad)

        r_sat = R_EARTH_KM + sat_alt_km

        # Check line of sight: target must be on visible Earth disc
        lambda_horizon_rad = math.acos(R_EARTH_KM / r_sat)
        if sigma_rad > lambda_horizon_rad:
            return False, 90.0, sigma_deg

        # Slant distance d to target
        d_km = math.sqrt(r_sat**2 + R_EARTH_KM**2 - 2.0 * r_sat * R_EARTH_KM * math.cos(sigma_rad))
        if d_km < 1e-6:
            return True, 0.0, 0.0

        # Off-nadir angle eta: sin(eta) / R_Earth = sin(sigma) / d
        sin_eta = (R_EARTH_KM / d_km) * math.sin(sigma_rad)
        sin_eta = max(-1.0, min(1.0, sin_eta))
        off_nadir_deg = math.degrees(math.asin(sin_eta))

        is_inside = off_nadir_deg <= fov_half_angle_deg
        return is_inside, off_nadir_deg, sigma_deg

    def propagate(self, elapsed_seconds: float) -> OrbitalState:
        """
        Propagate orbit to t = epoch + elapsed_seconds.
        Computes exact Keplerian state, 3D ECI position & velocity, geodetic lat/lon,
        conical eclipse exposure, and SAA radiation boundary test.
        """
        dt = elapsed_seconds - self.elements.epoch_seconds
        n = self.mean_motion()
        T = self.orbital_period()

        # Mean anomaly at time t
        M_rad = (math.radians(self.elements.mean_anomaly_deg) + n * dt) % (2.0 * math.pi)

        # Solve Kepler's equation for Eccentric Anomaly E
        e = self.elements.eccentricity
        E_rad = self._solve_kepler(M_rad, e)

        # True anomaly nu
        nu_rad = self._eccentric_to_true(E_rad, e)
        nu_deg = math.degrees(nu_rad) % 360.0

        # Orbital radius r
        a_m = self.elements.semi_major_axis_km * 1e3
        r_m = a_m * (1.0 - e * math.cos(E_rad))
        r_km = r_m / 1e3
        altitude_km = r_km - R_EARTH_KM

        # Vis-viva orbital velocity
        v_m_s = math.sqrt(MU_EARTH * (2.0 / r_m - 1.0 / a_m))
        v_km_s = v_m_s / 1e3

        # J2 Secular Perturbations
        raan_deg = (self.elements.raan_deg + self._j2_raan_drift_deg(dt)) % 360.0
        argp_deg = (self.elements.arg_periapsis_deg + self._j2_argp_drift_deg(dt)) % 360.0

        raan_rad = math.radians(raan_deg)
        argp_rad = math.radians(argp_deg)
        i_rad = math.radians(self.elements.inclination_deg)

        # Argument of latitude u = omega + nu
        u_rad = argp_rad + nu_rad

        # 3D Position in Perifocal and ECI frame
        p_km = self.semi_parameter_km()
        r_val_km = p_km / (1.0 + e * math.cos(nu_rad))

        cos_u = math.cos(u_rad)
        sin_u = math.sin(u_rad)
        cos_o = math.cos(raan_rad)
        sin_o = math.sin(raan_rad)
        cos_i = math.cos(i_rad)
        sin_i = math.sin(i_rad)

        x_eci = r_val_km * (cos_o * cos_u - sin_o * sin_u * cos_i)
        y_eci = r_val_km * (sin_o * cos_u + cos_o * sin_u * cos_i)
        z_eci = r_val_km * (sin_u * sin_i)

        # 3D Velocity in Perifocal and ECI frame
        sqrt_mu_p = math.sqrt((MU_EARTH / 1e9) / p_km)
        vr_km_s = sqrt_mu_p * e * math.sin(nu_rad)
        vt_km_s = sqrt_mu_p * (1.0 + e * math.cos(nu_rad))

        vx_eci = (x_eci / r_val_km) * vr_km_s + (-sin_o * cos_i * cos_u - cos_o * sin_u) * vt_km_s
        vy_eci = (y_eci / r_val_km) * vr_km_s + (cos_o * cos_i * cos_u - sin_o * sin_u) * vt_km_s
        vz_eci = (z_eci / r_val_km) * vr_km_s + (sin_i * cos_u) * vt_km_s

        # Sub-satellite Point (Geodetic Latitude & Longitude)
        lat_rad = math.asin(max(-1.0, min(1.0, sin_i * sin_u)))
        lat_deg = math.degrees(lat_rad)

        lon_rad = math.atan2(
            cos_i * sin_u,
            cos_u,
        ) + raan_rad - (EARTH_OMEGA * elapsed_seconds)

        lon_deg = math.degrees(lon_rad) % 360.0
        if lon_deg > 180.0:
            lon_deg -= 360.0

        # Sunlight & Eclipse using conical shadow
        # Use position vector in sunlight calculation
        s_hat = self.sun_vector_eci(elapsed_seconds)
        s_par = x_eci * s_hat[0] + y_eci * s_hat[1] + z_eci * s_hat[2]
        if s_par >= 0.0:
            sunlight_frac = 1.0
            in_eclipse = False
        else:
            d_p = math.sqrt(max(0.0, (x_eci**2 + y_eci**2 + z_eci**2) - s_par**2))
            x_dist = abs(s_par)
            tan_u = (R_SUN_KM - R_EARTH_KM) / ASTRONOMICAL_UNIT_KM
            tan_p = (R_SUN_KM + R_EARTH_KM) / ASTRONOMICAL_UNIT_KM
            ru = max(0.0, R_EARTH_KM - x_dist * tan_u)
            rp = R_EARTH_KM + x_dist * tan_p
            if d_p <= ru:
                sunlight_frac = 0.0
                in_eclipse = True
            elif d_p >= rp:
                sunlight_frac = 1.0
                in_eclipse = False
            else:
                sunlight_frac = (d_p - ru) / (rp - ru)
                in_eclipse = sunlight_frac < 0.5

        # Earth Angular Radius and Horizon Angle
        earth_ang_rad = self.earth_angular_radius_deg(altitude_km)
        horiz_ang = self.horizon_angle_deg(altitude_km)

        # South Atlantic Anomaly (SAA) Check
        # Region: -50 <= lat <= 0, -90 <= lon <= 0
        in_saa = (-50.0 <= lat_deg <= 0.0) and (-90.0 <= lon_deg <= 0.0)

        updated_elements = OrbitalElements(
            semi_major_axis_km=self.elements.semi_major_axis_km,
            eccentricity=e,
            inclination_deg=self.elements.inclination_deg,
            raan_deg=raan_deg,
            arg_periapsis_deg=argp_deg,
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
            sunlight_fraction=round(sunlight_frac, 4),
            earth_angular_radius_deg=round(earth_ang_rad, 2),
            horizon_angle_deg=round(horiz_ang, 2),
            in_saa=in_saa,
            position_eci_km=(round(x_eci, 3), round(y_eci, 3), round(z_eci, 3)),
            velocity_eci_km_s=(round(vx_eci, 4), round(vy_eci, 4), round(vz_eci, 4)),
        )

    def find_target_observation_windows(
        self,
        target: GroundTarget,
        start_seconds: float,
        duration_seconds: float,
        fov_half_angle_deg: float = 30.0,
        dt_step: float = 15.0,
    ) -> list[ObservationWindow]:
        """
        Forecast observation opportunity windows when spacecraft passes over target.
        Calculates AOS, TCA (closest approach), LOS, and minimum off-nadir angle.
        """
        windows: list[ObservationWindow] = []
        in_window = False
        win_start = 0.0
        best_off_nadir = 90.0
        best_tca = 0.0
        best_elevation = 0.0

        t = start_seconds
        end_time = start_seconds + duration_seconds

        while t <= end_time:
            st = self.propagate(t)
            inside, off_nadir, dist_deg = self.is_target_in_fov(
                st.latitude_deg, st.longitude_deg, st.altitude_km,
                target.latitude_deg, target.longitude_deg,
                fov_half_angle_deg=fov_half_angle_deg,
            )

            # Ground elevation angle looking up from target to satellite
            r_sat = R_EARTH_KM + st.altitude_km
            sigma_rad = math.radians(dist_deg)
            cos_s = math.cos(sigma_rad)
            sin_s = math.sin(sigma_rad)
            elev_rad = math.atan2(cos_s - R_EARTH_KM / r_sat, max(sin_s, 1e-12))
            elev_deg = math.degrees(elev_rad)

            if inside and not in_window:
                in_window = True
                win_start = t
                best_off_nadir = off_nadir
                best_tca = t
                best_elevation = elev_deg
            elif inside and in_window:
                if off_nadir < best_off_nadir:
                    best_off_nadir = off_nadir
                    best_tca = t
                    best_elevation = elev_deg
            elif not inside and in_window:
                in_window = False
                win_end = t
                windows.append(ObservationWindow(
                    target_id=target.target_id,
                    target_name=target.name,
                    start_seconds=win_start,
                    end_seconds=win_end,
                    duration_seconds=round(win_end - win_start, 1),
                    tca_seconds=best_tca,
                    min_off_nadir_deg=round(best_off_nadir, 2),
                    max_elevation_deg=round(best_elevation, 2),
                ))

            t += dt_step

        if in_window:
            windows.append(ObservationWindow(
                target_id=target.target_id,
                target_name=target.name,
                start_seconds=win_start,
                end_seconds=end_time,
                duration_seconds=round(end_time - win_start, 1),
                tca_seconds=best_tca,
                min_off_nadir_deg=round(best_off_nadir, 2),
                max_elevation_deg=round(best_elevation, 2),
            ))

        return windows

    def find_station_contact_windows(
        self,
        station_lat: float,
        station_lon: float,
        station_name: str,
        min_elevation_deg: float = 5.0,
        start_seconds: float = 0.0,
        duration_seconds: float = 86400.0,
        dt_step: float = 15.0,
    ) -> list[ContactWindow]:
        """
        Forecast ground station communication contact windows (AOS, TCA, LOS).
        Detects passes where elevation exceeds ground station mask angle.
        """
        windows: list[ContactWindow] = []
        in_pass = False
        aos_t = 0.0
        max_el = -90.0
        tca_t = 0.0
        min_slant = 99999.0

        t = start_seconds
        end_time = start_seconds + duration_seconds

        while t <= end_time:
            st = self.propagate(t)

            # Central angle between station and satellite
            phi1 = math.radians(station_lat)
            lam1 = math.radians(station_lon)
            phi2 = math.radians(st.latitude_deg)
            lam2 = math.radians(st.longitude_deg)

            cos_c = math.sin(phi1) * math.sin(phi2) + math.cos(phi1) * math.cos(phi2) * math.cos(lam2 - lam1)
            cos_c = max(-1.0, min(1.0, cos_c))
            c_rad = math.acos(cos_c)

            r_sat = R_EARTH_KM + st.altitude_km
            sin_c = math.sin(c_rad)

            # Elevation angle above local horizon
            el_rad = math.atan2(cos_c - R_EARTH_KM / r_sat, max(sin_c, 1e-12))
            el_deg = math.degrees(el_rad)

            # Slant range
            slant_km = math.sqrt(r_sat**2 + R_EARTH_KM**2 - 2.0 * r_sat * R_EARTH_KM * cos_c)

            if el_deg >= min_elevation_deg:
                if not in_pass:
                    in_pass = True
                    aos_t = t
                    max_el = el_deg
                    tca_t = t
                    min_slant = slant_km
                else:
                    if el_deg > max_el:
                        max_el = el_deg
                        tca_t = t
                        min_slant = slant_km
            else:
                if in_pass:
                    in_pass = False
                    los_t = t
                    windows.append(ContactWindow(
                        station_name=station_name,
                        aos_seconds=aos_t,
                        tca_seconds=tca_t,
                        los_seconds=los_t,
                        duration_seconds=round(los_t - aos_t, 1),
                        max_elevation_deg=round(max_el, 2),
                        min_slant_range_km=round(min_slant, 1),
                    ))

            t += dt_step

        if in_pass:
            windows.append(ContactWindow(
                station_name=station_name,
                aos_seconds=aos_t,
                tca_seconds=tca_t,
                los_seconds=end_time,
                duration_seconds=round(end_time - aos_t, 1),
                max_elevation_deg=round(max_el, 2),
                min_slant_range_km=round(min_slant, 1),
            ))

        return windows

    def find_eclipse_windows(
        self,
        start_seconds: float,
        duration_seconds: float,
        dt_step: float = 30.0,
    ) -> list[EclipseWindow]:
        """
        Forecast eclipse ingress (sunset) and egress (sunrise) intervals.
        """
        windows: list[EclipseWindow] = []
        in_ecl = False
        ingress_t = 0.0

        t = start_seconds
        end_time = start_seconds + duration_seconds

        while t <= end_time:
            _, is_ecl = self.sunlight_exposure(t)
            if is_ecl and not in_ecl:
                in_ecl = True
                ingress_t = t
            elif not is_ecl and in_ecl:
                in_ecl = False
                egress_t = t
                windows.append(EclipseWindow(
                    ingress_seconds=ingress_t,
                    egress_seconds=egress_t,
                    duration_seconds=round(egress_t - ingress_t, 1),
                    is_umbra=True,
                ))
            t += dt_step

        if in_ecl:
            windows.append(EclipseWindow(
                ingress_seconds=ingress_t,
                egress_seconds=end_time,
                duration_seconds=round(end_time - ingress_t, 1),
                is_umbra=True,
            ))

        return windows


# ── Benchmark Verification with Trusted Aerospace References ─────────────────

REFERENCE_CASES: dict[str, dict[str, float]] = {
    "iss_400km": {
        "altitude_km": 400.0,
        "semi_major_axis_km": R_EARTH_KM + 400.0,
        "eccentricity": 0.0005,
        "inclination_deg": 51.64,
        # Expected reference values from NASA / GMAT standard ephemeris:
        "expected_period_minutes": 92.68,
        "expected_velocity_km_s": 7.67,
    },
    "sentinel2_786km": {
        "altitude_km": 786.0,
        "semi_major_axis_km": R_EARTH_KM + 786.0,
        "eccentricity": 0.001,
        "inclination_deg": 98.62,
        # Expected reference values from ESA / Skyfield:
        "expected_period_minutes": 100.5,
        "expected_velocity_km_s": 7.45,
    },
    "landsat_705km": {
        "altitude_km": 705.0,
        "semi_major_axis_km": R_EARTH_KM + 705.0,
        "eccentricity": 0.001,
        "inclination_deg": 98.2,
        # Expected reference values from USGS / NASA Landsat Handbook:
        "expected_period_minutes": 98.88,
        "expected_velocity_km_s": 7.50,
    },
    "geo_35786km": {
        "altitude_km": 35786.0,
        "semi_major_axis_km": R_EARTH_KM + 35786.0,
        "eccentricity": 0.0,
        "inclination_deg": 0.0,
        # Expected reference values from IAU / ITU:
        "expected_period_minutes": 1436.1,  # 23.934 hours (sidereal day)
        "expected_velocity_km_s": 3.075,
    },
}
