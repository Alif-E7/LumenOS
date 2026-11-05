"""
LumenOS Canonical Domain Models, Game State, Roles, and API Contracts.

This module defines the 26 canonical typed domain schemas for the platform:
  1. Spacecraft
  2. Component
  3. Launcher
  4. Orbit
  5. Instrument
  6. MissionScenario
  7. MissionContract
  8. Objective
  9. GameSession
  10. MissionState
  11. PlayerAction
  12. ActionConsequence
  13. MissionEvent
  14. EventChoice
  15. Telemetry
  16. ScoreResult
  17. PlayerProgress
  18. Achievement
  19. Unlock
  20. MultiplayerRoom
  21. Participant
  22. PlayerRole
  23. RolePermission
  24. CommandRequest
  25. CommandResult
  26. SessionSnapshot

All contracts are versioned ("v1") and strictly validated.
Mission budget (contract constraint) is maintained completely separate from
earned Engineering Credits (progression currency).
"""

from __future__ import annotations

import math
import time
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

# ── 1. Enums ─────────────────────────────────────────────────────────────────

API_VERSION = "v1"


class PlayerRole(str, Enum):
    """The four distinct orbital mission disciplines."""
    MISSION_DIRECTOR = "mission_director"
    SYSTEMS_ENGINEER = "systems_engineer"
    SCIENCE_OFFICER = "science_officer"
    FLIGHT_CONTROLLER = "flight_controller"


class SubsystemType(str, Enum):
    """Subsystem classification for spacecraft components."""
    POWER = "power"
    THERMAL = "thermal"
    COMMS = "comms"
    PROPULSION = "propulsion"
    AVIONICS = "avionics"
    PAYLOAD = "payload"
    STRUCTURE = "structure"


class InstrumentType(str, Enum):
    """Supported science sensor and payload types."""
    THERMAL_INFRARED = "thermal_infrared"
    SYNTHETIC_APERTURE_RADAR = "synthetic_aperture_radar"
    UV_SPECTROMETER = "uv_spectrometer"
    MULTISPECTRAL_IMAGER = "multispectral_imager"
    OPTICAL_CAMERA = "optical_camera"
    MAGNETOMETER = "magnetometer"


class OrbitType(str, Enum):
    """Orbital regime classification."""
    LEO = "leo"
    SSO = "sso"
    POLAR = "polar"
    EQUATORIAL = "equatorial"
    HIGH_INCLINATION = "high_inclination"
    MEO = "meo"
    GEO = "geo"


class DifficultyLevel(str, Enum):
    """Mission difficulty tiers."""
    CADET = "cadet"          # 1
    ENGINEER = "engineer"    # 2
    SPECIALIST = "specialist"  # 3
    COMMANDER = "commander"  # 4
    LEGENDARY = "legendary"  # 5


class MissionStatus(str, Enum):
    """Mission operational phase."""
    PENDING = "pending"
    CONFIGURING = "configuring"
    VALIDATING = "validating"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class OutcomeType(str, Enum):
    """Final mission outcome."""
    WIN = "win"
    PARTIAL_SUCCESS = "partial_success"
    FAILURE = "failure"


