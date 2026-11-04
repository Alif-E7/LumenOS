"""
Communications Subsystem Model — Ground station visibility and data downlink.

Models:
- Ground station contact windows based on orbital position and station coords
- Link budget (simplified) based on distance, antenna gain, transmit power
- Data buffer management (collect → store → downlink)

REFERENCE:
- Speed of light c = 299792458 m/s
- Typical LEO ground station elevation mask = 5°
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

# ── REFERENCE constants ─────────────────────────────────────────────────────

SPEED_OF_LIGHT = 299792458.0   # m/s
BOLTZMANN_K = 1.380649e-23     # J/K
R_EARTH_KM = 6371.0


@dataclass
class GroundStation:
    """A ground station for data downlink."""
    name: str
    latitude_deg: float
    longitude_deg: float
    min_elevation_deg: float = 5.0    # Elevation mask
    receive_gain_dbi: float = 40.0
    data_rate_mbps: float = 10.0      # Max downlink rate


# Standard ground station network
DEFAULT_GROUND_STATIONS = [
    GroundStation("Svalbard", 78.23, 15.39, data_rate_mbps=20.0),
    GroundStation("Fairbanks", 64.86, -147.72, data_rate_mbps=15.0),
    GroundStation("Wallops Island", 37.94, -75.46, data_rate_mbps=10.0),
    GroundStation("McMurdo", -77.85, 166.67, data_rate_mbps=12.0),
    GroundStation("Canberra", -35.40, 148.98, data_rate_mbps=10.0),
]


@dataclass
class CommsConfig:
    """Spacecraft communications subsystem configuration."""
    antenna_gain_dbi: float = 25.0
    transmit_power_w: float = 10.0
    data_buffer_capacity_mb: float = 4000.0   # 4 GB onboard storage
    frequency_ghz: float = 8.2                 # X-band


@dataclass
class CommsState:
    """Communications subsystem state."""
    data_buffer_mb: float = 0.0
    data_buffer_pct: float = 0.0
    data_downlinked_mb: float = 0.0
    data_collected_mb: float = 0.0
    in_contact: bool = False
    active_station: str = ""
    current_data_rate_mbps: float = 0.0
    signal_strength_dbm: float = 0.0
    buffer_full_warning: bool = False


@dataclass
class CommsModel:
    """
    Communications subsystem simulation model.
    
    Deterministic — contact windows depend only on orbital position
    and ground station locations.
    """
    config: CommsConfig = field(default_factory=CommsConfig)
    state: CommsState = field(default_factory=CommsState)
    ground_stations: list[GroundStation] = field(default_factory=lambda: list(DEFAULT_GROUND_STATIONS))

    def _elevation_angle(
        self,
        sat_lat: float, sat_lon: float, sat_alt_km: float,
        gs_lat: float, gs_lon: float,
    ) -> float:
        """
        Approximate elevation angle of the satellite as seen from a ground station.
        Simplified spherical Earth geometry.
        """
        dlat = math.radians(sat_lat - gs_lat)
        dlon = math.radians(sat_lon - gs_lon)
        lat1 = math.radians(gs_lat)
        lat2 = math.radians(sat_lat)

        # Haversine for central angle
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        )
        central_angle = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        # Elevation angle
        r_e = R_EARTH_KM
        r_sat = r_e + sat_alt_km
        if central_angle < 1e-10:
            return 90.0  # directly overhead

        el = math.degrees(
            math.atan2(
                math.cos(central_angle) - r_e / r_sat,
                math.sin(central_angle),
            )
        )
        return el

    def _slant_range_km(self, altitude_km: float, elevation_deg: float) -> float:
        """Slant range from ground station to satellite."""
        r_e = R_EARTH_KM
        r_sat = r_e + altitude_km
        el_rad = math.radians(elevation_deg)
        return math.sqrt(
            r_sat**2 - (r_e * math.cos(el_rad))**2
        ) - r_e * math.sin(el_rad)

    def find_active_station(
        self, sat_lat: float, sat_lon: float, sat_alt_km: float,
    ) -> tuple[GroundStation | None, float]:
        """Find the best visible ground station and its elevation angle."""
        best_station = None
        best_elevation = -90.0

        for gs in self.ground_stations:
            el = self._elevation_angle(sat_lat, sat_lon, sat_alt_km, gs.latitude_deg, gs.longitude_deg)
            if el >= gs.min_elevation_deg and el > best_elevation:
                best_elevation = el
                best_station = gs

        return best_station, best_elevation

    def collect_data(self, amount_mb: float) -> float:
        """Add data to the onboard buffer. Returns amount actually stored."""
        available = self.config.data_buffer_capacity_mb - self.state.data_buffer_mb
        stored = min(amount_mb, available)
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
    ) -> CommsState:
        """Advance comms model by one step."""
        station, elevation = self.find_active_station(sat_lat, sat_lon, sat_alt_km)

        in_contact = station is not None
        active_name = station.name if station else ""
        data_rate = 0.0
        signal_dbm = -200.0

        if in_contact and transmitting and station is not None:
            slant_km = self._slant_range_km(sat_alt_km, elevation)
            slant_m = slant_km * 1e3

            # Free-space path loss (simplified)
            freq_hz = self.config.frequency_ghz * 1e9
            wavelength = SPEED_OF_LIGHT / freq_hz
            if slant_m > 0:
                fspl_db = 20 * math.log10(4 * math.pi * slant_m / wavelength)
            else:
                fspl_db = 0

            tx_power_dbm = 10 * math.log10(self.config.transmit_power_w * 1000)
            signal_dbm = (
                tx_power_dbm
                + self.config.antenna_gain_dbi
                + station.receive_gain_dbi
                - fspl_db
            )

            # Effective data rate scales with elevation (better at higher angles)
            el_factor = min(1.0, elevation / 30.0)  # full rate above 30°
            data_rate = station.data_rate_mbps * el_factor

            # Downlink data
            downlink_mb = data_rate * dt_seconds / 8.0  # bits to bytes
            actual_downlink = min(downlink_mb, self.state.data_buffer_mb)
            self.state.data_buffer_mb -= actual_downlink
            self.state.data_downlinked_mb += actual_downlink

        buffer_pct = (self.state.data_buffer_mb / self.config.data_buffer_capacity_mb) * 100.0

        self.state.in_contact = in_contact
        self.state.active_station = active_name
        self.state.current_data_rate_mbps = data_rate
        self.state.signal_strength_dbm = signal_dbm
        self.state.data_buffer_pct = buffer_pct
        self.state.buffer_full_warning = buffer_pct > 90.0

        return self.state

