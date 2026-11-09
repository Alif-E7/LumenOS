import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteGameSession, getGameScore, getGameState } from "../api/client";
import { loadMissionSession, clearMissionSession } from "../lib/mission";
import { coinsLeft, kidScoreStory } from "../lib/kid";

/**
 * Kid-friendly mission debrief: big stars, one-sentence story, three
 * mini-stats, and the next-step buttons. Replaces the expert ResultsPage
 * for the simple experience.
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
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      navigate("/missions", { replace: true });
      return;
    }
    Promise.all([getGameScore(sessionId), getGameState(sessionId)])
      .then(([scoreResp, stateResp]) => {
        setScore(scoreResp);
        setCoins(coinsLeft(stateResp.game_state));
        setOutcome(stateResp.game_state.outcome);
        setHealth(Math.round(stateResp.game_state.spacecraft_health_pct));
        setCollectedMb(stateResp.game_state.data_collected_mb ?? 0);
        setDownlinkedMb(stateResp.game_state.data_downlinked_mb ?? 0);
      })
      .catch(() => setError(true));
  }, [sessionId, navigate]);

  const pct = score ? Math.round((score.total_score / Math.max(1, score.max_score)) * 100) : 0;
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

  const stats = [
    { emoji: "📸", label: "Photos taken", value: `${Math.round(collectedMb)} MB` },
    { emoji: "📡", label: "Data sent home", value: `${Math.round(downlinkedMb)} MB` },
    { emoji: "🪙", label: "Coins left", value: coins.toLocaleString() },
    { emoji: "❤️", label: "Ship health", value: `${health}%` },
  ];

  return (
    <div className="fixed inset-0 bg-void overflow-y-auto">
      {/* Starry backdrop is the void itself — keep it simple */}
      <div className="min-h-full flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md text-center">
          {/* Stars */}
          <div className="text-6xl tracking-widest" aria-label={`${story.stars} of 3 stars`}>
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className={i < story.stars ? "" : "opacity-20 grayscale"}>
                ⭐
              </span>
            ))}
          </div>

          <h1 className="text-4xl font-bold text-ink mt-4">{story.headline}</h1>
          <p className="text-muted mt-2 leading-relaxed">
            {error
              ? "The mission is over — mission control went quiet, but you flew well!"
              : story.sentence}
          </p>

          {/* Mini stats */}
          <div className="grid grid-cols-2 gap-3 mt-8">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-edge bg-panel/70 px-4 py-3 shadow-lg"
              >
                <div className="text-2xl">{s.emoji}</div>
                <div className="text-lg font-bold text-ink mt-1">{s.value}</div>
                <div className="text-[11px] text-faint uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => finish(`/hangar?mission=${missionId}`)}
              className="rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-ink font-bold text-lg py-3 transition-colors"
            >
              🔁 Fly Again
            </button>
            <button
              type="button"
              onClick={() => finish("/missions")}
              className="rounded-2xl border border-edge bg-panel/70 hover:bg-panel text-ink font-bold py-3 transition-colors"
            >
              🗺️ Pick Another Mission
            </button>
            <button
              type="button"
              onClick={() => finish("/operate")}
              className="text-sm text-faint hover:text-muted underline"
            >
              Try the Expert Flight Console
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
