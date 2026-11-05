/**
 * LumenOS Canonical Domain Interfaces & API Contracts (Version 1).
 *
 * Synchronized with backend Pydantic models in api/models/canonical.py.
 * Covers all 26 canonical schemas with strict typing:
 *   1. Spacecraft
 *   2. Component
 *   3. Launcher
 *   4. Orbit
 *   5. Instrument
 *   6. MissionScenario
 *   7. MissionContract
 *   8. Objective
 *   9. GameSession
 *   10. MissionState
 *   11. PlayerAction
 *   12. ActionConsequence
 *   13. MissionEvent
 *   14. EventChoice
 *   15. Telemetry
 *   16. ScoreResult
 *   17. PlayerProgress
 *   18. Achievement
 *   19. Unlock
 *   20. MultiplayerRoom
 *   21. Participant
 *   22. PlayerRole
 *   23. RolePermission
 *   24. CommandRequest
 *   25. CommandResult
 *   26. SessionSnapshot
 */

export const API_VERSION = "v1";

// ── 1. Enums ─────────────────────────────────────────────────────────────────

export type PlayerRole =
  | "mission_director"
  | "systems_engineer"
  | "science_officer"
  | "flight_controller";

export type SubsystemType =
  | "power"
  | "thermal"
  | "comms"
  | "propulsion"
  | "avionics"
  | "payload"
  | "structure";

export type InstrumentType =
  | "thermal_infrared"
  | "synthetic_aperture_radar"
  | "uv_spectrometer"
  | "multispectral_imager"
  | "optical_camera"
  | "magnetometer";

export type OrbitType =
  | "leo"
  | "sso"
  | "polar"
  | "equatorial"
  | "high_inclination"
  | "meo"
  | "geo";

export type DifficultyLevel =
  | "cadet"
  | "engineer"
  | "specialist"
  | "commander"
  | "legendary";

export type MissionStatus =
  | "pending"
  | "configuring"
  | "validating"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export type OutcomeType = "win" | "partial_success" | "failure";

export type EventSeverity = "info" | "warning" | "critical";

export type EventResolutionState =
  | "untriggered"
  | "pending"
  | "resolved"
  | "expired";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export type RoomPhase = "lobby" | "briefing" | "playing" | "finished";

export type DataProvenance =
  | "reference"
  | "simulated"
  | "ai_prediction"
  | "ground_truth";

export type Grade =
  | "A+"
  | "A"
  | "A-"
  | "B+"
  | "B"
  | "B-"
  | "C+"
  | "C"
  | "C-"
  | "D"
  | "F";

// ── 2. Spacecraft Components, Instruments & Launchers ────────────────────────

export interface Component {
  id: string;
  name: string;
  subsystem: SubsystemType;
  mass_kg: number;
  power_draw_w: number;
  power_generation_w: number;
  cost_credits: number;
  required_level: number;
  health_pct: number;
  is_locked: boolean;
  specs?: Record<string, unknown>;
}

export interface Instrument {
  id: string;
  name: string;
  instrument_type: InstrumentType;
  mass_kg: number;
  power_draw_w: number;
  data_rate_kbps: number;
  resolution_m?: number;
  field_of_view_deg?: number;
  cost_credits: number;
  is_active: boolean;
  health_pct: number;
}

export interface Launcher {
  id: string;
  name: string;
  max_payload_leo_kg: number;
  max_payload_sso_kg: number;
  fairing_diameter_m: number;
  launch_cost_budget: number;
  reliability_pct: number;
  unlocked: boolean;
}

export interface Orbit {
  altitude_km: number;
  semi_major_axis_km: number;
  eccentricity: number;
  inclination_deg: number;
  raan_deg: number;
  arg_periapsis_deg: number;
  true_anomaly_deg: number;
  period_minutes: number;
  orbit_type: OrbitType;
}

export interface PowerSubsystem {
  solar_panel_area_m2: number;
  battery_capacity_wh: number;
}

export interface ThermalSubsystem {
  radiator_area_m2: number;
}

export interface CommsSubsystem {
  antenna_gain_dbi: number;
  transmit_power_w: number;
}

export interface PropulsionSubsystem {
  isp_s: number;
  thrust_n: number;
}

export interface PayloadSubsystem {
  payload_type: string;
  mass_kg: number;
  power_w: number;
}

export interface StructureSubsystem {
  dry_mass_kg: number;
  fuel_mass_kg: number;
}

