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
import { StatusBadge } from "../components/StatusBadge";
import { ResourceMeter } from "../components/ResourceMeter";
import { CesiumMissionViewer } from "../components/CesiumMissionViewer";
import { MissionClockBar } from "../components/MissionClockBar";
import {
  ParticipantList,
  type PendingActionRequest,
  type ActionAuditEntry,
} from "../components/ParticipantList";
import { ProvenanceBadge } from "../components/ProvenanceBadge";
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
  getSimulationClock,
  pauseSimulationClock,
  resumeSimulationClock,
  setSimulationClockSpeed,
  fastForwardSimulation,
  getForecastTimeline,
  getGroundTrack,
  saveSimulationCheckpoint,
  restoreSimulationCheckpoint,
  getAdvisoryState,
  respondToAdvisory,
  setAdvisoryAutomation,
} from "../api/client";
import { PredictiveAdvisoryPanel } from "../components/PredictiveAdvisoryPanel";
import type {
  ForecastWindow,
  AdvisoryRecommendation,
  AdvisoryMetricsSummary,
} from "../types/advisory";
import { useRoomSocket } from "../hooks/useRoomSocket";
import {
  loadMissionSession,
  clearMissionSession,
  type MissionSession,
} from "../lib/mission";
import type {
  ActiveEvent,
  GameStateSummary,
  StepResult,
  Telemetry,
  ClockState,
  GroundTrackPoint,
  TimelineEvent,
} from "../types";
import { ROLES, type RoleId } from "../lib/constants";
import { Satellite, Activity, Radio, Globe, Crosshair, Wallet, Users, ChevronRight, LogOut, Radar } from "lucide-react";

const BUDGET_TOTAL = 10000;