class EventSeverity(str, Enum):
    """Severity of a mission event."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class EventResolutionState(str, Enum):
    """Lifecycle state of an event."""
    UNTRIGGERED = "untriggered"
    PENDING = "pending"
    RESOLVED = "resolved"
    EXPIRED = "expired"


class ConnectionStatus(str, Enum):
    """Multiplayer participant connection state."""
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    DISCONNECTED = "disconnected"


class RoomPhase(str, Enum):
    """Multiplayer room lifecycle phase."""
    LOBBY = "lobby"
    BRIEFING = "briefing"
    PLAYING = "playing"
    FINISHED = "finished"


class DataProvenance(str, Enum):
    """Strict data lineage tracking."""
    REFERENCE = "reference"
    SIMULATED = "simulated"
    AI_PREDICTION = "ai_prediction"
    GROUND_TRUTH = "ground_truth"


class Grade(str, Enum):
    """Evaluation grade."""
    A_PLUS = "A+"
    A = "A"
    A_MINUS = "A-"
    B_PLUS = "B+"
    B = "B"
    B_MINUS = "B-"
    C_PLUS = "C+"
    C = "C"
    C_MINUS = "C-"
    D = "D"
    F = "F"


# ── 2. Spacecraft Components, Instruments & Launchers ────────────────────────

class Component(BaseModel):
    """A physical hardware component installed on a spacecraft bus."""
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    subsystem: SubsystemType
    mass_kg: float = Field(..., gt=0.0, description="Mass in kg")
    power_draw_w: float = Field(default=0.0, ge=0.0, description="Power consumed when active")
    power_generation_w: float = Field(default=0.0, ge=0.0, description="Power generated (e.g. solar)")
    cost_credits: int = Field(default=0, ge=0, description="Engineering credits required to purchase/unlock")
    required_level: int = Field(default=1, ge=1)
    health_pct: float = Field(default=100.0, ge=0.0, le=100.0)
    is_locked: bool = False
    specs: dict[str, Any] = Field(default_factory=dict)


class Instrument(BaseModel):
    """A scientific payload instrument designed to collect mission observations."""
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    instrument_type: InstrumentType
    mass_kg: float = Field(..., gt=0.0)
    power_draw_w: float = Field(..., ge=0.0)
    data_rate_kbps: float = Field(default=100.0, ge=0.0)
    resolution_m: Optional[float] = Field(default=None, gt=0.0)
    field_of_view_deg: Optional[float] = Field(default=None, gt=0.0, le=180.0)
    cost_credits: int = Field(default=0, ge=0)
    is_active: bool = True
    health_pct: float = Field(default=100.0, ge=0.0, le=100.0)


class Launcher(BaseModel):
    """Launch vehicle specification providing orbit insertion."""
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    max_payload_leo_kg: float = Field(..., gt=0.0)
    max_payload_sso_kg: float = Field(..., gt=0.0)
    fairing_diameter_m: float = Field(..., gt=0.0)
    launch_cost_budget: float = Field(..., ge=0.0, description="Deducted from Mission Budget")
    reliability_pct: float = Field(default=98.0, ge=50.0, le=100.0)
    unlocked: bool = True


class Orbit(BaseModel):
    """Keplerian orbit definition with calculated period."""
    altitude_km: float = Field(..., ge=100.0, le=50000.0)
    semi_major_axis_km: float = Field(default=0.0, ge=0.0)
    eccentricity: float = Field(default=0.0, ge=0.0, lt=1.0)
    inclination_deg: float = Field(..., ge=0.0, le=180.0)
    raan_deg: float = Field(default=0.0, ge=0.0, lt=360.0)
    arg_periapsis_deg: float = Field(default=0.0, ge=0.0, lt=360.0)
    true_anomaly_deg: float = Field(default=0.0, ge=0.0, lt=360.0)
    period_minutes: float = Field(default=0.0, ge=0.0)
    orbit_type: OrbitType = OrbitType.SSO

    @model_validator(mode="after")
    def compute_orbital_mechanics(self) -> Orbit:
        mu = 398600.4418  # Earth GM km^3/s^2
        r_earth = 6378.137  # Earth equator radius km
        if self.semi_major_axis_km <= 0.0:
            self.semi_major_axis_km = r_earth + self.altitude_km
        if self.period_minutes <= 0.0:
            period_sec = 2.0 * math.pi * math.sqrt((self.semi_major_axis_km ** 3) / mu)
            self.period_minutes = round(period_sec / 60.0, 2)
        return self


# ── Subsystem Data Schemas ───────────────────────────────────────────────────

class PowerSubsystem(BaseModel):
    solar_panel_area_m2: float = Field(default=6.0, ge=0.5, le=100.0)
    battery_capacity_wh: float = Field(default=2000.0, ge=100.0, le=50000.0)


class ThermalSubsystem(BaseModel):
    radiator_area_m2: float = Field(default=2.0, ge=0.1, le=50.0)


class CommsSubsystem(BaseModel):
    antenna_gain_dbi: float = Field(default=25.0, ge=1.0, le=60.0)
    transmit_power_w: float = Field(default=10.0, ge=0.5, le=200.0)


class PropulsionSubsystem(BaseModel):
    isp_s: float = Field(default=220.0, ge=50.0, le=5000.0)
    thrust_n: float = Field(default=1.0, ge=0.001, le=5000.0)


class PayloadSubsystem(BaseModel):
    payload_type: str = "thermal_infrared"
    mass_kg: float = Field(default=30.0, ge=1.0, le=500.0)
    power_w: float = Field(default=80.0, ge=1.0, le=2000.0)


class StructureSubsystem(BaseModel):
    dry_mass_kg: float = Field(default=500.0, ge=10.0, le=10000.0)
    fuel_mass_kg: float = Field(default=50.0, ge=0.0, le=5000.0)


class Spacecraft(BaseModel):
    """Complete canonical Spacecraft entity with integrated mass and power budgets."""
    id: str = Field(default_factory=lambda: f"sc_{uuid4().hex[:8]}")
    name: str = Field(..., min_length=1, max_length=120)
    description: str = ""
    structure: StructureSubsystem = Field(default_factory=StructureSubsystem)
    power: PowerSubsystem = Field(default_factory=PowerSubsystem)
    thermal: ThermalSubsystem = Field(default_factory=ThermalSubsystem)
    comms: CommsSubsystem = Field(default_factory=CommsSubsystem)
    propulsion: PropulsionSubsystem = Field(default_factory=PropulsionSubsystem)
    payload: PayloadSubsystem = Field(default_factory=PayloadSubsystem)
    components: list[Component] = Field(default_factory=list)
    instruments: list[Instrument] = Field(default_factory=list)
    total_mass_kg: float = Field(default=0.0, ge=0.0)
    mass_budget_kg: float = Field(default=1000.0, gt=0.0)
    power_budget_w: float = Field(default=500.0, gt=0.0)
    thermal_margin_pct: float = Field(default=20.0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="after")
    def calculate_total_mass(self) -> Spacecraft:
        comp_mass = sum(c.mass_kg for c in self.components)
        inst_mass = sum(i.mass_kg for i in self.instruments)
        self.total_mass_kg = round(
            self.structure.dry_mass_kg
            + self.structure.fuel_mass_kg
            + self.payload.mass_kg
            + comp_mass
            + inst_mass,
            2,
        )
        return self


# ── 3. Objectives & Conditions ───────────────────────────────────────────────

class Objective(BaseModel):
    """Measurable mission objective with real-time target tracking."""
    id: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    is_primary: bool = True
    metric: str = Field(default="", description="Key tracked by simulation (e.g. data_downlinked_mb)")
    target_value: float = Field(default=1.0, ge=0.0)
    current_value: float = Field(default=0.0, ge=0.0)
    unit: str = ""
    weight: float = Field(default=1.0, ge=0.0)
    partial_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    is_complete: bool = False
    fraction: float = Field(default=0.0, ge=0.0, le=1.0)

    def update_progress(self, value: float) -> None:
        self.current_value = max(0.0, value)
        if self.target_value > 0.0:
            self.fraction = min(1.0, round(self.current_value / self.target_value, 4))
        else:
            self.fraction = 1.0
        self.is_complete = self.fraction >= 1.0


class WinCondition(BaseModel):
    min_primary_completion_pct: float = Field(default=1.0, ge=0.0, le=1.0)
    min_overall_score_pct: float = Field(default=0.6, ge=0.0, le=1.0)


class FailCondition(BaseModel):
    budget_exceeded: bool = True
    deadline_exceeded: bool = True
    spacecraft_destroyed: bool = True
    min_health_pct: float = Field(default=0.0, ge=0.0, le=100.0)


class RewardRules(BaseModel):
    xp_base: int = Field(default=500, ge=0)
    credits_base: int = Field(default=250, ge=0)
    bonus_multiplier_per_star: float = Field(default=0.25, ge=0.0)


# ── 4. Mission Events, Choices & Actions ─────────────────────────────────────

class EventChoice(BaseModel):
    """A choice available to players in response to a MissionEvent."""
    id: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    description: str
    role_required: Optional[PlayerRole] = None
    cost_budget: float = Field(default=0.0, ge=0.0, description="Mission budget cost")
    effects: dict[str, float] = Field(default_factory=dict)
    risk_description: str = ""


class ActionConsequence(BaseModel):
    """Concrete consequence resulting from a player action or event choice."""
    action_id: str
    success: bool
    error: Optional[str] = None
    effects: dict[str, float] = Field(default_factory=dict)
    budget_spent: float = Field(default=0.0, ge=0.0)
    budget_remaining: float = Field(default=0.0)
    message: str = ""
    state_delta: dict[str, Any] = Field(default_factory=dict)


class MissionEvent(BaseModel):
    """Seeded, dynamic mission challenge or anomaly."""
    event_id: str = Field(default_factory=lambda: f"evt_{uuid4().hex[:8]}")
    template_id: str = ""
    name: str = Field(..., min_length=1)
    seed: int = 42
    severity: EventSeverity = EventSeverity.INFO
    cue: str = Field(..., description="Player-facing alert banner text")
    context_explanation: str = Field(default="", description="Educational science/operational background")
    trigger_conditions: dict[str, Any] = Field(default_factory=dict)
    probability: float = Field(default=0.1, ge=0.0, le=1.0)
    earliest_step: int = Field(default=0, ge=0)
    latest_step: int = Field(default=-1)
    choices: list[EventChoice] = Field(default_factory=list)
    allowed_roles: list[PlayerRole] = Field(default_factory=list)
    time_limit_steps: Optional[int] = Field(default=5, ge=1)
    triggered_step: Optional[int] = None
    deadline_step: Optional[int] = None
    resolution_state: EventResolutionState = EventResolutionState.UNTRIGGERED
    chosen_choice_id: Optional[str] = None
    consequence: Optional[ActionConsequence] = None

    @property
    def is_pending(self) -> bool:
        return self.resolution_state == EventResolutionState.PENDING


class PlayerAction(BaseModel):
    """An action submitted by a player/role to modify simulation or game state."""
    action_id: str = Field(default_factory=lambda: f"act_{uuid4().hex[:8]}")
    step: int = Field(default=0, ge=0)
    player_id: str
    role: PlayerRole
    action_type: str
    params: dict[str, Any] = Field(default_factory=dict)
    budget_cost: float = Field(default=0.0, ge=0.0)
    timestamp: float = Field(default_factory=time.time)


# ── 5. Mission Contract & Scenario ───────────────────────────────────────────

class MissionEnvironment(BaseModel):
    solar_flux_w_m2: float = 1361.0
    albedo: float = 0.3
    earth_ir_w_m2: float = 237.0
    magnetic_field_active: bool = False
    atmosphere_drag: bool = True


class MissionScenario(BaseModel):
    """Data-driven scenario definition for the four mission types."""
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    codename: str = ""
    description: str = ""
    difficulty: int = Field(ge=1, le=5)
    icon: str = "🛰️"
    orbit_target: Orbit
    duration_hours: float = Field(gt=0.0)
    recommended_payload: str = "thermal_infrared"
    environment: MissionEnvironment = Field(default_factory=MissionEnvironment)
    tags: list[str] = Field(default_factory=list)


class MissionContract(BaseModel):
    """
    The binding mission contract governing a play session.

    NOTE: mission_budget is strictly the constraint within this simulation session.
    Earned Engineering Credits are modeled separately in PlayerProgress.
    """
    mission_id: str = Field(..., min_length=1)
    mission_name: str = Field(..., min_length=1)
    story_context: str = Field(default="", description="Narrative setting for this mission")
    difficulty: DifficultyLevel = DifficultyLevel.ENGINEER
    deadline_steps: int = Field(default=1440, ge=1)
    deadline_hours: float = Field(default=24.0, gt=0.0)
    mission_budget: float = Field(default=10000.0, ge=0.0, description="Session budget limit")
    allowed_components: list[str] = Field(default_factory=list)
    locked_components: list[str] = Field(default_factory=list)
    risk_level: str = "moderate"
    primary_objectives: list[Objective] = Field(default_factory=list)
    optional_objectives: list[Objective] = Field(default_factory=list)
    win_condition: WinCondition = Field(default_factory=WinCondition)
    fail_condition: FailCondition = Field(default_factory=FailCondition)
    partial_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    event_pool: list[MissionEvent] = Field(default_factory=list)
    reward_rules: RewardRules = Field(default_factory=RewardRules)
    seed: int = 42

    @property
    def all_objectives(self) -> list[Objective]:
        return self.primary_objectives + self.optional_objectives


# ── 6. Telemetry & Scoring ───────────────────────────────────────────────────

class OrbitalTelemetry(BaseModel):
    altitude_km: float
    velocity_km_s: float
    latitude_deg: float
    longitude_deg: float
    in_eclipse: bool
    true_anomaly_deg: float


class PowerTelemetry(BaseModel):
    solar_output_w: float
    total_load_w: float
    net_power_w: float
    battery_soc_pct: float = Field(ge=0.0, le=100.0)
    in_eclipse: bool
    low_power_warning: bool
    power_critical: bool


class ThermalTelemetry(BaseModel):
    temperature_c: float
    heat_input_w: float
    heat_rejected_w: float
    overtemp_warning: bool
    undertemp_warning: bool


class CommsTelemetry(BaseModel):
    data_collected_mb: float = Field(ge=0.0)
    data_downlinked_mb: float = Field(ge=0.0)
    data_buffer_mb: float = Field(ge=0.0)
    data_buffer_pct: float = Field(ge=0.0, le=100.0)
    in_contact: bool
    active_station: str = ""
    signal_strength_dbm: float
    buffer_full_warning: bool


class WorkloadTelemetry(BaseModel):
    cpu_usage_pct: float = Field(ge=0.0, le=100.0)
    processing_queue_items: int = Field(ge=0)
    cpu_overload_warning: bool


class StorageTelemetry(BaseModel):
    used_pct: float = Field(ge=0.0, le=100.0)
    used_mb: float = Field(ge=0.0)
    free_mb: float = Field(ge=0.0)
    storage_full_warning: bool


class Telemetry(BaseModel):
    """Canonical physics telemetry snapshot."""
    step: int = Field(ge=0)
    elapsed_seconds: float = Field(ge=0.0)
    timestamp_utc: Optional[str] = None
    status: str = "running"
    spacecraft_health_pct: float = Field(default=100.0, ge=0.0, le=100.0)
    orbital: OrbitalTelemetry
    power: PowerTelemetry
    thermal: ThermalTelemetry
    comms: CommsTelemetry
    workload: WorkloadTelemetry
    storage: StorageTelemetry
    provenance: DataProvenance = DataProvenance.SIMULATED


class ScoreCategoryBreakdown(BaseModel):
    category: str
    weighted_score: float = Field(ge=0.0)
    max_possible: float = Field(gt=0.0)
    explanation: str = ""


class ScoreResult(BaseModel):
    """Post-mission scoring result."""
    session_id: str
    total_score: float = Field(ge=0.0)
    max_score: float = Field(gt=0.0)
    score_fraction: float = Field(ge=0.0, le=1.0)
    grade: Grade
    categories: list[ScoreCategoryBreakdown]
    objectives_met: int = Field(default=0, ge=0)
    objectives_total: int = Field(default=0, ge=0)
    events_handled_well: int = Field(default=0, ge=0)
    provenance: DataProvenance = DataProvenance.SIMULATED


# ── 7. Player Progression, Achievements & Unlocks ────────────────────────────

class Achievement(BaseModel):
    """Milestone badge earned through accomplishments."""
    id: str
    title: str
    description: str
    icon: str = "🏆"
    unlocked_at: Optional[datetime] = None
    is_unlocked: bool = False
    xp_reward: int = Field(default=100, ge=0)
    credits_reward: int = Field(default=0, ge=0)


class Unlock(BaseModel):
    """Unlockable spacecraft component or capability."""
    id: str
    name: str
    category: str
    required_level: int = Field(default=1, ge=1)
    credits_cost: int = Field(default=0, ge=0)
    is_unlocked: bool = False
    description: str = ""


class PlayerProgress(BaseModel):
    """
    Player career profile.

    Maintains earned Engineering Credits separately from per-mission budgets.
    """
    player_id: str
    callsign: str
    rank: str = "Cadet Operator"
    level: int = Field(default=1, ge=1)
    xp: int = Field(default=0, ge=0)
    xp_to_next_level: int = Field(default=500, ge=1)
    engineering_credits: int = Field(default=1000, ge=0, description="Career credits")
    missions_completed: int = Field(default=0, ge=0)
    missions_won: int = Field(default=0, ge=0)
    achievements: list[Achievement] = Field(default_factory=list)
    unlocked_component_ids: list[str] = Field(default_factory=list)


# ── 8. Multiplayer Rooms, Participants & Roles ───────────────────────────────

class RolePermission(BaseModel):
    """Specific permission granted to a role."""
    role: PlayerRole
    action_type: str
    can_execute: bool = True
    requires_approval: bool = False
    description: str = ""


class Participant(BaseModel):
    """An individual human participant connected to a shared mission room."""
    player_id: str
    display_name: str = Field(..., min_length=1, max_length=30)
    is_host: bool = False
    assigned_roles: list[PlayerRole] = Field(default_factory=list)
    connection_status: ConnectionStatus = ConnectionStatus.CONNECTED
    is_ready: bool = False
    last_ping: float = Field(default_factory=time.time)
    permissions: list[RolePermission] = Field(default_factory=list)


class MultiplayerRoom(BaseModel):
    """A private co-op multiplayer session room."""
    version: str = API_VERSION
    room_code: str = Field(..., min_length=4, max_length=10)
    host_id: str
    host_name: str
    phase: RoomPhase = RoomPhase.LOBBY
    participants: list[Participant] = Field(default_factory=list)
    session_id: Optional[str] = None
    mission_id: str = "wildfire"
    created_at: float = Field(default_factory=time.time)


# ── 9. Live Mission State, Snapshot & Game Session ───────────────────────────

class SimulationClock(BaseModel):
    step: int = Field(default=0, ge=0)
    elapsed_seconds: float = Field(default=0.0, ge=0.0)
    time_step_seconds: float = Field(default=60.0, gt=0.0)
    max_steps: int = Field(default=1440, ge=1)


class MissionState(BaseModel):
    """Authoritative real-time operational state of the mission."""
    session_id: str
    step: int = Field(default=0, ge=0)
    elapsed_seconds: float = Field(default=0.0, ge=0.0)
    status: MissionStatus = MissionStatus.RUNNING
    budget_total: float = Field(default=10000.0, ge=0.0)
    budget_remaining: float = Field(default=10000.0)
    spacecraft_health_pct: float = Field(default=100.0, ge=0.0, le=100.0)
    data_collected_mb: float = Field(default=0.0, ge=0.0)
    data_downlinked_mb: float = Field(default=0.0, ge=0.0)
    current_score: float = Field(default=0.0)
    objectives: list[Objective] = Field(default_factory=list)
    active_events: list[MissionEvent] = Field(default_factory=list)
    telemetry: Optional[Telemetry] = None
    outcome: Optional[OutcomeType] = None


class SessionSnapshot(BaseModel):
    """Versioned state snapshot for client synchronization and reconnects."""
    version: str = API_VERSION
    session_id: str
    step: int = Field(ge=0)
    elapsed_seconds: float = Field(ge=0.0)
    mission_status: MissionStatus
    spacecraft_health_pct: float = Field(ge=0.0, le=100.0)
    budget_remaining: float
    objectives: list[Objective] = Field(default_factory=list)
    active_events: list[MissionEvent] = Field(default_factory=list)
    telemetry: Optional[Telemetry] = None
    recent_actions: list[PlayerAction] = Field(default_factory=list)
    current_score: float = 0.0
    provenance: DataProvenance = DataProvenance.SIMULATED


class GameSession(BaseModel):
    """
    The canonical shared session model.

    Represents the shared mission independently from individual connected participants.
    """
    version: str = API_VERSION
    session_id: str = Field(default_factory=lambda: f"ses_{uuid4().hex[:12]}")
    mission_id: str
    seed: int = 42
    spacecraft: Spacecraft
    contract: MissionContract
    simulation_clock: SimulationClock = Field(default_factory=SimulationClock)
    mission_state: MissionState
    action_history: list[PlayerAction] = Field(default_factory=list)
    telemetry_history: list[Telemetry] = Field(default_factory=list)
    result: Optional[ScoreResult] = None
    created_at: float = Field(default_factory=time.time)


# ── 10. Versioned Command Protocol ───────────────────────────────────────────

class CommandRequest(BaseModel):
    """Versioned client-to-server command submission envelope."""
    version: str = API_VERSION
    request_id: str = Field(default_factory=lambda: f"req_{uuid4().hex[:8]}")
    session_id: str
    player_id: str
    role: PlayerRole
    command_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: float = Field(default_factory=time.time)


class CommandResult(BaseModel):
    """Authoritative server-to-client command response envelope."""
    version: str = API_VERSION
    request_id: str
    command_type: str
    success: bool
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    state_snapshot: Optional[SessionSnapshot] = None
    consequence: Optional[ActionConsequence] = None
    timestamp: float = Field(default_factory=time.time)


# ── 11. Role Permission Matrix & Role Bundling ───────────────────────────────

CANONICAL_ROLE_ACTIONS: dict[PlayerRole, set[str]] = {
    PlayerRole.MISSION_DIRECTOR: {
        "allocate_budget",
        "set_priority",
        "respond_to_event",
        "request_ai_prediction",
        "set_control_mode",
    },
    PlayerRole.SYSTEMS_ENGINEER: {
        "toggle_subsystem",
        "set_power_mode",
        "adjust_thermal",
        "repair_subsystem",
        "set_control_mode",
    },
    PlayerRole.SCIENCE_OFFICER: {
        "collect_data",
        "schedule_observation",
        "downlink_data",
        "set_control_mode",
    },
    PlayerRole.FLIGHT_CONTROLLER: {
        "adjust_orbit",
        "fire_thruster",
        "set_attitude",
        "set_control_mode",
    },
}


def check_canonical_permission(role: PlayerRole, action_type: str) -> bool:
    """Evaluate if role has permission to trigger action_type."""
    allowed = CANONICAL_ROLE_ACTIONS.get(role, set())
    return action_type in allowed


def get_canonical_permissions(role: PlayerRole) -> list[RolePermission]:
    """Retrieve full permission list for a role."""
    actions = CANONICAL_ROLE_ACTIONS.get(role, set())
    return [
        RolePermission(
            role=role,
            action_type=action,
            can_execute=True,
            requires_approval=(action == "allocate_budget"),
            description=f"Action '{action}' executable by {role.value}",
        )
        for action in sorted(actions)
    ]


def assign_canonical_roles(player_ids: list[str]) -> dict[str, list[PlayerRole]]:
    """
    Deterministically bundle all 4 roles across 1-4 players so that
    no critical role action becomes impossible in a smaller group.

    - 1 player:  Player gets all 4 roles.
    - 2 players: P1 = [Director, Science], P2 = [Flight, Systems]
    - 3 players: P1 = [Director, Science], P2 = [Flight], P3 = [Systems]
    - 4 players: 1 role each
    """
    n = len(player_ids)
    if n < 1 or n > 4:
        raise ValueError(f"Player count must be 1 to 4, got {n}")

    if n == 1:
        return {
            player_ids[0]: [
                PlayerRole.MISSION_DIRECTOR,
                PlayerRole.SYSTEMS_ENGINEER,
                PlayerRole.SCIENCE_OFFICER,
                PlayerRole.FLIGHT_CONTROLLER,
            ]
        }
    if n == 2:
        return {
            player_ids[0]: [PlayerRole.MISSION_DIRECTOR, PlayerRole.SCIENCE_OFFICER],
            player_ids[1]: [PlayerRole.FLIGHT_CONTROLLER, PlayerRole.SYSTEMS_ENGINEER],
        }
    if n == 3:
        return {
            player_ids[0]: [PlayerRole.MISSION_DIRECTOR, PlayerRole.SCIENCE_OFFICER],
            player_ids[1]: [PlayerRole.FLIGHT_CONTROLLER],
            player_ids[2]: [PlayerRole.SYSTEMS_ENGINEER],
        }
    return {
        player_ids[0]: [PlayerRole.MISSION_DIRECTOR],
        player_ids[1]: [PlayerRole.FLIGHT_CONTROLLER],
        player_ids[2]: [PlayerRole.SYSTEMS_ENGINEER],
        player_ids[3]: [PlayerRole.SCIENCE_OFFICER],
    }


def validate_role_distribution(roles_by_player: dict[str, list[PlayerRole]]) -> bool:
    """
    Verify that all 4 roles are assigned across the active participants.
    Returns True if complete coverage is achieved.
    """
    covered = set()
    for roles in roles_by_player.values():
        for r in roles:
            covered.add(r)
    return len(covered) == 4
