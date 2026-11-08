"""
Fault Injection & Educational Recovery — Subsystem fault modeling and recovery actions.

Provides controllable, understandable fault injection into spacecraft subsystems
with transparent physical impacts and clear, educational recovery pathways.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from api.models.mission import EventSeverity


class FaultType(str, Enum):
    """Supported spacecraft fault types."""
    SENSOR_DEGRADED = "sensor_degraded"
    BATTERY_CELL_DEGRADED = "battery_cell_degraded"
    RADIATOR_STUCK = "radiator_stuck"
    ATTITUDE_POINTING_DRIFT = "attitude_pointing_drift"
    CPU_PROCESS_HUNG = "cpu_process_hung"
    TRANSMITTER_OVERHEAT = "transmitter_overheat"
    STORAGE_CORRUPT = "storage_corrupt"


class SystemFault(BaseModel):
    """
    A spacecraft subsystem fault instance.
    
    Contains clear educational cues, causal explanation, physical effects,
    and valid operator recovery pathways.
    """
    fault_id: str = Field(default_factory=lambda: f"flt_{uuid4().hex[:8]}")
    fault_type: FaultType
    subsystem: str = Field(description="'payload', 'power', 'thermal', 'adcs', 'cdh', 'comms', 'storage'")
    severity: EventSeverity = EventSeverity.WARNING
    name: str
    description: str
    cue: str
    injected_step: int = 0
    active: bool = True
    resolved: bool = False
    resolved_step: Optional[int] = None
    resolution_action: Optional[str] = None
    
    # Concrete physical impact deltas
    effects: dict[str, Any] = Field(default_factory=dict)
    
    # Recommended educational recovery actions
    recommended_recovery: list[str] = Field(default_factory=list)
    explanation: str = ""


FAULT_TEMPLATES: dict[FaultType, dict[str, Any]] = {
    FaultType.SENSOR_DEGRADED: {
        "name": "Optical Sensor Calibration Drift",
        "subsystem": "payload",
        "severity": EventSeverity.WARNING,
        "description": "Earth observation payload optics experienced thermal shock, degrading resolution and data quality.",
        "cue": "TELEMETRY ALERT: Payload detector SNR dropped by 45%. Science capture efficiency degraded.",
        "effects": {
            "payload_data_rate_multiplier": 0.5,
            "data_quality_penalty": 0.3,
        },
        "recommended_recovery": [
            "reduce_workload",
            "adjust_observation_plan",
            "reset_fault",
        ],
        "explanation": "Cycling sensor power or re-calibrating in sunlight can restore nominal detector calibration.",
    },
    FaultType.BATTERY_CELL_DEGRADED: {
        "name": "Battery Cell Voltage Drop",
        "subsystem": "power",
        "severity": EventSeverity.CRITICAL,
        "description": "Lithium-ion battery cell block experienced internal resistance spike, limiting discharge capacity.",
        "cue": "POWER CRITICAL: Battery block 2 under-voltage. Usable capacity dropped by 35%.",
        "effects": {
            "battery_capacity_multiplier": 0.65,
            "max_discharge_w_multiplier": 0.60,
        },
        "recommended_recovery": [
            "enter_safe_mode",
            "reduce_workload",
            "delay_noncritical_processing",
        ],
        "explanation": "Immediate load shedding protects the remaining cells from permanent deep-discharge damage.",
    },
    FaultType.RADIATOR_STUCK: {
        "name": "Radiator Thermal Louver Jam",
        "subsystem": "thermal",
        "severity": EventSeverity.CRITICAL,
        "description": "Thermal rejection louver jammed at partial aperture, reducing deep-space radiative area.",
        "cue": "THERMAL WARNING: Radiator effective area reduced by 40%. Bus temperature rising toward 50°C.",
        "effects": {
            "radiator_area_multiplier": 0.60,
            "temperature_drift_rate_c": 0.25,
        },
        "recommended_recovery": [
            "adjust_radiator",
            "enter_safe_mode",
            "reduce_workload",
        ],
        "explanation": "Reducing internal electrical dissipation and slewing spacecraft to cold-space orientation prevents thermal runaway.",
    },
    FaultType.ATTITUDE_POINTING_DRIFT: {
        "name": "Star Tracker Glint / Reaction Wheel Drift",
        "subsystem": "adcs",
        "severity": EventSeverity.WARNING,
        "description": "Reaction wheel momentum bias produced a 12° pointing offset from Earth-nadir.",
        "cue": "ATTITUDE ALERT: Pointing error 12.4° exceeds 5° comms threshold. Ground link disrupted.",
        "effects": {
            "pointing_error_deg": 12.4,
            "comms_interrupted": True,
        },
        "recommended_recovery": [
            "use_later_pass",
            "requeue_data",
            "reset_fault",
        ],
        "explanation": "Desaturating reaction wheels or commanding an attitude re-alignment restores ground antenna pointing.",
    },
    FaultType.CPU_PROCESS_HUNG: {
        "name": "Flight Computer Task Queue Lockup",
        "subsystem": "cdh",
        "severity": EventSeverity.WARNING,
        "description": "Unchecked compression process triggered memory thrashing, locking CPU usage at 100%.",
        "cue": "PROCESSOR WARNING: CPU utilization 100%. Telemetry processing backlog accumulating rapidly.",
        "effects": {
            "cpu_usage_override_pct": 100.0,
            "cpu_power_w_extra": 25.0,
            "data_processing_stalled": True,
        },
        "recommended_recovery": [
            "reduce_workload",
            "delay_noncritical_processing",
            "reset_fault",
        ],
        "explanation": "Switching to ECO profile or restarting the flight computer software clears hung background processes.",
    },
    FaultType.TRANSMITTER_OVERHEAT: {
        "name": "RF S-Band Transmitter Thermal Excursion",
        "subsystem": "comms",
        "severity": EventSeverity.WARNING,
        "description": "Power amplifier heatsink saturated during continuous ground station downlink.",
        "cue": "COMMS WARNING: Transmitter temperature 72°C. RF output throttled to protect power amplifier.",
        "effects": {
            "current_data_rate_multiplier": 0.4,
            "transmitter_extra_heat_w": 15.0,
        },
        "recommended_recovery": [
            "use_later_pass",
            "requeue_data",
            "enter_safe_mode",
        ],
        "explanation": "Suspending transmission allows the amplifier heatsink to cool down before the next orbital pass.",
    },
    FaultType.STORAGE_CORRUPT: {
        "name": "Flash Memory Storage Sector Glitch",
        "subsystem": "storage",
        "severity": EventSeverity.WARNING,
        "description": "Single-event upset caused bad block error in solid-state flash memory queue.",
        "cue": "STORAGE WARNING: Flash sector checksum error. 200 MB raw buffer locked pending purge.",
        "effects": {
            "storage_locked_mb": 200.0,
        },
        "recommended_recovery": [
            "purge_storage",
            "requeue_data",
            "reset_fault",
        ],
        "explanation": "Purging corrupted sectors or re-queueing data clears bad memory blocks.",
    },
}


def create_fault(
    fault_type: FaultType | str,
    step: int = 0,
    custom_severity: Optional[EventSeverity] = None,
    custom_effects: Optional[dict[str, Any]] = None,
) -> SystemFault:
    """Factory to create a populated SystemFault instance from templates."""
    if isinstance(fault_type, str):
        fault_type = FaultType(fault_type)
        
    tmpl = FAULT_TEMPLATES.get(fault_type, {})
    effects = dict(tmpl.get("effects", {}))
    if custom_effects:
        effects.update(custom_effects)
        
    return SystemFault(
        fault_type=fault_type,
        subsystem=tmpl.get("subsystem", "payload"),
        severity=custom_severity or tmpl.get("severity", EventSeverity.WARNING),
        name=tmpl.get("name", fault_type.value),
        description=tmpl.get("description", ""),
        cue=tmpl.get("cue", ""),
        injected_step=step,
        active=True,
        effects=effects,
        recommended_recovery=list(tmpl.get("recommended_recovery", [])),
        explanation=tmpl.get("explanation", ""),
    )

