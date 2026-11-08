import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { RewardPanel, type Reward } from "../components/RewardPanel";
import { ObjectiveTracker } from "../components/ObjectiveTracker";
import { StatusBadge } from "../components/StatusBadge";
import { cn } from "../lib/utils";
import { Handshake } from "lucide-react";
import {
  getGameScore,
  getGameState,
  getCostAnalysis,
  getTeamContributions,
  recordMissionProgression,
} from "../api/client";
import { loadMissionSession, clearMissionSession } from "../lib/mission";
import type {
  GameStateSummary,
  ScoreResponse,
  LifecycleCostModel,
  TeamContributionBreakdown,
} from "../types";

/** Local (browser) career XP — labeled as local-only. */
function loadCareer(): { xp: number } {
  try {
    return JSON.parse(localStorage.getItem("lumenos.career") ?? "") ?? { xp: 0 };
  } catch {
    return { xp: 0 };
  }
}

function saveCareer(xp: number) {
  localStorage.setItem("lumenos.career", JSON.stringify({ xp }));
}

/** Eased count-up for score reveal. */
function useCountUp(target: number, duration = 1100): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target) || target <= 0) {
      setV(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function gradeTone(grade: string | undefined): string {
  if (!grade) return "text-ink";
  if (grade.startsWith("A") || grade.startsWith("B")) return "text-ok text-glow";
  if (grade.startsWith("C")) return "text-warn";
  return "text-crit";
}

/**
 * Results — outcome, full score breakdown, co-op contribution, cost analysis, and rewards.
 */
export function ResultsPage() {
  const navigate = useNavigate();
  const session = loadMissionSession();
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [state, setState] = useState<GameStateSummary | null>(null);
  const [costModel, setCostModel] = useState<LifecycleCostModel | null>(null);
  const [teamSummary, setTeamSummary] = useState<TeamContributionBreakdown | null>(null);
  const [showCostAssumptions, setShowCostAssumptions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [career, setCareer] = useState(loadCareer);
  const [xpAwarded, setXpAwarded] = useState(false);
  const animatedScore = useCountUp(score?.total_score ?? 0);

  useEffect(() => {
    if (!session?.sessionId) {
      setLoading(false);
      return;
    }
    const sid = session.sessionId;

    Promise.all([
      getGameScore(sid).catch(() => null),
      getGameState(sid).catch(() => null),
      getCostAnalysis(sid).catch(() => null),
      getTeamContributions(sid).catch(() => null),
    ])
      .then(([s, st, cost, team]) => {
        if (s) setScore(s);
        if (st) setState(st.game_state);
        if (cost) setCostModel(cost);
        if (team) setTeamSummary(team);

        // Award XP once per mission completion and record into persistent player profile
        if (!xpAwarded && st?.game_state.outcome && s) {
          const gained = Math.round(s.total_score / 10);
          const next = { xp: loadCareer().xp + gained };
          saveCareer(next.xp);
          setCareer(next);
          setXpAwarded(true);

          try {
            const prom = recordMissionProgression({
              player_id: session.playerId || "pilot-local",
              mission_id: session.missionId || "wildfire",
              grade: s.grade || "B",
              stars: s.stars || 1,
              is_win: st.game_state.outcome === "WIN" || s.score_fraction >= 0.5,
              spacecraft_health_pct: st.game_state.spacecraft_health_pct ?? 100,
              budget_spent_pct: 50.0,
              score: s.total_score,
            });
            if (prom && typeof prom.catch === "function") {
              prom.catch(() => {});
            }
          } catch {
            // Non-blocking fallback
          }
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin border-t-2 border-accent" />
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
          Computing mission debrief
        </p>
      </div>
    );
  }

  if (!session?.sessionId || (!score && !error)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card title="No Mission Results">
          <p className="mb-4 text-sm text-muted">
            Results appear after you fly a mission. Launch one from the campaign.
          </p>
          <Button onClick={() => navigate("/missions")}>Go to Mission Campaign</Button>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card title="Results Unavailable">
          <p className="mb-2 text-sm text-crit">{error}</p>
          <p className="mb-4 text-sm text-faint">
            The game session may have expired (sessions live in server memory).
          </p>
          <Button variant="secondary" onClick={() => navigate("/")}>Back to Home</Button>
        </Card>
      </div>
    );
  }

  const outcome = state?.outcome;
  const won = outcome === "win";
  const stars = score?.stars ?? 0;

  const rewards: Reward[] = [
    { id: "contract", label: "Contract Fulfilled", description: "All primary objectives met", earned: won, icon: "" },
    { id: "data", label: "Science Ace", description: "Downlinked a full data buffer", earned: (state?.data_downlinked_mb ?? 0) > 300, icon: "" },
    { id: "health", label: "Nominal Operator", description: "Kept spacecraft health above 80%", earned: (state?.spacecraft_health_pct ?? 0) > 80, icon: "" },
    { id: "budget", label: "Fiscal Hawk", description: "Finished with 25%+ budget reserve", earned: (state?.budget_remaining ?? 0) > 2500, icon: "" },
  ];

  const primaryDone = score?.primary_objectives_completed ?? (won ? 1 : 0);
  const primaryTotal = score?.primary_objectives_total ?? 1;
  const optionalDone = score?.optional_objectives_completed ?? 0;
  const optionalTotal = score?.optional_objectives_total ?? 1;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Grade reveal */}
      <div className="mb-10 text-center">
        <p className="micro-label mb-4 text-faint">Mission Debrief · {session.missionName}</p>
        {score && (
          <div className="mb-3 flex items-center justify-center gap-6">
            <div className="text-right">
              <div className="micro-label mb-1 text-faint">Final Score</div>
              <div className="data-readout text-3xl font-semibold text-ink">
                {animatedScore.toLocaleString()}
                <span className="ml-1 text-sm text-faint">/ {score.max_score.toLocaleString()}</span>
              </div>
            </div>
            <div
              className={cn(
                "border px-6 py-2 font-mono text-6xl font-bold leading-none animate-flicker",
                gradeTone(score.grade),
                score.grade.startsWith("A")
                  ? "border-ok/40 bg-ok/10"
                  : score.grade.startsWith("B")
                    ? "border-ok/30 bg-ok/5"
                    : score.grade.startsWith("C")
                      ? "border-warn/40 bg-warn/10"
                      : "border-crit/40 bg-crit/10"
              )}
              aria-label={`Final grade ${score.grade}`}
            >
              {score.grade}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {stars > 0 && (
            <span className="data-readout text-sm text-accent" aria-label={`${stars} stars`}>
              {"★".repeat(stars)}
              <span className="text-edge-strong">{"★".repeat(Math.max(0, 3 - stars))}</span>
            </span>
          )}
          <h1 className="text-2xl font-semibold text-ink">
            {won ? "Mission Success" : outcome === "partial" ? "Mission Partially Successful" : "Mission Debrief"}
          </h1>
          <StatusBadge
            label={outcome ?? "in progress"}
            variant={won ? "success" : outcome === "partial" ? "warning" : "danger"}
          />
        </div>
      </div>

      {state && state.status === "running" && (
        <Card title="Mission Still Running" className="mb-6">
          <p className="mb-3 text-sm text-muted">
            The session hasn't ended yet — the score below is a live operational snapshot.
          </p>
          <Button variant="secondary" onClick={() => navigate("/operate")}>Back to Mission Control</Button>
        </Card>
      )}

      {/* Primary & Optional Objectives Progress Banner */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="border border-edge bg-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="micro-label text-accent">Primary Objectives</span>
            <span className="data-readout text-sm text-ink">{primaryDone} / {primaryTotal} Complete</span>
          </div>
          <div className="h-1.5 w-full bg-edge overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-1000"
              style={{ width: `${Math.min(100, (primaryDone / Math.max(primaryTotal, 1)) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-faint">
            Mandatory contract deliverables required for baseline flight qualification.
          </p>
        </div>

        <div className="border border-edge bg-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="micro-label text-muted">Secondary / Optional Objectives</span>
            <span className="data-readout text-sm text-ink">{optionalDone} / {optionalTotal} Complete</span>
          </div>
          <div className="h-1.5 w-full bg-edge overflow-hidden">
            <div
              className="h-full bg-edge-strong transition-all duration-1000"
              style={{ width: `${Math.min(100, (optionalDone / Math.max(optionalTotal, 1)) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-faint">
            Scientific bonus tasks and telemetry endurance targets contributing to higher ratings.
          </p>
        </div>
      </div>

      {/* Score Breakdown (includes Safety Cap & Category details) */}
      {score && <ScoreBreakdown score={score} className="mb-8" />}

      {/* Objectives Detail Tracker */}
      {state && (
        <Card title="Objective Progression Detail" className="mb-8">
          <ObjectiveTracker objectives={state.objectives ?? []} />
        </Card>
      )}

      {/* Co-op Crew Contribution Summary (if multiplayer or team summary available) */}
      {teamSummary && teamSummary.participants && teamSummary.participants.length > 1 && (
        <Card title="Co-op Crew Contribution & Station Coordination" icon={<Handshake className="h-4 w-4" />} className="mb-8">
          <div className="mb-4 flex items-center justify-between border-b border-edge pb-3 text-xs">
            <div>
              <span className="text-muted">Team Coordination Rating: </span>
              <span className="text-sm font-bold text-ok">
                {Math.round(teamSummary.coordination_index * 100)}%
              </span>
            </div>
            <div className="text-muted">
              <span>Directives Assisted: </span>
              <span className="data-readout text-ink">{teamSummary.cross_role_assistance_count}</span>
            </div>
          </div>

          <p className="mb-4 text-xs italic text-muted">{teamSummary.summary_narrative}</p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {teamSummary.participants.map((member) => (
              <div key={member.player_id} className="border border-edge bg-void/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-ink">{member.display_name}</span>
                    <span className="block font-mono text-xs text-accent">{member.roles.join(", ")}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-ok">{member.contribution_percentage}%</span>
                    <span className="micro-label block text-faint">crew share</span>
                  </div>
                </div>

                <div className="mb-3 h-1 w-full bg-edge overflow-hidden">
                  <div
                    className="h-full bg-ok"
                    style={{ width: `${Math.min(100, member.contribution_percentage)}%` }}
                  />
                </div>

                <ul className="space-y-1 text-xs text-muted">
                  {member.role_highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span aria-hidden className="mt-0.5 text-ok">▸</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Educational "Is It Worth It?" (Cost-Per-Useful-Result Analysis) */}
      {costModel && (
        <Card title='Educational Economics: "Is It Worth It?" (Cost Per Useful Result)' className="mb-8">
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="border border-edge bg-void/60 p-4">
              <span className="micro-label mb-1.5 block text-faint">Amortized Mission Cost</span>
              <span className="data-readout text-2xl font-semibold text-ink">
                ${costModel.total_amortized_mission_cost_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="micro-label mt-1.5 block text-faint">
                CAPEX ${costModel.amortized_mission_capex_usd.toFixed(0)} + OPEX ${costModel.mission_operational_spent_usd.toFixed(0)}
              </span>
            </div>

            <div className="border border-edge bg-void/60 p-4">
              <span className="micro-label mb-1.5 block text-faint">Cost Per Useful Science MB</span>
              <span className="data-readout text-2xl font-semibold text-info">
                ${costModel.cost_per_mb_usd.toFixed(2)}
                <span className="ml-1 text-xs text-faint">/ MB</span>
              </span>
              <span className="micro-label mt-1.5 block text-faint">
                {costModel.data_downlinked_mb.toFixed(0)} MB downlinked
              </span>
            </div>

            <div className="border border-edge bg-void/60 p-4">
              <span className="micro-label mb-1.5 block text-faint">Cost Per Anomaly Alert</span>
              <span className="data-readout text-2xl font-semibold text-warn">
                ${costModel.cost_per_alert_usd.toFixed(2)}
                <span className="ml-1 text-xs text-faint">/ Alert</span>
              </span>
              <span className="micro-label mt-1.5 block text-faint">
                {costModel.alerts_delivered} alerts delivered
              </span>
            </div>
          </div>

          <div className="mb-4 border border-accent/30 bg-accent/[0.06] p-4 text-xs">
            <div className="mb-1 flex items-center justify-between">
              <span className="micro-label text-accent">Edge processing efficiency</span>
              <span className="data-readout text-sm font-semibold text-ok">{costModel.cost_efficiency_multiplier}x More Cost-Efficient</span>
            </div>
            <p className="text-muted">
              Traditional flagship satellites average ~${costModel.benchmark_flagship_cost_per_mb_usd}/MB. LumenOS onboard edge compression delivered an estimated <strong className="text-ok">{costModel.cost_efficiency_gain_pct}%</strong> cost reduction.
            </p>
          </div>

          <div className="border-t border-edge pt-3">
            <button
              onClick={() => setShowCostAssumptions(!showCostAssumptions)}
              className="flex items-center gap-1 font-mono text-xs text-accent transition-colors hover:text-accent-hi"
            >
              <span>{showCostAssumptions ? "Hide" : "Show"} documented assumptions</span>
              <span aria-hidden>{showCostAssumptions ? "▲" : "▼"}</span>
            </button>
            {showCostAssumptions && (
              <ul className="mt-3 list-inside list-disc space-y-1.5 bg-void/40 p-3 text-xs text-muted">
                {costModel.educational_assumptions.map((asm, idx) => (
                  <li key={idx} className="leading-relaxed">{asm}</li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      {/* Rewards & Rank */}
      <RewardPanel
        rewards={rewards}
        xp={career.xp}
        nextRankXp={1000}
        rankLabel={career.xp >= 800 ? "Veteran Flight Director" : career.xp >= 400 ? "Mission Specialist" : "Cadet Operator"}
        className="mb-8"
      />

      {/* Navigation CTAs */}
      <div className="flex flex-wrap justify-center gap-4">
        <Button onClick={() => navigate("/replay")}>
          Replay & What-If Studio →
        </Button>
        <Button variant="secondary" onClick={() => navigate("/missions")}>
          Fly Another Mission
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            clearMissionSession();
            navigate("/");
          }}
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
}
