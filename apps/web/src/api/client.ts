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

