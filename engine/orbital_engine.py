"""Orbital Engine — spacecraft position, orbital resource budget, and cooling capacity.

NASA Space Apps 2026 — "Space Mission Design Game"
===================================================
Designing a space mission requires managing competing orbital demands: when is
the satellite sunlit (solar power budget), when is it eclipsed (battery-only
mode), and — critically — what is the radiator seeing (thermal budget)?

This module simulates a spacecraft in a circular orbit and answers the three
orbital resource-trade-off questions LumenOS needs every scheduling tick:

1. **Sunlight vs. eclipse** — is the spacecraft inside Earth's shadow?
   (Determines whether the power budget comes from solar arrays or battery.)
2. **Solar power** — how many watts the solar array is currently generating.
   (A core limited resource; eclipse passes force a switch to battery reserves.)
3. **Radiator view factor** — what the radiator (fixed on the body -Z axis) is
   looking at, and therefore the spacecraft's *thermal budget* — how much heat
   it can reject to maintain safe operating temperatures:

   ============  ===========  =============================================
   Facing        Sink temp    Thermal budget impact
   ============  ===========  =============================================
   DEEP_SPACE    3 K          Excellent cooling — run heavy AI workloads
   EARTH_NIGHT   220 K        Moderate cooling — medium workloads only
   EARTH_DAY     280 K        Poor cooling — critical thermal danger zone
   ============  ===========  =============================================

These three variables define the **orbital resource envelope** the scheduler
must navigate: a mission engineer's hardware choices (radiator area, battery
capacity, server mass) directly control how well the spacecraft can operate in
each regime. Each design decision shapes whether the mission succeeds or fails.

Modelling assumptions (deliberately simplified for educational clarity):

* **Propagation** — `skyfield` + `sgp4`, orbit built from mean elements
  (near-circular, no drag) instead of a downloaded TLE, so it works offline.
* **Sun direction** — low-precision analytic solar ephemeris (Astronomical
  Almanac, ~0.01 deg accuracy); no ephemeris file download required.
* **Shadow** — cylindrical Earth-shadow model (no penumbra).
* **Solar array** — single-axis sun-tracking array (gimbal about the orbit
  normal), so the sun incidence angle equals the orbit *beta angle*:
  ``P = P_max * cos(beta)`` when sunlit, ``0`` in eclipse.
* **Attitude / radiator** — quasi-inertial attitude: the radiator normal lies in
  the orbit plane, 90 deg *behind* the Sun's projection onto that plane (the
  "dawn" direction). As the spacecraft goes around, the radiator therefore
  faces Earth from local noon through dusk to midnight (EARTH_DAY, then
  EARTH_NIGHT) and deep space from midnight through dawn to noon. The poor-
  cooling EARTH_DAY arc thus follows the sunlit heating phase — the thermally
  stressful trade-off a mission OS must plan around.
* **Cooling** — Stefan-Boltzmann:
  ``Q = epsilon * sigma * A * (T_radiator^4 - T_sink^4)``.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import numpy as np
from sgp4.api import WGS72, Satrec
from skyfield.api import EarthSatellite, load, wgs84

# --------------------------------------------------------------------------- #
# Physical constants & model parameters
# --------------------------------------------------------------------------- #
EARTH_RADIUS_KM: float = 6378.137
EARTH_MU_KM3_S2: float = 398600.4418

STEFAN_BOLTZMANN: float = 5.67e-8  # W / (m^2 K^4)
RADIATOR_EMISSIVITY: float = 0.80
RADIATOR_AREA_M2: float = 1.5
RADIATOR_TEMP_K: float = 340.0  # design operating temperature

SOLAR_ARRAY_MAX_WATTS: float = 2000.0

DEEP_SPACE = "DEEP_SPACE"
EARTH_DAY = "EARTH_DAY"
EARTH_NIGHT = "EARTH_NIGHT"

SINK_TEMPERATURES_K: dict[str, float] = {
    DEEP_SPACE: 3.0,
    EARTH_DAY: 280.0,
    EARTH_NIGHT: 220.0,
}

#: Default simulation epoch (fixed so runs are reproducible).
DEFAULT_EPOCH: datetime = datetime(2026, 3, 20, 12, 0, 0, tzinfo=timezone.utc)

_J2000_JD: float = 2451545.0
_J2000_DATETIME: datetime = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
_SGP4_EPOCH_ORIGIN_JD: float = 2433281.5  # 1949-12-31 00:00 UT


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _to_utc(time_utc: datetime) -> datetime:
    """Return ``time_utc`` as a timezone-aware UTC datetime.

    Naive datetimes are assumed to already be in UTC.
    """
    if time_utc.tzinfo is None:
        return time_utc.replace(tzinfo=timezone.utc)
    return time_utc.astimezone(timezone.utc)


def _julian_date(time_utc: datetime) -> float:
    """Julian Date of a UTC datetime (UTC~TT difference ignored)."""
    return _J2000_JD + (_to_utc(time_utc) - _J2000_DATETIME).total_seconds() / 86400.0


def _unit(vector: np.ndarray) -> np.ndarray:
    """Return ``vector`` normalised to unit length."""
    return vector / np.linalg.norm(vector)


def sun_unit_vector(time_utc: datetime) -> np.ndarray:
    """Unit vector from Earth's centre to the Sun in the equatorial (GCRS-like) frame.

    Uses the low-precision solar coordinates from the Astronomical Almanac,
    accurate to ~0.01 deg between 1950 and 2050 — far better than needed for
    eclipse and view-factor decisions.

    Args:
        time_utc: Instant of interest (UTC).

    Returns:
        A 3-element numpy array of unit length.
    """
    n = _julian_date(time_utc) - _J2000_JD
    mean_longitude = math.radians((280.460 + 0.9856474 * n) % 360.0)
    mean_anomaly = math.radians((357.528 + 0.9856003 * n) % 360.0)
    ecliptic_longitude = (
        mean_longitude
        + math.radians(1.915) * math.sin(mean_anomaly)
        + math.radians(0.020) * math.sin(2.0 * mean_anomaly)
    )
    obliquity = math.radians(23.439 - 0.0000004 * n)
    return np.array(
        [
            math.cos(ecliptic_longitude),
            math.cos(obliquity) * math.sin(ecliptic_longitude),
            math.sin(obliquity) * math.sin(ecliptic_longitude),
        ]
    )


def radiator_cooling_capacity(
    sink_temperature_kelvin: float,
    radiator_temp_kelvin: float = RADIATOR_TEMP_K,
) -> float:
    """Heat the radiator can reject, via the Stefan-Boltzmann law.

    ``Q = epsilon * sigma * area * (T_radiator^4 - T_sink^4)``

    With the default ``radiator_temp_kelvin`` (the 340 K design point) this is
    the *maximum* cooling capacity reported by the orbital engine. Passing the
    actual hardware temperature gives the heat actually being rejected.

    Args:
        sink_temperature_kelvin: Effective temperature of what the radiator sees.
        radiator_temp_kelvin: Radiator surface temperature (defaults to design point).

    Returns:
        Cooling in watts (never negative).
    """
    q = (
        RADIATOR_EMISSIVITY
        * STEFAN_BOLTZMANN
        * RADIATOR_AREA_M2
        * (radiator_temp_kelvin**4 - sink_temperature_kelvin**4)
    )
    return max(q, 0.0)


# --------------------------------------------------------------------------- #
# Orbital engine
# --------------------------------------------------------------------------- #
class OrbitalEngine:
    """Simulates a satellite in circular LEO and reports power & cooling conditions.

    Example:
        >>> engine = OrbitalEngine()
        >>> state = engine.get_orbital_state(engine.epoch)
        >>> state["radiator_facing"] in ("DEEP_SPACE", "EARTH_DAY", "EARTH_NIGHT")
        True
    """

    def __init__(
        self,
        altitude_km: float = 550.0,
        inclination_deg: float = 53.0,
        *,
        raan_deg: float = 0.0,
        epoch: Optional[datetime] = None,
        solar_array_max_watts: float = SOLAR_ARRAY_MAX_WATTS,
        radiator_area: Optional[float] = None,
        radiator_area_m2: Optional[float] = None,
        scenario: Optional[str] = None,
        solar_scale: Optional[float] = None,
        **kwargs: Any,
    ) -> None:
        """Build the orbit.

        Args:
            altitude_km: Circular orbit altitude above Earth's equatorial radius.
            inclination_deg: Orbit inclination in degrees (0-180).
            raan_deg: Right ascension of the ascending node in degrees. Together
                with the epoch this sets the beta angle (and so eclipse length).
            epoch: Orbit epoch / default simulation start (UTC). Defaults to
                :data:`DEFAULT_EPOCH` for reproducible runs.
            solar_array_max_watts: Array output at normal sun incidence.
            radiator_area: Radiator area in m^2 (updates RADIATOR_AREA_M2).
            radiator_area_m2: Alias for radiator_area.
            scenario: Mission scenario name ('LEO', 'Lunar Gateway', 'Mars Transit').
            solar_scale: Solar intensity multiplier (e.g. 0.65 for lunar, 0.43 for mars).

        Raises:
            ValueError: If altitude or inclination is out of range.
        """
        if scenario is not None:
            s = str(scenario).upper()
            if "LUNAR" in s or "MOON" in s or "NRHO" in s:
                if altitude_km == 550.0:
                    altitude_km = 5000.0
                if inclination_deg == 53.0:
                    inclination_deg = 90.0
                if solar_scale is None:
                    solar_scale = 0.65
            elif "MARS" in s:
                if altitude_km == 550.0:
                    altitude_km = 1000.0
                if inclination_deg == 53.0:
                    inclination_deg = 5.0
                if solar_scale is None:
                    solar_scale = 0.43

        if solar_scale is not None and solar_array_max_watts == SOLAR_ARRAY_MAX_WATTS:
            solar_array_max_watts = SOLAR_ARRAY_MAX_WATTS * float(solar_scale)

        rad_area = radiator_area if radiator_area is not None else radiator_area_m2
        if rad_area is not None:
            global RADIATOR_AREA_M2
            RADIATOR_AREA_M2 = float(rad_area)
            self.radiator_area_m2: float = float(rad_area)
        else:
            self.radiator_area_m2 = RADIATOR_AREA_M2

        if altitude_km <= 0:
            raise ValueError("altitude_km must be positive")
        if not 0.0 <= inclination_deg <= 180.0:
            raise ValueError("inclination_deg must be within [0, 180]")

        self.altitude_km: float = float(altitude_km)
        self.inclination_deg: float = float(inclination_deg)
        self.raan_deg: float = float(raan_deg)
        self.epoch: datetime = _to_utc(epoch) if epoch is not None else DEFAULT_EPOCH
        self.solar_array_max_watts: float = float(solar_array_max_watts)

        self.semi_major_axis_km: float = EARTH_RADIUS_KM + self.altitude_km
        mean_motion_rad_s = math.sqrt(EARTH_MU_KM3_S2 / self.semi_major_axis_km**3)
        self.orbital_period_minutes: float = 2.0 * math.pi / mean_motion_rad_s / 60.0

        satrec = Satrec()
        satrec.sgp4init(
            WGS72,
            "i",                                    # improved SGP4 mode
            99999,                                  # catalogue number
            _julian_date(self.epoch) - _SGP4_EPOCH_ORIGIN_JD,
            0.0,                                    # bstar (no drag)
            0.0,                                    # ndot
            0.0,                                    # nddot
            1e-6,                                   # eccentricity (~circular)
            0.0,                                    # argument of perigee
            math.radians(self.inclination_deg),
            0.0,                                    # mean anomaly
            mean_motion_rad_s * 60.0,               # mean motion, rad/min
            math.radians(self.raan_deg),
        )
        self._timescale = load.timescale()
        self._satellite = EarthSatellite.from_satrec(satrec, self._timescale)

        self._cooling_by_facing: dict[str, float] = {
            facing: radiator_cooling_capacity(t_sink)
            for facing, t_sink in SINK_TEMPERATURES_K.items()
        }

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def get_orbital_state(self, time_utc: datetime) -> dict[str, Any]:
        """Compute the satellite's power and cooling situation at one instant.

        Args:
            time_utc: Instant to evaluate (naive datetimes are treated as UTC).

        Returns:
            A dict with the core keys

            * ``timestamp`` (datetime, UTC)
            * ``is_sunlit`` (bool)
            * ``solar_power_watts`` (float, 0-``solar_array_max_watts``)
            * ``radiator_facing`` (``'DEEP_SPACE'`` | ``'EARTH_DAY'`` | ``'EARTH_NIGHT'``)
            * ``sink_temperature_kelvin`` (float: 3, 280 or 220)
            * ``max_cooling_capacity_watts`` (float)

            plus extra fields for visualisation/debugging: ``latitude_deg``,
            ``longitude_deg``, ``altitude_km``, ``beta_angle_deg`` and
            ``on_day_side``.
        """
        timestamp = _to_utc(time_utc)
        geocentric = self._satellite.at(self._timescale.from_datetime(timestamp))

        position_km = np.asarray(geocentric.position.km, dtype=float)
        velocity_km_s = np.asarray(geocentric.velocity.km_per_s, dtype=float)
        r_hat = _unit(position_km)
        orbit_normal = _unit(np.cross(position_km, velocity_km_s))
        sun_hat = sun_unit_vector(timestamp)

        # 1. Sunlight / eclipse
        is_sunlit = self._is_sunlit(position_km, sun_hat)

        # 2. Solar power (sun-tracking array -> incidence angle == beta angle)
        beta_rad = math.asin(float(np.clip(np.dot(sun_hat, orbit_normal), -1.0, 1.0)))
        solar_power = self.solar_array_max_watts * math.cos(beta_rad) if is_sunlit else 0.0

        # 3. Radiator view factor
        on_day_side = bool(np.dot(r_hat, sun_hat) > 0.0)
        radiator_normal = self._radiator_normal(sun_hat, orbit_normal)
        points_toward_earth = bool(np.dot(radiator_normal, -r_hat) > 0.0)
        radiator_facing = self._classify_radiator(on_day_side, points_toward_earth)

        latitude, longitude = wgs84.latlon_of(geocentric)

        return {
            "timestamp": timestamp,
            "is_sunlit": is_sunlit,
            "solar_power_watts": float(solar_power),
            "radiator_facing": radiator_facing,
            "sink_temperature_kelvin": SINK_TEMPERATURES_K[radiator_facing],
            "max_cooling_capacity_watts": self._cooling_by_facing[radiator_facing],
            # Extras for the dashboard globe / debugging
            "latitude_deg": float(latitude.degrees),
            "longitude_deg": float(longitude.degrees),
            "altitude_km": float(wgs84.height_of(geocentric).km),
            "beta_angle_deg": math.degrees(beta_rad),
            "on_day_side": on_day_side,
            "position_km": position_km.tolist(),
            "velocity_km_s": velocity_km_s.tolist(),
            "radiator_normal": radiator_normal.tolist(),
            "sun_vector": sun_hat.tolist(),
        }

    def simulate_orbit(
        self,
        duration_minutes: float = 90,
        step_seconds: float = 30,
        start_time: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """Sample :meth:`get_orbital_state` over a time window.

        Args:
            duration_minutes: Length of the window (default 90 min ~ one LEO orbit).
            step_seconds: Sampling interval (default 30 s, the LumenOS tick).
            start_time: Window start (UTC). Defaults to the orbit epoch.

        Returns:
            Orbital states ordered by time, including both endpoints.

        Raises:
            ValueError: If ``duration_minutes`` or ``step_seconds`` is not positive.
        """
        if duration_minutes <= 0:
            raise ValueError("duration_minutes must be positive")
        if step_seconds <= 0:
            raise ValueError("step_seconds must be positive")

        start = _to_utc(start_time) if start_time is not None else self.epoch
        n_steps = int((duration_minutes * 60.0) // step_seconds) + 1
        return [
            self.get_orbital_state(start + timedelta(seconds=i * step_seconds))
            for i in range(n_steps)
        ]

    def next_sunrise(
        self,
        after: Optional[datetime] = None,
        step_seconds: float = 30,
    ) -> datetime:
        """Find the first eclipse -> sunlight transition (orbital sunrise).

        Args:
            after: Search start (UTC). Defaults to the orbit epoch.
            step_seconds: Search resolution.

        Returns:
            Time of the first sunlit sample after an eclipsed one. If the orbit
            has no eclipse (high beta angle), returns ``after`` unchanged.
        """
        start = _to_utc(after) if after is not None else self.epoch
        n_steps = int(2 * self.orbital_period_minutes * 60.0 // step_seconds) + 1
        previous_sunlit = self.get_orbital_state(start)["is_sunlit"]
        for i in range(1, n_steps):
            t = start + timedelta(seconds=i * step_seconds)
            sunlit = self.get_orbital_state(t)["is_sunlit"]
            if sunlit and not previous_sunlit:
                return t
            previous_sunlit = sunlit
        return start

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #
    @staticmethod
    def _is_sunlit(position_km: np.ndarray, sun_hat: np.ndarray) -> bool:
        """Cylindrical shadow test: is the satellite outside Earth's shadow?

        Args:
            position_km: Satellite position from Earth's centre (km).
            sun_hat: Unit vector toward the Sun.

        Returns:
            ``True`` if sunlit, ``False`` if in eclipse.
        """
        along_sun = float(np.dot(position_km, sun_hat))
        if along_sun >= 0.0:
            return True  # on the sunward half — cannot be shadowed
        distance_from_shadow_axis = float(np.linalg.norm(position_km - along_sun * sun_hat))
        return distance_from_shadow_axis > EARTH_RADIUS_KM

    @staticmethod
    def _radiator_normal(sun_hat: np.ndarray, orbit_normal: np.ndarray) -> np.ndarray:
        """Direction of the radiator (body -Z axis) in the inertial frame.

        The radiator normal lies in the orbit plane, 90 deg behind the Sun's
        projection onto that plane (so it faces Earth from noon to midnight).
        Falls back to an arbitrary in-plane axis when the Sun is (almost) along
        the orbit normal (|beta| ~ 90 deg).

        Args:
            sun_hat: Unit vector toward the Sun.
            orbit_normal: Unit angular-momentum vector of the orbit.

        Returns:
            Unit vector of the radiator normal.
        """
        sun_in_plane = sun_hat - np.dot(sun_hat, orbit_normal) * orbit_normal
        if np.linalg.norm(sun_in_plane) < 1e-6:
            reference = np.array([1.0, 0.0, 0.0])
            if abs(np.dot(reference, orbit_normal)) > 0.9:
                reference = np.array([0.0, 1.0, 0.0])
            sun_in_plane = reference - np.dot(reference, orbit_normal) * orbit_normal
        return _unit(np.cross(_unit(sun_in_plane), orbit_normal))

    @staticmethod
    def _classify_radiator(on_day_side: bool, points_toward_earth: bool) -> str:
        """Map geometry to a radiator-facing category.

        * night side + away from Earth  -> DEEP_SPACE
        * day side   + toward Earth     -> EARTH_DAY
        * night side + toward Earth     -> EARTH_NIGHT
        * otherwise                     -> DEEP_SPACE
        """
        if points_toward_earth:
            return EARTH_DAY if on_day_side else EARTH_NIGHT
        return DEEP_SPACE


if __name__ == "__main__":
    engine = OrbitalEngine()
    states = engine.simulate_orbit()
    print(f"Orbital period: {engine.orbital_period_minutes:.1f} min, samples: {len(states)}")
    for s in states[::10]:
        print(
            f"{s['timestamp']:%H:%M:%S}  sunlit={str(s['is_sunlit']):5}  "
            f"solar={s['solar_power_watts']:7.1f} W  "
            f"radiator={s['radiator_facing']:11}  "
            f"cooling={s['max_cooling_capacity_watts']:7.1f} W"
        )
