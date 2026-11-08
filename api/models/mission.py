"""
Pydantic schemas for Mission definitions and simulation state.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Enums ───────────────────────────────────────────────────────────────────

class MissionStatus(str, Enum):
    PENDING = "pending"
    CONFIGURING = "configuring"
    VALIDATING = "validating"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class ControlMode(str, Enum):
    """How the spacecraft is being controlled during simulation."""
    MANUAL = "manual"
    AUTOPILOT = "autopilot"            # traditional rule-based
    LUMENOS_AI = "lumenos_ai"           # ML-based predictive control


class DataProvenance(str, Enum):
    """Label for every piece of data — never ambiguous."""
    REFERENCE = "reference"             # Published NASA/IAU values
    SIMULATED = "simulated"             # Physics engine output
    AI_PREDICTION = "ai_prediction"     # ML model output
    GROUND_TRUTH = "ground_truth"       # Mission scenario definition


class EventSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


# ── Mission definition (read from YAML configs) ────────────────────────────

class MissionBrief(BaseModel):
    """Summary of a mission for the selection screen."""
    id: str
    name: str
    codename: str
    description: str
    difficulty: int = Field(ge=1, le=5)
    icon: str = "🛰️"
    recommended_payload: str
    orbit_altitude_km: float
    orbit_inclination_deg: float
    duration_hours: float
    tags: list[str] = []


class EventChoice(BaseModel):
    """A player choice in response to an event."""
    id: str
    label: str
    description: str
    effects: dict[str, float] = {}  # key: subsystem parameter, value: delta


class MissionObjective(BaseModel):
    """A single mission objective to be evaluated."""
    id: str
    description: str
    weight: float = Field(default=1.0, ge=0.0)
    target_value: float = Field(default=1.0)
    unit: str = ""
    is_primary: bool = True


class MissionEventTemplate(BaseModel):
    """Template for an event that can occur during the mission."""
    id: str
    name: str
    description: str
    severity: EventSeverity = EventSeverity.INFO
    probability: float = Field(ge=0.0, le=1.0, description="Probability per simulation step")
    earliest_step: int = 0
    latest_step: int = -1  # -1 = any step
    choices: list[EventChoice] = []
    auto_resolve_steps: int = Field(default=5, description="Steps before auto-resolution if no choice made")


class MissionEnvironment(BaseModel):
    """Environmental conditions for the mission scenario."""
    solar_flux_w_m2: float = 1361.0  # REFERENCE: NASA solar constant
    albedo: float = 0.3               # REFERENCE: Earth average
    earth_ir_w_m2: float = 237.0      # REFERENCE: Earth IR emission
    magnetic_field_active: bool = False
    atmosphere_drag: bool = True


class ScoringConfig(BaseModel):
    """How mission success is evaluated."""
    max_score: float = 100.0
    time_bonus_weight: float = 0.1
    data_collected_weight: float = 0.3
    health_maintained_weight: float = 0.3
    objectives_completed_weight: float = 0.3


class MissionDetail(MissionBrief):
    """Full mission definition including objectives, tasks, targets, and event pool."""
    story: str = ""
    budget: float = 10000.0
    objectives: list[MissionObjective] = []
    permitted_components: dict[str, list[str]] = Field(default_factory=dict)
    observation_tasks: list[dict[str, Any]] = Field(default_factory=list)
    targets: list[dict[str, Any]] = Field(default_factory=list)
    role_responsibilities: dict[str, str] = Field(default_factory=dict)
    difficulty_settings: dict[str, Any] = Field(default_factory=dict)
    rewards: dict[str, Any] = Field(default_factory=dict)
    win_condition: dict[str, Any] = Field(default_factory=dict)
    fail_condition: dict[str, Any] = Field(default_factory=dict)
    event_pool: list[MissionEventTemplate] = []
    environment: MissionEnvironment = Field(default_factory=lambda: MissionEnvironment())
    scoring: ScoringConfig = Field(default_factory=lambda: ScoringConfig())


# ── Simulation state ──────────────────────────────────────────────────────

class OrbitalState(BaseModel):
    """Current orbital parameters (Keplerian elements)."""
    semi_major_axis_km: float
    eccentricity: float = 0.0
    inclination_deg: float
    raan_deg: float = 0.0             # right ascension of ascending node
    arg_periapsis_deg: float = 0.0
    true_anomaly_deg: float = 0.0
    altitude_km: float                 # computed from SMA - Re
    latitude_deg: float = 0.0         # sub-satellite point
    longitude_deg: float = 0.0


class SubsystemStatus(BaseModel):
    """Real-time status of a spacecraft subsystem."""
    name: str
    health_pct: float = Field(default=100.0, ge=0.0, le=100.0)
    active: bool = True
    values: dict[str, float] = {}     # subsystem-specific telemetry


class SimulationEvent(BaseModel):
    """An event that occurred during simulation."""
    step: int
    timestamp_sim: float               # simulation seconds elapsed
    event_id: str
    name: str
    description: str
    severity: EventSeverity
    choices: list[EventChoice] = []
    chosen: Optional[str] = None       # choice id selected
    resolved: bool = False
    provenance: DataProvenance = DataProvenance.SIMULATED


class SimulationState(BaseModel):
    """Complete snapshot of a running simulation at a given step."""
    run_id: str
    mission_id: str
    step: int
    elapsed_seconds: float
    seed: int
    control_mode: ControlMode
    status: MissionStatus
    orbital: OrbitalState
    subsystems: dict[str, SubsystemStatus]
    events: list[SimulationEvent] = []
    pending_events: list[SimulationEvent] = []
    data_collected_mb: float = 0.0
    score: float = 0.0
    provenance: DataProvenance = DataProvenance.SIMULATED


# ── Mission run request/response ──────────────────────────────────────────

class MissionRunCreate(BaseModel):
    """Request to start a new simulation run."""
    mission_id: str
    spacecraft_config_id: str
    seed: Optional[int] = None         # None → random seed
    control_mode: ControlMode = ControlMode.MANUAL
    time_step_seconds: float = Field(default=60.0, ge=1.0, le=3600.0)


class MissionRunResponse(BaseModel):
    """Summary of a mission run."""
    id: str
    mission_id: str
    spacecraft_config_id: str
    seed: int
    status: MissionStatus
    score: Optional[float] = None
    summary: str = ""
    created_at: datetime
    completed_at: Optional[datetime] = None


class SimulationStepRequest(BaseModel):
    """Advance the simulation by N steps, optionally with a player action."""
    steps: int = Field(default=1, ge=1, le=1000)
    action: Optional[dict[str, Any]] = None   # player action payload
    event_choice_id: Optional[str] = None      # response to a pending event


class MissionReportResponse(BaseModel):
    """Post-mission analysis report."""
    run_id: str
    mission_id: str
    final_score: float
    grade: str                         # A+ through F
    objectives: list[ObjectiveResult]
    timeline: list[SimulationEvent]
    statistics: dict[str, float]
    provenance: DataProvenance = DataProvenance.SIMULATED


class ObjectiveResult(BaseModel):
    """Result of a single mission objective."""
    objective_id: str
    description: str
    target_value: float
    achieved_value: float
    score: float
    passed: bool