export interface Spacecraft {
  id: string;
  name: string;
  description: string;
  structure: StructureSubsystem;
  power: PowerSubsystem;
  thermal: ThermalSubsystem;
  comms: CommsSubsystem;
  propulsion: PropulsionSubsystem;
  payload: PayloadSubsystem;
  components: Component[];
  instruments: Instrument[];
  total_mass_kg: number;
  mass_budget_kg: number;
  power_budget_w: number;
  thermal_margin_pct: number;
  created_at: string;
  updated_at: string;
}

// ── 3. Objectives & Conditions ───────────────────────────────────────────────

export interface Objective {
  id: string;
  description: string;
  is_primary: boolean;
  metric: string;
  target_value: number;
  current_value: number;
  unit: string;
  weight: number;
  partial_threshold: number;
  is_complete: boolean;
  fraction: number;
}

export interface WinCondition {
  min_primary_completion_pct: number;
  min_overall_score_pct: number;
}

export interface FailCondition {
  budget_exceeded: boolean;
  deadline_exceeded: boolean;
  spacecraft_destroyed: boolean;
  min_health_pct: number;
}

export interface RewardRules {
  xp_base: number;
  credits_base: number;
  bonus_multiplier_per_star: number;
}

// ── 4. Mission Events, Choices & Actions ─────────────────────────────────────

export interface EventChoice {
  id: string;
  label: string;
  description: string;
  role_required?: PlayerRole;
  cost_budget: number;
  effects: Record<string, number>;
  risk_description: string;
}

export interface ActionConsequence {
  action_id: string;
  success: boolean;
  error?: string;
  effects: Record<string, number>;
  budget_spent: number;
  budget_remaining: number;
  message: string;
  state_delta: Record<string, unknown>;
}

export interface MissionEvent {
  event_id: string;
  template_id: string;
  name: string;
  seed: number;
  severity: EventSeverity;
  cue: string;
  context_explanation: string;
  trigger_conditions: Record<string, unknown>;
  probability: number;
  earliest_step: number;
  latest_step: number;
  choices: EventChoice[];
  allowed_roles: PlayerRole[];
  time_limit_steps?: number;
  triggered_step?: number;
  deadline_step?: number;
  resolution_state: EventResolutionState;
  chosen_choice_id?: string;
  consequence?: ActionConsequence;
}

export interface PlayerAction {
  action_id: string;
  step: number;
  player_id: string;
  role: PlayerRole;
  action_type: string;
  params: Record<string, unknown>;
  budget_cost: number;
  timestamp: number;
}

// ── 5. Mission Contract & Scenario ───────────────────────────────────────────

export interface MissionEnvironment {
  solar_flux_w_m2: number;
  albedo: number;
  earth_ir_w_m2: number;
  magnetic_field_active: boolean;
  atmosphere_drag: boolean;
}

export interface MissionScenario {
  id: string;
  name: string;
  codename: string;
  description: string;
  difficulty: number;
  icon: string;
  orbit_target: Orbit;
  duration_hours: number;
  recommended_payload: string;
  environment: MissionEnvironment;
  tags: string[];
}

export interface MissionContract {
  mission_id: string;
  mission_name: string;
  story_context: string;
  difficulty: DifficultyLevel;
  deadline_steps: number;
  deadline_hours: number;
  mission_budget: number;
  allowed_components: string[];
  locked_components: string[];
  risk_level: string;
  primary_objectives: Objective[];
  optional_objectives: Objective[];
  win_condition: WinCondition;
  fail_condition: FailCondition;
  partial_threshold: number;
  event_pool: MissionEvent[];
  reward_rules: RewardRules;
  seed: number;
}

// ── 6. Telemetry & Scoring ───────────────────────────────────────────────────

export interface OrbitalTelemetry {
  altitude_km: number;
  velocity_km_s: number;
  latitude_deg: number;
  longitude_deg: number;
  in_eclipse: boolean;
  true_anomaly_deg: number;
}

export interface PowerTelemetry {
  solar_output_w: number;
  total_load_w: number;
  net_power_w: number;
  battery_soc_pct: number;
  in_eclipse: boolean;
  low_power_warning: boolean;
  power_critical: boolean;
}

export interface ThermalTelemetry {
  temperature_c: number;
  heat_input_w: number;
  heat_rejected_w: number;
  overtemp_warning: boolean;
  undertemp_warning: boolean;
}

export interface CommsTelemetry {
  data_collected_mb: number;
  data_downlinked_mb: number;
  data_buffer_mb: number;
  data_buffer_pct: number;
  in_contact: boolean;
  active_station: string;
  signal_strength_dbm: number;
  buffer_full_warning: boolean;
}

