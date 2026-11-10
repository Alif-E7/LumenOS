/**
 * API client — typed fetch wrappers for the LumenOS backend.
 * All requests go through the Vite proxy (/api → localhost:8000/api).
 */

import type {
  HealthResponse,
  MissionBrief,
  MissionDetail,
  SpacecraftCreate,
  SpacecraftResponse,
  SpacecraftValidation,
  CatalogItem,
  SpacecraftDesign,
  LiveEngineeringMetrics,
  PreLaunchReviewReport,
  ClockState,
  TimelineEvent,
  GroundTrackPoint,
  CheckpointData,
  GameStartResponse,
  StepResult,
  ActionResponse,
  EventResolveResponse,
  GameStateSummary,
  ScoreResponse,
  Telemetry,
  CampaignMissionNode,
  DifficultySetting,
  CreateRoomResponse,
  JoinRoomResponse,
  RoomInfoResponse,
  BenchmarkScenarioItem,
  BenchmarkComparisonResult,
  LifecycleCostModel,
  TeamContributionBreakdown,
  MissionTrajectoryRecord,
  WhatIfBranchRequest,
  WhatIfComparisonResult,
  ReplayListItem,
  PlayerProfileResponse,
  RecordMissionProgressionRequest,
  RecordMissionProgressionResponse,
} from "../types";

import {
  BUNDLED_MISSION_BRIEFS,
  BUNDLED_MISSION_DETAILS,
} from "../lib/bundled-missions";

// Normalise API and WebSocket URLs from environment variables
const rawApiUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const API_BASE_URL = rawApiUrl;
const BASE = rawApiUrl
  ? rawApiUrl.endsWith("/api")
    ? rawApiUrl
    : `${rawApiUrl}/api`
  : "/api";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "Unknown error");
    throw new Error(`API ${resp.status}: ${text}`);
  }
  // 204 No Content
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

// ── Health ──────────────────────────────────────────────────────────────────

export const getHealth = () => fetchJSON<HealthResponse>("/health");

// ── Spacecraft ──────────────────────────────────────────────────────────────

const LOCAL_STORAGE_SPACECRAFT_KEY = "lumenos_saved_spacecraft";

