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

const BASE = "/api";

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

export const listSpacecraft = () =>
  fetchJSON<SpacecraftResponse[]>("/spacecraft");

export const getSpacecraft = (id: string) =>
  fetchJSON<SpacecraftResponse>(`/spacecraft/${id}`);

export const createSpacecraft = (body: SpacecraftCreate) =>
  fetchJSON<SpacecraftResponse>("/spacecraft", {
    method: "POST",
    body: JSON.stringify(body),
  });

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

export const listMissions = () => fetchJSON<MissionBrief[]>("/missions");

export const getMission = (id: string) =>
  fetchJSON<MissionDetail>(`/missions/${id}`);

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

/** Build the room WebSocket URL (same origin; Vite proxies /ws in dev). */
export const roomSocketUrl = (
  roomCode: string,
  playerId: string,
  displayName?: string
) => {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const name = displayName ? `?display_name=${encodeURIComponent(displayName)}` : "";
  return `${proto}://${window.location.host}/api/rooms/ws/${roomCode}/${playerId}${name}`;
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

export const getBenchmarkScenarios = () =>
  fetchJSON<BenchmarkScenarioItem[]>("/benchmark/scenarios");

export const runBenchmarkComparison = (params: {
  scenario_id: string;
  seed?: number;
  max_steps?: number;
}) =>
  fetchJSON<BenchmarkComparisonResult>("/benchmark/run", {
    method: "POST",
    body: JSON.stringify(params),
  });

export const getLatestBenchmark = () =>
  fetchJSON<BenchmarkComparisonResult>("/benchmark/latest");

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

export const getPlayerProfile = (playerId: string = "pilot-local") =>
  fetchJSON<PlayerProfileResponse>(`/progression/profile?player_id=${encodeURIComponent(playerId)}`);

export const recordMissionProgression = (body: RecordMissionProgressionRequest) =>
  fetchJSON<RecordMissionProgressionResponse>("/progression/record_mission", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const purchaseUnlock = (playerId: string, unlockId: string) =>
  fetchJSON<{ success: boolean; unlock_id: string; remaining_credits: number; unlocked: string[] }>(
    "/progression/unlock",
    {
      method: "POST",
      body: JSON.stringify({ player_id: playerId, unlock_id: unlockId }),
    }
  );