export interface WorkloadTelemetry {
  cpu_usage_pct: number;
  processing_queue_items: number;
  cpu_overload_warning: boolean;
}

export interface StorageTelemetry {
  used_pct: number;
  used_mb: number;
  free_mb: number;
  storage_full_warning: boolean;
}

export interface Telemetry {
  step: number;
  elapsed_seconds: number;
  timestamp_utc?: string;
  status: string;
  spacecraft_health_pct: number;
  orbital: OrbitalTelemetry;
  power: PowerTelemetry;
  thermal: ThermalTelemetry;
  comms: CommsTelemetry;
  workload: WorkloadTelemetry;
  storage: StorageTelemetry;
  provenance: DataProvenance;
}

export interface ScoreCategoryBreakdown {
  category: string;
  weighted_score: number;
  max_possible: number;
  explanation: string;
}

export interface ScoreResult {
  session_id: string;
  total_score: number;
  max_score: number;
  score_fraction: number;
  grade: Grade;
  categories: ScoreCategoryBreakdown[];
  objectives_met: number;
  objectives_total: number;
  events_handled_well: number;
  provenance: DataProvenance;
}

// ── 7. Player Progression, Achievements & Unlocks ────────────────────────────

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked_at?: string;
  is_unlocked: boolean;
  xp_reward: number;
  credits_reward: number;
}

export interface Unlock {
  id: string;
  name: string;
  category: string;
  required_level: number;
  credits_cost: number;
  is_unlocked: boolean;
  description: string;
}

export interface PlayerProgress {
  player_id: string;
  callsign: string;
  rank: string;
  level: number;
  xp: number;
  xp_to_next_level: number;
  engineering_credits: number;
  missions_completed: number;
  missions_won: number;
  achievements: Achievement[];
  unlocked_component_ids: string[];
}

// ── 8. Multiplayer Rooms, Participants & Roles ───────────────────────────────

export interface RolePermission {
  role: PlayerRole;
  action_type: string;
  can_execute: boolean;
  requires_approval: boolean;
  description: string;
}

export interface Participant {
  player_id: string;
  display_name: string;
  is_host: boolean;
  assigned_roles: PlayerRole[];
  connection_status: ConnectionStatus;
  is_ready: boolean;
  last_ping: number;
  permissions: RolePermission[];
}

export interface MultiplayerRoom {
  version: string;
  room_code: string;
  host_id: string;
  host_name: string;
  phase: RoomPhase;
  participants: Participant[];
  session_id?: string;
  mission_id: string;
  created_at: number;
}

// ── 9. Live Mission State, Snapshot & Game Session ───────────────────────────

export interface SimulationClock {
  step: number;
  elapsed_seconds: number;
  time_step_seconds: number;
  max_steps: number;
}

export interface MissionState {
  session_id: string;
  step: number;
  elapsed_seconds: number;
  status: MissionStatus;
  budget_total: number;
  budget_remaining: number;
  spacecraft_health_pct: number;
  data_collected_mb: number;
  data_downlinked_mb: number;
  current_score: number;
  objectives: Objective[];
  active_events: MissionEvent[];
  telemetry?: Telemetry;
  outcome?: OutcomeType;
}

export interface SessionSnapshot {
  version: string;
  session_id: string;
  step: number;
  elapsed_seconds: number;
  mission_status: MissionStatus;
  spacecraft_health_pct: number;
  budget_remaining: number;
  objectives: Objective[];
  active_events: MissionEvent[];
  telemetry?: Telemetry;
  recent_actions: PlayerAction[];
  current_score: number;
  provenance: DataProvenance;
}

export interface GameSession {
  version: string;
  session_id: string;
  mission_id: string;
  seed: number;
  spacecraft: Spacecraft;
  contract: MissionContract;
  simulation_clock: SimulationClock;
  mission_state: MissionState;
  action_history: PlayerAction[];
  telemetry_history: Telemetry[];
  result?: ScoreResult;
  created_at: number;
}

// ── 10. Versioned Command Protocol ───────────────────────────────────────────

export interface CommandRequest {
  version: string;
  request_id: string;
  session_id: string;
  player_id: string;
  role: PlayerRole;
  command_type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface CommandResult {
  version: string;
  request_id: string;
  command_type: string;
  success: boolean;
  error_code?: string;
  error_message?: string;
  state_snapshot?: SessionSnapshot;
  consequence?: ActionConsequence;
  timestamp: number;
}
