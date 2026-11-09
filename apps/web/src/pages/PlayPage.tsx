import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  Camera,
  Radio,
  Leaf,
  Zap,
  Shield,
  Rocket,
  Play,
  Pause,
  Coins,
  X,
} from "lucide-react";
import {
  getGameState,
  getGameTelemetry,
  getSimulationClock,
  getGroundTrack,
  getAdvisoryState,
  respondToAdvisory,
  stepGame,
  performAction,
  resolveEvent,
} from "../api/client";
import { loadMissionSession, saveMissionSession, newPlayerId, type MissionSession } from "../lib/mission";
import {
  KID_ACTIONS,
  coinsLeft,
  kidEvent,
  kidGauges,
  kidGoals,
  missionClock,
  missionGoal,
  missionStory,
  nextOnboardingTip,
  situationTip,
  type KidAction,
  type LumiTip,
} from "../lib/kid";
import { CesiumFlightView } from "../components/CesiumFlightView";
import { KidGaugeBar } from "../components/flight/KidGaugeBar";
import { EventPopup } from "../components/flight/EventPopup";
import { LumiBot, type LumiAdvice } from "../components/flight/LumiBot";
import { ToastStack, type Toast } from "../components/flight/Toasts";
import type {
  ActiveEvent,
  ClockState,
  GameStateSummary,
  GroundTrackPoint,
  Telemetry,
} from "../types";

const ACTION_ICONS = { camera: Camera, antenna: Radio, leaf: Leaf, zap: Zap, shield: Shield, rocket: Rocket } as const;

const SPEEDS = [
  { label: "1×", steps: 1, delayMs: 1200 },
  { label: "2×", steps: 1, delayMs: 600 },
  { label: "5×", steps: 1, delayMs: 240 },
] as const;

/**
 * Cadet flight screen — the simple, immersive gameplay surface.
 * Fullscreen 3D stage with floating HUD: goals, gauges, transport,
 * six friendly actions, event popups, and Lumi the helper robot.
 */
