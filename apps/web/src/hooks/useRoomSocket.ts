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
import type { PendingActionRequest } from "../components/ParticipantList";

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
  isPaused: boolean;
  roles: Record<string, string[]>;
  gameState: GameStateSummary | null;
  telemetry: Telemetry | null;
  activeEvents: ActiveEvent[];
  pendingRequests: PendingActionRequest[];
  activityFeed: Array<Record<string, any>>;
  /** Recent action log lines for the shared feed. */
  feed: string[];
  lastError: string | null;
  finished: RoomFinishInfo | null;
}

function mapPendingRequest(raw: any): PendingActionRequest {
  return {
    id: raw.request_id || raw.id || "",
    requesterId: raw.requester_id || raw.requesterId || "",
    requesterName: raw.requester_name || raw.requesterName || "Crew",
    role: (raw.target_role || raw.role || "mission_director") as any,
    actionType: raw.action_type || raw.actionType || "",
    description: raw.reason || raw.description || "",
    timestamp: new Date(
      (raw.created_at || Date.now() / 1000) * 1000
 ).toLocaleTimeString(),
  };
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
    isPaused: false,
    roles: {},
    gameState: null,
    telemetry: null,
    activeEvents: [],
    pendingRequests: [],
    activityFeed: [],
    feed: [],
    lastError: null,
    finished: null,
  });

  useEffect(() => {
    if (!roomCode || !playerId) return;
    const code = roomCode;

    let isUnmounted = false;
    let retryCount = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    const maxRetries = 5;

    function connect() {
      if (isUnmounted) return;
      const ws = new WebSocket(roomSocketUrl(code, playerId, displayName));
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount = 0;
        setState((s) => ({ ...s, status: "open", lastError: null }));
      };

      ws.onclose = (event) => {
        if (isUnmounted) return;
        // Clean closures (normal close or room terminal status codes)
        if (event.code === 1000 || event.code === 4004 || event.code === 4009) {
          setState((s) => ({ ...s, status: "closed" }));
          return;
        }
        // Unexpected disconnect: trigger reconnect backoff
        setState((s) => ({ ...s, status: "connecting" }));
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
          retryCount++;
          retryTimeout = setTimeout(connect, delay);
        } else {
          setState((s) => ({
            ...s,
            status: "error",
            lastError: "Connection lost. Please refresh or rejoin the room.",
          }));
        }
      };

      ws.onerror = () => {
        // onclose will follow and manage reconnect backoff
      };

      ws.onmessage = (ev) => {
        let msg: RoomServerMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        setState((s) => reduce(s, msg));
      };
    }

    connect();

    return () => {
      isUnmounted = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (wsRef.current) {
        wsRef.current.close(1000, "Normal closure");
        wsRef.current = null;
      }
    };
  }, [roomCode, playerId, displayName]);

  const send = useCallback((message: Record<string, unknown>) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  const requestAction = useCallback(
    (
      targetRole: string,
      actionType: string,
      params: Record<string, unknown> = {},
      reason = ""
 ) => {
      send({
        command: "request_action",
        target_role: targetRole,
        action_type: actionType,
        params,
        reason,
      });
    },
    [send]
 );

  const respondActionRequest = useCallback(
    (requestId: string, decision: "approve" | "reject", reason = "") => {
      send({
        command: "respond_action_request",
        request_id: requestId,
        decision,
        reason,
      });
    },
    [send]
 );

  const sendTacticalPing = useCallback(
    (pingType: string, message: string) => {
      send({
        command: "tactical_ping",
        ping_type: pingType,
        message,
      });
    },
    [send]
 );

  const reassignRoles = useCallback(
    (roleAssignments: Record<string, string[]>) => {
      send({
        command: "reassign_roles",
        role_assignments: roleAssignments,
      });
    },
    [send]
 );

  const pause = useCallback(() => {
    send({ command: "pause" });
  }, [send]);

  const resume = useCallback(() => {
    send({ command: "resume" });
  }, [send]);

  const restart = useCallback(() => {
    send({ command: "restart" });
  }, [send]);

  const end = useCallback(() => {
    send({ command: "end" });
  }, [send]);

  return {
    ...state,
    send,
    requestAction,
    respondActionRequest,
    sendTacticalPing,
    reassignRoles,
    pause,
    resume,
    restart,
    end,
  };
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
    case "player_disconnected":
    case "player_reconnected": {
      const parts = (msg.participants as ParticipantInfo[]) ?? s.participants;
      let feedLine: string | null = null;
      if (msg.type === "player_joined" && msg.display_name) {
        feedLine = `${String(msg.display_name)} joined the mission room.`;
      } else if (msg.type === "player_disconnected" && msg.display_name) {
        feedLine = `${String(msg.display_name)} disconnected (holding slot).`;
      } else if (msg.type === "player_reconnected" && msg.display_name) {
        feedLine = `${String(msg.display_name)} reconnected to station.`;
      }
      return {
        ...s,
        participants: parts,
        roles: (msg.roles as Record<string, string[]>) ?? s.roles,
        feed: feedLine ? [feedLine, ...s.feed].slice(0, 15) : s.feed,
        lastError: null,
      };
    }

    case "roles_updated":
      return {
        ...s,
        roles: (msg.roles as Record<string, string[]>) ?? s.roles,
        participants: (msg.participants as ParticipantInfo[]) ?? s.participants,
        feed: [`Host updated station role assignments.`, ...s.feed].slice(0, 15),
      };

    case "game_started":
    case "game_restarted":
      return {
        ...s,
        phase: "playing",
        isPaused: false,
        roles: (msg.roles as Record<string, string[]>) ?? {},
        gameState: msg.state as GameStateSummary,
        telemetry: (msg.telemetry as Telemetry) ?? s.telemetry,
        feed: [
          msg.type === "game_restarted"
            ? `Mission restarted from ignition step 0.`
            : `Mission launched: ${String(msg.mission_name || "Orbiter")}`,
          ...s.feed,
        ].slice(0, 15),
      };

    case "game_paused":
      return {
        ...s,
        isPaused: true,
        feed: [
          `Simulation clock paused by ${String(msg.paused_by || "crew")}.`,
          ...s.feed,
        ].slice(0, 15),
      };

    case "game_resumed":
      return {
        ...s,
        isPaused: false,
        feed: [
          `Simulation clock resumed by ${String(msg.resumed_by || "crew")}.`,
          ...s.feed,
        ].slice(0, 15),
      };

    case "step_result": {
      let next = applyState(s, msg.state);
      const results =
        (msg.results as Array<{ telemetry?: Telemetry; new_events?: unknown[] }>) ?? [];
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
          ].slice(0, 15),
        };
      }
      return { ...s, lastError: String(msg.error ?? "Action rejected") };

    case "action_broadcast":
      return {
        ...s,
        feed: [
          `${String(msg.display_name || msg.player_id)} (${String(
            (msg.roles as string[])?.[0] || "crew"
 )}): ${String(msg.action_type)}`,
          ...s.feed,
        ].slice(0, 15),
      };

    case "action_requested": {
      const rawReq = (msg.request || msg) as any;
      const pending = [
        ...s.pendingRequests.filter((r) => r.id !== (rawReq.request_id || rawReq.id)),
        mapPendingRequest(rawReq),
      ];
      return {
        ...s,
        pendingRequests: pending,
        feed: [
          `Request: ${String(rawReq.requester_name || "Crew")} asked ${String(
            rawReq.target_role || "station"
 )} for ${String(rawReq.action_type)}`,
          ...s.feed,
        ].slice(0, 15),
      };
    }

    case "request_approved": {
      const reqId = String(msg.request_id || "");
      const remaining = s.pendingRequests.filter((r) => r.id !== reqId);
      return {
        ...s,
        pendingRequests: remaining,
        feed: [
          `Request ${reqId} approved by ${String(msg.approved_by || "station")}.`,
          ...s.feed,
        ].slice(0, 15),
      };
    }

    case "request_rejected": {
      const reqId = String(msg.request_id || "");
      const remaining = s.pendingRequests.filter((r) => r.id !== reqId);
      return {
        ...s,
        pendingRequests: remaining,
        feed: [
          `Request ${reqId} rejected by ${String(msg.rejected_by || "station")}.`,
          ...s.feed,
        ].slice(0, 15),
      };
    }

    case "requests_timed_out": {
      const expired = (msg.expired_ids as string[]) ?? [];
      const remaining = s.pendingRequests.filter((r) => !expired.includes(r.id));
      return {
        ...s,
        pendingRequests: remaining,
        feed: [`${expired.length} request(s) safely timed out.`, ...s.feed].slice(0, 15),
      };
    }

    case "tactical_ping":
      return {
        ...s,
        feed: [
          `📢 [${String(msg.ping_type)}] ${String(msg.display_name)}: ${String(
            msg.message
 )}`,
          ...s.feed,
        ].slice(0, 15),
      };

    case "event_resolved":
      return {
        ...s,
        feed: [
          `Event resolved by ${String(msg.player_id)}: ${String(msg.choice ?? "")}`,
          ...s.feed,
        ].slice(0, 15),
      };

    case "state_snapshot":
    case "reconnect_state": {
      let next = applyState(s, msg.state);
      if (msg.telemetry) next = { ...next, telemetry: msg.telemetry as Telemetry };
      if (msg.pending_requests && Array.isArray(msg.pending_requests)) {
        next = {
          ...next,
          pendingRequests: msg.pending_requests.map(mapPendingRequest),
        };
      }
      return {
        ...next,
        roles: (msg.roles as Record<string, string[]>) ?? s.roles,
        phase: (msg as { phase?: RoomSocketState["phase"] }).phase ?? s.phase,
        isPaused: Boolean(msg.is_paused ?? s.isPaused),
        participants: (msg.participants as ParticipantInfo[]) ?? s.participants,
      };
    }

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
