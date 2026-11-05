"""
Timeline Event Engine — Deterministic Orbital Forecasting and Epistemic Barrier.

Core Principles:
1. Deterministic Geometry Forecasting:
   - Sunlight/Eclipse ingress/egress, ground station passes (AOS/TCA/LOS), target observation
     swath opportunities, and SAA radiation transits are deterministically predictable from
     Keplerian mechanics over a forward forecast horizon (e.g. 24–48 hours).
2. Epistemic Barrier (No Future Leaks):
   - All deterministic geometric events are tagged `is_forecast=True`.
   - Stochastic anomalies (e.g., solar flares, gyro drift, component degradation, sudden cloud cover)
     are NOT included in the forecast timeline prior to their simulated occurrence time.
     "No controller may receive information unavailable at the simulated time."
"""

from __future__ import annotations

import math
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field

from simulation.physics.orbital import (
    OrbitalModel,
    GroundTarget,
    ObservationWindow,
    ContactWindow,
    EclipseWindow,
)
from simulation.physics.comms import GroundStation, DEFAULT_GROUND_STATIONS


class TimelineEventType(str, Enum):
    # Sunlight & Eclipse
    SUNRISE = "SUNRISE"
    SUNSET = "SUNSET"

    # Ground Station Communication Passes
    GROUND_STATION_AOS = "GROUND_STATION_AOS"
    GROUND_STATION_TCA = "GROUND_STATION_TCA"
    GROUND_STATION_LOS = "GROUND_STATION_LOS"

    # Ground Observation Opportunities
    OBSERVATION_OPPORTUNITY_AOS = "OBSERVATION_OPPORTUNITY_AOS"
    OBSERVATION_OPPORTUNITY_TCA = "OBSERVATION_OPPORTUNITY_TCA"
    OBSERVATION_OPPORTUNITY_LOS = "OBSERVATION_OPPORTUNITY_LOS"

    # Space Environment / Radiation
    RADIATION_SAA_ENTER = "RADIATION_SAA_ENTER"
    RADIATION_SAA_EXIT = "RADIATION_SAA_EXIT"
    RADIATION_AURORAL_ENTER = "RADIATION_AURORAL_ENTER"
    RADIATION_AURORAL_EXIT = "RADIATION_AURORAL_EXIT"

    # In-Flight Stochastic Events (NEVER FORECASTABLE)
    STOCHASTIC_ANOMALY = "STOCHASTIC_ANOMALY"


class TimelineEvent(BaseModel):
    """A scheduled or forecasted event along the mission timeline."""
    event_id: str
    event_type: TimelineEventType
    timestamp_seconds: float
    step: int
    label: str
    description: str
    is_forecast: bool = True
    forecast_confidence: float = 1.0
    target_or_station_id: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)


