/**
 * Mission session context — carries the player's choices through the
 * solo mission flow (mode select → brief → design → review → launch →
 * operate → results) across page navigations via localStorage.
 *
 * Co-op rooms are managed by useRoomSocket; solo metadata lives here.
 */

export type PlayMode = "solo" | "coop";

export interface MissionSession {
  mode: PlayMode;
  missionId: string;
  missionName: string;
  /** Spacecraft configuration chosen in the designer (backend id). */
  spacecraftId: string | null;
  /** Live game session id (backend). */
  sessionId: string | null;
  /** Local player id (solo: generated; co-op: from room join). */
  playerId: string;
  /** Co-op room code. */
  roomCode: string | null;
}

const KEY = "lumenos.missionSession";

export function loadMissionSession(): MissionSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MissionSession) : null;
  } catch {
    return null;
  }
}

export function saveMissionSession(session: MissionSession): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearMissionSession(): void {
  localStorage.removeItem(KEY);
}

export function newPlayerId(): string {
  return `player_${Math.random().toString(16).slice(2, 10)}`;
}

/** Role ids as defined by the backend permission matrix (game/roles.py). */
export const ROLE_IDS = [
  "mission_director",
  "systems_engineer",
  "science_officer",
  "flight_controller",
] as const;

export type RoleId2 = (typeof ROLE_IDS)[number];

/**
 * Which station actions each role may perform — mirrors the backend
 * PERMISSION_MATRIX so the UI can render role-appropriate controls.
 * The backend remains authoritative; these are for display only.
 */
export const ROLE_ACTIONS: Record<RoleId2, string[]> = {
  mission_director: [
    "respond_event",
    "allocate_budget",
    "set_priority",
    "request_ai",
  ],
  systems_engineer: [
    "toggle_subsystem",
    "set_power_mode",
    "adjust_thermal",
    "repair_subsystem",
  ],
  science_officer: [
    "collect_data",
    "schedule_observation",
    "downlink_data",
  ],
  flight_controller: [
    "adjust_orbit",
    "fire_thruster",
    "set_attitude",
  ],
};

/** Backend ActionType values (game/actions.py) mapped to station actions. */
export const STATION_ACTION_TYPES = {
  respond_event: "respond_to_event",
  allocate_budget: "allocate_budget",
  set_priority: "set_priority",
  request_ai: "request_ai_prediction",
  toggle_subsystem: "toggle_subsystem",
  set_power_mode: "set_power_mode",
  adjust_thermal: "adjust_thermal",
  repair_subsystem: "repair_subsystem",
  collect_data: "collect_data",
  schedule_observation: "schedule_observation",
  downlink_data: "downlink_data",
  adjust_orbit: "adjust_orbit",
  fire_thruster: "fire_thruster",
  set_attitude: "set_attitude",
} as const;

export type StationAction = keyof typeof STATION_ACTION_TYPES;
