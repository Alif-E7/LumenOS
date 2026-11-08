import { useNavigate, useSearchParams } from "react-router-dom";
import { BenchmarkComparisonView } from "../components/BenchmarkComparisonView";
import { Button } from "../components/Button";

/**
 * BenchmarkPage — Fair Three-Way Control Comparison Harness (Prompt 13).
 * Evaluates Manual Pilot vs Traditional Reactive Autopilot vs LumenOS Predictive Control.
 */
export function BenchmarkPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialScenario = searchParams.get("scenario") || "wildfire_scout";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Control Strategy Benchmark
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-medium bg-blue-900/60 border border-blue-600 text-blue-300">
              PROMPT 13
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Head-to-head empirical evaluation of Manual, Reactive, and Predictive satellite flight controllers under identical physical conditions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate("/operate")}>
            Satellite Operations 🛰️
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/sources")}>
            Data Provenance 📚
          </Button>
        </div>
      </div>

      {/* Main Benchmark Comparison View Component */}
      <BenchmarkComparisonView initialScenarioId={initialScenario} />
    </div>
  );
}

