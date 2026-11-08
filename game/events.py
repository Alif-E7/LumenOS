"""
Event Director — Seeded event scheduling with cue→choice→consequence pipeline.

Events are drawn from two sources:
  1. System/Physics Triggers — Dynamic events evaluated from physical telemetry
     (eclipse, observation opportunity, high workload, communication window/outage,
     battery low, thermal warning, storage backlog, environmental hazard, instrument faults).
  2. Mission Event Pool — Seeded scenario-specific narrative events.

Fair event rules:
  - No more than MAX_CONCURRENT_EVENTS active at once
  - Cooldown period between events of the same type
  - Critical events have a minimum spacing
  - Events respect their earliest/latest step windows
"""

from __future__ import annotations

import copy
import random
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from api.models.mission import EventSeverity, MissionEventTemplate, EventChoice


# ── Event lifecycle ──────────────────────────────────────────────────────────


class EventPhase(str, Enum):
    """Phases of the event lifecycle."""
    CUE = "cue"                           # Event just triggered, alerting crew
    AWAITING_CHOICE = "awaiting_choice"   # Waiting for player decision
    RESOLVED = "resolved"                 # Player made a choice (or auto-resolved)
    EXPIRED = "expired"                   # Auto-resolved after deadline timeout


class EventType(str, Enum):
    """Categorization of mission events."""
    ECLIPSE = "eclipse"
    OBSERVATION_OPPORTUNITY = "observation_opportunity"
    HIGH_WORKLOAD = "high_workload"
    COMMUNICATION_WINDOW = "communication_window"
    COMMUNICATION_OUTAGE = "communication_outage"
    BATTERY_LOW = "battery_low"
    THERMAL_WARNING = "thermal_warning"
    STORAGE_BACKLOG = "storage_backlog"
    ENVIRONMENTAL_HAZARD = "environmental_hazard"
    INSTRUMENT_SYSTEM_FAULT = "instrument_system_fault"
    MISSION_TEMPLATE = "mission_template"


class ActiveEvent(BaseModel):
    """A live event instance in the game."""
    event_id: str
    template_id: str
    event_type: str = EventType.MISSION_TEMPLATE.value
    name: str
    description: str
    cue: str = ""
    severity: EventSeverity
    phase: EventPhase = EventPhase.CUE
    triggered_step: int
    deadline_step: int
    choices: list[EventChoice] = Field(default_factory=list)
    chosen_id: Optional[str] = None
    effects_applied: dict[str, float] = Field(default_factory=dict)
    auto_resolve_steps: int = 5
    resolution_reason: str = ""

    @property
    def is_pending(self) -> bool:
        return self.phase in (EventPhase.CUE, EventPhase.AWAITING_CHOICE)


class EventConsequence(BaseModel):
    """The result of resolving an event."""
    event_id: str
    choice_id: Optional[str]
    choice_label: str
    effects: dict[str, float]
    description: str


# ── Fair event rules ─────────────────────────────────────────────────────────

MAX_CONCURRENT_EVENTS = 3
MIN_CRITICAL_SPACING = 60    # minimum steps between critical events
EVENT_COOLDOWN = 30          # minimum steps between same-type events


# ── Event Director ───────────────────────────────────────────────────────────


