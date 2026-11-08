import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { RewardPanel, type Reward } from "../components/RewardPanel";
import { ObjectiveTracker } from "../components/ObjectiveTracker";
import { StatusBadge } from "../components/StatusBadge";
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
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-accent mx-auto mb-4" />
        <p className="text-muted">Computing mission debrief & telemetry economics…</p>
      </div>
    );
  }

  if (!session?.sessionId || (!score && !error)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card title="No Mission Results" icon="📉">
          <p className="text-muted text-sm mb-4">
            Results appear after you fly a mission. Launch one from the campaign.
          </p>
          <Button onClick={() => navigate("/missions")}>Go to Mission Campaign</Button>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card title="Results Unavailable" icon="⚠️">
          <p className="text-crit text-sm mb-2">{error}</p>
          <p className="text-ink0 text-sm mb-4">
            The game session may have expired (sessions live in server memory).
          </p>
          <Button variant="secondary" onClick={() => navigate("/")}>Back to Home</Button>
        </Card>
      </div>
    );
  }

  const outcome = state?.outcome;
  const won = outcome === "win";

  const rewards: Reward[] = [
    { id: "contract", label: "Contract Fulfilled", description: "All primary objectives met", earned: won, icon: "🏅" },
    { id: "data", label: "Science Ace", description: "Downlinked a full data buffer", earned: (state?.data_downlinked_mb ?? 0) > 300, icon: "🔬" },
    { id: "health", label: "Nominal Operator", description: "Kept spacecraft health above 80%", earned: (state?.spacecraft_health_pct ?? 0) > 80, icon: "🩺" },
    { id: "budget", label: "Fiscal Hawk", description: "Finished with 25%+ budget reserve", earned: (state?.budget_remaining ?? 0) > 2500, icon: "💰" },
  ];

  const primaryDone = score?.primary_objectives_completed ?? (won ? 1 : 0);
  const primaryTotal = score?.primary_objectives_total ?? 1;
  const optionalDone = score?.optional_objectives_completed ?? 0;
  const optionalTotal = score?.optional_objectives_total ?? 1;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-6xl mb-3" aria-hidden>{won ? "🎉" : "🛠️"}</div>
        <h1 className="text-3xl font-bold text-ink mb-2">
          {won ? "Mission Success" : outcome === "partial" ? "Mission Partially Successful" : "Mission Debrief"}
        </h1>
        <p className="text-muted">
          {session.missionName} —{" "}
          <StatusBadge
            label={outcome ?? "in progress"}
            variant={won ? "success" : outcome === "partial" ? "warning" : "danger"}
          />
        </p>
      </div>

      {state && state.status === "running" && (
        <Card title="Mission Still Running" icon="⏱️" className="mb-6">
          <p className="text-muted text-sm mb-3">
            The session hasn't ended yet — the score below is a live operational snapshot.
          </p>
          <Button variant="secondary" onClick={() => navigate("/operate")}>Back to Mission Control</Button>
        </Card>
      )}

      {/* Primary & Optional Objectives Progress Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="p-4 rounded-none bg-panel/70 border border-edge">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">Primary Objectives</span>
            <span className="text-sm font-mono text-ink">{primaryDone} / {primaryTotal} Complete</span>
          </div>
          <div className="w-full bg-raised h-2 rounded-full overflow-hidden">
            <div
              className="bg-accent h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, (primaryDone / Math.max(primaryTotal, 1)) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted mt-2">
            Mandatory contract deliverables required for baseline flight qualification.
          </p>
        </div>

        <div className="p-4 rounded-none bg-panel/70 border border-edge">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Secondary / Optional Objectives</span>
            <span className="text-sm font-mono text-ink">{optionalDone} / {optionalTotal} Complete</span>
          </div>
          <div className="w-full bg-raised h-2 rounded-full overflow-hidden">
            <div
              className="bg-edge-strong h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, (optionalDone / Math.max(optionalTotal, 1)) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted mt-2">
            Scientific bonus tasks and telemetry endurance targets contributing to higher ratings.
          </p>
        </div>
      </div>

      {/* Score Breakdown (includes Safety Cap & Category details) */}
      {score && <ScoreBreakdown score={score} className="mb-8" />}

      {/* Objectives Detail Tracker */}
      {state && (
        <Card title="Objective Progression Detail" icon="🎯" className="mb-8">
          <ObjectiveTracker objectives={state.objectives ?? []} />
        </Card>
      )}

      {/* Co-op Crew Contribution Summary (if multiplayer or team summary available) */}
      {teamSummary && teamSummary.participants && teamSummary.participants.length > 1 && (
        <Card title="Co-op Crew Contribution & Station Coordination" icon="🤝" className="mb-8">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-edge text-xs">
            <div>
              <span className="text-muted">Team Coordination Rating: </span>
              <span className="text-ok font-bold text-sm">
                {Math.round(teamSummary.coordination_index * 100)}%
              </span>
            </div>
            <div className="text-muted">
              <span>Directives Assisted: </span>
              <span className="text-ink font-mono">{teamSummary.cross_role_assistance_count}</span>
            </div>
          </div>

          <p className="text-xs text-ink italic mb-4">{teamSummary.summary_narrative}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamSummary.participants.map((member) => (
              <div key={member.player_id} className="p-4 rounded-none bg-void/60 border border-edge">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-sm text-ink">{member.display_name}</span>
                    <span className="text-xs text-accent block">{member.roles.join(", ")}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-ok">{member.contribution_percentage}%</span>
                    <span className="text-2xs text-ink0 block">crew share</span>
                  </div>
                </div>

                <div className="w-full bg-raised h-1.5 rounded-full overflow-hidden mb-3">
                  <div
                    className="bg-ok h-full rounded-full"
                    style={{ width: `${Math.min(100, member.contribution_percentage)}%` }}
                  />
                </div>

                <ul className="text-xs text-muted space-y-1">
                  {member.role_highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-ok text-2xs mt-0.5">▸</span>
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
        <Card title='Educational Economics: "Is It Worth It?" (Cost Per Useful Result)' icon="💡" className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-none bg-void/60 border border-edge">
              <span className="text-xs text-muted block mb-1">Amortized Mission Cost</span>
              <span className="text-2xl font-bold text-ink font-mono">
                ${costModel.total_amortized_mission_cost_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-2xs text-ink0 block mt-1">
                CapEx (${costModel.amortized_mission_capex_usd.toFixed(0)}) + OpEx (${costModel.mission_operational_spent_usd.toFixed(0)})
              </span>
            </div>

            <div className="p-4 rounded-none bg-void/60 border border-edge">
              <span className="text-xs text-muted block mb-1">Cost Per Useful Science MB</span>
              <span className="text-2xl font-bold text-info font-mono">
                ${costModel.cost_per_mb_usd.toFixed(2)}
                <span className="text-xs font-normal text-muted"> / MB</span>
              </span>
              <span className="text-2xs text-ink0 block mt-1">
                {costModel.data_downlinked_mb.toFixed(0)} MB useful science downlinked
              </span>
            </div>

            <div className="p-4 rounded-none bg-void/60 border border-edge">
              <span className="text-xs text-muted block mb-1">Cost Per Anomaly Alert</span>
              <span className="text-2xl font-bold text-warn font-mono">
                ${costModel.cost_per_alert_usd.toFixed(2)}
                <span className="text-xs font-normal text-muted"> / Alert</span>
              </span>
              <span className="text-2xs text-ink0 block mt-1">
                {costModel.alerts_delivered} high-priority alerts delivered
              </span>
            </div>
          </div>

          <div className="p-4 rounded-none bg-accent/10/30 border border-blue-900/40 text-xs mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-accent-hi">Edge Processing Cost-Efficiency vs Monolithic Satellite:</span>
              <span className="text-ok font-bold font-mono text-sm">{costModel.cost_efficiency_multiplier}x More Cost-Efficient</span>
            </div>
            <p className="text-ink">
              Traditional flagship monolithic satellites average ~${costModel.benchmark_flagship_cost_per_mb_usd}/MB due to massive bus launch mass and uncompressed raw downlinks. LumenOS onboard edge compression delivered an estimated <strong className="text-ok">{costModel.cost_efficiency_gain_pct}%</strong> cost reduction.
            </p>
          </div>

          <div className="border-t border-edge pt-3">
            <button
              onClick={() => setShowCostAssumptions(!showCostAssumptions)}
              className="text-xs text-accent hover:text-accent-hi font-medium flex items-center gap-1"
            >
              <span>{showCostAssumptions ? "Hide" : "Show"} Documented Educational Assumptions</span>
              <span>{showCostAssumptions ? "▲" : "▼"}</span>
            </button>
            {showCostAssumptions && (
              <ul className="mt-3 text-xs text-muted space-y-1.5 list-disc list-inside bg-void/40 p-3 rounded">
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
      <div className="flex flex-wrap gap-4 justify-center">
        <Button onClick={() => navigate("/replay")} className="bg-accent hover:bg-accent shadow-lg shadow-accent/20">
          Launch Replay & What-If Studio →
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
