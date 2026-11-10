import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Crosshair,
  Cpu,
  CheckCircle2,
  Flame,
  Navigation,
  Thermometer,
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
import {
  UltraRealisticEarthFlight,
  GLOBAL_EARTH_EVENTS,
  type GlobalEarthEvent,
} from "../components/flight/UltraRealisticEarthFlight";
import { KidGaugeBar } from "../components/flight/KidGaugeBar";
import { EventPopup } from "../components/flight/EventPopup";
import { LumiBot, type LumiAdvice } from "../components/flight/LumiBot";
import { ToastStack, type Toast } from "../components/flight/Toasts";
import { deriveOrbitalAIDataCenterState } from "../lib/ai-datacenter";
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

interface FloatingReward {
  id: number;
  label: string;
  sublabel: string;
  tone: "emerald" | "violet" | "cyan" | "amber";
}

/** Synthesize crisp Web Audio API sci-fi tactical sound effects (safe in browser & headless tests). */
function playSciFiSfx(kind: "lock" | "scan" | "ai" | "contain" | "boost") {
  try {
    if (typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes =
      kind === "contain"
        ? [523.25, 659.25, 783.99, 1046.5]
        : kind === "ai"
          ? [440, 659.25, 880]
          : kind === "scan"
            ? [587.33, 880]
            : kind === "boost"
              ? [220, 440]
              : [660, 990];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "contain" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      gain.gain.setValueAtTime(0.06, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.25);
    });
    setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 600);
  } catch {
    /* ignore audio context restrictions */
  }
}

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

  // ── Interactive 3D Target Intercept & 3-Stage Orbital AI Pipeline State ──
  type TargetPipelineStage = "UNSCANNED" | "RAW_CAPTURED" | "AI_PROCESSED" | "RESOLVED";

  const missionTargets = useMemo<GlobalEarthEvent[]>(() => {
    const cleanId = missionId.replace(/_scout|_sentinel|_watch/g, "");
    const primary = GLOBAL_EARTH_EVENTS.filter(
      (e) => e.scenarioId === missionId || e.type === cleanId
    );
    return primary.length > 0 ? primary : GLOBAL_EARTH_EVENTS.slice(0, 4);
  }, [missionId]);

  const [targetStages, setTargetStages] = useState<Record<string, TargetPipelineStage>>({});
  const [targetScanPct, setTargetScanPct] = useState<Record<string, number>>({});
  const [autopilotTargetId, setAutopilotTargetId] = useState<string | null>(null);
  const [inRangeTarget, setInRangeTarget] = useState<GlobalEarthEvent | null>(null);
  const [inRangeDistKm, setInRangeDistKm] = useState<number>(9999);
  const [aiInferencePct, setAiInferencePct] = useState<number>(0);
  const [isRunningAi, setIsRunningAi] = useState<boolean>(false);
  const [islPulseActive, setIslPulseActive] = useState<boolean>(false);
  const [computeHeatBonusC, setComputeHeatBonusC] = useState<number>(0);
  const [tacticalScoreBonus, setTacticalScoreBonus] = useState<number>(0);
  const [comboStreak, setComboStreak] = useState<number>(0);
  const [rewardPopups, setRewardPopups] = useState<FloatingReward[]>([]);
  const rewardSeq = useRef(0);

  const pushReward = useCallback(
    (label: string, sublabel: string, tone: FloatingReward["tone"] = "emerald") => {
      const id = ++rewardSeq.current;
      setRewardPopups((prev) => [...prev.slice(-2), { id, label, sublabel, tone }]);
      setTimeout(() => {
        setRewardPopups((prev) => prev.filter((r) => r.id !== id));
      }, 2200);
    },
    []
  );

  // Default Autopilot Intercept to the first unresolved mission target
  useEffect(() => {
    if (missionTargets.length === 0) return;
    setAutopilotTargetId((prev) => {
      if (prev && missionTargets.some((t) => t.id === prev) && targetStages[prev] !== "RESOLVED") {
        return prev;
      }
      const nextUnresolved = missionTargets.find((t) => targetStages[t.id] !== "RESOLVED");
      return nextUnresolved?.id ?? null;
    });
  }, [missionTargets, targetStages]);

  const resolvedTargetIds = useMemo(
    () => Object.keys(targetStages).filter((id) => targetStages[id] === "RESOLVED"),
    [targetStages]
  );
  const rawCapturedIds = useMemo(
    () => Object.keys(targetStages).filter((id) => targetStages[id] === "RAW_CAPTURED"),
    [targetStages]
  );
  const aiProcessedIds = useMemo(
    () => Object.keys(targetStages).filter((id) => targetStages[id] === "AI_PROCESSED"),
    [targetStages]
  );

  const handleTargetInRangeChange = useCallback(
    (target: GlobalEarthEvent | null, distanceKm: number) => {
      setInRangeTarget((prev) => {
        if (target && prev?.id !== target.id) {
          playSciFiSfx("lock");
        }
        return target;
      });
      setInRangeDistKm(distanceKm);
    },
    []
  );

  const handleSelectTarget = useCallback(
    (target: GlobalEarthEvent) => {
      setAutopilotTargetId(target.id);
      playSciFiSfx("boost");
      pushToast(`🎯 Intercept locked: ${target.name} — Ion Thruster Burst Engaged!`);
    },
    [pushToast]
  );

  // ── Stage 1: Automatic & Manual Nadir Laser Scan when over a Crisis Target ──
  const triggerBackendCollect = useCallback(
    async (targetName: string) => {
      playSciFiSfx("scan");
      setTacticalScoreBonus((s) => s + 100);
      pushReward("+100 PTS · SWATH LOCKED!", `${targetName} Raw Frame Captured`, "emerald");
      if (!sessionId) return;
      try {
        await performAction(sessionId, {
          player_id: session?.playerId ?? "cadet",
          action_type: "collect_data",
          params: {},
        });
        void refresh();
      } catch {
        /* ignore transient backend error */
      }
      pushToast(`📸 100% Nadir Scan: ${targetName} captured! Press [R] to ignite 24-TOPS Neural AI.`);
    },
    [sessionId, session, refresh, pushToast, pushReward]
  );

  useEffect(() => {
    if (!inRangeTarget) return;
    const tid = inRangeTarget.id;
    const currentStage = targetStages[tid] ?? "UNSCANNED";
    if (currentStage !== "UNSCANNED") return;

    const timer = setInterval(() => {
      setTargetScanPct((prev) => {
        const cur = prev[tid] ?? 0;
        const next = Math.min(100, cur + 16);
        if (next >= 100 && cur < 100) {
          setTargetStages((st) => ({ ...st, [tid]: "RAW_CAPTURED" }));
          void triggerBackendCollect(inRangeTarget.name);
        }
        return { ...prev, [tid]: next };
      });
    }, 200);

    return () => clearInterval(timer);
  }, [inRangeTarget, targetStages, triggerBackendCollect]);

  // Manual Boost Scan ([E] or Scan Button)
  const handleManualScanBurst = useCallback(() => {
    if (!inRangeTarget) {
      const nextTarget = missionTargets.find((t) => targetStages[t.id] !== "RESOLVED");
      if (nextTarget) {
        setAutopilotTargetId(nextTarget.id);
        playSciFiSfx("boost");
        pushToast(`🚀 Ion Intercept locked onto ${nextTarget.name}! Flying into Nadir Cone...`);
      } else {
        pushToast("⚠️ All crisis targets in this theater are already contained!", "ok");
      }
      return;
    }
    const tid = inRangeTarget.id;
    const stage = targetStages[tid] ?? "UNSCANNED";
    if (stage !== "UNSCANNED") {
      pushToast(`✅ ${inRangeTarget.name} already scanned! Run Edge AI [R] or Transmit [F].`);
      return;
    }
    playSciFiSfx("lock");
    const cur = targetScanPct[tid] ?? 0;
    const next = Math.min(100, cur + 50);
    setTargetScanPct((prev) => ({ ...prev, [tid]: next }));
    if (next >= 100) {
      setTargetStages((st) => ({ ...st, [tid]: "RAW_CAPTURED" }));
      void triggerBackendCollect(inRangeTarget.name);
    } else {
      pushToast(`🔍 Laser Swath Scanning ${inRangeTarget.name}: ${next}%`);
    }
  }, [inRangeTarget, missionTargets, targetStages, targetScanPct, triggerBackendCollect, pushToast]);

  // ── Stage 2: 24-TOPS Neural Edge AI Inference ([R] or Process AI Button) ──
  const handleRunEdgeAi = useCallback(() => {
    if (isRunningAi) return;
    if (rawCapturedIds.length === 0) {
      pushToast("⚠️ No Raw Sensor Frames queued! Fly over a crisis target and scan it to 100% first.", "error");
      return;
    }
    playSciFiSfx("ai");
    setIsRunningAi(true);
    setAiInferencePct(20);
    setComputeHeatBonusC((h) => Math.min(26, h + 8.5));

    if (sessionId) {
      void performAction(sessionId, {
        player_id: session?.playerId ?? "cadet",
        action_type: "set_compute_profile",
        params: { profile: "FULL" },
      }).catch(() => undefined);
    }

    let pct = 20;
    const timer = setInterval(() => {
      pct += 30;
      if (pct >= 100) {
        clearInterval(timer);
        setAiInferencePct(0);
        setIsRunningAi(false);
        const count = rawCapturedIds.length;
        setTargetStages((prev) => {
          const updated = { ...prev };
          rawCapturedIds.forEach((id) => {
            updated[id] = "AI_PROCESSED";
          });
          return updated;
        });
        setTacticalScoreBonus((s) => s + count * 150);
        pushReward(
          `+${count * 150} PTS · 24-TOPS NEURAL AI!`,
          `${count} Alert Vector(s) Compressed at Data Center`,
          "violet"
        );
        pushToast(
          `🧠 24-TOPS Edge AI Complete! ${count} Alert Vector(s) ready. Press [F] to Fire Orbital Beam!`
        );
      } else {
        setAiInferencePct(pct);
      }
    }, 150);
  }, [isRunningAi, rawCapturedIds, sessionId, session, pushToast, pushReward]);

  // ── Stage 3: Optical ISL / RF Alert Transmission ([F] or Transmit Button) ──
  const handleTransmitAlert = useCallback(async () => {
    if (aiProcessedIds.length === 0) {
      if (rawCapturedIds.length > 0) {
        pushToast("⚠️ Run 24-TOPS Edge AI [R] on your raw frames before transmitting!", "error");
      } else {
        pushToast("⚠️ No AI-verified alerts ready! Scan a target [E] → Run Edge AI [R] → Transmit [F].", "error");
      }
      return;
    }

    playSciFiSfx("contain");
    setIslPulseActive(true);
    setTimeout(() => setIslPulseActive(false), 2600);

    const resolvedCount = aiProcessedIds.length;
    const nextStreak = comboStreak + resolvedCount;
    setComboStreak(nextStreak);
    const streakMultiplier = Math.min(3, nextStreak);
    const earnedPts = resolvedCount * 300 * streakMultiplier;

    setTargetStages((prev) => {
      const updated = { ...prev };
      aiProcessedIds.forEach((id) => {
        updated[id] = "RESOLVED";
      });
      return updated;
    });
    setTacticalScoreBonus((s) => s + earnedPts);
    pushReward(
      `🔥 ${streakMultiplier}× STREAK! +${earnedPts} PTS`,
      `${resolvedCount} Crisis Target(s) CONTAINED via Mother Station!`,
      "cyan"
    );

    if (sessionId) {
      try {
        await performAction(sessionId, {
          player_id: session?.playerId ?? "cadet",
          action_type: "downlink_data",
          params: {},
        });
        void refresh();
      } catch {
        /* ignore */
      }
    }

    pushToast(
      `📡 Optical ISL Crosslink Fired! ${resolvedCount} Crisis Target(s) CONTAINED (+${earnedPts} pts)!`
    );
  }, [aiProcessedIds, rawCapturedIds, comboStreak, sessionId, session, refresh, pushToast, pushReward]);

  // ── Radiator Coolant Purge ([T]) ──
  const handleCoolantPurge = useCallback(() => {
    playSciFiSfx("lock");
    setComputeHeatBonusC((h) => Math.max(-6, h - 10));
    setTacticalScoreBonus((s) => s + 50);
    pushReward("+50 PTS · CRYO RADIATOR PURGE", "Ammonia Loop Louvers Vented (-10°C)", "amber");
    if (sessionId) {
      void performAction(sessionId, {
        player_id: session?.playerId ?? "cadet",
        action_type: "set_compute_profile",
        params: { profile: "CONSERVATIVE" },
      }).catch(() => undefined);
    }
    pushToast("❄️ Ammonia Loop Louvers 100% Open — Venting NPU heat to deep space (-10°C)!");
  }, [sessionId, session, pushToast, pushReward]);

  // Keyboard shortcuts for Interactive 3-Stage Pipeline: [E] Scan, [R] Edge AI, [F] Transmit, [T] Coolant
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "KeyE") handleManualScanBurst();
      if (e.code === "KeyR") handleRunEdgeAi();
      if (e.code === "KeyF") void handleTransmitAlert();
      if (e.code === "KeyT") handleCoolantPurge();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleManualScanBurst, handleRunEdgeAi, handleTransmitAlert, handleCoolantPurge]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const dispatchAction = useCallback(
    async (action: KidAction) => {
      if (!sessionId || busy) return;
      // Route Sensor Capture & Beam Downlink through the interactive 3D gameplay loop when appropriate!
      if (action.actionType === "collect_data" && !inRangeTarget) {
        pushToast(
          "⚠️ No target inside Nadir Sensor Cone! Click a crisis target to Intercept or steer with WASD.",
          "error"
        );
        return;
      }
      if (action.actionType === "collect_data" && inRangeTarget) {
        handleManualScanBurst();
      }
      if (action.actionType === "downlink_data" && aiProcessedIds.length > 0) {
        await handleTransmitAlert();
        return;
      }

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
    [
      sessionId,
      busy,
      state,
      session,
      inRangeTarget,
      aiProcessedIds.length,
      handleManualScanBurst,
      handleTransmitAlert,
      pushToast,
      refresh,
    ]
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

  // ── Derived Flight Deck & Orbital AI Data Center views ────────────────────
  const gauges = kidGauges(telemetry);
  const goals = kidGoals(state?.objectives);
  const coins = coinsLeft(state);
  const kidEventView = activeEvent ? kidEvent(activeEvent) : null;
  const elapsed = telemetry?.elapsed_seconds ?? state?.elapsed_seconds ?? 0;
  const aiState = deriveOrbitalAIDataCenterState(missionId, telemetry, state);
  const [showAiPanel, setShowAiPanel] = useState(true);
  const effectiveThermalTempC = Math.round(((telemetry?.thermal?.temperature_c ?? 22.0) + computeHeatBonusC) * 10) / 10;
  const activeScanPct = inRangeTarget ? (targetScanPct[inRangeTarget.id] ?? 0) : 0;
  const displayScore = Math.round((state?.current_score ?? 0) + tacticalScoreBonus);
  const missionCompletionPct = Math.min(
    100,
    Math.round(
      ((resolvedTargetIds.length * 1.0 + aiProcessedIds.length * 0.65 + rawCapturedIds.length * 0.35) /
        Math.max(1, missionTargets.length)) *
        100
    )
  );
  const nextUnresolvedTarget = missionTargets.find((t) => targetStages[t.id] !== "RESOLVED") ?? null;

  if (!sessionId) return null;

  return (
    <div className="fixed inset-0 bg-void overflow-hidden select-none">
      {/* Fullscreen 3D stage — Ultra-Realistic 3D Globe with Sun, Orbit & Live Earth Events */}
      <UltraRealisticEarthFlight
        orbital={telemetry?.orbital ?? null}
        comms={telemetry?.comms ?? null}
        clock={clock}
        scenarioId={missionId}
        groundTrackPoints={groundTrack}
        activeEvent={activeEvent}
        thermalTempC={effectiveThermalTempC}
        aiActiveTops={isRunningAi ? aiState.peakTops : aiState.activeTops}
        resolvedTargetIds={resolvedTargetIds}
        scanningTargetId={inRangeTarget?.id ?? null}
        scanProgressPct={activeScanPct}
        autopilotTargetId={autopilotTargetId}
        islPulseActive={islPulseActive}
        onTargetInRangeChange={handleTargetInRangeChange}
        onSelectTarget={handleSelectTarget}
      />

      {/* ── High-Dopamine Floating Score & Combo Popups (Center Screen) ── */}
      {rewardPopups.length > 0 && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex flex-col items-center gap-1.5">
          {rewardPopups.map((r) => (
            <div
              key={r.id}
              className={`px-4 py-1.5 rounded-2xl border backdrop-blur-md shadow-2xl font-mono text-center animate-bounce ${
                r.tone === "cyan"
                  ? "bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-cyan-500/30"
                  : r.tone === "violet"
                    ? "bg-violet-950/90 border-violet-400 text-violet-200 shadow-violet-500/30"
                    : r.tone === "amber"
                      ? "bg-amber-950/90 border-amber-400 text-amber-200 shadow-amber-500/30"
                      : "bg-emerald-950/90 border-emerald-400 text-emerald-200 shadow-emerald-500/30"
              }`}
            >
              <div className="text-xs font-extrabold tracking-wide">{r.label}</div>
              <div className="text-[10px] opacity-90">{r.sublabel}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Top-left: Mission Objectives + Interactive 3-Stage Orbital AI Data Center ── */}
      <div className="absolute top-14 left-3 z-30 w-82 max-w-[calc(100vw-1.5rem)] pointer-events-auto space-y-1.5">
        <div className="bg-void/88 backdrop-blur-md rounded-2xl border border-edge px-3 py-2 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-accent font-mono truncate">
              Theater: {session?.missionName ?? missionId}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {comboStreak > 1 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-400/60 text-amber-300 font-bold animate-pulse">
                  🔥 {Math.min(3, comboStreak)}×
                </span>
              )}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold tabular-nums">
                Score {displayScore}
              </span>
              <button
                type="button"
                onClick={() => setShowAiPanel((v) => !v)}
                className="text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50 cursor-pointer"
              >
                {showAiPanel ? "Hide AI" : "Show AI"}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-ink mt-0.5 font-semibold leading-snug">
            {missionGoal(missionId)}
          </p>

          {/* Live Theater Containment Bar */}
          <div className="mt-1.5">
            <div className="flex items-center justify-between text-[9px] font-mono text-faint mb-0.5">
              <span>THEATER CONTAINMENT PROGRESS</span>
              <span className="text-emerald-300 font-bold">{missionCompletionPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-panel rounded-full overflow-hidden border border-edge/60">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${missionCompletionPct}%` }}
              />
            </div>
          </div>

          {goals.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {goals.map((g, idx) => {
                const boostedProgress =
                  idx === 0
                    ? Math.min(100, Math.max(g.progress, missionCompletionPct))
                    : idx === 1
                      ? Math.min(100, Math.max(g.progress, resolvedTargetIds.length * 50))
                      : g.progress;
                const isGoalDone = g.done || boostedProgress >= 100;
                return (
                  <div key={g.id} className="flex items-center gap-1.5">
                    <span
                      className={`text-[11px] ${isGoalDone ? "text-emerald-300" : "text-muted"}`}
                      aria-hidden
                    >
                      {isGoalDone ? "✅" : "⬜"}
                    </span>
                    <span
                      className={`text-[10px] flex-1 truncate ${
                        isGoalDone ? "text-emerald-200 line-through" : "text-muted"
                      }`}
                    >
                      {g.text}
                    </span>
                    <span className="text-[10px] text-faint tabular-nums font-mono">{boostedProgress}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Interactive 3-Stage Orbital AI Data Center & Phenomenology Deck */}
        {showAiPanel && (
          <div
            data-testid="orbital-ai-datacenter-hud"
            className="bg-void/90 backdrop-blur-md rounded-2xl border border-cyan-500/35 px-3 py-2 shadow-xl text-xs space-y-1.5"
          >
            <div className="flex items-center justify-between border-b border-edge/70 pb-1">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Orbital AI Data Center</span>
              </span>
              <span className="font-mono text-[10px] text-emerald-300 font-bold">
                {isRunningAi ? aiState.peakTops : aiState.activeTops}/{aiState.peakTops} TOPS
              </span>
            </div>

            {/* Interactive 3-Stage Pipeline Action Bar: [1] Nadir Scan -> [2] 24-TOPS Edge AI -> [3] Optical ISL Transmit */}
            <div className="grid grid-cols-3 gap-1.5 font-mono">
              <button
                type="button"
                onClick={handleManualScanBurst}
                className={`rounded-xl border px-2 py-1 text-left transition-all cursor-pointer ${
                  inRangeTarget
                    ? "border-emerald-400 bg-emerald-950/70 text-emerald-200 shadow-sm shadow-emerald-500/30 animate-pulse"
                    : "border-edge bg-panel/70 text-muted hover:border-cyan-500/50"
                }`}
                title="Stage 1: Scan target inside Nadir Sensor Cone (Shortcut: E)"
              >
                <div className="flex items-center justify-between text-[9px] uppercase text-faint">
                  <span>1. Scan</span>
                  <kbd className="px-1 rounded bg-void/80 text-cyan-300">E</kbd>
                </div>
                <div className="text-[10px] font-bold mt-0.5 truncate">
                  {inRangeTarget ? `${activeScanPct}% Lock` : "No Lock"}
                </div>
              </button>

              <button
                type="button"
                onClick={handleRunEdgeAi}
                className={`rounded-xl border px-2 py-1 text-left transition-all cursor-pointer ${
                  rawCapturedIds.length > 0 || isRunningAi
                    ? "border-violet-400 bg-violet-950/75 text-violet-200 shadow-sm shadow-violet-500/30 animate-pulse"
                    : "border-edge bg-panel/70 text-muted hover:border-violet-500/50"
                }`}
                title="Stage 2: Run 24-TOPS Neural Edge AI Inference on captured raw frames (Shortcut: R)"
              >
                <div className="flex items-center justify-between text-[9px] uppercase text-faint">
                  <span>2. Edge AI</span>
                  <kbd className="px-1 rounded bg-void/80 text-violet-300">R</kbd>
                </div>
                <div className="text-[10px] font-bold mt-0.5 truncate">
                  {isRunningAi ? `NPU ${aiInferencePct}%` : `${rawCapturedIds.length} Queued`}
                </div>
              </button>

              <button
                type="button"
                onClick={() => void handleTransmitAlert()}
                className={`rounded-xl border px-2 py-1 text-left transition-all cursor-pointer ${
                  aiProcessedIds.length > 0
                    ? "border-cyan-400 bg-cyan-950/80 text-cyan-200 shadow-sm shadow-cyan-500/30 animate-bounce"
                    : "border-edge bg-panel/70 text-muted hover:border-cyan-500/50"
                }`}
                title="Stage 3: Transmit AI Alert Vector via 1550 nm Optical ISL Crosslink (Shortcut: F)"
              >
                <div className="flex items-center justify-between text-[9px] uppercase text-faint">
                  <span>3. ISL Beam</span>
                  <kbd className="px-1 rounded bg-void/80 text-emerald-300">F</kbd>
                </div>
                <div className="text-[10px] font-bold mt-0.5 truncate">
                  {aiProcessedIds.length > 0 ? `${aiProcessedIds.length} Ready!` : `${resolvedTargetIds.length} Sent`}
                </div>
              </button>
            </div>

            <div className="space-y-0.5 font-mono text-[10px]">
              <div className="flex items-center justify-between text-muted">
                <span className="truncate pr-2">Model: {aiState.activePipelineName}</span>
                <span className="text-violet-300 shrink-0">{aiState.compressionRatio}:1 Vec</span>
              </div>
              <div className="flex items-center justify-between text-faint">
                <span>
                  Core Temp:{" "}
                  <strong className={effectiveThermalTempC >= 40 ? "text-rose-300" : "text-amber-300"}>
                    {effectiveThermalTempC.toFixed(1)}°C
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={handleCoolantPurge}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-sky-950/70 border border-sky-500/40 text-sky-300 hover:bg-sky-900/70 cursor-pointer flex items-center gap-1"
                  title="Vent NPU heat via deployable Ammonia Loop Radiator Louvers (Shortcut: T)"
                >
                  <Thermometer className="w-2.5 h-2.5" />
                  <span>Purge Rad [T]</span>
                </button>
              </div>
              <div className="flex items-center justify-between text-faint">
                <span className="truncate pr-1">
                  ISL Relay:{" "}
                  <strong className={aiState.opticalCrosslinkActive ? "text-cyan-300" : "text-muted"}>
                    {aiState.activeRelayNode
                      ? `${aiState.activeRelayNode.name} (${aiState.activeRelayNode.opticalDataRateGbps} Gbps)`
                      : "Searching Limb…"}
                  </strong>
                </span>
                <span className="text-emerald-300 shrink-0">EDAC: {aiState.edacSeuScrubbed} SEU</span>
              </div>
            </div>

            {/* Mission-Specific Scientific Phenomenology Mini-Grid */}
            <div className="grid grid-cols-2 gap-1 pt-1 border-t border-edge/60 font-mono">
              {aiState.metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg bg-panel/70 border border-edge/70 px-2 py-0.5"
                >
                  <div className="text-[8px] text-faint uppercase truncate">{m.label}</div>
                  <div
                    className={`text-[10px] font-bold truncate ${
                      m.status === "critical"
                        ? "text-rose-300"
                        : m.status === "warning"
                          ? "text-amber-300"
                          : m.status === "highlight"
                            ? "text-cyan-300"
                            : "text-emerald-300"
                    }`}
                  >
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Top-center: mission clock ── */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="bg-void/85 backdrop-blur-md rounded-full border border-edge px-4 py-1 shadow-lg text-center">
          <span className="text-xs text-faint mr-1">Flight time</span>
          <span className="text-sm font-bold text-ink tabular-nums">{missionClock(elapsed)}</span>
        </div>
      </div>

      {/* ── Top-Right Dock (Below Camera Switcher): Tactical Crisis Target Intercept Queue ── */}
      <div
        data-testid="target-intercept-queue"
        className="absolute top-28 right-3 sm:right-6 z-30 w-68 pointer-events-auto hidden md:block"
      >
        <div className="bg-void/88 backdrop-blur-md border border-edge rounded-2xl p-3 shadow-xl space-y-2">
          <div className="flex items-center justify-between border-b border-edge/70 pb-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-accent flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5 text-accent" />
              <span>Crisis Intercept Queue</span>
            </span>
            <span className="font-mono text-[10px] text-emerald-300 font-bold">
              {resolvedTargetIds.length}/{missionTargets.length} Contained
            </span>
          </div>

          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
            {missionTargets.map((t) => {
              const stage = targetStages[t.id] ?? "UNSCANNED";
              const pct = targetScanPct[t.id] ?? 0;
              const isIntercepting = autopilotTargetId === t.id;
              const isInCone = inRangeTarget?.id === t.id;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setAutopilotTargetId((prev) => (prev === t.id ? null : t.id));
                    playSciFiSfx("boost");
                  }}
                  className={`w-full text-left rounded-xl border px-2.5 py-1.5 transition-all cursor-pointer ${
                    stage === "RESOLVED"
                      ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                      : isInCone
                        ? "border-emerald-400 bg-emerald-950/70 text-ink ring-1 ring-emerald-400/50"
                        : isIntercepting
                          ? "border-cyan-400/80 bg-cyan-950/50 text-ink"
                          : "border-edge/80 bg-panel/70 text-muted hover:border-accent/50 hover:text-ink"
                  }`}
                  title="Click to lock Autonomous Orbital Plane Intercept onto this target"
                >
                  <div className="flex items-center justify-between gap-1.5 text-[11px] font-bold">
                    <span className="truncate flex items-center gap-1.5">
                      {stage === "RESOLVED" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : isIntercepting ? (
                        <Navigation className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-pulse" />
                      ) : (
                        <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="truncate">{t.name}</span>
                    </span>
                    <span className="text-[9px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-void/70 border border-edge/60">
                      {stage === "RESOLVED"
                        ? "CONTAINED"
                        : stage === "AI_PROCESSED"
                          ? "BEAM [F]"
                          : stage === "RAW_CAPTURED"
                            ? "RUN AI [R]"
                            : isInCone
                              ? `LOCKED ${pct}%`
                              : isIntercepting
                                ? "INTERCEPT"
                                : t.intensity}
                    </span>
                  </div>
                  {stage === "UNSCANNED" && pct > 0 && (
                    <div className="w-full h-1 bg-void rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-200"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-edge/60 text-[10px] font-mono text-faint">
            <span>
              {inRangeTarget
                ? `🟢 In Cone (${inRangeDistKm} km)`
                : autopilotTargetId
                  ? "🧭 Orbiting to Target"
                  : "🕹️ Manual WASD Flight"}
            </span>
            <button
              type="button"
              onClick={() => navigate("/mission-end")}
              className="text-rose-300 hover:underline cursor-pointer"
            >
              ✕ End Flight
            </button>
          </div>
        </div>
      </div>

      {/* ── Center-Bottom High-Dopamine Tactical Action Prompt (Above RCS Steer Bar) ── */}
      <div
        data-testid="tactical-primary-cta"
        className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-auto"
      >
        {aiProcessedIds.length > 0 ? (
          <button
            type="button"
            onClick={() => void handleTransmitAlert()}
            className="flex items-center gap-2.5 px-5 py-2 rounded-full bg-cyan-950/90 border-2 border-cyan-400 text-cyan-100 font-mono text-xs font-extrabold shadow-xl shadow-cyan-500/30 hover:bg-cyan-900 cursor-pointer animate-bounce"
          >
            <span>⚡ FIRE ORBITAL CONTAINMENT BEAM [F]</span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-400/20 text-emerald-300 text-[10px]">
              +{aiProcessedIds.length * 300 * Math.min(3, comboStreak + 1)} PTS
            </span>
          </button>
        ) : rawCapturedIds.length > 0 || isRunningAi ? (
          <button
            type="button"
            onClick={handleRunEdgeAi}
            className="flex items-center gap-2.5 px-5 py-2 rounded-full bg-violet-950/90 border-2 border-violet-400 text-violet-100 font-mono text-xs font-extrabold shadow-xl shadow-violet-500/30 hover:bg-violet-900 cursor-pointer animate-pulse"
          >
            <span>
              {isRunningAi
                ? `🧠 24-TOPS NEURAL NPU CRUNCHING (${aiInferencePct}%)...`
                : `🧠 IGNITE 24-TOPS NEURAL AI [R] (${rawCapturedIds.length} RAW)`}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-violet-400/20 text-violet-200 text-[10px]">
              +150 PTS
            </span>
          </button>
        ) : inRangeTarget && (targetStages[inRangeTarget.id] ?? "UNSCANNED") === "UNSCANNED" ? (
          <button
            type="button"
            onClick={handleManualScanBurst}
            className="flex items-center gap-2.5 px-5 py-2 rounded-full bg-emerald-950/90 border-2 border-emerald-400 text-emerald-100 font-mono text-xs font-extrabold shadow-xl shadow-emerald-500/30 hover:bg-emerald-900 cursor-pointer animate-pulse"
          >
            <span>
              📸 LASER SCAN {inRangeTarget.name.toUpperCase()} [E] ({activeScanPct}%)
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 text-[10px]">
              +100 PTS
            </span>
          </button>
        ) : nextUnresolvedTarget ? (
          <button
            type="button"
            onClick={() => {
              setAutopilotTargetId(nextUnresolvedTarget.id);
              playSciFiSfx("boost");
              window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
              setTimeout(() => {
                window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
              }, 900);
              pushToast(`🚀 Ion Thruster Burn toward ${nextUnresolvedTarget.name}!`);
            }}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-void/85 border border-sky-400/60 text-sky-200 font-mono text-[11px] font-bold shadow-lg hover:bg-sky-950/80 hover:border-sky-300 cursor-pointer transition-all"
          >
            <span>🚀 WARP INTERCEPT: {nextUnresolvedTarget.name.toUpperCase()}</span>
            <span className="text-[10px] text-amber-300">[Click / Hold Space]</span>
          </button>
        ) : null}
      </div>

      {/* ── Toasts ── */}
      <ToastStack toasts={toasts} />

      {/* ── Bottom-left: gauges + Lumi side-by-side (Zero Overlap with Top-Left AI Card) ── */}
      <div className="absolute bottom-3 left-3 z-30 flex items-end gap-2.5 pointer-events-auto">
        <KidGaugeBar gauges={gauges} />
        <LumiBot tip={tip} advice={lumiAdvice} onAcceptAdvice={acceptAdvice} busy={busy} />
      </div>

      {/* ── Bottom-center: transport ── */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        <div className="flex items-center gap-2 bg-void/85 backdrop-blur-md rounded-full border border-edge px-3 py-2 shadow-xl">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            disabled={state?.status !== "running" || !!kidEventView}
            className={`flex items-center gap-2 rounded-full px-5 py-2 font-bold text-sm transition-colors disabled:opacity-40 ${
              running
                ? "bg-amber-400 text-ink hover:bg-amber-300"
                : "bg-emerald-400 text-ink hover:bg-emerald-300"
            }`}
            aria-label={running ? "Pause mission" : "Play mission"}
          >
            {running ? <Pause size={18} /> : <Play size={18} />}
            {running ? "Pause" : "Play"}
          </button>
          <div className="h-5 w-px bg-edge mx-1" />
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setSpeedIdx(i)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                speedIdx === i ? "bg-accent text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom-right: Budget Credits + Orbital Command Deck ── */}
      <div className="absolute bottom-3 right-3 sm:right-6 z-30 pointer-events-auto">
        <div className="bg-void/88 backdrop-blur-md rounded-2xl border border-edge p-3 shadow-xl w-68">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-sm font-bold text-amber-300 font-mono">
              <Coins size={16} />
              <span className="tabular-nums">{coins.toLocaleString()} cr</span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/operate")}
              className="text-[10px] font-mono text-accent hover:underline uppercase tracking-wider cursor-pointer"
            >
              4-Station Console →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
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
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-colors cursor-pointer ${
                    affordable
                      ? "border-edge bg-panel/80 hover:bg-raised hover:border-accent/50"
                      : "border-edge/50 bg-panel/40 opacity-40 cursor-not-allowed"
                  } disabled:cursor-wait`}
                >
                  <Icon size={18} className="text-accent" aria-hidden />
                  <span className="text-[11px] font-bold text-ink leading-none text-center">
                    {a.label}
                  </span>
                  <span className={`text-[10px] font-mono leading-none ${a.cost > 0 ? "text-amber-400/80" : "text-faint"}`}>
                    {a.cost > 0 ? `${a.cost} cr` : "0 cr"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Mobile Leave button (visible on small screens) ── */}
      <button
        type="button"
        onClick={() => navigate("/mission-end")}
        className="md:hidden absolute top-32 right-3 z-40 text-xs text-faint hover:text-rose-300 bg-void/80 border border-edge px-3 py-1 rounded-full transition-colors pointer-events-auto"
      >
        ✕ End flight
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