function getLocalSpacecraft(): SpacecraftResponse[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_SPACECRAFT_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalSpacecraft(sc: SpacecraftResponse) {
  try {
    if (typeof localStorage === "undefined") return;
    const list = getLocalSpacecraft().filter((item) => item.id !== sc.id);
    list.unshift(sc);
    localStorage.setItem(LOCAL_STORAGE_SPACECRAFT_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("Failed to persist spacecraft locally:", err);
  }
}

export const listSpacecraft = async (): Promise<SpacecraftResponse[]> => {
  const localItems = getLocalSpacecraft();
  try {
    const remote = await fetchJSON<SpacecraftResponse[]>("/spacecraft");
    const map = new Map<string, SpacecraftResponse>();
    for (const item of remote) {
      map.set(item.id, item);
    }
    for (const item of localItems) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
    const combined = Array.from(map.values());
    if (combined.length > 0) return combined;
  } catch (err) {
    console.warn("Backend /spacecraft unreachable; using local spacecraft fallback:", err);
  }

  if (localItems.length > 0) {
    return localItems;
  }

  return [
    {
      id: "baseline-orbiter",
      name: "Standard LEO Research Bus",
      description: "Versatile modular smallsat bus configured for multi-spectral Earth observation.",
      structure: { dry_mass_kg: 500.0, fuel_mass_kg: 50.0 },
      power: { solar_panel_area_m2: 6.0, battery_capacity_wh: 2000.0 },
      thermal: { radiator_area_m2: 2.0 },
      comms: { antenna_gain_dbi: 12.0, transmit_power_w: 15.0 },
      propulsion: { isp_s: 220.0, thrust_n: 1.0 },
      payload: { payload_type: "thermal_infrared", mass_kg: 50.0, power_w: 120.0 },
      total_mass_kg: 600.0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
};

export const getSpacecraft = async (id: string): Promise<SpacecraftResponse> => {
  try {
    return await fetchJSON<SpacecraftResponse>(`/spacecraft/${id}`);
  } catch (err) {
    const local = getLocalSpacecraft().find((s) => s.id === id);
    if (local) return local;
    return {
      id,
      name: "Standard LEO Research Bus",
      description: "Versatile modular smallsat bus configured for multi-spectral Earth observation.",
      structure: { dry_mass_kg: 500.0, fuel_mass_kg: 50.0 },
      power: { solar_panel_area_m2: 6.0, battery_capacity_wh: 2000.0 },
      thermal: { radiator_area_m2: 2.0 },
      comms: { antenna_gain_dbi: 12.0, transmit_power_w: 15.0 },
      propulsion: { isp_s: 220.0, thrust_n: 1.0 },
      payload: { payload_type: "thermal_infrared", mass_kg: 50.0, power_w: 120.0 },
      total_mass_kg: 600.0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
};

export const createSpacecraft = async (body: SpacecraftCreate): Promise<SpacecraftResponse> => {
  let created: SpacecraftResponse;
  try {
    created = await fetchJSON<SpacecraftResponse>("/spacecraft", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn("Backend /spacecraft POST unreachable or rejected; using local spacecraft fallback:", err);
    created = {
      id: `sc_${Date.now()}`,
      name: body.name,
      description: body.description || "Custom Spacecraft Build",
      structure: body.structure || { dry_mass_kg: 500.0, fuel_mass_kg: 50.0 },
      power: body.power || { solar_panel_area_m2: 6.0, battery_capacity_wh: 2000.0 },
      thermal: body.thermal || { radiator_area_m2: 2.0 },
      comms: body.comms || { antenna_gain_dbi: 12.0, transmit_power_w: 15.0 },
      propulsion: body.propulsion || { isp_s: 220.0, thrust_n: 1.0 },
      payload: body.payload || { payload_type: "thermal_infrared", mass_kg: 50.0, power_w: 120.0 },
      total_mass_kg: (body.structure?.dry_mass_kg ?? 500.0) + (body.structure?.fuel_mass_kg ?? 50.0) + (body.payload?.mass_kg ?? 50.0),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  saveLocalSpacecraft(created);
  return created;
};

export const updateSpacecraft = (id: string, body: Partial<SpacecraftCreate>) =>
  fetchJSON<SpacecraftResponse>(`/spacecraft/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const deleteSpacecraft = (id: string) =>
  fetchJSON<void>(`/spacecraft/${id}`, { method: "DELETE" });

export const validateSpacecraft = (id: string) =>
  fetchJSON<SpacecraftValidation>(`/spacecraft/${id}/validate`, {
    method: "POST",
  });

export const getSpacecraftCatalog = () =>
  fetchJSON<CatalogItem[]>("/spacecraft/catalog");

export const getDesignerPresets = () =>
  fetchJSON<Record<string, Record<string, SpacecraftDesign>>>(
    "/spacecraft/designer/presets"
 );

export const evaluateDesign = (
  design: SpacecraftDesign,
  contractBudget = 10000.0
) =>
  fetchJSON<LiveEngineeringMetrics>("/spacecraft/designer/evaluate", {
    method: "POST",
    body: JSON.stringify({ design, contract_budget: contractBudget }),
  });

export const reviewDesign = (
  design: SpacecraftDesign,
  contractBudget = 10000.0
) =>
  fetchJSON<PreLaunchReviewReport>("/spacecraft/designer/review", {
    method: "POST",
    body: JSON.stringify({ design, contract_budget: contractBudget }),
  });

// ── Missions ────────────────────────────────────────────────────────────────

export const listMissions = async (): Promise<MissionBrief[]> => {
  try {
    return await fetchJSON<MissionBrief[]>("/missions");
  } catch (err) {
    console.warn("Backend /missions unreachable; using bundled missions fallback:", err);
    return BUNDLED_MISSION_BRIEFS;
  }
};

export const getMission = async (id: string): Promise<MissionDetail> => {
  try {
    return await fetchJSON<MissionDetail>(`/missions/${id}`);
  } catch (err) {
    console.warn(`Backend /missions/${id} unreachable; using bundled mission fallback:`, err);
    return BUNDLED_MISSION_DETAILS[id] || BUNDLED_MISSION_DETAILS.wildfire;
  }
};

export const getCampaignNodes = () =>
  fetchJSON<CampaignMissionNode[]>("/missions/campaign/nodes");

export const getSunriseTutorial = () =>
  fetchJSON<{
    is_tutorial: boolean;
    title: string;
    description: string;
    stages: string[];
    steps: Array<{
      id: string;
      stage: string;
      title: string;
      concept: string;
      explorer_guidance: string;
      engineer_telemetry_focus: string;
      required_action: string;
      hint: string;
    }>;
    contract: Record<string, unknown>;
  }>("/missions/tutorial/sunrise");

export const getDifficulties = () =>
  fetchJSON<DifficultySetting[]>("/missions/difficulties");

// ── Game sessions ───────────────────────────────────────────────────────────

export const startGame = (body: {
  mission_id: string;
  spacecraft_id?: string;
  seed?: number;
  player_ids?: string[];
  difficulty?: string;
  /** Custom spacecraft design (hangar builder) — built server-side via design.to_spacecraft_config(). */
  design?: SpacecraftDesign;
}) =>
  fetchJSON<GameStartResponse>("/game/start", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const stepGame = (sessionId: string, steps = 1) =>
  fetchJSON<{ session_id: string; results: StepResult[] }>(
    `/game/${sessionId}/step`,
    { method: "POST", body: JSON.stringify({ steps }) }
 );

export const performAction = (
  sessionId: string,
  body: { player_id: string; action_type: string; params?: Record<string, unknown> }
) =>
  fetchJSON<ActionResponse>(`/game/${sessionId}/action`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const resolveEvent = (
  sessionId: string,
  body: { player_id: string; event_id: string; choice_id: string }
) =>
  fetchJSON<EventResolveResponse>(`/game/${sessionId}/event`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getGameState = (sessionId: string) =>
  fetchJSON<{ session_id: string; game_state: GameStateSummary }>(
    `/game/${sessionId}/state`
 );

export const getGameTelemetry = (sessionId: string) =>
  fetchJSON<{ session_id: string; telemetry: Telemetry }>(
    `/game/${sessionId}/telemetry`
 );

export const getGameScore = (sessionId: string) =>
  fetchJSON<ScoreResponse>(`/game/${sessionId}/score`);

export const deleteGameSession = (sessionId: string) =>
  fetchJSON<{ session_id: string; deleted: boolean }>(`/game/${sessionId}`, {
    method: "DELETE",
  });

// ── Co-op rooms ─────────────────────────────────────────────────────────────

export const createRoom = (hostName: string) =>
  fetchJSON<CreateRoomResponse>("/rooms", {
    method: "POST",
    body: JSON.stringify({ host_name: hostName }),
  });

export const joinRoom = (roomCode: string, displayName: string) =>
  fetchJSON<JoinRoomResponse>(`/rooms/${roomCode}/join`, {
    method: "POST",
    body: JSON.stringify({ display_name: displayName }),
  });

export const getRoomInfo = (roomCode: string) =>
  fetchJSON<RoomInfoResponse>(`/rooms/${roomCode}`);

/** Build the room WebSocket URL (supports VITE_WS_URL, VITE_API_URL, or same-origin fallback). */
export const roomSocketUrl = (
  roomCode: string,
  playerId: string,
  displayName?: string
) => {
  const name = displayName ? `?display_name=${encodeURIComponent(displayName)}` : "";
  const rawWsUrl = (import.meta.env.VITE_WS_URL || "").trim().replace(/\/+$/, "");

  if (rawWsUrl) {
    // Normalise http(s) to ws(s) if user entered web scheme by mistake
    const wsBase = rawWsUrl
      .replace(/^https:\/\//i, "wss://")
      .replace(/^http:\/\//i, "ws://")
      .replace(/\/api$/i, "");
    return `${wsBase}/api/rooms/ws/${roomCode}/${playerId}${name}`;
  }

  if (API_BASE_URL) {
    const wsProto = API_BASE_URL.startsWith("https") ? "wss" : "ws";
    const host = API_BASE_URL
      .replace(/^https?:\/\//, "")
      .replace(/\/api$/i, "")
      .replace(/\/+$/, "");
    return `${wsProto}://${host}/api/rooms/ws/${roomCode}/${playerId}${name}`;
  }

  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  const host = typeof window !== "undefined" ? window.location.host : "localhost:5173";
  return `${proto}://${host}/api/rooms/ws/${roomCode}/${playerId}${name}`;
};

// ── Simulation Clock, Environment & Timeline API (Prompt 6) ─────────────────

export const getSimulationClock = (sessionId: string) =>
  fetchJSON<{ session_id: string; clock: ClockState }>(`/game/${sessionId}/clock`);

export const pauseSimulationClock = (sessionId: string) =>
  fetchJSON<{ session_id: string; status: string; clock: ClockState }>(
    `/game/${sessionId}/clock/pause`,
    { method: "POST" }
 );

export const resumeSimulationClock = (sessionId: string) =>
  fetchJSON<{ session_id: string; status: string; clock: ClockState }>(
    `/game/${sessionId}/clock/resume`,
    { method: "POST" }
 );

export const setSimulationClockSpeed = (sessionId: string, speed: number) =>
  fetchJSON<{ session_id: string; clock: ClockState }>(
    `/game/${sessionId}/clock/speed`,
    {
      method: "POST",
      body: JSON.stringify({ speed }),
    }
 );

export const fastForwardSimulation = (
  sessionId: string,
  params: { target_seconds?: number; event_type?: string }
) =>
  fetchJSON<{ session_id: string; result: any }>(
    `/game/${sessionId}/clock/fast_forward`,
    {
      method: "POST",
      body: JSON.stringify(params),
    }
 );

export const getForecastTimeline = (sessionId: string, horizonSeconds = 86400) =>
  fetchJSON<{
    session_id: string;
    horizon_seconds: number;
    timeline_events: TimelineEvent[];
  }>(`/game/${sessionId}/timeline?horizon_seconds=${horizonSeconds}`);

export const getGroundTrack = (
  sessionId: string,
  numPoints = 100,
  durationSeconds?: number
) => {
  const query = durationSeconds
    ? `?num_points=${numPoints}&duration_seconds=${durationSeconds}`
    : `?num_points=${numPoints}`;
  return fetchJSON<{ session_id: string; points: GroundTrackPoint[] }>(
    `/game/${sessionId}/orbit/groundtrack${query}`
 );
};

export const saveSimulationCheckpoint = (sessionId: string) =>
  fetchJSON<{ session_id: string; checkpoint: CheckpointData }>(
    `/game/${sessionId}/checkpoint/save`,
    { method: "POST" }
 );

export const restoreSimulationCheckpoint = (
  sessionId: string,
  checkpoint: Record<string, any>
) =>
  fetchJSON<{ session_id: string; restored: boolean; clock: ClockState }>(
    `/game/${sessionId}/checkpoint/restore`,
    {
      method: "POST",
      body: JSON.stringify({ checkpoint }),
    }
 );

// ── LumenOS Predictive Advisory API (Prompt 12) ──────────────────────────────

export const getAdvisoryState = (sessionId: string) =>
  fetchJSON<any>(`/game/${sessionId}/advisory`);

export const respondToAdvisory = (
  sessionId: string,
  params: {
    recommendation_id: string;
    action: string;
    modified_parameters?: Record<string, any>;
    player_id?: string;
  }
) =>
  fetchJSON<any>(`/game/${sessionId}/advisory/respond`, {
    method: "POST",
    body: JSON.stringify(params),
  });

export const setAdvisoryAutomation = (
  sessionId: string,
  params: { enabled: boolean; player_id?: string }
) =>
  fetchJSON<any>(`/game/${sessionId}/advisory/automation`, {
    method: "POST",
    body: JSON.stringify(params),
  });

export const getAdvisoryMetrics = (sessionId: string) =>
  fetchJSON<any>(`/game/${sessionId}/advisory/metrics`);

// ── Benchmark Harness API (Prompt 13) ─────────────────────────────────────────

const OFFLINE_BENCHMARK_SCENARIOS: BenchmarkScenarioItem[] = [
  {
    id: "wildfire_scout",
    name: "Wildfire Scout — Eyes on Fire",
    description: "Detect active fire hotspots and manage high thermal loads across smoke-obscured fronts.",
    difficulty: "Standard",
    duration_hours: 24.0,
    orbit_altitude_km: 550.0,
    objectives_count: 3,
  },
  {
    id: "flood_scout",
    name: "Flood Scout — Rising Waters",
    description: "Map monsoon inundation zones with C-Band SAR and onboard 50:1 AI vector compression.",
    difficulty: "Standard",
    duration_hours: 48.0,
    orbit_altitude_km: 600.0,
    objectives_count: 3,
  },
  {
    id: "volcano_watch",
    name: "Volcano Watch — Fire Beneath the Earth",
    description: "Monitor caldera thermal flux, SO2 dispersion plumes, and issue aviation SIGMET advisories.",
    difficulty: "Advanced",
    duration_hours: 36.0,
    orbit_altitude_km: 500.0,
    objectives_count: 3,
  },
  {
    id: "solar_storm_sentinel",
    name: "Solar Storm Sentinel — Watch the Sun",
    description: "Monitor CME shockwaves, Kp geomagnetic indices, and mitigate radiation SEU anomalies.",
    difficulty: "Advanced",
    duration_hours: 72.0,
    orbit_altitude_km: 700.0,
    objectives_count: 3,
  },
];

export const getBenchmarkScenarios = async (): Promise<BenchmarkScenarioItem[]> => {
  try {
    return await fetchJSON<BenchmarkScenarioItem[]>("/benchmark/scenarios");
  } catch {
    return OFFLINE_BENCHMARK_SCENARIOS;
  }
};

export const runBenchmarkComparison = (params: {
  scenario_id: string;
  seed?: number;
  max_steps?: number;
}) =>
  fetchJSON<BenchmarkComparisonResult>("/benchmark/run", {
    method: "POST",
    body: JSON.stringify(params),
  });

export const getLatestBenchmark = async (): Promise<BenchmarkComparisonResult> => {
  return fetchJSON<BenchmarkComparisonResult>("/benchmark/latest");
};

export const runBenchmarkSuite = (params: {
  scenarios?: string[];
  seeds?: number[];
  max_steps?: number;
}) =>
  fetchJSON<any>("/benchmark/suite", {
    method: "POST",
    body: JSON.stringify(params),
  });

// ── Replay, What-If & Post-Mission Analysis API (Prompt 15) ──────────────────

export const getMissionReplay = (sessionId: string) =>
  fetchJSON<MissionTrajectoryRecord>(`/replay/${sessionId}`);

export const runWhatIf = (sessionId: string, params: WhatIfBranchRequest) =>
  fetchJSON<WhatIfComparisonResult>(`/replay/${sessionId}/what_if`, {
    method: "POST",
    body: JSON.stringify(params),
  });

export const getCostAnalysis = (sessionId: string) =>
  fetchJSON<LifecycleCostModel>(`/replay/${sessionId}/cost_analysis`);

export const getTeamContributions = (sessionId: string) =>
  fetchJSON<TeamContributionBreakdown>(`/replay/${sessionId}/contributions`);

export const listReplays = () =>
  fetchJSON<ReplayListItem[]>("/replay");

// ── Player Profile & Progression API (Prompt 16) ─────────────────────────────

const LOCAL_PROGRESSION_KEY = "lumenos_career_profile_v1";

function loadLocalCareerState(): { xp: number; credits: number; completed: number; unlocked: string[] } {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LOCAL_PROGRESSION_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { xp: 350, credits: 850, completed: 1, unlocked: ["high_density_battery"] };
}

function saveLocalCareerState(state: { xp: number; credits: number; completed: number; unlocked: string[] }) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LOCAL_PROGRESSION_KEY, JSON.stringify(state));
    }
  } catch {
    // ignore
  }
}

export const getPlayerProfile = (playerId: string = "pilot-local") =>
  fetchJSON<PlayerProfileResponse>(`/progression/profile?player_id=${encodeURIComponent(playerId)}`);

export const recordMissionProgression = async (
  body: RecordMissionProgressionRequest
): Promise<RecordMissionProgressionResponse> => {
  try {
    return await fetchJSON<RecordMissionProgressionResponse>("/progression/record_mission", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    const local = loadLocalCareerState();
    const numericScore = body.score ?? 75;
    const xpGained = Math.max(50, Math.round(numericScore * 2.5));
    const creditsGained = Math.max(100, Math.round(numericScore * 3.5));
    local.xp += xpGained;
    local.credits += creditsGained;
    local.completed += 1;
    saveLocalCareerState(local);
    const level = Math.max(1, Math.floor(local.xp / 350) + 1);
    const starsEarned = body.stars ?? (numericScore >= 80 ? 3 : numericScore >= 55 ? 2 : 1);
    return {
      player_id: body.player_id || "pilot-local",
      rewards: {
        mission_id: body.mission_id,
        xp_earned: xpGained,
        credits_earned: creditsGained,
        stars_earned: starsEarned,
        best_stars: starsEarned,
        new_stars_earned: starsEarned,
        is_first_completion: local.completed === 1,
        new_achievements: [],
        newly_unlocked_missions: [],
        total_xp: local.xp,
        level,
        engineering_credits: local.credits,
        explanation: "Orbital AI mission telemetry archived and verified.",
      },
      current_level: level,
      total_xp: local.xp,
      engineering_credits: local.credits,
    };
  }
};

export const purchaseUnlock = (playerId: string, unlockId: string) =>
  fetchJSON<{ success: boolean; unlock_id: string; remaining_credits: number; unlocked: string[] }>(
    "/progression/unlock",
    {
      method: "POST",
      body: JSON.stringify({ player_id: playerId, unlock_id: unlockId }),
    }
  );






