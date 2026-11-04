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

