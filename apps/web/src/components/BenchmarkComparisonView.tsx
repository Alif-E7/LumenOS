import React, { useState, useEffect } from "react";
import type {
  BenchmarkComparisonResult,
  BenchmarkScenarioItem,
  BenchmarkTrialResult,
} from "../types/benchmark";
import {
  getBenchmarkScenarios,
  runBenchmarkComparison,
  getLatestBenchmark,
} from "../api/client";

interface BenchmarkComparisonViewProps {
  initialScenarioId?: string;
}

export const BenchmarkComparisonView: React.FC<BenchmarkComparisonViewProps> = ({
  initialScenarioId = "wildfire_scout",
}) => {
  const [scenarios, setScenarios] = useState<BenchmarkScenarioItem[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>(initialScenarioId);
  const [seed, setSeed] = useState<number>(42);
  const [maxSteps, setMaxSteps] = useState<number>(100);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<BenchmarkComparisonResult | null>(null);
  const [selectedActionTab, setSelectedActionTab] = useState<
    "lumenos_predictive" | "reactive_autopilot" | "manual_pilot"
 >("lumenos_predictive");
  const [showActionLogs, setShowActionLogs] = useState<boolean>(false);

  // Load scenarios on mount
  useEffect(() => {
    getBenchmarkScenarios()
      .then((data) => {
        setScenarios(data);
        if (data.length > 0 && !data.some((s) => s.id === selectedScenario)) {
          setSelectedScenario(data[0].id);
        }
      })
      .catch((err) => {
        console.warn("Failed to load benchmark scenarios:", err);
      });

    // Attempt to load latest benchmark if available
    getLatestBenchmark()
      .then((latest) => {
        if (latest) {
          setComparison(latest);
          setSelectedScenario(latest.scenario_id);
          setSeed(latest.seed);
        }
      })
      .catch(() => {
        // No cached benchmark yet, ignore
      });
  }, []);

  const handleRunBenchmark = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runBenchmarkComparison({
        scenario_id: selectedScenario,
        seed: Number(seed),
        max_steps: Number(maxSteps),
      });
      setComparison(result);
    } catch (err: any) {
      setError(err?.message || "Failed to execute benchmark comparison");
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "A":
        return "text-ok bg-ok/10 border-ok/40/60";
      case "B":
        return "text-info bg-info/10 border-info/40/60";
      case "C":
        return "text-warn bg-warn/10 border-warn/40";
      case "D":
        return "text-warn bg-warn/10 border-warn/40/60";
      default:
        return "text-crit bg-crit/10 border-crit/40/60";
    }
  };

  const formatDelta = (val: number, unit = "", invertBetter = false) => {
    if (val === 0) return <span className="text-muted">0 {unit}</span>;
    const isPositive = val > 0;
    const isBetter = invertBetter ? !isPositive : isPositive;
    const sign = isPositive ? "+" : "";
    return (
 <span className={isBetter ? "text-ok font-medium" : "text-crit font-medium"}>
        {sign}
        {val.toFixed(1)} {unit}
 </span>
 );
  };

  return (
 <div data-testid="benchmark-comparison-view" className="space-y-8">
      {/* Methodology & Rigor Header Banner */}
 <div className="bg-panel/90 border border-edge-strong/80 rounded-none p-5 shadow-lg backdrop-blur-sm">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-edge pb-4">
 <div>
 <div className="flex items-center gap-2 mb-1">
 <span className="text-xl">⚖️</span>
 <h2 className="text-lg font-bold text-ink tracking-wide">
                Fair Three-Way Flight Control Benchmark Harness
 </h2>
 </div>
 <p className="text-xs text-ink max-w-3xl">
              Strictly controlled comparison between{" "}
 <strong className="text-ink">Manual Pilot</strong> (human checklist execution),{" "}
 <strong className="text-info">Reactive Autopilot</strong> (classic aerospace threshold-based FDIR),
              and <strong className="text-accent">LumenOS Predictive Control</strong> (5-min forward physics ODE scheduling).
 </p>
 </div>
 <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
 <span className="px-2 py-0.5 rounded-none bg-accent/10 border border-accent/40 text-accent-hi">
              ISOLATED SEEDS
 </span>
 <span className="px-2 py-0.5 rounded-none bg-info/10 border border-info/40/70 text-info">
              ZERO LOOKAHEAD LEAKAGE
 </span>
 <span className="px-2 py-0.5 rounded-none bg-raised/80 border border-edge-strong/70 text-muted">
              IDENTICAL INITIAL STATE
 </span>
 </div>
 </div>

        {/* Methodology Notes */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 text-xs text-ink">
 <div className="p-2.5 rounded-none bg-void/60 border border-edge">
 <span className="text-muted font-semibold block mb-0.5">1. Identical Test Conditions</span>
            Initial orbit, design, components, battery SoC, and temperature are strictly bit-exact across all three strategies.
 </div>
 <div className="p-2.5 rounded-none bg-void/60 border border-edge">
 <span className="text-muted font-semibold block mb-0.5">2. Decoupled Random Streams</span>
            Exogenous environmental events arrive on a separate precomputed stream. Controller actions consume an isolated RNG stream.
 </div>
 <div className="p-2.5 rounded-none bg-void/60 border border-edge">
 <span className="text-muted font-semibold block mb-0.5">3. State-Only Observation</span>
            No controller has knowledge of future random events. Predictive control projects only through physics integration from $S_t$.
 </div>
 </div>
 </div>

      {/* Control / Execution Bar */}
 <div className="bg-panel border border-edge rounded-none p-4 flex flex-wrap items-center justify-between gap-4">
 <div className="flex flex-wrap items-center gap-4">
 <div>
 <label className="block text-[11px] uppercase tracking-wider font-semibold text-muted mb-1">
              Mission Scenario
 </label>
 <select
              data-testid="benchmark-scenario-select"
              aria-label="Mission Scenario"
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              className="bg-void border border-edge-strong rounded-none px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-accent font-medium"
 >
              {scenarios.map((s) => (
 <option key={s.id} value={s.id}>
                  {s.name} ({s.difficulty})
 </option>
 ))}
 </select>
 </div>

 <div>
 <label className="block text-[11px] uppercase tracking-wider font-semibold text-muted mb-1">
              Random Seed
 </label>
 <input
              type="number"
              data-testid="benchmark-seed-input"
              aria-label="Random Seed"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
              className="w-24 bg-void border border-edge-strong rounded-none px-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:border-accent"
            />
 </div>

 <div>
 <label className="block text-[11px] uppercase tracking-wider font-semibold text-muted mb-1">
              Max Steps
 </label>
 <input
              type="number"
              data-testid="benchmark-steps-input"
              aria-label="Max Steps"
              value={maxSteps}
              onChange={(e) => setMaxSteps(parseInt(e.target.value) || 100)}
              className="w-24 bg-void border border-edge-strong rounded-none px-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:border-accent"
            />
 </div>
 </div>

 <div className="flex items-center gap-2">
 <button
            type="button"
            data-testid="run-benchmark-btn"
            onClick={handleRunBenchmark}
            disabled={loading}
            className="px-4 py-2 bg-accent hover:bg-accent disabled:opacity-50 text-ink rounded-none text-xs font-semibold shadow-md shadow-accent/20 transition-all flex items-center gap-2"
 >
            {loading ? (
 <>
 <span className="animate-spin text-sm"></span>
 <span>Executing 3 Trials...</span>
 </>
 ) : (
 <>
 <span></span>
 <span>Run 3-Way Benchmark</span>
 </>
 )}
 </button>
 </div>
 </div>

      {error && (
 <div className="bg-crit/10 border border-crit/40 text-crit px-4 py-3 rounded-none text-xs flex items-center gap-2">
 <span></span>
 <span>{error}</span>
 </div>
 )}

      {/* Comparison Results */}
      {comparison && (
 <div className="space-y-8" data-testid="benchmark-results-container">
          {/* Strategy Scorecards Grid */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Manual Pilot */}
 <StrategyCard
              title="Manual Pilot"
              tag="Human Crew Emulation"
              tagColor="bg-raised text-ink border-edge-strong"
              trial={comparison.trials.manual_pilot}
              getGradeColor={getGradeColor}
              isHighlight={false}
            />

            {/* Reactive Autopilot */}
 <StrategyCard
              title="Reactive Autopilot"
              tag="Classic Threshold FDIR"
              tagColor="bg-info/10 text-info border-info/40"
              trial={comparison.trials.reactive_autopilot}
              getGradeColor={getGradeColor}
              isHighlight={false}
            />

            {/* LumenOS Predictive Control */}
 <StrategyCard
              title="LumenOS Predictive"
              tag="Physics ODE Lookahead"
              tagColor="bg-accent/10 text-accent-hi border-accent"
              trial={comparison.trials.lumenos_predictive}
              getGradeColor={getGradeColor}
              isHighlight={true}
              showForecastStats={true}
            />
 </div>

          {/* Metric Comparison Table */}
 <div className="bg-panel border border-edge rounded-none overflow-hidden shadow-xl">
 <div className="px-5 py-4 border-b border-edge bg-void/60 flex flex-wrap items-center justify-between gap-2">
 <div>
 <h3 className="text-sm font-bold text-ink tracking-wide">
                  Head-to-Head Physical & Mission Metrics
 </h3>
 <p className="text-xs text-muted">
                  Comprehensive performance comparison across thermal, power, data, and mission objectives
 </p>
 </div>
 <div className="text-[11px] font-mono text-muted">
                Seed: <span className="text-ink font-semibold">{comparison.seed}</span> | Steps:{" "}
 <span className="text-ink font-semibold">{comparison.max_steps}</span>
 </div>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs border-collapse">
 <thead>
 <tr className="border-b border-edge bg-void/40 text-muted">
 <th className="py-2.5 px-4 font-semibold">Evaluation Metric</th>
 <th className="py-2.5 px-4 font-semibold text-center">Manual Pilot</th>
 <th className="py-2.5 px-4 font-semibold text-center">Reactive Autopilot</th>
 <th className="py-2.5 px-4 font-semibold text-center text-accent">LumenOS Predictive</th>
 <th className="py-2.5 px-4 font-semibold text-center">Advantage vs Reactive</th>
 <th className="py-2.5 px-4 font-semibold text-center">Top Strategy</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-edge/60 font-mono text-ink">
                  {/* Mission Score */}
 <tr className="hover:bg-raised/30">
 <td className="py-2.5 px-4 font-sans text-ink font-medium">Mission Score</td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.mission_score.toFixed(1)}
 </td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.mission_score.toFixed(1)}
 </td>
 <td className="py-2.5 px-4 text-center font-bold text-accent">
                      {comparison.trials.lumenos_predictive.metrics.mission_score.toFixed(1)}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
                      {formatDelta(
                        comparison.metric_deltas?.mission_score?.delta_vs_reactive ?? 0,
                        "pts"
 )}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
 <WinnerBadge winner={comparison.winner_by_metric?.mission_score} />
 </td>
 </tr>

                  {/* Thermal Violations */}
 <tr className="hover:bg-raised/30">
 <td className="py-2.5 px-4 font-sans text-ink font-medium">Thermal Violations Count</td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.thermal_violations_count}
 </td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.thermal_violations_count}
 </td>
 <td className="py-2.5 px-4 text-center font-bold text-accent">
                      {comparison.trials.lumenos_predictive.metrics.thermal_violations_count}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
                      {formatDelta(
                        comparison.metric_deltas?.thermal_violations_count?.delta_vs_reactive ?? 0,
                        "",
                        true
 )}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
 <WinnerBadge winner={comparison.winner_by_metric?.thermal_violations_count} />
 </td>
 </tr>

                  {/* Min Thermal Margin */}
 <tr className="hover:bg-raised/30">
 <td className="py-2.5 px-4 font-sans text-ink font-medium">Min Thermal Margin (°C)</td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.min_thermal_margin_c.toFixed(1)}°C
 </td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.min_thermal_margin_c.toFixed(1)}°C
 </td>
 <td className="py-2.5 px-4 text-center font-bold text-accent">
                      {comparison.trials.lumenos_predictive.metrics.min_thermal_margin_c.toFixed(1)}°C
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
                      {formatDelta(
                        comparison.metric_deltas?.min_thermal_margin_c?.delta_vs_reactive ?? 0,
                        "°C"
 )}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
 <WinnerBadge winner={comparison.winner_by_metric?.min_thermal_margin_c} />
 </td>
 </tr>

                  {/* Battery Violations */}
 <tr className="hover:bg-raised/30">
 <td className="py-2.5 px-4 font-sans text-ink font-medium">Battery Violations Count</td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.battery_violations_count}
 </td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.battery_violations_count}
 </td>
 <td className="py-2.5 px-4 text-center font-bold text-accent">
                      {comparison.trials.lumenos_predictive.metrics.battery_violations_count}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
                      {formatDelta(
                        comparison.metric_deltas?.battery_violations_count?.delta_vs_reactive ?? 0,
                        "",
                        true
 )}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
 <WinnerBadge winner={comparison.winner_by_metric?.battery_violations_count} />
 </td>
 </tr>

                  {/* Min Battery SoC */}
 <tr className="hover:bg-raised/30">
 <td className="py-2.5 px-4 font-sans text-ink font-medium">Min Battery SoC (%)</td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.min_battery_soc_pct.toFixed(1)}%
 </td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.min_battery_soc_pct.toFixed(1)}%
 </td>
 <td className="py-2.5 px-4 text-center font-bold text-accent">
                      {comparison.trials.lumenos_predictive.metrics.min_battery_soc_pct.toFixed(1)}%
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
                      {formatDelta(
                        comparison.metric_deltas?.min_battery_soc_pct?.delta_vs_reactive ?? 0,
                        "%"
 )}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
 <WinnerBadge winner={comparison.winner_by_metric?.min_battery_soc_pct} />
 </td>
 </tr>

                  {/* Useful Science Tasks */}
 <tr className="hover:bg-raised/30">
 <td className="py-2.5 px-4 font-sans text-ink font-medium">Useful Science Tasks</td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.useful_science_tasks}
 </td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.useful_science_tasks}
 </td>
 <td className="py-2.5 px-4 text-center font-bold text-accent">
                      {comparison.trials.lumenos_predictive.metrics.useful_science_tasks}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
                      {formatDelta(
                        comparison.metric_deltas?.useful_science_tasks?.delta_vs_reactive ?? 0,
                        "tasks"
 )}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
 <WinnerBadge winner={comparison.winner_by_metric?.useful_science_tasks} />
 </td>
 </tr>

                  {/* Science Data Downlinked */}
 <tr className="hover:bg-raised/30">
 <td className="py-2.5 px-4 font-sans text-ink font-medium">Science Downlinked (MB)</td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.science_data_downlinked_mb.toFixed(1)} MB
 </td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.science_data_downlinked_mb.toFixed(1)} MB
 </td>
 <td className="py-2.5 px-4 text-center font-bold text-accent">
                      {comparison.trials.lumenos_predictive.metrics.science_data_downlinked_mb.toFixed(1)} MB
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
                      {formatDelta(
                        comparison.metric_deltas?.science_data_downlinked_mb?.delta_vs_reactive ?? 0,
                        "MB"
 )}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
 <WinnerBadge winner={comparison.winner_by_metric?.science_data_downlinked_mb} />
 </td>
 </tr>

                  {/* Data Dropped / Buffer Overflow */}
 <tr className="hover:bg-raised/30">
 <td className="py-2.5 px-4 font-sans text-ink font-medium">Data Dropped (Overflow MB)</td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.data_dropped_overflow_mb.toFixed(1)} MB
 </td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.data_dropped_overflow_mb.toFixed(1)} MB
 </td>
 <td className="py-2.5 px-4 text-center font-bold text-accent">
                      {comparison.trials.lumenos_predictive.metrics.data_dropped_overflow_mb.toFixed(1)} MB
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
                      {formatDelta(
                        comparison.metric_deltas?.data_dropped_overflow_mb?.delta_vs_reactive ?? 0,
                        "MB",
                        true
 )}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
 <WinnerBadge winner={comparison.winner_by_metric?.data_dropped_overflow_mb} />
 </td>
 </tr>

                  {/* Spacecraft Health */}
 <tr className="hover:bg-raised/30">
 <td className="py-2.5 px-4 font-sans text-ink font-medium">Spacecraft Health (%)</td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.final_spacecraft_health_pct.toFixed(1)}%
 </td>
 <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.final_spacecraft_health_pct.toFixed(1)}%
 </td>
 <td className="py-2.5 px-4 text-center font-bold text-accent">
                      {comparison.trials.lumenos_predictive.metrics.final_spacecraft_health_pct.toFixed(1)}%
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
                      {formatDelta(
                        comparison.metric_deltas?.final_spacecraft_health_pct?.delta_vs_reactive ?? 0,
                        "%"
 )}
 </td>
 <td className="py-2.5 px-4 text-center font-sans">
 <WinnerBadge winner={comparison.winner_by_metric?.final_spacecraft_health_pct} />
 </td>
 </tr>
 </tbody>
 </table>
 </div>
 </div>

          {/* Plain-Language Narrative Summary */}
 <div className="bg-panel border border-edge rounded-none p-5 shadow-lg">
 <div className="flex items-center gap-2 mb-3">
 <span className="text-lg"></span>
 <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
                Benchmark Evaluation Summary
 </h3>
 </div>
 <p className="text-xs text-ink leading-relaxed font-sans whitespace-pre-line bg-void/70 p-4 rounded-none border border-edge">
              {comparison.plain_language_summary}
 </p>
 </div>

          {/* Transparent Limitations & Trade-Offs Callout */}
 <div className="bg-warn/10 border border-warn/40 rounded-none p-5 shadow-lg">
 <div className="flex items-center gap-2 mb-2">
 <span className="text-lg">⚖️</span>
 <h3 className="text-xs font-bold text-warn uppercase tracking-wider">
                Benchmark Transparency & Limitations Disclaimer
 </h3>
 </div>
 <p className="text-xs text-warn leading-relaxed font-sans mb-3">
              {comparison.limitations_disclaimer}
 </p>
 <div className="text-[11px] text-warn/70 grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-warn/30 font-sans">
 <div>
 <strong>When Reactive Matches LumenOS:</strong> In low-stress scenarios or nominal quiescent orbits without acute thermal excursions, reactive threshold triggers operate with zero computational overhead and achieve identical outcomes.
 </div>
 <div>
 <strong>Human Advantage Cases:</strong> Skilled human operators who take calculated short-term risks can sometimes complete urgent observations that autonomous algorithms conservatively defer.
 </div>
 </div>
 </div>

          {/* Toggleable Action Sequence Trace */}
 <div className="bg-panel border border-edge rounded-none p-4">
 <div className="flex items-center justify-between">
 <div>
 <h4 className="text-xs font-semibold text-ink">Execution Action Logs</h4>
 <p className="text-[11px] text-muted">
                  Inspect the step-by-step decisions made by each controller during the benchmark trial
 </p>
 </div>
 <button
                type="button"
                onClick={() => setShowActionLogs(!showActionLogs)}
                className="px-3 py-1 bg-raised hover:bg-edge-strong text-ink rounded-none text-xs transition-colors"
 >
                {showActionLogs ? "Hide Action Trace ▲" : "View Action Trace ▼"}
 </button>
 </div>

            {showActionLogs && (
 <div className="mt-4 pt-4 border-t border-edge">
 <div className="flex items-center gap-2 mb-3">
 <button
                    type="button"
                    onClick={() => setSelectedActionTab("lumenos_predictive")}
                    className={`px-3 py-1 rounded-none text-xs font-medium transition-colors ${
                      selectedActionTab === "lumenos_predictive"
                        ? "bg-accent text-ink"
                        : "bg-raised text-muted hover:text-ink"
                    }`}
 >
                    LumenOS Predictive ({comparison.trials.lumenos_predictive.actions_count})
 </button>
 <button
                    type="button"
                    onClick={() => setSelectedActionTab("reactive_autopilot")}
                    className={`px-3 py-1 rounded-none text-xs font-medium transition-colors ${
                      selectedActionTab === "reactive_autopilot"
                        ? "bg-info text-ink"
                        : "bg-raised text-muted hover:text-ink"
                    }`}
 >
                    Reactive Autopilot ({comparison.trials.reactive_autopilot.actions_count})
 </button>
 <button
                    type="button"
                    onClick={() => setSelectedActionTab("manual_pilot")}
                    className={`px-3 py-1 rounded-none text-xs font-medium transition-colors ${
                      selectedActionTab === "manual_pilot"
                        ? "bg-edge-strong text-ink"
                        : "bg-raised text-muted hover:text-ink"
                    }`}
 >
                    Manual Pilot ({comparison.trials.manual_pilot.actions_count})
 </button>
 </div>

 <div className="max-h-60 overflow-y-auto bg-void p-3 rounded-none border border-edge font-mono text-[11px] text-ink divide-y divide-edge/40">
                  {comparison.trials[selectedActionTab].actions_log.length === 0 ? (
 <div className="py-2 text-faint italic">No discrete actions taken in this run.</div>
 ) : (
                    comparison.trials[selectedActionTab].actions_log.map((action, idx) => (
 <div key={idx} className="py-1.5 flex items-center justify-between">
 <div>
 <span className="text-faint mr-2">[Step {action.step}]</span>
 <span className="text-accent font-semibold">{action.action_type}</span>
 <span className="text-muted ml-2">by {action.actor}</span>
 </div>
 <div className="text-muted text-[10px] truncate max-w-xs">
                          {JSON.stringify(action.params)}
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 );
};

// ── Helper Components ─────────────────────────────────────────────────────────

interface StrategyCardProps {
  title: string;
  tag: string;
  tagColor: string;
  trial: BenchmarkTrialResult;
  getGradeColor: (grade: string) => string;
  isHighlight?: boolean;
  showForecastStats?: boolean;
}

const StrategyCard: React.FC<StrategyCardProps> = ({
  title,
  tag,
  tagColor,
  trial,
  getGradeColor,
  isHighlight,
  showForecastStats,
}) => {
  const m = trial.metrics;

  return (
 <div
      className={`rounded-none border p-5 flex flex-col justify-between transition-all ${
        isHighlight
          ? "bg-accent/10 border-accent/80 shadow-lg shadow-black/40 ring-1 ring-accent/30"
          : "bg-panel border-edge shadow-md"
      }`}
 >
 <div>
        {/* Card Header */}
 <div className="flex items-start justify-between gap-2 mb-3">
 <div>
 <div className="flex items-center gap-2">
 <h3 className="text-base font-bold text-ink">{title}</h3>
 </div>
 <span className={`inline-block text-[10px] uppercase font-mono px-2 py-0.5 rounded-none border mt-1 ${tagColor}`}>
              {tag}
 </span>
 </div>

 <div
            className={`w-11 h-11 rounded-none border flex flex-col items-center justify-center font-bold text-lg leading-none ${getGradeColor(
              m.grade
 )}`}
 >
            {m.grade}
 <span className="text-[9px] font-mono mt-0.5 font-normal opacity-80">
              {m.mission_score.toFixed(0)}
 </span>
 </div>
 </div>

        {/* Primary Metrics Grid */}
 <div className="grid grid-cols-2 gap-2 my-4 text-xs font-mono">
 <div className="bg-void/70 p-2 rounded-none border border-edge">
 <div className="text-[10px] font-sans text-muted">Health / Uptime</div>
 <div className="font-semibold text-ink">
              {m.final_spacecraft_health_pct.toFixed(0)}% / {(m.uptime_fraction * 100).toFixed(0)}%
 </div>
 </div>

 <div className="bg-void/70 p-2 rounded-none border border-edge">
 <div className="text-[10px] font-sans text-muted">Thermal Margin</div>
 <div className={`font-semibold ${m.min_thermal_margin_c < 2 ? "text-crit" : "text-ok"}`}>
              {m.min_thermal_margin_c.toFixed(1)}°C ({m.thermal_violations_count} viol)
 </div>
 </div>

 <div className="bg-void/70 p-2 rounded-none border border-edge">
 <div className="text-[10px] font-sans text-muted">Min Battery SoC</div>
 <div className={`font-semibold ${m.min_battery_soc_pct < 20 ? "text-crit" : "text-info"}`}>
              {m.min_battery_soc_pct.toFixed(1)}% ({m.battery_violations_count} viol)
 </div>
 </div>

 <div className="bg-void/70 p-2 rounded-none border border-edge">
 <div className="text-[10px] font-sans text-muted">Science Downlinked</div>
 <div className="font-semibold text-accent-hi">
              {m.science_data_downlinked_mb.toFixed(1)} MB ({m.useful_science_tasks} tasks)
 </div>
 </div>
 </div>

        {/* Mode Distribution Mini Bar */}
 <div className="mb-4">
 <div className="flex justify-between text-[10px] text-muted mb-1 font-sans">
 <span>Operating Profile Distribution</span>
 <span>
              {m.time_in_full_pct.toFixed(0)}% FULL | {m.time_in_eco_pct.toFixed(0)}% ECO |{" "}
              {m.time_in_safe_pct.toFixed(0)}% SAFE
 </span>
 </div>
 <div className="h-1.5 w-full bg-void rounded-full overflow-hidden flex">
 <div style={{ width: `${m.time_in_full_pct}%` }} className="bg-ok h-full" title="FULL" />
 <div style={{ width: `${m.time_in_eco_pct}%` }} className="bg-info h-full" title="ECO" />
 <div style={{ width: `${m.time_in_safe_pct}%` }} className="bg-warn h-full" title="SAFE" />
 </div>
 </div>

        {/* Predictive Verification Stats (for LumenOS) */}
        {showForecastStats && (
 <div className="p-2.5 rounded-none bg-accent/10 border border-accent/40/40 text-[11px] font-mono mb-2">
 <div className="text-[10px] font-sans uppercase tracking-wider text-accent-hi font-semibold mb-1">
              Predictive Verification (ODE Model)
 </div>
 <div className="grid grid-cols-2 gap-1 text-ink">
 <div>
                Temp MAE:{" "}
 <span className="text-ink font-semibold">
                  {m.forecast_mae_temp_c != null ? `${m.forecast_mae_temp_c.toFixed(2)}°C` : "N/A"}
 </span>
 </div>
 <div>
                SoC MAE:{" "}
 <span className="text-ink font-semibold">
                  {m.forecast_mae_soc_pct != null ? `${m.forecast_mae_soc_pct.toFixed(2)}%` : "N/A"}
 </span>
 </div>
 <div>
                Warning Precision:{" "}
 <span className="text-ink font-semibold">
                  {m.warning_precision != null ? `${(m.warning_precision * 100).toFixed(0)}%` : "N/A"}
 </span>
 </div>
 <div>
                Avg Lead Time:{" "}
 <span className="text-ink font-semibold">
                  {m.avg_warning_lead_time_s != null ? `${m.avg_warning_lead_time_s.toFixed(0)}s` : "N/A"}
 </span>
 </div>
 </div>
 </div>
 )}
 </div>

 <div className="pt-2 border-t border-edge text-[11px] text-faint flex justify-between font-mono">
 <span>Actions Executed: {trial.actions_count}</span>
 <span>Version: {trial.controller_version}</span>
 </div>
 </div>
 );
};

const WinnerBadge: React.FC<{ winner?: string }> = ({ winner }) => {
  if (!winner) return <span className="text-faint">—</span>;

  let color = "bg-raised text-ink border-edge-strong";
  let label = "Manual";

  if (winner === "lumenos_predictive") {
    color = "bg-accent/10 border-accent/40 text-accent-hi font-bold";
    label = "LumenOS";
  } else if (winner === "reactive_autopilot") {
    color = "bg-info/10 border-info/40 text-info font-bold";
    label = "Reactive";
  } else if (winner === "manual_pilot") {
    color = "bg-raised border-edge-strong text-ink";
    label = "Manual";
  } else if (winner === "tie") {
    return <span className="text-muted font-mono text-[10px]">TIE</span>;
  }

  return (
 <span className={`inline-block px-2 py-0.5 rounded-none text-[10px] border ${color}`}>
      ★ {label}
 </span>
 );
};

