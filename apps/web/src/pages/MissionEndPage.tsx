import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteGameSession,
  getGameScore,
  getGameState,
  recordMissionProgression,
} from "../api/client";
import { loadMissionSession, clearMissionSession } from "../lib/mission";
import { coinsLeft, kidScoreStory } from "../lib/kid";
import type { RecordMissionProgressionResponse } from "../types";

/**
 * Post-Mission Orbital AI Debrief & Career Progression Screen.
 * Combines star rating, mission outcome analysis, orbital AI telemetry metrics,
 * and persistent career XP / Engineering Credits progression.
 */
export function MissionEndPage() {
  const navigate = useNavigate();
  const session = useMemo(() => loadMissionSession(), []);
  const sessionId = session?.sessionId ?? null;
  const missionId = session?.missionId ?? "wildfire";

  const [score, setScore] = useState<Awaited<ReturnType<typeof getGameScore>> | null>(null);
  const [coins, setCoins] = useState(0);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [health, setHealth] = useState(100);
  const [collectedMb, setCollectedMb] = useState(0);
  const [downlinkedMb, setDownlinkedMb] = useState(0);
  const [progression, setProgression] = useState<RecordMissionProgressionResponse | null>(null);
  const [error, setError] = useState(false);
  const recordedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      navigate("/missions", { replace: true });
      return;
    }
    Promise.all([getGameScore(sessionId), getGameState(sessionId)])
      .then(async ([scoreResp, stateResp]) => {
        setScore(scoreResp);
        const remainingBudget = coinsLeft(stateResp.game_state);
        setCoins(remainingBudget);
        setOutcome(stateResp.game_state.outcome);
        const finalHealth = Math.round(stateResp.game_state.spacecraft_health_pct);
        setHealth(finalHealth);
        const collected = stateResp.game_state.data_collected_mb ?? 0;
        const downlinked = stateResp.game_state.data_downlinked_mb ?? 0;
        setCollectedMb(collected);
        setDownlinkedMb(downlinked);

        if (!recordedRef.current) {
          recordedRef.current = true;
          const totalScore = scoreResp?.total_score ?? 75;
          const maxScore = Math.max(1, scoreResp?.max_score ?? 100);
          const normPct = Math.round((totalScore / maxScore) * 100);
          const grade =
            normPct >= 90
              ? "A+"
              : normPct >= 80
                ? "A"
                : normPct >= 70
                  ? "B"
                  : normPct >= 60
                    ? "C"
                    : "D";
          const starsEarned = normPct >= 80 ? 3 : normPct >= 55 ? 2 : normPct >= 30 ? 1 : 0;
          try {
            const progResp = await recordMissionProgression({
              player_id: session?.playerId || "pilot-local",
              mission_id: missionId,
              score: normPct,
              grade,
              stars: starsEarned,
              is_win: stateResp.game_state.outcome === "WIN",
              spacecraft_health_pct: finalHealth,
            });
            setProgression(progResp);
          } catch {
            // Progression helper includes local fallback
          }
        }
      })
      .catch(() => setError(true));
  }, [sessionId, missionId, session?.playerId, navigate]);

  const pct = score ? Math.round((score.total_score / Math.max(1, score.max_score)) * 100) : 78;
  const story = kidScoreStory(
    outcome,
    pct,
    score?.success_failure_causes ?? [],
    score?.primary_cause ?? null
  );

  // Clean up the finished session after debrief
  const finish = (to: string) => {
    if (sessionId) {
      deleteGameSession(sessionId).catch(() => undefined);
    }
    clearMissionSession();
    navigate(to);
  };

  if (!sessionId) return null;

  const aiVectors = Math.max(1, Math.round(downlinkedMb / 12));
  const stats = [
    { emoji: "📸", label: "Sensor Imagery Ingested", value: `${Math.round(collectedMb)} MB` },
    { emoji: "📡", label: "Telemetry Downlinked", value: `${Math.round(downlinkedMb)} MB` },
    { emoji: "🧠", label: "AI Vector Products", value: `${aiVectors} Alerts` },
    { emoji: "🪙", label: "Budget Reserve", value: `${coins.toLocaleString()} cr` },
    { emoji: "🛰️", label: "Bus Integrity", value: `${health}%` },
    { emoji: "⚡", label: "Mission Efficiency", value: `${pct}%` },
  ];

  return (
    <div className="fixed inset-0 bg-void overflow-y-auto">
      <div className="min-h-full flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl text-center rounded-2xl border border-edge bg-panel/80 backdrop-blur-md p-6 sm:p-8 shadow-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/40 bg-accent/10 text-[11px] font-mono uppercase tracking-widest text-accent mb-3">
            LumenOS Orbital AI Post-Flight Debrief · {missionId.toUpperCase()}
          </div>

          {/* Stars */}
          <div className="text-5xl tracking-widest mt-1" aria-label={`${story.stars} of 3 stars`}>
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className={i < story.stars ? "" : "opacity-20 grayscale"}>
                ⭐
              </span>
            ))}
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-ink mt-3">{story.headline}</h1>
          <p className="text-muted mt-2 text-sm sm:text-base leading-relaxed">
            {error
              ? "Telemetry stream concluded — orbital AI archive synchronized with Ground Control."
              : story.sentence}
          </p>

          {/* Career Progression Banner */}
          {progression && (
            <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-left flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-300">
                  Career Progression Updated · Level {progression.current_level}
                </div>
                <div className="text-sm font-semibold text-ink">
                  Total XP: {progression.total_xp.toLocaleString()} · Balance: {progression.engineering_credits.toLocaleString()} cr
                </div>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 font-bold">
                  +{progression.rewards.xp_earned} XP
                </span>
                <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 font-bold">
                  +{progression.rewards.credits_earned} Credits
                </span>
              </div>
            </div>
          )}

          {/* Telemetry & AI Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-edge bg-void/70 px-3.5 py-3 shadow-md text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl">{s.emoji}</span>
                  <span className="text-base font-mono font-bold text-ink">{s.value}</span>
                </div>
                <div className="text-[10px] text-faint uppercase tracking-wider mt-1.5 font-mono">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => finish(`/hangar?mission=${missionId}`)}
              className="flex-1 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-void font-bold text-base py-3 px-4 transition-colors cursor-pointer"
            >
              🔁 Fly Again
            </button>
            <button
              type="button"
              onClick={() => finish("/missions")}
              className="flex-1 rounded-xl border border-edge bg-panel hover:bg-raised text-ink font-bold text-base py-3 px-4 transition-colors cursor-pointer"
            >
              🗺️ Pick Another Mission
            </button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => finish("/rewards")}
              className="text-xs font-mono text-accent hover:underline cursor-pointer"
            >
              View Career & Hardware Unlocks →
            </button>
            <button
              type="button"
              onClick={() => finish("/operate")}
              className="text-xs font-mono text-faint hover:text-muted underline cursor-pointer"
            >
              Try the Expert Flight Console
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
