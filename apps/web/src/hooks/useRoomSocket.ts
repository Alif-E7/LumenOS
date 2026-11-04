/**
 * useRoomSocket — live co-op room connection.
 *
 * Connects to /api/rooms/ws/{code}/{player_id}, tracks participants,
 * ready state, roles and the shared mission state, and exposes send().
 * All state shown to the player comes from the server — nothing here
 * fakes synchronization.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ActiveEvent,
  GameStateSummary,
  ParticipantInfo,
  RoomServerMessage,
  Telemetry,
} from "../types";
import { roomSocketUrl } from "../api/client";

export type SocketStatus = "connecting" | "open" | "closed" | "error";

export interface RoomFinishInfo {
  outcome: string;
  score: number;
  grade: string;
  breakdown: Record<string, { score: number; explanation: string }>;
}

export interface RoomSocketState {
  status: SocketStatus;
  participants: ParticipantInfo[];
  phase: "lobby" | "playing" | "finished";
  roles: Record<string, string[]>;
  gameState: GameStateSummary | null;
  telemetry: Telemetry | null;
  activeEvents: ActiveEvent[];
  /** Recent action log lines for the shared feed. */
  feed: string[];
  lastError: string | null;
  finished: RoomFinishInfo | null;
}

export function useRoomSocket(
  roomCode: string | null,
  playerId: string,
  displayName: string | undefined
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<RoomSocketState>({
    status: roomCode ? "connecting" : "closed",
    participants: [],
    phase: "lobby",
    roles: {},
    gameState: null,
    telemetry: null,
    activeEvents: [],
    feed: [],
    lastError: null,
    finished: null,
  });

  useEffect(() => {
    if (!roomCode || !playerId) return;

    const ws = new WebSocket(roomSocketUrl(roomCode, playerId, displayName));
    wsRef.current = ws;

    ws.onopen = () => setState((s) => ({ ...s, status: "open" }));

    ws.onclose = () => setState((s) => ({ ...s, status: "closed" }));

    ws.onerror = () => setState((s) => ({ ...s, status: "error" }));

    ws.onmessage = (ev) => {
      let msg: RoomServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      setState((s) => reduce(s, msg));
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
    // displayName intentionally excluded — renaming mid-connection would drop the socket
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, playerId]);

  const send = useCallback((message: Record<string, unknown>) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  return { ...state, send };
}

// ── Message reducer ─────────────────────────────────────────────────────────

type FullState = GameStateSummary; // server sends summary + objectives + active_events

function applyState(s: RoomSocketState, raw: unknown): RoomSocketState {
  const st = raw as FullState;
  return {
    ...s,
    gameState: st,
    activeEvents: (st.active_events ?? []).filter((e) => e.is_pending),
    telemetry: s.telemetry,
  };
}

function reduce(s: RoomSocketState, msg: RoomServerMessage): RoomSocketState {
  switch (msg.type) {
    case "player_joined":
    case "player_left":
    case "ready_status":
      return {
        ...s,
        participants: (msg.participants as ParticipantInfo[]) ?? s.participants,
        lastError: null,
      };

    case "game_started":
      return {
        ...s,
        phase: "playing",
        roles: (msg.roles as Record<string, string[]>) ?? {},
        gameState: msg.state as GameStateSummary,
      };

    case "step_result": {
      let next = applyState(s, msg.state);
      const results = (msg.results as Array<{ telemetry?: Telemetry; new_events?: unknown[] }>) ?? [];
      const lastWithTel = [...results].reverse().find((r) => r.telemetry);
      if (lastWithTel?.telemetry) next = { ...next, telemetry: lastWithTel.telemetry };
      return next;
    }

    case "action_result":
      if (msg.success) {
        return {
          ...s,
          feed: [
            `You: ${String(msg.action_type)} — accepted (${msg.budget_cost ?? 0} cr)`,
            ...s.feed,
          ].slice(0, 8),
        };
      }
      return { ...s, lastError: String(msg.error ?? "Action rejected") };

    case "action_broadcast":
      return {
        ...s,
        feed: [
          `${String(msg.display_name)}: ${String(msg.action_type)}`,
          ...s.feed,
        ].slice(0, 8),
      };

    case "event_resolved":
      return {
        ...s,
        feed: [
          `Event resolved by ${String(msg.player_id)}: ${String(msg.choice ?? "")}`,
          ...s.feed,
        ].slice(0, 8),
      };

    case "state_snapshot":
    case "reconnect_state":
      return {
        ...applyState(s, msg.state),
        roles: (msg.roles as Record<string, string[]>) ?? s.roles,
        phase: (msg as { phase?: RoomSocketState["phase"] }).phase ?? s.phase,
      };

    case "game_finished":
      return {
        ...s,
        phase: "finished",
        finished: {
          outcome: String(msg.outcome ?? "unknown"),
          score: Number(msg.score ?? 0),
          grade: String(msg.grade ?? "?"),
          breakdown: (msg.breakdown as RoomFinishInfo["breakdown"]) ?? {},
        },
      };

    case "error":
      return { ...s, lastError: String(msg.error ?? "Unknown error") };

    default:
      return s;
  }
}