class TimelineForecastEngine:
    """
    Computes deterministic future timeline events from orbital propagation and ephemeris.
    Enforces the epistemic barrier separating predictable geometry from stochastic anomalies.
    """

    @classmethod
    def generate_forecast(
        cls,
        orbital_model: OrbitalModel,
        ground_stations: Optional[list[GroundStation]] = None,
        targets: Optional[list[GroundTarget]] = None,
        start_seconds: float = 0.0,
        horizon_seconds: float = 86400.0,
        time_step_seconds: float = 60.0,
    ) -> list[TimelineEvent]:
        """
        Generate all deterministic geometric timeline events within [start_seconds, start_seconds + horizon_seconds].
        All produced events have `is_forecast=True` and `forecast_confidence=1.0`.
        """
        stations = ground_stations if ground_stations is not None else DEFAULT_GROUND_STATIONS
        obs_targets = targets or []

        events: list[TimelineEvent] = []

        # 1. Eclipse & Sunlight Ingress/Egress
        eclipse_windows = orbital_model.find_eclipse_windows(
            start_seconds=start_seconds,
            duration_seconds=horizon_seconds,
            dt_step=min(30.0, time_step_seconds),
        )
        for idx, ew in enumerate(eclipse_windows):
            events.append(TimelineEvent(
                event_id=f"sunset_{int(ew.ingress_seconds)}",
                event_type=TimelineEventType.SUNSET,
                timestamp_seconds=ew.ingress_seconds,
                step=int(ew.ingress_seconds / time_step_seconds),
                label="Sunset (Eclipse Ingress)",
                description=f"Spacecraft enters Earth's umbral shadow cone for {ew.duration_seconds / 60.0:.1f} minutes.",
                is_forecast=True,
                forecast_confidence=1.0,
                payload={"duration_seconds": ew.duration_seconds},
            ))
            events.append(TimelineEvent(
                event_id=f"sunrise_{int(ew.egress_seconds)}",
                event_type=TimelineEventType.SUNRISE,
                timestamp_seconds=ew.egress_seconds,
                step=int(ew.egress_seconds / time_step_seconds),
                label="Sunrise (Sunlight Egress)",
                description="Spacecraft emerges from eclipse into direct solar illumination; panels begin generating power.",
                is_forecast=True,
                forecast_confidence=1.0,
                payload={"duration_seconds": ew.duration_seconds},
            ))

        # 2. Ground Station Communication Passes
        for gs in stations:
            contact_windows = orbital_model.find_station_contact_windows(
                station_lat=gs.latitude_deg,
                station_lon=gs.longitude_deg,
                station_name=gs.name,
                min_elevation_deg=gs.min_elevation_deg,
                start_seconds=start_seconds,
                duration_seconds=horizon_seconds,
                dt_step=min(15.0, time_step_seconds),
            )
            for cw in contact_windows:
                events.append(TimelineEvent(
                    event_id=f"gs_aos_{gs.name.lower()}_{int(cw.aos_seconds)}",
                    event_type=TimelineEventType.GROUND_STATION_AOS,
                    timestamp_seconds=cw.aos_seconds,
                    step=int(cw.aos_seconds / time_step_seconds),
                    label=f"AOS {gs.name}",
                    description=f"Acquisition of signal with {gs.name} ground station (min elev {gs.min_elevation_deg}°).",
                    is_forecast=True,
                    forecast_confidence=1.0,
                    target_or_station_id=gs.name,
                    payload={"station": gs.name, "max_elevation_deg": cw.max_elevation_deg, "duration_s": cw.duration_seconds},
                ))
                events.append(TimelineEvent(
                    event_id=f"gs_tca_{gs.name.lower()}_{int(cw.tca_seconds)}",
                    event_type=TimelineEventType.GROUND_STATION_TCA,
                    timestamp_seconds=cw.tca_seconds,
                    step=int(cw.tca_seconds / time_step_seconds),
                    label=f"TCA {gs.name} (El {cw.max_elevation_deg}°)",
                    description=f"Time of closest approach to {gs.name}; maximum elevation reached ({cw.max_elevation_deg}°).",
                    is_forecast=True,
                    forecast_confidence=1.0,
                    target_or_station_id=gs.name,
                    payload={"station": gs.name, "max_elevation_deg": cw.max_elevation_deg, "min_slant_km": cw.min_slant_range_km},
                ))
                events.append(TimelineEvent(
                    event_id=f"gs_los_{gs.name.lower()}_{int(cw.los_seconds)}",
                    event_type=TimelineEventType.GROUND_STATION_LOS,
                    timestamp_seconds=cw.los_seconds,
                    step=int(cw.los_seconds / time_step_seconds),
                    label=f"LOS {gs.name}",
                    description=f"Loss of signal with {gs.name} as spacecraft drops below horizon mask.",
                    is_forecast=True,
                    forecast_confidence=1.0,
                    target_or_station_id=gs.name,
                    payload={"station": gs.name},
                ))

        # 3. Ground Observation Opportunities
        for tgt in obs_targets:
            obs_windows = orbital_model.find_target_observation_windows(
                target=tgt,
                start_seconds=start_seconds,
                duration_seconds=horizon_seconds,
                fov_half_angle_deg=30.0,
                dt_step=min(15.0, time_step_seconds),
            )
            for ow in obs_windows:
                events.append(TimelineEvent(
                    event_id=f"obs_aos_{tgt.target_id}_{int(ow.start_seconds)}",
                    event_type=TimelineEventType.OBSERVATION_OPPORTUNITY_AOS,
                    timestamp_seconds=ow.start_seconds,
                    step=int(ow.start_seconds / time_step_seconds),
                    label=f"Target In View: {tgt.name}",
                    description=f"Target '{tgt.name}' enters instrument nadir observation swath.",
                    is_forecast=True,
                    forecast_confidence=1.0,
                    target_or_station_id=tgt.target_id,
                    payload={"target": tgt.name, "duration_s": ow.duration_seconds},
                ))
                events.append(TimelineEvent(
                    event_id=f"obs_tca_{tgt.target_id}_{int(ow.tca_seconds)}",
                    event_type=TimelineEventType.OBSERVATION_OPPORTUNITY_TCA,
                    timestamp_seconds=ow.tca_seconds,
                    step=int(ow.tca_seconds / time_step_seconds),
                    label=f"Optimal Imaging: {tgt.name}",
                    description=f"Closest nadir pass over '{tgt.name}' (off-nadir angle {ow.min_off_nadir_deg}°).",
                    is_forecast=True,
                    forecast_confidence=1.0,
                    target_or_station_id=tgt.target_id,
                    payload={"target": tgt.name, "min_off_nadir_deg": ow.min_off_nadir_deg},
                ))
                events.append(TimelineEvent(
                    event_id=f"obs_los_{tgt.target_id}_{int(ow.end_seconds)}",
                    event_type=TimelineEventType.OBSERVATION_OPPORTUNITY_LOS,
                    timestamp_seconds=ow.end_seconds,
                    step=int(ow.end_seconds / time_step_seconds),
                    label=f"Target Out of View: {tgt.name}",
                    description=f"Target '{tgt.name}' exits sensor swath.",
                    is_forecast=True,
                    forecast_confidence=1.0,
                    target_or_station_id=tgt.target_id,
                    payload={"target": tgt.name},
                ))

        # 4. SAA Radiation Zone Entry / Exit
        t = start_seconds
        in_saa = False
        saa_start = 0.0
        while t <= start_seconds + horizon_seconds:
            st = orbital_model.propagate(t)
            if st.in_saa and not in_saa:
                in_saa = True
                saa_start = t
                events.append(TimelineEvent(
                    event_id=f"saa_enter_{int(t)}",
                    event_type=TimelineEventType.RADIATION_SAA_ENTER,
                    timestamp_seconds=t,
                    step=int(t / time_step_seconds),
                    label="Enter South Atlantic Anomaly (SAA)",
                    description="Spacecraft enters South Atlantic Anomaly; proton flux increases by 25x (higher SEU risk).",
                    is_forecast=True,
                    forecast_confidence=1.0,
                ))
            elif not st.in_saa and in_saa:
                in_saa = False
                events.append(TimelineEvent(
                    event_id=f"saa_exit_{int(t)}",
                    event_type=TimelineEventType.RADIATION_SAA_EXIT,
                    timestamp_seconds=t,
                    step=int(t / time_step_seconds),
                    label="Exit South Atlantic Anomaly (SAA)",
                    description=f"Spacecraft exits SAA after {(t - saa_start) / 60.0:.1f} minutes; radiation flux returns to nominal.",
                    is_forecast=True,
                    forecast_confidence=1.0,
                ))
            t += 60.0

        # Sort chronologically by timestamp
        events.sort(key=lambda ev: (ev.timestamp_seconds, ev.event_type.value))
        return events

    @classmethod
    def get_next_event(
        cls,
        events: list[TimelineEvent],
        current_time_seconds: float,
        event_type: Optional[TimelineEventType] = None,
    ) -> Optional[TimelineEvent]:
        """Find the earliest event occurring strictly after current_time_seconds."""
        for ev in events:
            if ev.timestamp_seconds > current_time_seconds:
                if event_type is None or ev.event_type == event_type:
                    return ev
        return None

    @classmethod
    def get_events_in_range(
        cls,
        events: list[TimelineEvent],
        start_seconds: float,
        end_seconds: float,
    ) -> list[TimelineEvent]:
        """Filter events occurring within [start_seconds, end_seconds]."""
        return [
            ev for ev in events
            if start_seconds <= ev.timestamp_seconds <= end_seconds
        ]