export function PlayPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const locationState = location.state as { sessionId?: string; missionId?: string } | null;
  const querySessionId = searchParams.get("session");
  const [session, setSession] = useState(() => loadMissionSession());

  const effectiveSessionId = locationState?.sessionId ?? querySessionId ?? session?.sessionId ?? null;
  const sessionId = effectiveSessionId;
  const missionId = locationState?.missionId ?? session?.missionId ?? searchParams.get("mission") ?? "wildfire";

  const [state, setState] = useState<GameStateSummary | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [groundTrack, setGroundTrack] = useState<GroundTrackPoint[]>([]);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [lumiAdvice, setLumiAdvice] = useState<LumiAdvice | null>(null);

  const [running, setRunning] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tip, setTip] = useState<LumiTip | null>(null);
  const toastSeq = useRef(0);
  const endedRef = useRef(false);

  // ── Sync session to localStorage if arrived via router state ─────────────
  useEffect(() => {
    if (effectiveSessionId && session?.sessionId !== effectiveSessionId) {
      const updated: MissionSession = {
        mode: session?.mode ?? "solo",
        missionId,
        missionName: session?.missionName ?? "Mission",
        spacecraftId: null,
        sessionId: effectiveSessionId,
        playerId: session?.playerId ?? newPlayerId(),
        roomCode: null,
        experience: "simple",
      };
      saveMissionSession(updated);
      setSession(updated);
    }
  }, [effectiveSessionId, missionId, session]);

  // ── Toasts ────────────────────────────────────────────────────────────────
  const pushToast = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = ++toastSeq.current;
    setToasts((ts) => [...ts.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 2500);
  }, []);

  // ── Guard: need a live session (solo only — co-op keeps the expert deck) ──
  useEffect(() => {
    const s = loadMissionSession();
    const effectiveId = locationState?.sessionId ?? querySessionId ?? s?.sessionId;
    if (!effectiveId) {
      navigate("/missions", { replace: true });
    } else if (s?.mode === "coop") {
      navigate("/operate", { replace: true });
    }
  }, [locationState, querySessionId, navigate]);

  // ── Initial load ──────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const [stateResp, telResp, clockResp] = await Promise.all([
        getGameState(sessionId),
        getGameTelemetry(sessionId),
        getSimulationClock(sessionId).catch(() => null),
      ]);
      const gs = stateResp.game_state;
      setState(gs);

      const tel = telResp?.telemetry;
      const hasValidTel = tel && typeof tel === "object" && Object.keys(tel).length > 0 && !!tel.power;
      if (hasValidTel) {
        setTelemetry(tel);
        setTip(situationTip(kidGauges(tel), gs, tel.orbital?.in_eclipse ?? false));
      } else {
        // Step once to establish initial telemetry snapshot
        try {
          const stepResp = await stepGame(sessionId, 1);
          const last = stepResp.results?.[stepResp.results.length - 1];
          if (last?.telemetry) {
            setState(last.game_state);
            setTelemetry(last.telemetry);
            setTip(situationTip(kidGauges(last.telemetry), last.game_state, last.telemetry.orbital?.in_eclipse ?? false));
          }
        } catch {
          /* ignore */
        }
      }

      if (clockResp?.clock) setClock(clockResp.clock);
      const events = (gs.active_events ?? []).filter((e) => e.is_pending);
      setActiveEvent(events[0] ?? null);
    } catch {
      pushToast("Lost contact with mission control…", "error");
    }
  }, [sessionId, pushToast]);

  useEffect(() => {
    if (!sessionId) return;
    void refresh();
    getGroundTrack(sessionId)
      .then((r) => setGroundTrack(r.points ?? []))
      .catch(() => undefined);
  }, [sessionId, refresh]);

  // ── Onboarding tips (first flight only) ───────────────────────────────────
  useEffect(() => {
    const raw = nextOnboardingTip();
    setTip(raw ? { text: raw, kind: "tip" } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Advisory (Lumi's smart suggestion) ────────────────────────────────────
  const refreshAdvisory = useCallback(async () => {
    if (!sessionId) return;
    try {
      const resp = await getAdvisoryState(sessionId);
      const recs = resp?.advisory?.recommendations ?? [];
      const pending = recs.find((r: any) => r.status === "pending");
      setLumiAdvice(
        pending
          ? {
              recommendationId: pending.recommendation_id,
              title: pending.title,
              explanation: pending.plain_language_explanation || pending.expected_benefit || "Lumi has a suggestion to keep the spaceship healthy.",
              benefit: pending.expected_benefit,
            }
          : null
      );
    } catch {
      /* advisory is optional decoration — ignore failures */
    }
  }, [sessionId]);

  useEffect(() => {
    void refreshAdvisory();
  }, [refreshAdvisory, state?.step]);

  // ── Mission end detection ─────────────────────────────────────────────────
  useEffect(() => {
    if (!state || endedRef.current) return;
    if (state.outcome || state.status === "completed" || state.status === "failed") {
      endedRef.current = true;
      setRunning(false);
      navigate("/mission-end", { replace: true });
    }
  }, [state, navigate]);

  // ── Auto-run loop: the "Play button" that makes time move ─────────────────
  useEffect(() => {
    if (!running || !sessionId || !state || state.status !== "running") return;
    const speed = SPEEDS[speedIdx];
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const resp = await stepGame(sessionId, speed.steps);
        const last = resp.results?.[resp.results.length - 1];
        if (last) {
          setState(last.game_state);
          setTelemetry(last.telemetry);
          setTip(situationTip(kidGauges(last.telemetry), last.game_state, last.telemetry.orbital?.in_eclipse ?? false));
        }
        void refreshAdvisory();
      } catch {
        /* transient network hiccup — next tick retries */
      }
    };

    const t = setInterval(() => void tick(), speed.delayMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [running, sessionId, speedIdx, state?.status, refreshAdvisory]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const dispatchAction = useCallback(
    async (action: KidAction) => {
      if (!sessionId || busy) return;
      const coins = coinsLeft(state);
      if (action.cost > coins) {
        pushToast("Not enough coins for that!", "error");
        return;
      }
      setBusy(true);
      try {
        const resp = await performAction(sessionId, {
          player_id: session?.playerId ?? "cadet",
          action_type: action.actionType,
          params: action.params,
        });
        if (resp.success) {
          pushToast(`${action.label} — done!`);
          void refresh();
        } else {
          pushToast(friendlyActionError(resp.error), "error");
        }
      } catch (err) {
        pushToast(friendlyActionError((err as Error).message), "error");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, busy, state, session, pushToast, refresh]
  );

  const chooseEvent = useCallback(
    async (choiceId: string) => {
      if (!sessionId || !activeEvent) return;
      setBusy(true);
      try {
        await resolveEvent(sessionId, {
          player_id: session?.playerId ?? "cadet",
          event_id: activeEvent.event_id,
          choice_id: choiceId,
        });
        pushToast("Good choice, Cadet!");
        setActiveEvent(null);
        void refresh();
      } catch (err) {
        pushToast(friendlyActionError((err as Error).message), "error");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, activeEvent, session, pushToast, refresh]
  );

  const acceptAdvice = useCallback(
    async (recommendationId: string) => {
      if (!sessionId) return;
      setBusy(true);
      try {
        await respondToAdvisory(sessionId, {
          recommendation_id: recommendationId,
          action: "accept",
          player_id: session?.playerId ?? "cadet",
        });
        pushToast("Lumi did it! 🤖");
        setLumiAdvice(null);
        void refresh();
      } catch {
        pushToast("Lumi couldn't do that right now.", "error");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, session, pushToast, refresh]
  );

  // ── Derived kid views ─────────────────────────────────────────────────────
  const gauges = kidGauges(telemetry);
  const goals = kidGoals(state?.objectives);
  const coins = coinsLeft(state);
  const kidEventView = activeEvent ? kidEvent(activeEvent) : null;
  const elapsed = telemetry?.elapsed_seconds ?? state?.elapsed_seconds ?? 0;

  if (!sessionId) return null;

  return (
    <div className="fixed inset-0 bg-void overflow-hidden select-none">
      {/* Fullscreen 3D stage */}
      <CesiumFlightView
        orbital={telemetry?.orbital ?? null}
        comms={telemetry?.comms ?? null}
        clock={clock}
        scenarioId={missionId}
        groundTrackPoints={groundTrack}
        activeEvent={activeEvent}
      />

      {/* ── Top-left: mission goal + goals ── */}
      <div className="absolute top-3 left-3 z-30 max-w-sm pointer-events-auto">
        <div className="bg-void/80 backdrop-blur-md rounded-2xl border border-edge px-4 py-3 shadow-lg">
          <div className="text-[11px] font-bold uppercase tracking-wider text-accent">
            Mission: {session?.missionName ?? missionId}
          </div>
          <p className="text-sm text-ink mt-0.5 font-semibold leading-snug">
            {missionGoal(missionId)}
          </p>
          {goals.length > 0 && (
            <div className="mt-2 space-y-1">
              {goals.map((g) => (
                <div key={g.id} className="flex items-center gap-2">
                  <span
                    className={`text-xs ${g.done ? "text-emerald-300" : "text-muted"}`}
                    aria-hidden
                  >
                    {g.done ? "✅" : "⬜"}
                  </span>
                  <span className={`text-xs flex-1 ${g.done ? "text-emerald-200 line-through" : "text-muted"}`}>
                    {g.text}
                  </span>
                  <span className="text-[10px] text-faint tabular-nums">{g.progress}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Top-center: mission clock ── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="bg-void/80 backdrop-blur-md rounded-full border border-edge px-4 py-1.5 shadow-lg text-center">
          <span className="text-xs text-faint mr-1">Flight time</span>
          <span className="text-sm font-bold text-ink tabular-nums">{missionClock(elapsed)}</span>
        </div>
      </div>

      {/* ── Toasts ── */}
      <ToastStack toasts={toasts} />

      {/* ── Onboarding tip banner ── */}
      {tip && !kidEventView && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
          <div className="flex items-center gap-3 bg-sky-950/90 backdrop-blur-md rounded-full border border-sky-400/40 px-4 py-2 shadow-lg max-w-md">
            <span className="text-sm text-sky-100">{tip.text}</span>
            <button
              type="button"
              onClick={() => setTip(null)}
              aria-label="Dismiss tip"
              className="text-sky-300 hover:text-white shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom-left: gauges + Lumi ── */}
      <div className="absolute bottom-3 left-3 z-30 space-y-2 pointer-events-auto">
        <LumiBot tip={tip} advice={lumiAdvice} onAcceptAdvice={acceptAdvice} busy={busy} />
        <KidGaugeBar gauges={gauges} />
      </div>

      {/* ── Bottom-center: transport ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        <div className="flex items-center gap-2 bg-void/85 backdrop-blur-md rounded-full border border-edge px-3 py-2 shadow-xl">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            disabled={state?.status !== "running" || !!kidEventView}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 font-bold text-base transition-colors disabled:opacity-40 ${
              running
                ? "bg-amber-400 text-ink hover:bg-amber-300"
                : "bg-emerald-400 text-ink hover:bg-emerald-300"
            }`}
            aria-label={running ? "Pause mission" : "Play mission"}
          >
            {running ? <Pause size={20} /> : <Play size={20} />}
            {running ? "Pause" : "Play"}
          </button>
          <div className="h-6 w-px bg-edge mx-1" />
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setSpeedIdx(i)}
              className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                speedIdx === i ? "bg-accent text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom-right: coins + actions ── */}
      <div className="absolute bottom-3 right-3 z-30 pointer-events-auto">
        <div className="bg-void/85 backdrop-blur-md rounded-2xl border border-edge p-3 shadow-xl w-64">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5 text-sm font-bold text-amber-300">
              <Coins size={16} />
              <span className="tabular-nums">{coins.toLocaleString()}</span>
            </div>
            <span className="text-[10px] text-faint uppercase tracking-wider">coins</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {KID_ACTIONS.map((a) => {
              const Icon = ACTION_ICONS[a.icon];
              const affordable = a.cost <= coins;
              return (
                <button
                  key={a.id}
                  type="button"
                  title={a.hint}
                  disabled={busy || !affordable}
                  onClick={() => void dispatchAction(a)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition-colors ${
                    affordable
                      ? "border-edge bg-panel/80 hover:bg-raised hover:border-accent/50"
                      : "border-edge/50 bg-panel/40 opacity-40 cursor-not-allowed"
                  } disabled:cursor-wait`}
                >
                  <Icon size={20} className="text-accent" aria-hidden />
                  <span className="text-[11px] font-bold text-ink leading-none text-center">
                    {a.label}
                  </span>
                  <span className={`text-[10px] leading-none ${a.cost > 0 ? "text-amber-400/80" : "text-faint"}`}>
                    {a.cost > 0 ? `🪙 ${a.cost}` : "free"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Leave (small, out of the way) ── */}
      <button
        type="button"
        onClick={() => navigate("/mission-end")}
        className="absolute top-3 right-3 z-20 mt-12 text-[11px] text-faint hover:text-muted pointer-events-auto"
      >
        End flight
      </button>

      {/* ── Event decision popup ── */}
      {kidEventView && (
        <EventPopup event={kidEventView} onChoose={(c) => void chooseEvent(c)} busy={busy} />
      )}

      {/* Mission story — first 10 seconds welcome overlay */}
      <WelcomeOverlay missionId={missionId} />
    </div>
  );
}

/** 6-second welcome card explaining today's mission in one sentence. */
function WelcomeOverlay({ missionId }: { missionId: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 6000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div
      className="absolute inset-x-0 top-24 z-30 flex justify-center pointer-events-none px-4"
      role="status"
    >
      <div className="bg-void/90 backdrop-blur-md rounded-3xl border border-accent/40 px-6 py-4 shadow-2xl max-w-lg text-center">
        <div className="text-3xl mb-1">🛰️</div>
        <p className="text-sm text-ink leading-relaxed">{missionStory(missionId)}</p>
      </div>
    </div>
  );
}

/** Translate backend action errors into kid-friendly language. */
function friendlyActionError(raw: string | undefined): string {
  const msg = (raw ?? "").toLowerCase();
  if (msg.includes("budget") || msg.includes("cost")) return "Not enough coins for that!";
  if (msg.includes("permission") || msg.includes("role")) return "Your crew can't do that right now.";
  if (msg.includes("not found")) return "That's not available anymore.";
  return "Hmm, that didn't work. Try again!";
}
