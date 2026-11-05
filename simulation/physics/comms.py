"""
Communications Subsystem Model — Contact Windows, Link Budget, and Priority Downlink.

Models:
- Ground station visibility geometry (elevation angle >= 5° horizon mask, AOS/TCA/LOS).
- Dynamic RF link budget: free-space path loss (FSPL), antenna pointing constraints,
  effective receiver carrier-to-noise, and elevation-scaled transmission bandwidth.
- Prioritized data downlink queue:
  1. Priority Alerts (critical disaster/weather alerts, delivered immediately)
  2. Processed Science Products (compressed data)
  3. Raw Observations (bulk survey telemetry)
- Command telecommand uplink queue during contact windows.
- Transmission interruption / failure: handles LOS loss of signal, attitude pointing
  deviations, or brownout cutoffs safely without buffer corruption.

REFERENCE:
- Speed of light c = 299792458 m/s
- Boltzmann constant k = 1.380649e-23 J/K
- Typical LEO ground station elevation mask = 5.0°
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from simulation.physics.storage import StorageModel

# ── Reference Physical Constants ─────────────────────────────────────────────

SPEED_OF_LIGHT = 299792458.0   # m/s
BOLTZMANN_K = 1.380649e-23     # J/K
R_EARTH_KM = 6371.0


@dataclass
class GroundStation:
    """A ground station supporting telecommand uplink and telemetry/science downlink."""
    name: str
    latitude_deg: float
    longitude_deg: float
    min_elevation_deg: float = 5.0       # Elevation mask
    receive_gain_dbi: float = 40.0
    data_rate_mbps: float = 20.0         # Max downlink rate at zenith
    uplink_rate_kbps: float = 256.0      # Telecommand uplink rate


# Standard global tracking network (polar + mid-latitude + equatorial)
DEFAULT_GROUND_STATIONS = [
    GroundStation("Svalbard", 78.23, 15.39, data_rate_mbps=25.0),
    GroundStation("Fairbanks", 64.86, -147.72, data_rate_mbps=20.0),
    GroundStation("Wallops Island", 37.94, -75.46, data_rate_mbps=15.0),
    GroundStation("Canberra", -35.40, 148.98, data_rate_mbps=15.0),
    GroundStation("McMurdo", -77.85, 166.67, data_rate_mbps=20.0),
    GroundStation("Kourou", 5.25, -52.81, data_rate_mbps=15.0),
]


@dataclass
class CommsConfig:
    """Spacecraft communications subsystem configuration."""
    antenna_gain_dbi: float = 25.0
    transmit_power_w: float = 20.0
    frequency_ghz: float = 8.2                    # X-band downlink
    data_buffer_capacity_mb: float = 8000.0       # 8 GB onboard buffer
    max_pointing_error_deg: float = 5.0           # Antenna pointing beamwidth constraint
    current_pointing_error_deg: float = 0.0


@dataclass
class CommsState:
    """Communications subsystem state at a discrete simulation step."""
    in_contact: bool = False
    active_station: str = ""
    elevation_deg: float = -90.0
    slant_range_km: float = 0.0
    current_data_rate_mbps: float = 0.0
    signal_strength_dbm: float = -200.0
    data_buffer_mb: float = 0.0
    data_buffer_pct: float = 0.0
    data_collected_mb: float = 0.0
    data_downlinked_mb: float = 0.0
    # Segregated downlink telemetry
    alerts_downlinked_mb: float = 0.0
    processed_downlinked_mb: float = 0.0
    raw_downlinked_mb: float = 0.0
    # Command uplink
    telecommand_queue_count: int = 0
    telecommands_received: int = 0
    # Status flags
    transmission_interrupted: bool = False
    buffer_full_warning: bool = False
    downlink_priority_mode: str = "alerts_first"


@dataclass
class CommsModel:
    """
    Communications Subsystem Simulation Model.

    Deterministic — contact geometry is governed by orbit subpoints and
    ground station geodetic locations.
    """
    config: CommsConfig = field(default_factory=CommsConfig)
    state: CommsState = field(default_factory=CommsState)
    ground_stations: list[GroundStation] = field(
        default_factory=lambda: list(DEFAULT_GROUND_STATIONS)
    )

    def _elevation_angle(
        self,
        sat_lat: float, sat_lon: float, sat_alt_km: float,
        gs_lat: float, gs_lon: float,
    ) -> float:
        """Calculate topocentric elevation angle of spacecraft from ground station."""
        dlat = math.radians(sat_lat - gs_lat)
        dlon = math.radians(sat_lon - gs_lon)
        lat1 = math.radians(gs_lat)
        lat2 = math.radians(sat_lat)

        # Haversine central angle calculation
        a = (
            math.sin(dlat / 2.0) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0) ** 2
        )
        central_angle = 2.0 * math.atan2(math.sqrt(max(0.0, a)), math.sqrt(max(0.0, 1.0 - a)))

        r_e = R_EARTH_KM
        r_sat = r_e + sat_alt_km
        if central_angle < 1e-10:
            return 90.0

        el = math.degrees(
            math.atan2(
                math.cos(central_angle) - (r_e / r_sat),
                math.sin(central_angle),
            )
        )
        return el

    def _slant_range_km(self, altitude_km: float, elevation_deg: float) -> float:
        """Calculate line-of-sight slant range from ground station to spacecraft."""
        r_e = R_EARTH_KM
        r_sat = r_e + altitude_km
        el_rad = math.radians(max(0.0, elevation_deg))
        cos_el = math.cos(el_rad)
        sin_el = math.sin(el_rad)
        discrim = (r_sat ** 2) - ((r_e * cos_el) ** 2)
        if discrim < 0:
            return altitude_km
        return math.sqrt(discrim) - (r_e * sin_el)

    def find_active_station(
        self,
        sat_lat: float,
        sat_lon: float,
        sat_alt_km: float,
    ) -> tuple[Optional[GroundStation], float]:
        """Find the best visible ground station with elevation above its horizon mask."""
        best_station: Optional[GroundStation] = None
        best_elevation = -90.0

        for gs in self.ground_stations:
            el = self._elevation_angle(
                sat_lat=sat_lat,
                sat_lon=sat_lon,
                sat_alt_km=sat_alt_km,
                gs_lat=gs.latitude_deg,
                gs_lon=gs.longitude_deg,
            )
            if el >= gs.min_elevation_deg and el > best_elevation:
                best_elevation = el
                best_station = gs

        return best_station, best_elevation

    def collect_data(self, amount_mb: float) -> float:
        """Legacy helper: add data to the comms tracking buffer."""
        available = self.config.data_buffer_capacity_mb - self.state.data_buffer_mb
        stored = min(amount_mb, max(0.0, available))
        self.state.data_buffer_mb += stored
        self.state.data_collected_mb += stored
        return stored

    def step(
        self,
        dt_seconds: float,
        sat_lat: float,
        sat_lon: float,
        sat_alt_km: float,
        transmitting: bool = True,
        storage_model: Optional[StorageModel] = None,
        pointing_error_deg: float = 0.0,
    ) -> CommsState:
        """
        Advance communications model by dt_seconds.

        Evaluates:
        1. Ground station geometric contact.
        2. Antenna pointing beam alignment (interrupted if error > threshold).
        3. Dynamic bandwidth scaling with elevation angle and slant range FSPL.
        4. Prioritized downlink (alerts first, then processed products, then raw).
        5. Telecommand uplink queue consumption.
        """
        station, elevation = self.find_active_station(sat_lat, sat_lon, sat_alt_km)
        in_contact = station is not None
        active_name = station.name if station else ""

        # Check antenna pointing constraints
        effective_error = max(pointing_error_deg, self.config.current_pointing_error_deg)
        pointing_valid = effective_error <= self.config.max_pointing_error_deg

        data_rate = 0.0
        signal_dbm = -200.0
        slant_km = 0.0
        interrupted = False

        if in_contact and station is not None:
            slant_km = self._slant_range_km(sat_alt_km, elevation)
            slant_m = slant_km * 1e3

            # Free-space path loss (FSPL): FSPL = 20*log10(4*pi*d / lambda)
            freq_hz = self.config.frequency_ghz * 1e9
            wavelength = SPEED_OF_LIGHT / freq_hz
            if slant_m > 0:
                fspl_db = 20.0 * math.log10(4.0 * math.pi * slant_m / wavelength)
            else:
                fspl_db = 0.0

            tx_power_dbm = 10.0 * math.log10(max(1.0, self.config.transmit_power_w) * 1000.0)
            signal_dbm = (
                tx_power_dbm
                + self.config.antenna_gain_dbi
                + station.receive_gain_dbi
                - fspl_db
            )

            # Bandwidth scales smoothly with elevation above mask (full rate at >= 30°)
            elevation_scale = min(1.0, max(0.1, elevation / 30.0))

            if transmitting and pointing_valid:
                data_rate = station.data_rate_mbps * elevation_scale
                downlink_capacity_mb = (data_rate * dt_seconds) / 8.0  # Mbps to MB

                if storage_model is not None:
                    # Priority extraction from storage model:
                    extracted = storage_model.extract_downlink_data(downlink_capacity_mb)
                    self.state.alerts_downlinked_mb += extracted["alerts"]
                    self.state.processed_downlinked_mb += extracted["processed"]
                    self.state.raw_downlinked_mb += extracted["raw"]
                    actual_downlink = extracted["total"]
                    self.state.data_downlinked_mb += actual_downlink
                    self.state.data_buffer_mb = storage_model.state.used_mb
                else:
                    # Fallback buffer downlink
                    actual_downlink = min(downlink_capacity_mb, self.state.data_buffer_mb)
                    self.state.data_buffer_mb -= actual_downlink
                    self.state.data_downlinked_mb += actual_downlink

                # Telecommand uplink during contact
                uplink_kb = (station.uplink_rate_kbps * dt_seconds) / 8.0
                if self.state.telecommand_queue_count > 0:
                    uplinked = min(self.state.telecommand_queue_count, max(1, int(uplink_kb / 5.0)))
                    self.state.telecommand_queue_count -= uplinked
                    self.state.telecommands_received += uplinked
            elif not pointing_valid and transmitting:
                interrupted = True
        elif not in_contact and transmitting and self.state.in_contact:
            # Contact window was just lost mid-transmission
            interrupted = True

        buffer_capacity = storage_model.config.capacity_mb if storage_model else self.config.data_buffer_capacity_mb
        buffer_used = storage_model.state.used_mb if storage_model else self.state.data_buffer_mb
        buffer_pct = (buffer_used / max(1.0, buffer_capacity)) * 100.0

        self.state.in_contact = in_contact
        self.state.active_station = active_name
        self.state.elevation_deg = elevation
        self.state.slant_range_km = slant_km
        self.state.current_data_rate_mbps = data_rate
        self.state.signal_strength_dbm = signal_dbm
        self.state.data_buffer_mb = buffer_used
        self.state.data_buffer_pct = buffer_pct
        self.state.buffer_full_warning = buffer_pct > 90.0
        self.state.transmission_interrupted = interrupted

        return self.state
