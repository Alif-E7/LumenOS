import { useNavigate, useSearchParams } from "react-router-dom";
import { BenchmarkComparisonView } from "../components/BenchmarkComparisonView";
import { Button } from "../components/Button";
import { BookOpen } from "lucide-react";

/**
 * BenchmarkPage — Fair Three-Way Control Comparison Harness.
 * Evaluates Manual Pilot vs Traditional Reactive Autopilot vs LumenOS Predictive Control.
 */
export function BenchmarkPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialScenario = searchParams.get("scenario") || "wildfire_scout";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="micro-label mb-2 text-accent">Benchmark Harness</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            Control Strategy Benchmark
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Head-to-head empirical evaluation of Manual, Reactive, and Predictive satellite
            flight controllers under identical physical conditions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate("/operate")}>
            Satellite Operations
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/sources")}>
            <BookOpen className="h-3.5 w-3.5" aria-hidden /> Data Provenance
          </Button>
        </div>
      </div>

      {/* Main Benchmark Comparison View Component */}
      <BenchmarkComparisonView initialScenarioId={initialScenario} />
    </div>
  );
}
