/**
 * Shared TypeScript types — mirrors the backend Pydantic models.
 * These are the API contracts between frontend and backend.
 */

export * from "./canonical";

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
  stars?: number;
  star_criteria?: string[];
  explanation?: string;
  categories: ScoreCategory[];
}

// ── Campaign, Tutorial & Difficulty ─────────────────────────────────────────

export interface CampaignMissionNode {
  mission_id: string;
  name: string;
  codename: string;
  order: number;
  difficulty_level: number;
  icon: string;
  summary: string;
  prerequisite_mission_id?: string | null;
  prerequisite_min_stars: number;
  prerequisite_player_level: number;
  xp_first_completion: number;
  credits_first_completion: number;
  xp_replay_mastery: number;
  credits_replay_mastery: number;
}

export interface DifficultySetting {
  difficulty: string;
  level: number;
  name: string;
  description: string;
  budget_multiplier: number;
  deadline_multiplier: number;
  event_rate_multiplier: number;
  objective_target_multiplier: number;
  min_health_fail_pct: number;
  reward_multiplier: number;
}

export interface TutorialStepInfo {
  id: string;
  stage: string;
  title: string;
  concept: string;
  explorer_guidance: string;
  engineer_telemetry_focus: string;
  required_action: string;
  hint: string;
}

// ── Spacecraft Catalog & Pre-Launch Review (Prompt 5) ────────────────────────

export interface CatalogItem {
  id: string;
  name: string;
  subsystem: string;
  category_label: string;
  description: string;
  mass_kg: number;
  cost_credits: number;
  power_draw_w: number;
  power_generation_w: number;
  heat_contribution_w: number;
  data_rate_kbps: number;
  storage_capacity_mb: number;
  battery_capacity_wh: number;
  processing_mips: number;
  heat_rejection_w: number;
  performance_score: number;
  reliability: number;
  science_multiplier: number;
  compatible_missions: string[];
  incompatible_components: string[];
  required_components: string[];
  educational_notes: string;
  assumptions_and_units: string;
}

export interface SpacecraftDesign {
  design_id?: string;
  name: string;
  mission_id: string;
  launcher_id: string;
  orbit_id: string;
  instrument_ids: string[];
  computer_id: string;
  battery_id: string;
  solar_id: string;
  thermal_id: string;
  comms_id: string;
  storage_id: string;
  shielding_id: string;
  chassis_dry_mass_kg?: number;
  fuel_mass_kg?: number;
}

export interface LiveEngineeringMetrics {
  total_mass_kg: number;
  launcher_capacity_kg: number;
  mass_margin_kg: number;
  mass_margin_pct: number;
  total_cost_credits: number;
  contract_budget_credits: number;
  budget_remaining_credits: number;
  budget_margin_pct: number;
  power_generation_sunlight_w: number;
  power_nominal_load_w: number;
  power_peak_load_w: number;
  net_power_sunlight_w: number;
  battery_capacity_wh: number;
  eclipse_duration_minutes: number;
  eclipse_energy_demand_wh: number;
  eclipse_dod_pct: number;
  eclipse_battery_reserve_pct: number;
  heat_generated_w: number;
  heat_rejected_w: number;
  thermal_margin_pct: number;
  data_generation_rate_kbps: number;
  storage_capacity_mb: number;
  storage_hours_to_fill: number;
  downlink_rate_kbps: number;
  downlink_per_pass_mb: number;
  science_value_rating: number;
  mission_suitability_pct: number;
  reliability_rating: number;
}

export interface EngineeringCheckResult {
  check_id: string;
  category: string;
  title: string;
  status: "PASS" | "WARNING" | "ERROR";
  value_measured: string;
  threshold_required: string;
  explanation: string;
  revision_recommendation?: string | null;
}

export interface PreLaunchReviewReport {
  design_name: string;
  mission_id: string;
  readiness: "FLIGHT_READY" | "EXPERIMENTAL_LAUNCH" | "GROUNDED";
  can_launch: boolean;
  is_experimental: boolean;
  error_count: number;
  warning_count: number;
  pass_count: number;
  checks: EngineeringCheckResult[];
  active_risks: string[];
  metrics: LiveEngineeringMetrics;
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

