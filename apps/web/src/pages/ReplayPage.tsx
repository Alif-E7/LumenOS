import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { MockDataBadge } from "../components/MockDataBadge";

/**
 * Replay / What-If — planned post-mission analysis view.
 * NOT IMPLEMENTED yet: it needs stored per-step mission history, which the
 * in-memory session doesn't keep after teardown. Rather than fake charts,
 * this screen explains the plan and links to what works today.
 */
export function ReplayPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold text-white">Replay & What-If</h1>
        <MockDataBadge reason="replay/what-if is not implemented yet" />
      </div>
      <p className="text-slate-400 mb-8">
        Re-fly critical decisions and compare outcomes side-by-side.
      </p>

      <Card title="Planned Experience" icon="🧭" className="mb-6">
        <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside">
          <li><span className="text-slate-200">Decision timeline:</span> scrub through every event and action you took, with the telemetry at that moment.</li>
          <li><span className="text-slate-200">What-if forks:</span> branch at any decision, change the choice, and re-run the deterministic seeded simulation to compare.</li>
          <li><span className="text-slate-200">Score delta:</span> see how each alternative choice would have changed your grade.</li>
        </ul>
        <p className="text-xs text-slate-500 mt-4">
          The simulation is already seeded and deterministic (same seed → same
          mission), so what-if comparisons will be exact once mission history
          persistence lands.
        </p>
      </Card>

      <Card title="Available Today" icon="✅" className="mb-8">
        <ul className="text-sm text-slate-400 space-y-2">
          <li>📊 Full score breakdown per category — <em>Results page</em></li>
          <li>🎯 Objective-by-objective completion — <em>Results page</em></li>
          <li>🎖️ Badges & XP — <em>Rewards page</em></li>
        </ul>
      </Card>

      <div className="flex gap-3 justify-center">
        <Button onClick={() => navigate("/results")}>Mission Results</Button>
        <Button variant="secondary" onClick={() => navigate("/missions")}>Fly Again</Button>
      </div>
    </div>
  );
}
