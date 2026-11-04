import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { RewardPanel, type Reward } from "../components/RewardPanel";
import { ObjectiveTracker } from "../components/ObjectiveTracker";
import { MockDataBadge } from "../components/MockDataBadge";
import { StatusBadge } from "../components/StatusBadge";
import { getGameScore, getGameState } from "../api/client";
import { loadMissionSession, saveMissionSession, clearMissionSession } from "../lib/mission";
import type { GameStateSummary, ScoreResponse } from "../types";

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
 * Results — outcome, full score breakdown, and rewards.
 * Only reachable once the session has an outcome.
 */
export function ResultsPage() {
  const navigate = useNavigate();
  const session = loadMissionSession();
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [state, setState] = useState<GameStateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [career, setCareer] = useState(loadCareer);
  const [xpAwarded, setXpAwarded] = useState(false);

  useEffect(() => {
    if (!session?.sessionId) {
      setLoading(false);
      return;
    }
    Promise.all([getGameScore(session.sessionId), getGameState(session.sessionId)])
      .then(([s, st]) => {
        setScore(s);
        setState(st.game_state);
        // Award XP once per mission completion
        if (!xpAwarded && st.game_state.outcome) {
          const gained = Math.round(s.total_score / 10);
          const next = { xp: loadCareer().xp + gained };
          saveCareer(next.xp);
          setCareer(next);
          setXpAwarded(true);
          const updated = loadMissionSession();
          if (updated) saveMissionSession({ ...updated, sessionId: null }); // mission consumed
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500 mx-auto mb-4" />
        <p className="text-slate-400">Computing mission results…</p>
      </div>
    );
  }

  if (!session?.sessionId || (!score && !error)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card title="No Mission Results" icon="📉">
          <p className="text-slate-400 text-sm mb-4">
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
          <p className="text-red-400 text-sm mb-2">{error}</p>
          <p className="text-slate-500 text-sm mb-4">
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-8">
        <div className="text-6xl mb-3" aria-hidden>{won ? "🎉" : "🛠️"}</div>
        <h1 className="text-3xl font-bold text-white mb-2">
          {won ? "Mission Success" : outcome === "partial" ? "Mission Partially Successful" : "Mission Debrief"}
        </h1>
        <p className="text-slate-400">
          {session.missionName} —{" "}
          <StatusBadge
            label={outcome ?? "in progress"}
            variant={won ? "success" : outcome === "partial" ? "warning" : "danger"}
          />
        </p>
      </div>

      {state && state.status === "running" && (
        <Card title="Mission Still Running" icon="⏱️" className="mb-6">
          <p className="text-slate-400 text-sm mb-3">
            The session hasn't ended yet — the score below is a live snapshot.
          </p>
          <Button variant="secondary" onClick={() => navigate("/operate")}>Back to Mission Control</Button>
        </Card>
      )}

      {score && <ScoreBreakdown score={score} className="mb-8" />}

      {state && (
        <Card title="Objective Summary" icon="🎯" className="mb-8">
          <ObjectiveTracker objectives={state.objectives ?? []} />
        </Card>
      )}

      <RewardPanel
        rewards={rewards}
        xp={career.xp}
        nextRankXp={1000}
        rankLabel={career.xp >= 800 ? "Veteran Flight Director" : career.xp >= 400 ? "Mission Specialist" : "Cadet Operator"}
        className="mb-8"
      />

      <div className="flex flex-wrap gap-3 justify-center">
        <Button onClick={() => navigate("/replay")}>Replay / What-If →</Button>
        <Button variant="secondary" onClick={() => navigate("/missions")}>Fly Another Mission</Button>
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