class EventDirector:
    """
    Manages the event lifecycle for a mission.

    Uses a seeded RNG for deterministic event scheduling.
    Enforces fair event rules to prevent event-storming.
    Evaluates both physical telemetry triggers and mission template pools.
    """

    def __init__(
        self,
        event_pool: list[MissionEventTemplate],
        seed: int = 42,
        max_steps: int = 1440,
    ):
        self._pool = {e.id: e for e in event_pool}
        self._rng = random.Random(seed)
        self._seed = seed
        self._max_steps = max_steps

        # State
        self._active_events: list[ActiveEvent] = []
        self._resolved_events: list[ActiveEvent] = []
        self._event_counter = 0
        self._last_trigger_by_template: dict[str, int] = {}
        self._last_trigger_by_type: dict[str, int] = {}
        self._last_critical_step: int = -MIN_CRITICAL_SPACING

        # Physical telemetry tracking (to detect edge-triggers)
        self._was_in_eclipse: bool = False
        self._was_in_contact: bool = False
        self._known_fault_ids: set[str] = set()

    @property
    def active_events(self) -> list[ActiveEvent]:
        return list(self._active_events)

    @property
    def resolved_events(self) -> list[ActiveEvent]:
        return list(self._resolved_events)

    @property
    def all_events(self) -> list[ActiveEvent]:
        return self._active_events + self._resolved_events

    def tick(
        self,
        current_step: int,
        sim_snapshot: Optional[Any] = None,
        active_faults: Optional[list[Any]] = None,
    ) -> list[ActiveEvent]:
        """
        Advance the event system by one step.

        Evaluates:
        1. Auto-resolving expired events.
        2. System / physics triggers based on sim_snapshot and active faults.
        3. Mission template pool draws via seeded RNG.
        Returns newly triggered events this step.
        """
        new_events: list[ActiveEvent] = []

        # 1. Auto-resolve expired events
        self._auto_resolve_expired(current_step)

        # 2. Check system/physics triggers
        if sim_snapshot is not None and len(self._active_events) < MAX_CONCURRENT_EVENTS:
            system_events = self._check_system_triggers(current_step, sim_snapshot, active_faults or [])
            for evt in system_events:
                if len(self._active_events) >= MAX_CONCURRENT_EVENTS:
                    break
                self._active_events.append(evt)
                new_events.append(evt)
                self._last_trigger_by_type[evt.event_type] = current_step
                if evt.severity == EventSeverity.CRITICAL:
                    self._last_critical_step = current_step

        # 3. Try to trigger template events from the mission pool
        if len(self._active_events) < MAX_CONCURRENT_EVENTS:
            for template in self._pool.values():
                if self._should_trigger(template, current_step):
                    event = self._create_event(template, current_step)
                    self._active_events.append(event)
                    new_events.append(event)
                    self._last_trigger_by_template[template.id] = current_step
                    self._last_trigger_by_type[event.event_type] = current_step
                    if template.severity == EventSeverity.CRITICAL:
                        self._last_critical_step = current_step

                    if len(self._active_events) >= MAX_CONCURRENT_EVENTS:
                        break

        return new_events

    def resolve_event(
        self,
        event_id: str,
        choice_id: str,
        actor: str = "operator",
    ) -> Optional[EventConsequence]:
        """
        Resolve an active event with the player's chosen response.

        Returns the consequence, or None if event not found / already resolved.
        """
        for i, event in enumerate(self._active_events):
            if event.event_id == event_id and event.is_pending:
                choice = None
                for c in event.choices:
                    if c.id == choice_id:
                        choice = c
                        break

                if choice is None:
                    return None

                # Apply
                event.chosen_id = choice_id
                event.phase = EventPhase.RESOLVED
                event.effects_applied = dict(choice.effects)
                event.resolution_reason = f"Resolved by {actor}"

                # Move to resolved
                self._active_events.pop(i)
                self._resolved_events.append(event)

                return EventConsequence(
                    event_id=event_id,
                    choice_id=choice_id,
                    choice_label=choice.label,
                    effects=dict(choice.effects),
                    description=choice.description,
                )

        return None

    def _should_trigger(self, template: MissionEventTemplate, step: int) -> bool:
        """Determine if an event template should trigger this step, respecting fair rules."""
        if step < template.earliest_step:
            return False
        if template.latest_step >= 0 and step > template.latest_step:
            return False

        last = self._last_trigger_by_template.get(template.id, -EVENT_COOLDOWN)
        if step - last < EVENT_COOLDOWN:
            return False

        if template.severity == EventSeverity.CRITICAL:
            if step - self._last_critical_step < MIN_CRITICAL_SPACING:
                return False

        if any(e.template_id == template.id and e.is_pending for e in self._active_events):
            return False

        return self._rng.random() < template.probability

    def _create_event(self, template: MissionEventTemplate, step: int) -> ActiveEvent:
        """Create a new ActiveEvent instance from a template."""
        self._event_counter += 1
        return ActiveEvent(
            event_id=f"evt_{self._event_counter:04d}",
            template_id=template.id,
            event_type=EventType.MISSION_TEMPLATE.value,
            name=template.name,
            description=template.description,
            cue=f"MISSION EVENT: {template.name}",
            severity=template.severity,
            phase=EventPhase.AWAITING_CHOICE,
            triggered_step=step,
            deadline_step=step + template.auto_resolve_steps,
            choices=list(template.choices),
            auto_resolve_steps=template.auto_resolve_steps,
        )

    def _check_system_triggers(
        self,
        step: int,
        snap: Any,
        active_faults: list[Any],
    ) -> list[ActiveEvent]:
        """Evaluate subsystem telemetry and faults to trigger dynamic events."""
        events: list[ActiveEvent] = []

        # Helper to check type cooldown and active existence
        def can_trigger_type(ev_type: EventType, cooldown: int = EVENT_COOLDOWN) -> bool:
            if any(e.event_type == ev_type.value and e.is_pending for e in self._active_events):
                return False
            last_t = self._last_trigger_by_type.get(ev_type.value, -cooldown)
            return (step - last_t) >= cooldown

        # 1. ECLIPSE ENTRY
        in_eclipse = getattr(snap.orbital, "in_eclipse", False) or getattr(snap.power, "in_eclipse", False)
        if in_eclipse and not self._was_in_eclipse and can_trigger_type(EventType.ECLIPSE, 60):
            self._event_counter += 1
            events.append(ActiveEvent(
                event_id=f"evt_{self._event_counter:04d}",
                template_id="sys_eclipse_entry",
                event_type=EventType.ECLIPSE.value,
                name="Eclipse Umbra Transition",
                description="Spacecraft has crossed the solar terminator into Earth's shadow. Solar flux is 0 W/m².",
                cue="SOLAR SENSOR: Solar array generation 0.0 W. Battery discharge initiated.",
                severity=EventSeverity.INFO,
                phase=EventPhase.AWAITING_CHOICE,
                triggered_step=step,
                deadline_step=step + 5,
                choices=[
                    EventChoice(
                        id="conserve_power",
                        label="Enter Low-Power Shed (ECO)",
                        description="Reduce CPU clock and non-essential loads to conserve battery reserves.",
                        effects={"power_mode_eco": 1.0},
                    ),
                    EventChoice(
                        id="maintain_nominal",
                        label="Maintain Operations",
                        description="Continue planned operations relying on full battery reserve.",
                        effects={},
                    ),
                ],
            ))
        self._was_in_eclipse = in_eclipse

        # 2. OBSERVATION OPPORTUNITY (Target in nadir FOV)
        active_targets = getattr(snap, "active_targets", [])
        if active_targets and can_trigger_type(EventType.OBSERVATION_OPPORTUNITY, 45):
            tgt_name = active_targets[0]
            self._event_counter += 1
            events.append(ActiveEvent(
                event_id=f"evt_{self._event_counter:04d}",
                template_id="sys_target_observation",
                event_type=EventType.OBSERVATION_OPPORTUNITY.value,
                name=f"Observation Opportunity: {tgt_name}",
                description=f"Spacecraft nadir swath is currently passing over designated ground target {tgt_name}.",
                cue=f"PAYLOAD FOV: Target {tgt_name} acquired in nadir field of view.",
                severity=EventSeverity.INFO,
                phase=EventPhase.AWAITING_CHOICE,
                triggered_step=step,
                deadline_step=step + 4,
                choices=[
                    EventChoice(
                        id="high_res_capture",
                        label="Capture High-Res Science",
                        description="Execute maximum payload capture, generating priority data products.",
                        effects={"payload_data_rate_multiplier": 1.5},
                    ),
                    EventChoice(
                        id="routine_capture",
                        label="Routine Survey",
                        description="Perform nominal standard capture to preserve storage capacity.",
                        effects={},
                    ),
                ],
            ))

        # 3. HIGH WORKLOAD (CPU > 80% or queue overload)
        cpu_pct = getattr(snap.workload, "cpu_usage_pct", 0.0)
        cpu_warning = getattr(snap.workload, "cpu_overload_warning", False)
        if (cpu_pct >= 80.0 or cpu_warning) and can_trigger_type(EventType.HIGH_WORKLOAD, 40):
            self._event_counter += 1
            events.append(ActiveEvent(
                event_id=f"evt_{self._event_counter:04d}",
                template_id="sys_high_workload",
                event_type=EventType.HIGH_WORKLOAD.value,
                name="Flight Computer Processor Overload",
                description=f"Onboard flight computer CPU load has reached {cpu_pct:.1f}%. Processing queue is backing up.",
                cue=f"CPU METRIC: Processor load at {cpu_pct:.1f}%. Thermal dissipation increasing.",
                severity=EventSeverity.WARNING,
                phase=EventPhase.AWAITING_CHOICE,
                triggered_step=step,
                deadline_step=step + 5,
                choices=[
                    EventChoice(
                        id="reduce_workload",
                        label="Switch to ECO Workload Profile",
                        description="Shed noncritical tasks and throttle processing to lower CPU draw and heat.",
                        effects={"reduce_workload_eco": 1.0},
                    ),
                    EventChoice(
                        id="delay_processing",
                        label="Delay Non-Critical Processing",
                        description="Pause raw image compression until next sunlight pass.",
                        effects={"delay_processing_steps": 10.0},
                    ),
                    EventChoice(
                        id="maintain_workload",
                        label="Maintain High Performance",
                        description="Accept elevated thermal dissipation to clear science queue quickly.",
                        effects={},
                    ),
                ],
            ))

        # 4. COMMUNICATION WINDOW (AOS)
        in_contact = getattr(snap.comms, "in_contact", False)
        station_name = getattr(snap.comms, "active_station", "Ground Station")
        if in_contact and not self._was_in_contact and can_trigger_type(EventType.COMMUNICATION_WINDOW, 45):
            el_deg = getattr(snap.comms, "elevation_deg", 10.0)
            self._event_counter += 1
            events.append(ActiveEvent(
                event_id=f"evt_{self._event_counter:04d}",
                template_id="sys_comms_window",
                event_type=EventType.COMMUNICATION_WINDOW.value,
                name=f"Ground Contact AOS: {station_name}",
                description=f"Acquisition of Signal (AOS) with {station_name} at {el_deg:.1f}° elevation.",
                cue=f"RF COMMS: Carrier locked with {station_name}. Downlink queue active.",
                severity=EventSeverity.INFO,
                phase=EventPhase.AWAITING_CHOICE,
                triggered_step=step,
                deadline_step=step + 5,
                choices=[
                    EventChoice(
                        id="priority_alerts_downlink",
                        label="Prioritize Disaster Alerts",
                        description="Flush urgent hazard alerts before transmitting routine raw data.",
                        effects={"downlink_priority_alerts": 1.0},
                    ),
                    EventChoice(
                        id="dump_all_data",
                        label="Maximum Throughput Dump",
                        description="Transmit all buffered data at maximum transmitter power.",
                        effects={"adjust_transmit_power": 5.0},
                    ),
                ],
            ))
        self._was_in_contact = in_contact

        # 5. COMMUNICATION OUTAGE / POINTING MISALIGNMENT
        transmission_interrupted = getattr(snap.comms, "transmission_interrupted", False)
        if transmission_interrupted and can_trigger_type(EventType.COMMUNICATION_OUTAGE, 30):
            self._event_counter += 1
            events.append(ActiveEvent(
                event_id=f"evt_{self._event_counter:04d}",
                template_id="sys_comms_outage",
                event_type=EventType.COMMUNICATION_OUTAGE.value,
                name="RF Ground Link Interrupted",
                description="Ground transmission halted due to antenna beam pointing misalignment exceeding 5°.",
                cue="RF WARNING: Antenna pointing deviation exceeded 5.0°. Signal carrier lost.",
                severity=EventSeverity.WARNING,
                phase=EventPhase.AWAITING_CHOICE,
                triggered_step=step,
                deadline_step=step + 5,
                choices=[
                    EventChoice(
                        id="reorient_nadir",
                        label="Reorient Attitude to Nadir",
                        description="Command reaction wheels to restore Earth pointing alignment.",
                        effects={"reorient_attitude": 1.0},
                    ),
                    EventChoice(
                        id="use_later_pass",
                        label="Buffer for Next Pass",
                        description="Pause transmission and preserve power until the next ground station window.",
                        effects={"pause_comms": 1.0},
                    ),
                ],
            ))

        # 6. BATTERY LOW
        soc_pct = getattr(snap.power, "battery_soc_pct", 100.0)
        power_critical = getattr(snap.power, "power_critical", False)
        low_power_warning = getattr(snap.power, "low_power_warning", False)
        if (soc_pct <= 25.0 or low_power_warning or power_critical) and can_trigger_type(EventType.BATTERY_LOW, 45):
            is_crit = power_critical or (soc_pct <= 15.0)
            self._event_counter += 1
            events.append(ActiveEvent(
                event_id=f"evt_{self._event_counter:04d}",
                template_id="sys_battery_low",
                event_type=EventType.BATTERY_LOW.value,
                name="Battery Low Voltage Reserve",
                description=f"Battery Depth of Discharge has reached {100.0 - soc_pct:.1f}% (SoC: {soc_pct:.1f}%).",
                cue=f"POWER ALERT: Battery state of charge critical at {soc_pct:.1f}%. Brownout imminent.",
                severity=EventSeverity.CRITICAL if is_crit else EventSeverity.WARNING,
                phase=EventPhase.AWAITING_CHOICE,
                triggered_step=step,
                deadline_step=step + 4,
                choices=[
                    EventChoice(
                        id="enter_safe_mode",
                        label="Enter Spacecraft Safe Mode",
                        description="Shed all payloads, heaters trim, transmitter down to minimal 5W survival mode.",
                        effects={"enter_safe_mode": 1.0},
                    ),
                    EventChoice(
                        id="shed_payload_only",
                        label="Shed Payload Subsystem",
                        description="Disable science instrument only to keep housekeeping active.",
                        effects={"payload_active": 0.0},
                    ),
                    EventChoice(
                        id="maintain_loads",
                        label="Maintain Current Loads",
                        description="Accept extreme risk of battery undervoltage shutdown.",
                        effects={},
                    ),
                ],
            ))

        # 7. THERMAL WARNING
        temp_c = getattr(snap.thermal, "temperature_c", 20.0)
        overtemp = getattr(snap.thermal, "overtemp_warning", False)
        undertemp = getattr(snap.thermal, "undertemp_warning", False)
        thermal_crit = getattr(snap.thermal, "thermal_critical", False)
        if (overtemp or undertemp or thermal_crit) and can_trigger_type(EventType.THERMAL_WARNING, 45):
            self._event_counter += 1
            events.append(ActiveEvent(
                event_id=f"evt_{self._event_counter:04d}",
                template_id="sys_thermal_warning",
                event_type=EventType.THERMAL_WARNING.value,
                name=f"Thermal Excursion ({temp_c:.1f}°C)",
                description=f"Spacecraft bus temperature has reached {temp_c:.1f}°C, outside nominal bounds.",
                cue=f"THERMAL ALERT: Bus temperature {temp_c:.1f}°C triggers thermal limit warning.",
                severity=EventSeverity.CRITICAL if thermal_crit else EventSeverity.WARNING,
                phase=EventPhase.AWAITING_CHOICE,
                triggered_step=step,
                deadline_step=step + 5,
                choices=[
                    EventChoice(
                        id="adjust_radiator_area",
                        label="Increase Radiator Exposure (+0.5 m²)",
                        description="Expose additional radiator area to enhance deep-space radiative cooling.",
                        effects={"adjust_radiator": 0.5},
                    ),
                    EventChoice(
                        id="reduce_internal_power",
                        label="Reduce Internal Heat Dissipation",
                        description="Lower CPU profile to ECO to reduce electrical waste heat.",
                        effects={"reduce_workload_eco": 1.0},
                    ),
                    EventChoice(
                        id="monitor_thermal",
                        label="Monitor Trend",
                        description="Rely on orbital thermal cycle to restore nominal temperatures.",
                        effects={},
                    ),
                ],
            ))

        # 8. STORAGE BACKLOG
        used_pct = getattr(snap.storage, "used_pct", 0.0)
        storage_warning = getattr(snap.storage, "storage_full_warning", False)
        if (used_pct >= 80.0 or storage_warning) and can_trigger_type(EventType.STORAGE_BACKLOG, 40):
            free_mb = getattr(snap.storage, "free_mb", 100.0)
            self._event_counter += 1
            events.append(ActiveEvent(
                event_id=f"evt_{self._event_counter:04d}",
                template_id="sys_storage_backlog",
                event_type=EventType.STORAGE_BACKLOG.value,
                name="Solid-State Data Storage Buffer Backlog",
                description=f"Onboard storage is {used_pct:.1f}% full with only {free_mb:.1f} MB remaining.",
                cue=f"STORAGE ALERT: Buffer capacity {used_pct:.1f}%. Raw observation drops imminent.",
                severity=EventSeverity.WARNING,
                phase=EventPhase.AWAITING_CHOICE,
                triggered_step=step,
                deadline_step=step + 5,
                choices=[
                    EventChoice(
                        id="purge_raw_buffer",
                        label="Purge Uncompressed Raw Buffer",
                        description="Purge 150 MB of raw routine survey data to make room for critical science.",
                        effects={"purge_storage": 150.0},
                    ),
                    EventChoice(
                        id="compress_queue",
                        label="Prioritize Pipeline Compression",
                        description="Run maximum 3:1 data compression on stored raw products.",
                        effects={"pipeline_compress": 1.0},
                    ),
                ],
            ))

        # 9. ENVIRONMENTAL HAZARD (SAA / Solar Radiation)
        in_saa = False
        in_aurora = False
        if hasattr(snap, "radiation_debris") and snap.radiation_debris is not None:
            in_saa = snap.radiation_debris.in_saa_zone
            in_aurora = snap.radiation_debris.in_auroral_horn
        elif hasattr(snap, "environment") and snap.environment is not None:
            in_saa = snap.environment.in_saa
            in_aurora = snap.environment.in_auroral_zone

        if (in_saa or in_aurora) and can_trigger_type(EventType.ENVIRONMENTAL_HAZARD, 60):
            zone_str = "South Atlantic Anomaly (SAA)" if in_saa else "Polar Auroral Horn"
            self._event_counter += 1
            events.append(ActiveEvent(
                event_id=f"evt_{self._event_counter:04d}",
                template_id="sys_radiation_hazard",
                event_type=EventType.ENVIRONMENTAL_HAZARD.value,
                name=f"Radiation Belt Transit: {zone_str}",
                description=f"Spacecraft is transiting the {zone_str}, subjecting electronics to high proton flux.",
                cue=f"RADIATION SENSOR: Elevated particle flux detected in {zone_str}.",
                severity=EventSeverity.WARNING,
                phase=EventPhase.AWAITING_CHOICE,
                triggered_step=step,
                deadline_step=step + 5,
                choices=[
                    EventChoice(
                        id="sensor_standby",
                        label="Protect Sensitive Sensor Arrays",
                        description="Switch optical and imaging payloads to standby mode during radiation transit.",
                        effects={"payload_active": 0.0},
                    ),
                    EventChoice(
                        id="continue_nominal",
                        label="Continue Routine Operations",
                        description="Accept slight single-event upset (SEU) risk to maintain continuous data.",
                        effects={},
                    ),
                ],
            ))

        # 10. SYSTEM FAULT INJECTION (Trigger from active faults)
        for fault in active_faults:
            fid = getattr(fault, "fault_id", str(fault))
            if fid not in self._known_fault_ids:
                self._known_fault_ids.add(fid)
                self._event_counter += 1
                name = getattr(fault, "name", "Subsystem Anomaly")
                desc = getattr(fault, "description", "An active fault has been detected in spacecraft subsystems.")
                cue = getattr(fault, "cue", f"ANOMALY ALERT: {name}")
                sev = getattr(fault, "severity", EventSeverity.WARNING)

                events.append(ActiveEvent(
                    event_id=f"evt_{self._event_counter:04d}",
                    template_id=f"fault_{fid}",
                    event_type=EventType.INSTRUMENT_SYSTEM_FAULT.value,
                    name=f"Anomaly: {name}",
                    description=desc,
                    cue=cue,
                    severity=sev,
                    phase=EventPhase.AWAITING_CHOICE,
                    triggered_step=step,
                    deadline_step=step + 5,
                    choices=[
                        EventChoice(
                            id="safe_recovery",
                            label="Enter Safe Mode & Isolate",
                            description="Immediately shed non-essential loads and run diagnostic telemetry.",
                            effects={"enter_safe_mode": 1.0},
                        ),
                        EventChoice(
                            id="reset_subsystem",
                            label="Reboot & Recalibrate Subsystem",
                            description="Power cycle the faulted subsystem to attempt automated software reset.",
                            effects={"repair_subsystem": 1.0},
                        ),
                    ],
                ))

        return events

    def _auto_resolve_expired(self, current_step: int) -> None:
        """Auto-resolve events that have passed their deadline."""
        still_active: list[ActiveEvent] = []
        for event in self._active_events:
            if event.is_pending and current_step >= event.deadline_step:
                event.phase = EventPhase.EXPIRED
                event.resolution_reason = "Auto-resolved on deadline expiration"
                if event.choices:
                    default = event.choices[0]
                    event.chosen_id = default.id
                    event.effects_applied = dict(default.effects)
                self._resolved_events.append(event)
            else:
                still_active.append(event)
        self._active_events = still_active

    # ── Checkpoint Serialization ─────────────────────────────────────────────

    def to_dict(self) -> dict[str, Any]:
        """Serialize complete EventDirector state for checkpoints."""
        return {
            "seed": self._seed,
            "max_steps": self._max_steps,
            "rng_state": self._rng.getstate(),
            "event_counter": self._event_counter,
            "last_trigger_by_template": dict(self._last_trigger_by_template),
            "last_trigger_by_type": dict(self._last_trigger_by_type),
            "last_critical_step": self._last_critical_step,
            "was_in_eclipse": self._was_in_eclipse,
            "was_in_contact": self._was_in_contact,
            "known_fault_ids": list(self._known_fault_ids),
            "active_events": [e.model_dump() for e in self._active_events],
            "resolved_events": [e.model_dump() for e in self._resolved_events],
        }

    def load_dict(self, data: dict[str, Any]) -> None:
        """Restore EventDirector state from a checkpoint dict."""
        self._seed = data.get("seed", 42)
        self._max_steps = data.get("max_steps", 1440)
        if "rng_state" in data:
            rng_s = data["rng_state"]
            if isinstance(rng_s, (list, tuple)):
                version = rng_s[0]
                internal = tuple(rng_s[1]) if isinstance(rng_s[1], list) else rng_s[1]
                gauss = rng_s[2]
                self._rng.setstate((version, internal, gauss))
            else:
                self._rng.setstate(rng_s)

        self._event_counter = data.get("event_counter", 0)
        self._last_trigger_by_template = dict(data.get("last_trigger_by_template", {}))
        self._last_trigger_by_type = dict(data.get("last_trigger_by_type", {}))
        self._last_critical_step = data.get("last_critical_step", -MIN_CRITICAL_SPACING)
        self._was_in_eclipse = data.get("was_in_eclipse", False)
        self._was_in_contact = data.get("was_in_contact", False)
        self._known_fault_ids = set(data.get("known_fault_ids", []))
        self._active_events = [ActiveEvent.model_validate(e) for e in data.get("active_events", [])]
        self._resolved_events = [ActiveEvent.model_validate(e) for e in data.get("resolved_events", [])]
