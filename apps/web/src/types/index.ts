/**
 * Shared TypeScript types — mirrors the backend Pydantic models.
 * These are the API contracts between frontend and backend.
 */

// ── Spacecraft ──────────────────────────────────────────────────────────────

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

export interface SpacecraftCreate {
  name: string;
  description?: string;
  structure?: StructureSubsystem;
  power?: PowerSubsystem;
  thermal?: ThermalSubsystem;
  comms?: CommsSubsystem;
  propulsion?: PropulsionSubsystem;
  payload?: PayloadSubsystem;
}

export interface SpacecraftResponse {
  id: string;
  name: string;
  description: string;
  structure: StructureSubsystem;
  power: PowerSubsystem;
  thermal: ThermalSubsystem;
  comms: CommsSubsystem;
  propulsion: PropulsionSubsystem;
  payload: PayloadSubsystem;
  total_mass_kg: number;
  created_at: string;
  updated_at: string;
}

export interface SpacecraftValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  mass_budget_kg: number;
  power_budget_w: number;
  thermal_margin_pct: number;
}

// ── Missions ────────────────────────────────────────────────────────────────

export interface MissionBrief {
  id: string;
  name: string;
  codename: string;
  description: string;
  difficulty: number;
  icon: string;
  recommended_payload: string;
  orbit_altitude_km: number;
  orbit_inclination_deg: number;
  duration_hours: number;
  tags: string[];
}

export interface MissionObjective {
  id: string;
  description: string;
  weight: number;
  target_value: number;
  unit: string;
}

export interface EventChoice {
  id: string;
  label: string;
  description: string;
  effects: Record<string, number>;
}

export interface MissionEventTemplate {
  id: string;
  name: string;
  description: string;
  severity: "info" | "warning" | "critical";
  probability: number;
  earliest_step: number;
  latest_step: number;
  choices: EventChoice[];
  auto_resolve_steps: number;
}

export interface MissionEnvironment {
  solar_flux_w_m2: number;
  albedo: number;
  earth_ir_w_m2: number;
  magnetic_field_active: boolean;
  atmosphere_drag: boolean;
}

export interface ScoringConfig {
  max_score: number;
  time_bonus_weight: number;
  data_collected_weight: number;
  health_maintained_weight: number;
  objectives_completed_weight: number;
}

export interface MissionDetail extends MissionBrief {
  objectives: MissionObjective[];
  event_pool: MissionEventTemplate[];
  environment: MissionEnvironment;
  scoring: ScoringConfig;
}

// ── Simulation ──────────────────────────────────────────────────────────────

export type MissionStatus =
  | "pending"
  | "configuring"
  | "validating"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export type ControlMode = "manual" | "autopilot" | "lumenos_ai";

export type DataProvenance =
  | "reference"
  | "simulated"
  | "ai_prediction"
  | "ground_truth";

// ── API Health ──────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
}

// ── Game sessions ───────────────────────────────────────────────────────────

export interface ObjectiveProgress {
  objective_id: string;
  description: string;
  target_value: number;
  current_value: number;
  unit: string;
  weight: number;
  is_primary: boolean;
  fraction: number;
  is_complete: boolean;
}

export interface ActiveEventChoice {
  id: string;
  label: string;
  description: string;
}

export interface ActiveEvent {
  event_id: string;
  name: string;
  description: string;
  severity: "info" | "warning" | "critical";
  phase: string;
  is_pending: boolean;
  triggered_step: number;
  deadline_step: number;
  choices: ActiveEventChoice[];
}

export interface GameStateSummary {
  session_id: string;
  mission_id: string;
  step: number;
  elapsed_seconds: number;
  status: "pending" | "running" | "completed" | "failed";
  budget_remaining: number;
  spacecraft_health_pct: number;
  data_collected_mb: number;
  data_downlinked_mb?: number;
  resolved_event_count?: number;
  current_score: number;
  control_mode: string;
  active_event_count: number;
  objectives_complete: number;
  objectives_total: number;
  outcome: string | null;
  // Full-state extras (GET /game/{id}/state)
  objectives?: ObjectiveProgress[];
  active_events?: ActiveEvent[];
}

export interface GameStartResponse {
  session_id: string;
  mission_id: string;
  mission_name: string;
  seed: number;
  status: string;
  game_state: GameStateSummary;
}

export interface TelemetryEventInfo {
  event_id: string;
  name: string;
  description: string;
  severity: string;
  choices: ActiveEventChoice[];
  deadline_step: number;
}

export interface StepResult {
  step: number;
  elapsed_seconds: number;
  telemetry: Telemetry;
  new_events: TelemetryEventInfo[];
  game_state: GameStateSummary;
}

export interface Telemetry {
  step: number;
  elapsed_seconds: number;
  status: string;
  spacecraft_health_pct: number;
  orbital: {
    altitude_km: number;
    velocity_km_s: number;
    latitude_deg: number;
    longitude_deg: number;
    in_eclipse: boolean;
    true_anomaly_deg: number;
  };
  power: {
    solar_output_w: number;
    total_load_w: number;
    net_power_w: number;
    battery_soc_pct: number;
    in_eclipse: boolean;
    low_power_warning: boolean;
    power_critical: boolean;
  };
  thermal: {
    temperature_c: number;
    heat_input_w: number;
    heat_rejected_w: number;
    overtemp_warning: boolean;
    undertemp_warning: boolean;
  };
  comms: {
    data_buffer_mb: number;
    data_buffer_pct: number;
    data_collected_mb: number;
    data_downlinked_mb: number;
    in_contact: boolean;
    active_station: string;
    signal_strength_dbm: number;
    buffer_full_warning: boolean;
  };
  storage: {
    used_pct: number;
    used_mb: number;
    free_mb: number;
    storage_full_warning: boolean;
  };
  workload: {
    cpu_usage_pct: number;
    processing_queue_items: number;
    cpu_overload_warning: boolean;
  };
}

export interface ActionResponse {
  success: boolean;
  error?: string;
  action_type?: string;
  budget_cost?: number;
  budget_remaining?: number;
  player_roles?: string[];
}

export interface EventResolveResponse {
  success: boolean;
  error?: string;
  event_id?: string;
  choice?: string;
  effects?: Record<string, number>;
  description?: string;
}

export interface ScoreCategory {
  category: string;
  weighted_score: number;
  max_possible: number;
  explanation: string;
}

export interface ScoreResponse {
  session_id: string;
  total_score: number;
  max_score: number;
  score_fraction: number;
  grade: string;
  categories: ScoreCategory[];
}

// ── Co-op rooms ─────────────────────────────────────────────────────────────

export interface ParticipantInfo {
  player_id: string;
  display_name: string;
  is_host: boolean;
  ready: boolean;
  connected: boolean;
}

export interface CreateRoomResponse {
  room_code: string;
  player_id: string;
}

export interface JoinRoomResponse {
  player_id: string;
  participants: ParticipantInfo[];
}

export interface RoomInfoResponse {
  room_code: string;
  phase: string;
  participant_count: number;
  participants: ParticipantInfo[];
}

/** Messages received from the room WebSocket. */
export interface RoomServerMessage {
  type:
    | "player_joined"
    | "player_left"
    | "ready_status"
    | "game_started"
    | "step_result"
    | "action_result"
    | "action_broadcast"
    | "event_resolved"
    | "state_snapshot"
    | "score_breakdown"
    | "game_finished"
    | "reconnect_state"
    | "error";
  [key: string]: unknown;
}

