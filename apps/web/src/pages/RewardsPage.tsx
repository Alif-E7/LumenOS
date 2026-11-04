import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { RewardPanel, type Reward } from "../components/RewardPanel";
import { MockDataBadge } from "../components/MockDataBadge";

const BADGES: Reward[] = [
  { id: "first_flight", label: "First Flight", description: "Complete your first mission", earned: false, icon: "🚀" },
  { id: "contract", label: "Contract Fulfilled", description: "Win any mission", earned: false, icon: "🏅" },
  { id: "science", label: "Science Ace", description: "Downlink a full buffer of data", earned: false, icon: "🔬" },
  { id: "thermal", label: "Cool Head", description: "Win a mission without an overtemp warning", earned: false, icon: "🧊" },
  { id: "crew", label: "Team Player", description: "Win a co-op mission with a full crew", earned: false, icon: "👥" },
  { id: "director", label: "Iron Director", description: "Resolve 5 events without losing health", earned: false, icon: "🎖️" },
];

/**
 * Rewards / Progression — career overview.
 * Badge unlock conditions are defined; persistence is browser-local and
 * per-mission history is not stored yet (labeled).
 */
export function RewardsPage() {
  const navigate = useNavigate();
  let xp = 0;
  try {
    xp = JSON.parse(localStorage.getItem("lumenos.career") ?? "").xp ?? 0;
  } catch { /* default 0 */ }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold text-white">Rewards & Progression</h1>
        <MockDataBadge reason="badge unlock history is not persisted yet" />
      </div>
      <p className="text-slate-400 mb-8">
        XP is earned from mission scores. Your total travels with this browser;
        cross-device profiles aren't implemented.
      </p>

      <RewardPanel rewards={BADGES} xp={xp} nextRankXp={1000} rankLabel="Cadet Operator" className="mb-8" />

      <Card title="How XP Works" icon="ℹ️" className="mb-8">
        <ul className="text-sm text-slate-400 space-y-1.5 list-disc list-inside">
          <li>1 XP per 10 mission points scored</li>
          <li>Ranks: Cadet Operator → Mission Specialist (400 XP) → Veteran Flight Director (800 XP)</li>
          <li>Badges unlock from mission outcomes and play conditions</li>
        </ul>
      </Card>

      <div className="flex justify-center">
        <Button onClick={() => navigate("/missions")}>Earn XP — Fly a Mission</Button>
      </div>
    </div>
  );
}
