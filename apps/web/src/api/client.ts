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