function fmtClock(seconds: number, durationHours: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} / ${durationHours.toFixed(0)}:00 h`;
}

/**
 * Operate / Mission Control — Live Flight Deck.
 * Centered around decisions: primary & optional objectives, countdown/deadlines,
 * upcoming forecast timeline, active event cards, resource meters, non-color warnings,
 * command status, and primary 3D Cesium mission view with accessible 2D fallback.
 *
 * Solo mode: All Stations workspace with four role panels + action history.
 * Co-op mode: Role-specific workstations, crew member connection status, action requests,
 * and shared authoritative state across all participants.
 */
export function OperatePage() {
  const navigate = useNavigate();
  const [session] = useState<MissionSession | null>(() => loadMissionSession());
  const [engineerMode, setEngineerMode] = useState(
    () => localStorage.getItem("lumenos.engineerMode") === "true"
 );
  const [force2DMap, setForce2DMap] = useState(false);

  // Solo REST state
  const [gameState, setGameState] = useState<GameStateSummary | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [groundTrack, setGroundTrack] = useState<GroundTrackPoint[]>([]);
  const [forecastEvents, setForecastEvents] = useState<TimelineEvent[]>([]);
  const [savedCheckpoint, setSavedCheckpoint] = useState<any>(null);
  const [stepping, setStepping] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // LumenOS Predictive Advisory state (Prompt 12)
  const [advisoryForecast, setAdvisoryForecast] = useState<ForecastWindow | null>(null);
  const [advisoryRecs, setAdvisoryRecs] = useState<AdvisoryRecommendation[]>([]);
  const [advisoryMetrics, setAdvisoryMetrics] = useState<AdvisoryMetricsSummary | null>(null);
  const [advisoryAutoPilot, setAdvisoryAutoPilot] = useState<boolean>(false);

  // Co-op audit feed & pending requests
  const [pendingRequests, setPendingRequests] = useState<PendingActionRequest[]>([]);
  const [recentActions, setRecentActions] = useState<ActionAuditEntry[]>([]);

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
      const [stateResp, telResp, clockResp] = await Promise.all([
        getGameState(session.sessionId),
        getGameTelemetry(session.sessionId),
        getSimulationClock(session.sessionId).catch(() => null),
      ]);
      setGameState(stateResp.game_state);
      if (Object.keys(telResp.telemetry).length > 0) setTelemetry(telResp.telemetry);
      if (clockResp?.clock) setClock(clockResp.clock);

      // Async fetch ground track and timeline forecast
      void getGroundTrack(session.sessionId, 60)
        .then((resp) => {
          if (resp?.points) setGroundTrack(resp.points);
        })
        .catch(() => {});

      void getForecastTimeline(session.sessionId, 14400)
        .then((resp) => {
          if (resp?.timeline_events) setForecastEvents(resp.timeline_events);
        })
        .catch(() => {});

      void getAdvisoryState(session.sessionId)
        .then((adv) => {
          if (adv?.forecast) setAdvisoryForecast(adv.forecast);
          if (adv?.recommendations || adv?.active_recommendations) {
            setAdvisoryRecs(adv.recommendations || adv.active_recommendations);
          }
          if (adv?.metrics) setAdvisoryMetrics(adv.metrics);
          if (adv?.auto_pilot_enabled !== undefined) {
            setAdvisoryAutoPilot(adv.auto_pilot_enabled);
          }
        })
        .catch(() => {});
    } catch (err) {
      setError((err as Error).message);
    }
  }, [session?.sessionId]);

  const handleAdvisoryResponse = async (
    recId: string,
    action: "accept" | "reject" | "modify",
    modifiedParams?: Record<string, any>
 ) => {
    if (!session?.sessionId) return;
    try {
      if (session.mode === "solo") {
        await respondToAdvisory(session.sessionId, {
          recommendation_id: recId,
          action,
          modified_parameters: modifiedParams,
        });
        setStatusMessage(`Advisory recommendation ${action}ed.`);
        void refreshSolo();
      } else {
        room.send({
          command: "advisory_respond",
          recommendation_id: recId,
          action,
          modified_parameters: modifiedParams,
        });
        setStatusMessage(`Broadcasted advisory ${action} to team.`);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleAdvisoryAutomation = async (enabled: boolean) => {
    if (!session?.sessionId) return;
    try {
      if (session.mode === "solo") {
        await setAdvisoryAutomation(session.sessionId, { enabled });
        setAdvisoryAutoPilot(enabled);
        setStatusMessage(`LumenOS autopilot automation set to ${enabled ? "ACTIVE" : "STANDBY"}.`);
        void refreshSolo();
      } else {
        room.send({
          command: "set_automation",
          enabled,
        });
        setAdvisoryAutoPilot(enabled);
        setStatusMessage(`Team autopilot set to ${enabled ? "ACTIVE" : "STANDBY"}.`);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

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

  // ── Clock & Simulation Controls ──────────────────────────────────────
  const handlePause = async () => {
    if (session?.mode === "coop") {
      room.send({ command: "pause" });
      return;
    }
    if (!session?.sessionId) return;
    try {
      const resp = await pauseSimulationClock(session.sessionId);
      if (resp.clock) setClock(resp.clock);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleResume = async () => {
    if (session?.mode === "coop") {
      room.send({ command: "resume" });
      return;
    }
    if (!session?.sessionId) return;
    try {
      const resp = await resumeSimulationClock(session.sessionId);
      if (resp.clock) setClock(resp.clock);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSetSpeed = async (multiplier: number) => {
    if (session?.mode === "coop") {
      room.send({ command: "clock_speed", speed: multiplier });
      return;
    }
    if (!session?.sessionId) return;
    try {
      const resp = await setSimulationClockSpeed(session.sessionId, multiplier);
      if (resp.clock) setClock(resp.clock);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleFastForward = async (params: { target_seconds?: number; event_type?: string }) => {
    if (!session?.sessionId) return;
    try {
      setStatusMessage(`Fast-forwarding to ${params.event_type ?? "target"}...`);
      await fastForwardSimulation(session.sessionId, params);
      await refreshSolo();
      setStatusMessage("Simulation advanced to event timestamp.");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveCheckpoint = async () => {
    if (!session?.sessionId) return;
    try {
      const resp = await saveSimulationCheckpoint(session.sessionId);
      if (resp?.checkpoint) {
        setSavedCheckpoint(resp.checkpoint);
        setStatusMessage("Checkpoint snapshot saved successfully.");
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRestoreCheckpoint = async () => {
    if (!session?.sessionId || !savedCheckpoint) {
      setError("No saved checkpoint available to restore.");
      return;
    }
    try {
      const resp = await restoreSimulationCheckpoint(session.sessionId, savedCheckpoint);
      if (resp.restored) {
        if (resp.clock) setClock(resp.clock);
        await refreshSolo();
        setStatusMessage("Checkpoint restored successfully.");
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ── Action dispatch (solo REST / co-op WS) ───────────────────────────
  const dispatchAction = async (actionType: string, params: Record<string, unknown>, label: string) => {
    setError(null);
    const nowStr = new Date().toLocaleTimeString();

    if (session?.mode === "coop") {
      room.send({ command: "action", action_type: actionType, params });
      setRecentActions((prev) => [
        {
          actor: "You",
          role: myRoles[0] ?? "crew",
          actionType: label,
          timestamp: nowStr,
          result: "ACCEPTED",
        },
        ...prev,
      ]);
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
        setRecentActions((prev) => [
          {
            actor: "Director/You",
            role: "flight_deck",
            actionType: label,
            timestamp: nowStr,
            result: "REJECTED",
            detail: resp.error,
          },
          ...prev,
        ]);
      } else {
        setRecentActions((prev) => [
          {
            actor: "Director/You",
            role: "flight_deck",
            actionType: label,
            timestamp: nowStr,
            result: "ACCEPTED",
          },
          ...prev,
        ]);
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
  const activeEvents = isCoop
    ? room.activeEvents
    : (gameState?.active_events ?? []).filter((e) => e.is_pending);
  const objectives = activeGameState?.objectives ?? [];
  const budgetRemaining = activeGameState?.budget_remaining ?? BUDGET_TOTAL;

  // Derive active clock state
  const activeClock: ClockState = useMemo(() => {
    if (clock) return clock;
    return {
      status: autoRun ? "RUNNING" : "PAUSED",
      speed_multiplier: 1.0,
      time_step_seconds: 60.0,
      elapsed_seconds: activeGameState?.elapsed_seconds ?? 0,
      step_count: activeGameState?.step ?? 0,
      max_steps: 1440,
    };
  }, [clock, autoRun, activeGameState?.elapsed_seconds, activeGameState?.step]);

  const myRoles = useMemo<RoleId[]>(() => {
    if (!session) return [];
    if (!isCoop) return STATION_ORDER; // solo: all stations
    const assigned = room.roles[session.playerId] ?? [];
    return assigned as RoleId[];
  }, [session, isCoop, room.roles]);

  const isHost = useMemo(() => {
    if (!isCoop || !session) return false;
    return Boolean(room.participants.find((p) => p.player_id === session.playerId)?.is_host);
  }, [isCoop, session, room.participants]);

  const warnings = useMemo<Warning[]>(() => {
    if (!activeTelemetry) return [];
    const w: Warning[] = [];
    if (activeTelemetry.power.power_critical)
      w.push({ id: "power-critical", message: "CRITICAL: Battery level below safety threshold — imminent bus shutdown", level: "critical" });
    else if (activeTelemetry.power.low_power_warning)
      w.push({ id: "power-low", message: "WARN: Low battery state — non-critical loads should be shed", level: "warning" });

    if (activeTelemetry.thermal.thermal_critical)
      w.push({ id: "thermal-critical", message: "CRITICAL: Thermal boundary exceeded — payload overheat risk", level: "critical" });
    else if (activeTelemetry.thermal.overtemp_warning)
      w.push({ id: "overtemp", message: `WARN: Bus temperature high (${activeTelemetry.thermal.temperature_c.toFixed(1)} °C)`, level: "critical" });
    else if (activeTelemetry.thermal.undertemp_warning)
      w.push({ id: "undertemp", message: "WARN: Bus temperature below lower tolerance limit — heaters firing", level: "warning" });

    if (activeTelemetry.comms.buffer_full_warning)
      w.push({ id: "buffer-full", message: "WARN: Onboard data buffer full — downlink pass required", level: "warning" });
    if (activeTelemetry.workload.cpu_overload_warning)
      w.push({ id: "cpu", message: "WARN: CPU overload — observation processing backing up", level: "warning" });
    if (activeTelemetry.storage.storage_full_warning)
      w.push({ id: "storage", message: "WARN: Solid-state storage capacity near overflow", level: "warning" });
    if (activeTelemetry.radiation_debris?.radiation_warning)
      w.push({ id: "radiation", message: "WARN: High radiation environment (SAA / Auroral crossing)", level: "warning" });
    return w;
  }, [activeTelemetry]);

  // ── Guard states ─────────────────────────────────────────────────────
  if (!session || !session.missionId) {
    return (
 <div className="max-w-3xl mx-auto px-4 py-12">
 <Card title="No Active Mission">
 <p className="text-muted text-sm mb-4">
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
 <Card title="Not in a Room">
 <p className="text-muted text-sm mb-4">
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
 <Card title="Waiting in Lobby…">
 <p className="text-muted text-sm mb-4">
            Room <span className="font-mono text-ink">{session.roomCode}</span> — the
            host hasn't launched yet. Return to the lobby for status.
 </p>
 <Button onClick={() => navigate("/coop/lobby")}>Open Lobby</Button>
 </Card>
 </div>
 );
  }

  const missionHours = 24;

  const stationTabs = myRoles.map((roleId) => {
    const RoleIcon = ROLES[roleId].Icon;
    return {
      id: roleId,
      label: ROLES[roleId].label,
      icon: <RoleIcon className="h-4 w-4" />,
    };
  });

  const stationProps: StationProps = {
    telemetry: activeTelemetry,
    budgetRemaining,
    budgetTotal: BUDGET_TOTAL,
    onAction: (type, params, label) => void dispatchAction(type, params, label),
    enabled: phase === "playing" && !isFinished(activeGameState),
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Command header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center border border-accent/40 bg-accent/10 text-accent">
            <Satellite className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight text-ink md:text-2xl">
                {session.missionName}
              </h1>
              <ProvenanceBadge provenance="SIMULATED_SPACECRAFT" />
            </div>
            <p className="micro-label mt-1 text-faint">
              CONTRACT {session.missionId} · ORBITER LUMEN-1
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={isCoop ? `CO-OP ROOM: ${session.roomCode}` : "SOLO FLIGHT DECK"}
            variant="info"
          />
          <StatusBadge
            label={
              activeGameState?.status === "completed"
                ? `Mission Complete — ${activeGameState.outcome}`
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
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setForce2DMap(!force2DMap)}
            title="Toggle between 3D Cesium View and 2D Accessible Map"
          >
            {force2DMap ? "3D View" : "2D Map"}
          </Button>
        </div>
      </div>

      {/* ── Mission clock & transport controls ── */}
      <MissionClockBar
        clock={activeClock}
        onPause={() => void handlePause()}
        onResume={() => void handleResume()}
        onSetSpeed={(s) => void handleSetSpeed(s)}
        onStep={(n) => void doStep(n)}
        onFastForward={(p) => void handleFastForward(p)}
        onSaveCheckpoint={() => void handleSaveCheckpoint()}
        onRestoreCheckpoint={() => void handleRestoreCheckpoint()}
        disabled={stepping || isFinished(activeGameState)}
        isCoop={isCoop}
      />

      {/* Status toast */}
      {statusMessage && (
        <div
          className="flex items-center gap-2 border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-xs text-accent animate-rise"
          role="status"
        >
          <Radar className="h-3.5 w-3.5" aria-hidden /> {statusMessage}
        </div>
      )}

      {/* Co-op reconnecting banner */}
      {isCoop && room.status === "connecting" && (
        <div
          className="flex items-center justify-between border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-ping bg-warn" aria-hidden="true" />
            <span>Reconnecting to mission network…</span>
          </div>
          <span className="micro-label">RECONNECTING</span>
        </div>
      )}

      {/* ── Decision zone: errors + active events (always on top) ── */}
      {(error || room.lastError || activeEvents.length > 0) && (
        <div className="space-y-3">
          {error && (
            <WarningPanel
              title="Command Feedback"
              warnings={[{ id: "cmd-err", message: error, level: "warning" }]}
            />
          )}
          {room.lastError && (
            <WarningPanel
              title="Room Network Error"
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

      {/* ── Flight director cockpit ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Center: situation display + systems */}
        <div className="min-w-0 space-y-4">
          <Card frame title="Orbital Situation Display" icon={<Globe className="h-4 w-4" />}>
            <CesiumMissionViewer
              orbital={activeTelemetry?.orbital}
              comms={activeTelemetry?.comms}
              clock={activeClock}
              scenarioId={session.missionId}
              groundTrackPoints={groundTrack}
              forceFallback={force2DMap}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card title="Subsystem Status" icon={<Activity className="h-4 w-4" />}>
              {activeTelemetry ? (
                <div className="space-y-4">
                  <ResourceMeter
                    label="Spacecraft Health"
                    value={activeTelemetry.spacecraft_health_pct}
                    max={100}
                    unit="%"
                  />
                  <ResourceMeter
                    label="Battery SoC"
                    value={activeTelemetry.power.battery_soc_pct}
                    max={100}
                    unit="%"
                  />
                  <ResourceMeter
                    label="Bus Temp"
                    value={activeTelemetry.thermal.temperature_c}
                    max={100}
                    unit="°C"
                    invert
                  />
                  <ResourceMeter
                    label="Comms Buffer"
                    value={activeTelemetry.comms.data_buffer_pct}
                    max={100}
                    unit="%"
                    invert
                  />
                  {engineerMode && (
                    <details className="border border-edge bg-void/60 p-3">
                      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.1em] text-info">
                        Deep physics telemetry
                      </summary>
                      <div className="mt-3 grid grid-cols-1 gap-4 font-mono text-xs text-muted sm:grid-cols-2">
                        <div>
                          <p className="micro-label mb-1 text-ink">Power accounting</p>
                          <p>Solar Gen: {activeTelemetry.power.solar_output_w.toFixed(0)} W</p>
                          <p>Bus Load: {activeTelemetry.power.total_load_w.toFixed(0)} W</p>
                          <p>Net Power: {activeTelemetry.power.net_power_w.toFixed(0)} W</p>
                          <p>DoD: {activeTelemetry.power.battery_dod_pct?.toFixed(1) ?? "0.0"}%</p>
                          <p>EFC: {activeTelemetry.power.battery_equivalent_full_cycles?.toFixed(3) ?? "0.000"}</p>
                        </div>
                        <div>
                          <p className="micro-label mb-1 text-ink">Thermal balance</p>
                          <p>Solar+Albedo: {((activeTelemetry.thermal.solar_absorbed_w ?? 0) + (activeTelemetry.thermal.albedo_absorbed_w ?? 0)).toFixed(0)} W</p>
                          <p>Internal Heat: {activeTelemetry.thermal.internal_dissipation_w?.toFixed(0) ?? "0"} W</p>
                          <p>Rejected: {activeTelemetry.thermal.heat_rejected_w.toFixed(0)} W</p>
                          <p>T Bus: {activeTelemetry.thermal.temperature_c.toFixed(1)} °C</p>
                        </div>
                        <div>
                          <p className="micro-label mb-1 text-ink">Comms & storage</p>
                          <p>Data Buffer: {activeTelemetry.comms.data_buffer_mb.toFixed(1)} MB</p>
                          <p>RF Link: {activeTelemetry.comms.in_contact ? "ACTIVE" : "NO CONTACT"}</p>
                          <p>Ground Stn: {activeTelemetry.comms.active_station || "None"}</p>
                          <p>Downlinked: {activeTelemetry.comms.data_downlinked_mb.toFixed(1)} MB</p>
                        </div>
                        <div>
                          <p className="micro-label mb-1 text-ink">Orbit & environment</p>
                          <p>Altitude: {activeTelemetry.orbital.altitude_km.toFixed(1)} km</p>
                          <p>Velocity: {activeTelemetry.orbital.velocity_km_s.toFixed(2)} km/s</p>
                          <p>True Anomaly: {activeTelemetry.orbital.true_anomaly_deg.toFixed(1)}°</p>
                          <p>Illumination: {activeTelemetry.orbital.in_eclipse ? "Umbra" : "Sunlit"}</p>
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <p className="font-mono text-xs text-faint">
                  {isCoop
                    ? "AWAITING TELEMETRY — ADVANCE THE MISSION"
                    : "AWAITING TELEMETRY — PRESS STEP OR RESUME"}
                </p>
              )}
            </Card>

            <div className="space-y-4">
              <Card title="Pass Forecast" icon={<Radio className="h-4 w-4" />}>
                {forecastEvents.length > 0 ? (
                  <ul className="space-y-2 font-mono text-xs">
                    {forecastEvents.slice(0, 4).map((ev) => (
                      <li key={ev.event_id} className="flex items-center justify-between border-b border-edge pb-1.5 last:border-0">
                        <span className="truncate text-muted">{ev.label}</span>
                        <span className="ml-3 shrink-0 text-info">T+{Math.floor(ev.timestamp_seconds / 60)}m</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-mono text-xs text-faint">NO UPCOMING CONTACTS</p>
                )}
              </Card>
              <Timeline
                marks={[
                  {
                    label: "Now",
                    fraction:
                      ((activeGameState?.step ?? 0) / Math.max(1, activeGameState?.step ?? 1)) *
                      0.999,
                    kind: "active",
                  },
                ]}
                timeLabel={fmtClock(activeGameState?.elapsed_seconds ?? 0, missionHours)}
                className="border border-edge bg-panel p-4"
              />
            </div>
          </div>
        </div>

        {/* Right rail: contract & budget */}
        <div className="space-y-4">
          <Card frame title="Contract Objectives" icon={<Crosshair className="h-4 w-4" />}>
            <ObjectiveTracker objectives={objectives} />
          </Card>
          <Card title="Mission Budget" icon={<Wallet className="h-4 w-4" />}>
            <BudgetMeter remaining={budgetRemaining} total={BUDGET_TOTAL} />
          </Card>
          <WarningPanel warnings={warnings} />
        </div>
      </div>

      {/* ── LumenOS Predictive advisory ── */}
      <PredictiveAdvisoryPanel
        forecast={advisoryForecast}
        recommendations={advisoryRecs}
        metrics={advisoryMetrics}
        autoPilotEnabled={advisoryAutoPilot}
        onRespond={handleAdvisoryResponse}
        onToggleAutomation={handleToggleAdvisoryAutomation}
      />

      {/* ── Workstations ── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-5">
          <h2 className="micro-label text-faint">
            {isCoop ? "Role Station" : "Flight Deck Stations"}
          </h2>
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs uppercase tracking-[0.08em] text-muted">
            <input
              type="checkbox"
              checked={engineerMode}
              onChange={(e) => setEngineerMode(e.target.checked)}
              className="accent-accent"
            />
            Engineer Mode
          </label>
        </div>

        {/* Co-op crew network */}
        {isCoop && (
          <Card title="Crew Network & Command Operations" icon={<Users className="h-4 w-4" />}>
            {isHost && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border border-warn/30 bg-void p-2.5">
                <div className="flex items-center gap-2">
                  <span className="micro-label border border-warn/30 bg-warn/10 px-2 py-1 text-warn">
                    HOST
                  </span>
                  <span className="text-xs text-muted">Session authority</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (room.isPaused) room.resume();
                      else room.pause();
                    }}
                  >
                    {room.isPaused ? "Resume" : "Pause"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (window.confirm("Restart mission from ignition step 0?")) {
                        room.restart();
                      }
                    }}
                  >
                    Restart
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (window.confirm("End mission and calculate final score?")) {
                        room.end();
                      }
                    }}
                  >
                    End Mission
                  </Button>
                </div>
              </div>
            )}

            <ParticipantList
              participants={room.participants}
              selfId={session.playerId}
              roles={room.roles}
              pendingRequests={room.pendingRequests.length > 0 ? room.pendingRequests : pendingRequests}
              recentActions={recentActions}
              feed={room.feed}
              userRoles={myRoles}
              canApprove={myRoles.includes("mission_director") || isHost}
              onSendTacticalPing={(pingType, msg) => {
                room.sendTacticalPing(pingType, msg);
                setStatusMessage(`Broadcasted tactical ping: ${pingType}`);
                setTimeout(() => setStatusMessage(null), 3000);
              }}
              onApproveRequest={(id) => {
                room.respondActionRequest(id, "approve");
                setPendingRequests((prev) => prev.filter((r) => r.id !== id));
                setStatusMessage(`Authorized request ${id}.`);
                setTimeout(() => setStatusMessage(null), 3000);
              }}
              onRejectRequest={(id) => {
                room.respondActionRequest(id, "reject");
                setPendingRequests((prev) => prev.filter((r) => r.id !== id));
                setStatusMessage(`Rejected request ${id}.`);
                setTimeout(() => setStatusMessage(null), 3000);
              }}
            />
          </Card>
        )}

        {/* Role workstations */}
        <Tabs
          tabs={stationTabs.length > 0 ? stationTabs : [{ id: "none", label: "No Station Assigned" }]}
        >
          {stationTabs.length === 0 ? (
            <p className="font-mono text-xs text-faint">No station assigned yet. Contact room host.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {myRoles.map((roleId) => {
                const Station = STATION_COMPONENTS[roleId];
                const RoleIcon = ROLES[roleId].Icon;
                return (
                  <Card
                    key={roleId}
                    title={ROLES[roleId].label}
                    icon={<RoleIcon className="h-4 w-4" />}
                    subtitle={ROLES[roleId].description}
                  >
                    <Station {...stationProps} />
                  </Card>
                );
              })}
            </div>
          )}
        </Tabs>
      </section>

      {/* ── Command bar (sticky) ── */}
      <div className="sticky bottom-4 border border-edge-strong bg-panel/95 p-3 shadow-[0_-4px_24px_rgba(0,0,0,0.5)] backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void doStep(1)}
              disabled={stepping || isFinished(activeGameState)}
            >
              {stepping ? "Stepping…" : "Advance 1 Step"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void doStep(5)}
              disabled={stepping || isFinished(activeGameState)}
            >
              +5 Steps
            </Button>
            {!isCoop && (
              <label className="ml-2 flex cursor-pointer items-center gap-2 font-mono text-xs uppercase tracking-[0.08em] text-muted">
                <input
                  type="checkbox"
                  checked={autoRun}
                  onChange={(e) => setAutoRun(e.target.checked)}
                  disabled={isFinished(activeGameState)}
                  className="accent-accent"
                />
                Auto-run
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(activeGameState?.status === "completed" ||
              activeGameState?.status === "failed" ||
              room.phase === "finished") && (
              <Button onClick={() => navigate("/results")}>
                Mission Results <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={async () => {
                if (session.mode === "solo" && session.sessionId) {
                  try {
                    const { deleteGameSession } = await import("../api/client");
                    await deleteGameSession(session.sessionId);
                  } catch {
                    /* ignore */
                  }
                }
                clearMissionSession();
                navigate("/");
              }}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> End & Leave
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isFinished(state: GameStateSummary | null): boolean {
  return state?.status === "completed" || state?.status === "failed";
}

export type { StepResult };
