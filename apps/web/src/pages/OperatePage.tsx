import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Tabs } from "../components/Tabs";
import { ObjectiveTracker } from "../components/ObjectiveTracker";
import { EventCard } from "../components/EventCard";
import { WarningPanel, type Warning } from "../components/WarningPanel";
import { Timeline } from "../components/Timeline";
import { BudgetMeter } from "../components/BudgetMeter";
import { RoleBadge } from "../components/RoleBadge";
import { StatusBadge } from "../components/StatusBadge";
import { ResourceMeter } from "../components/ResourceMeter";
import { Tooltip } from "../components/Tooltip";
import {
  STATION_COMPONENTS,
  STATION_ORDER,
  type StationProps,
} from "../components/StationPanels";
import {
  stepGame,
  getGameState,
  getGameTelemetry,
  performAction,
  resolveEvent,
} from "../api/client";
import { useRoomSocket } from "../hooks/useRoomSocket";
import {
  loadMissionSession,
  saveMissionSession,
  clearMissionSession,
  type MissionSession,
} from "../lib/mission";
import type { ActiveEvent, GameStateSummary, StepResult, Telemetry } from "../types";
import { ROLES, type RoleId } from "../lib/constants";

const BUDGET_TOTAL = 10000;

function fmtClock(seconds: number, durationHours: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} / ${durationHours.toFixed(0)}:00 h`;
}

/**
 * Operate / Mission Control — the live flight deck.
 *
 * Solo: REST-driven (step, actions, events). All four stations available.
 * Co-op: room WebSocket drives the shared state; players see only their
 * assigned stations and the server enforces role permissions.
 */
export function OperatePage() {
  const navigate = useNavigate();
  const [session] = useState<MissionSession | null>(() => loadMissionSession());
  const [engineerMode, setEngineerMode] = useState(
    () => localStorage.getItem("lumenos.engineerMode") === "true"
  );

  // Solo REST state
  const [gameState, setGameState] = useState<GameStateSummary | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [stepping, setStepping] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Co-op room state
  const room = useRoomSocket(
    session?.mode === "coop" ? session.roomCode : null,
    session?.playerId ?? "",
    undefined
  );

  useEffect(() => {
    localStorage.setItem("lumenos.engineerMode", String(engineerMode));
  }, [engineerMode]);

  // ── Solo data loading ────────────────────────────────────────────────
  const refreshSolo = useCallback(async () => {
    if (!session?.sessionId) return;
    try {
      const [stateResp, telResp] = await Promise.all([
        getGameState(session.sessionId),
        getGameTelemetry(session.sessionId),
      ]);
      setGameState(stateResp.game_state);
      if (Object.keys(telResp.telemetry).length > 0) setTelemetry(telResp.telemetry);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [session?.sessionId]);

  useEffect(() => {
    if (session?.mode === "solo") void refreshSolo();
  }, [session?.mode, refreshSolo]);

  // Auto-run loop (solo)
  useEffect(() => {
    if (!autoRun || session?.mode !== "solo" || !session?.sessionId) return;
    if (gameState?.status !== "running") {
      setAutoRun(false);
      return;
    }
    const t = setInterval(() => void doStep(1), 1200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, session?.mode, session?.sessionId, gameState?.status]);

  const doStep = async (steps: number) => {
    if (!session?.sessionId) return;
    setStepping(true);
    setError(null);
    try {
      const resp = await stepGame(session.sessionId, steps);
      const last = resp.results[resp.results.length - 1];
      if (last?.telemetry && Object.keys(last.telemetry).length > 0) setTelemetry(last.telemetry);
      if (last?.game_state) setGameState(last.game_state);
      await refreshSolo();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStepping(false);
    }
  };

  // ── Action dispatch (solo REST / co-op WS) ───────────────────────────
  const dispatchAction = async (actionType: string, params: Record<string, unknown>, label: string) => {
    setError(null);
    if (session?.mode === "coop") {
      room.send({ command: "action", action_type: actionType, params });
      return;
    }
    if (!session?.sessionId) return;
    try {
      const resp = await performAction(session.sessionId, {
        player_id: session.playerId,
        action_type: actionType,
        params,
      });
      if (!resp.success) {
        setError(`${label} rejected: ${resp.error ?? "unknown reason"}`);
      }
      await refreshSolo();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const chooseEventResponse = async (event: ActiveEvent, choiceId: string) => {
    setError(null);
    if (session?.mode === "coop") {
      room.send({ command: "resolve_event", event_id: event.event_id, choice_id: choiceId });
      return;
    }
    if (!session?.sessionId) return;
    try {
      const resp = await resolveEvent(session.sessionId, {
        player_id: session.playerId,
        event_id: event.event_id,
        choice_id: choiceId,
      });
      if (!resp.success) setError(`Event response rejected: ${resp.error ?? "unknown"}`);
      await refreshSolo();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ── Unified view model ───────────────────────────────────────────────
  const isCoop = session?.mode === "coop";
  const phase = isCoop ? room.phase : gameState?.status === "pending" ? "lobby" : "playing";
  const activeGameState = isCoop ? room.gameState : gameState;
  const activeTelemetry = isCoop ? room.telemetry : telemetry;
  const activeEvents = isCoop ? room.activeEvents : (gameState?.active_events ?? []).filter((e) => e.is_pending);
  const objectives = activeGameState?.objectives ?? [];
  const budgetRemaining = activeGameState?.budget_remaining ?? BUDGET_TOTAL;

  const myRoles = useMemo<RoleId[]>(() => {
    if (!session) return [];
    if (!isCoop) return STATION_ORDER; // solo: all stations
    const assigned = room.roles[session.playerId] ?? [];
    return assigned as RoleId[];
  }, [session, isCoop, room.roles]);

  const warnings = useMemo<Warning[]>(() => {
    if (!activeTelemetry) return [];
    const w: Warning[] = [];
    if (activeTelemetry.power.power_critical) w.push({ id: "power-critical", message: "Battery critical — imminent shutdown", level: "critical" });
    else if (activeTelemetry.power.low_power_warning) w.push({ id: "power-low", message: "Low power state — battery below reserve", level: "warning" });
    if (activeTelemetry.thermal.overtemp_warning) w.push({ id: "overtemp", message: `Bus overheating (${activeTelemetry.thermal.temperature_c.toFixed(1)} °C)`, level: "critical" });
    if (activeTelemetry.thermal.undertemp_warning) w.push({ id: "undertemp", message: "Bus temperature below lower limit", level: "warning" });
    if (activeTelemetry.comms.buffer_full_warning) w.push({ id: "buffer-full", message: "Data buffer nearly full — downlink required", level: "warning" });
    if (activeTelemetry.workload.cpu_overload_warning) w.push({ id: "cpu", message: "CPU overload — processing queue backing up", level: "warning" });
    if (activeTelemetry.storage.storage_full_warning) w.push({ id: "storage", message: "Onboard storage nearly full", level: "warning" });
    return w;
  }, [activeTelemetry]);

  // ── Guard states ─────────────────────────────────────────────────────
  if (!session || !session.missionId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card title="No Active Mission" icon="🛰️">
          <p className="text-slate-400 text-sm mb-4">
            Mission Control needs an accepted contract. Start from the campaign.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/mode")}>Choose Mission Mode</Button>
            <Button variant="secondary" onClick={() => navigate("/missions")}>
              Mission Campaign
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (isCoop && !session.roomCode) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card title="Not in a Room" icon="👥">
          <p className="text-slate-400 text-sm mb-4">
            This is a co-op session but no room is connected. Create or join a room first.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/coop/create")}>Create Room</Button>
            <Button variant="secondary" onClick={() => navigate("/coop/join")}>Join Room</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (isCoop && room.phase === "lobby") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card title="Waiting in Lobby…" icon="⏳">
          <p className="text-slate-400 text-sm mb-4">
            Room <span className="font-mono text-slate-200">{session.roomCode}</span> — the
            host hasn't launched yet. Return to the lobby for status.
          </p>
          <Button onClick={() => navigate("/coop/lobby")}>Open Lobby</Button>
        </Card>
      </div>
    );
  }

  const missionHours = 24; // displayed as contract duration reference

  const stationTabs = myRoles.map((roleId) => ({
    id: roleId,
    label: ROLES[roleId].label,
    icon: ROLES[roleId].icon,
  }));

  const stationProps: StationProps = {
    telemetry: activeTelemetry,
    budgetRemaining,
    budgetTotal: BUDGET_TOTAL,
    onAction: (type, params, label) => void dispatchAction(type, params, label),
    enabled: phase === "playing" && !isFinished(activeGameState),
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-white">Mission Control — {session.missionName}</h1>
        <StatusBadge
          label={isCoop ? "CO-OP CREW" : "SOLO — ALL STATIONS"}
          variant="info"
        />
        <StatusBadge
          label={
            activeGameState?.status === "completed"
              ? `Completed — ${activeGameState.outcome}`
              : activeGameState?.status === "failed"
                ? "Mission Failed"
                : `Step ${activeGameState?.step ?? 0} · Running`
          }
          variant={
            activeGameState?.status === "completed"
              ? "success"
              : activeGameState?.status === "failed"
                ? "danger"
                : "info"
          }
        />
        {myRoles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 ml-auto">
            {isCoop ? (
              myRoles.map((r) => <RoleBadge key={r} role={r} size="sm" />)
            ) : (
              <Tooltip content="Solo mode: you hold all four crew roles.">
                <span><RoleBadge role="mission_director" size="sm" /> +3 more</span>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* Prominent: objectives + events + budget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card title="Objectives" icon="🎯" className="lg:col-span-2">
          <ObjectiveTracker objectives={objectives} />
        </Card>
        <div className="space-y-4">
          <Card title="Budget" icon="💰">
            <BudgetMeter remaining={budgetRemaining} total={BUDGET_TOTAL} />
          </Card>
          <Timeline
            marks={[
              { label: "Now", fraction: (activeGameState?.step ?? 0) / Math.max(1, activeGameState?.step ?? 1) * 0.999, kind: "active" },
            ]}
            timeLabel={fmtClock(activeGameState?.elapsed_seconds ?? 0, missionHours)}
          />
        </div>
      </div>

      {/* Events — most decision-critical surface */}
      {(activeEvents.length > 0 || room.lastError || error) && (
        <div className="mb-6 space-y-3">
          {error && (
            <WarningPanel
              title="Command Feedback"
              warnings={[{ id: "cmd", message: error, level: "warning" }]}
            />
          )}
          {room.lastError && (
            <WarningPanel
              title="Room Message"
              warnings={[{ id: "room-err", message: room.lastError, level: "warning" }]}
            />
          )}
          {activeEvents.map((ev) => (
            <EventCard
              key={ev.event_id}
              event={ev}
              canResolve
              onChoose={(choice) => void chooseEventResponse(ev, choice.id)}
            />
          ))}
        </div>
      )}

      {/* Warnings */}
      <div className="mb-6">
        <WarningPanel warnings={warnings} />
      </div>

      {/* Shared mission view: telemetry */}
      <Card
        title="Shared Telemetry"
        icon="📊"
        className="mb-6"
        subtitle="All crew members see this view — SIMULATED physics data"
      >
        {activeTelemetry ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <ResourceMeter label="Health" value={activeTelemetry.spacecraft_health_pct} max={100} unit="%" />
              <ResourceMeter label="Battery" value={activeTelemetry.power.battery_soc_pct} max={100} unit="%" />
              <ResourceMeter label="Bus temp" value={activeTelemetry.thermal.temperature_c} max={100} unit="°C" invert />
              <ResourceMeter label="Buffer" value={activeTelemetry.comms.data_buffer_pct} max={100} unit="%" invert />
            </div>
            {engineerMode && (
              <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4" open>
                <summary className="text-sm font-medium text-cyan-400 cursor-pointer">
                  Engineer Mode — full subsystem assumptions
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 font-mono text-xs text-slate-400">
                  <div>
                    <p className="text-slate-300 font-semibold mb-1">POWER</p>
                    <p>solar {activeTelemetry.power.solar_output_w.toFixed(0)} W</p>
                    <p>load {activeTelemetry.power.total_load_w.toFixed(0)} W</p>
                    <p>net {activeTelemetry.power.net_power_w.toFixed(0)} W</p>
                    <p>eclipse {activeTelemetry.power.in_eclipse ? "yes" : "no"}</p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-semibold mb-1">THERMAL</p>
                    <p>in {activeTelemetry.thermal.heat_input_w.toFixed(0)} W</p>
                    <p>out {activeTelemetry.thermal.heat_rejected_w.toFixed(0)} W</p>
                    <p>T {activeTelemetry.thermal.temperature_c.toFixed(1)} °C</p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-semibold mb-1">COMMS</p>
                    <p>buffer {activeTelemetry.comms.data_buffer_mb.toFixed(0)} MB</p>
                    <p>rate contact {activeTelemetry.comms.in_contact ? "yes" : "no"}</p>
                    <p>station {activeTelemetry.comms.active_station || "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-semibold mb-1">ORBIT</p>
                    <p>alt {activeTelemetry.orbital.altitude_km.toFixed(0)} km</p>
                    <p>v {activeTelemetry.orbital.velocity_km_s.toFixed(2)} km/s</p>
                    <p>anomaly {activeTelemetry.orbital.true_anomaly_deg.toFixed(0)}°</p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-slate-600">
                  Model assumptions: cylindrical eclipse shadow, sun-tracking solar array
                  (P ∝ cos β), radiator rejection ∝ εσA(T⁴ − T_sink⁴). Sources: /data
                </p>
              </details>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">
            No telemetry yet — {isCoop ? "waiting for the first step from any crew member." : "advance the mission to start the flow."}
          </p>
        )}
      </Card>

      {/* Stations */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-white">
            {isCoop ? "Your Stations" : "All Stations"}
          </h2>
          {!isCoop && (
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={engineerMode}
                onChange={(e) => setEngineerMode(e.target.checked)}
                className="accent-blue-500"
              />
              Engineer Mode
            </label>
          )}
        </div>
        <Tabs
          tabs={stationTabs.length > 0 ? stationTabs : [{ id: "none", label: "No station assigned" }]}
        >
          {stationTabs.length === 0 ? (
            <p className="text-sm text-slate-500">
              You have no station yet — roles are assigned when the host starts the mission.
            </p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {isCoop && (
                <Card title="Crew Feed" icon="📻" className="xl:col-span-2">
                  {room.feed.length === 0 ? (
                    <p className="text-sm text-slate-500">No crew activity yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-slate-300">
                      {room.feed.map((line, i) => (
                        <li key={i} className="font-mono text-xs">{line}</li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
              {myRoles.map((roleId) => {
                const Station = STATION_COMPONENTS[roleId];
                return (
                  <Card
                    key={roleId}
                    title={ROLES[roleId].label}
                    icon={ROLES[roleId].icon}
                    subtitle={`Station — ${ROLES[roleId].label}`}
                  >
                    <Station {...stationProps} />
                  </Card>
                );
              })}
            </div>
          )}
        </Tabs>
      </div>

      {/* Mission progress controls */}
      <Card className="sticky bottom-4">
        <div className="flex flex-wrap items-center gap-3">
          {isCoop ? (
            <>
              <Button
                onClick={() => room.send({ command: "step", steps: 1 })}
                disabled={phase !== "playing"}
              >
                Advance Mission ▸ 1 Step
              </Button>
              <Button
                variant="secondary"
                onClick={() => room.send({ command: "step", steps: 5 })}
                disabled={phase !== "playing"}
              >
                ▸▸ 5 Steps
              </Button>
              <Button variant="ghost" onClick={() => room.send({ command: "get_state" })}>
                Sync State
              </Button>
              <p className="text-xs text-slate-500">
                Any crew member can advance the shared mission clock.
              </p>
            </>
          ) : (
            <>
              <Button onClick={() => void doStep(1)} disabled={stepping || gameState?.status !== "running"}>
                {stepping ? "Stepping…" : "Advance Mission ▸ 1 Step"}
              </Button>
              <Button variant="secondary" onClick={() => void doStep(5)} disabled={stepping || gameState?.status !== "running"}>
                ▸▸ 5 Steps
              </Button>
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRun}
                  onChange={(e) => setAutoRun(e.target.checked)}
                  disabled={gameState?.status !== "running"}
                  className="accent-blue-500"
                />
                Auto-run
              </label>
            </>
          )}

          <div className="ml-auto flex gap-2">
            {(activeGameState?.status === "completed" || activeGameState?.status === "failed" || room.phase === "finished") && (
              <Button onClick={() => navigate("/results")}>View Mission Results →</Button>
            )}
            <Button
              variant="ghost"
              onClick={async () => {
                if (session.mode === "solo" && session.sessionId) {
                  try {
                    const { deleteGameSession } = await import("../api/client");
                    await deleteGameSession(session.sessionId);
                  } catch { /* session may already be gone */ }
                }
                clearMissionSession();
                navigate("/");
              }}
            >
              End & Leave Mission
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function isFinished(state: GameStateSummary | null): boolean {
  return state?.status === "completed" || state?.status === "failed";
}

// Re-export for the results page navigation convenience
export type { StepResult };
