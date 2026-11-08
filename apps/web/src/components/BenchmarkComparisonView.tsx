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
        return "text-emerald-400 bg-emerald-950/60 border-emerald-700/60";
      case "B":
        return "text-cyan-400 bg-cyan-950/60 border-cyan-700/60";
      case "C":
        return "text-amber-400 bg-amber-950/60 border-amber-700/60";
      case "D":
        return "text-orange-400 bg-orange-950/60 border-orange-700/60";
      default:
        return "text-rose-400 bg-rose-950/60 border-rose-700/60";
    }
  };

  const formatDelta = (val: number, unit = "", invertBetter = false) => {
    if (val === 0) return <span className="text-slate-400">0 {unit}</span>;
    const isPositive = val > 0;
    const isBetter = invertBetter ? !isPositive : isPositive;
    const sign = isPositive ? "+" : "";
    return (
      <span className={isBetter ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
        {sign}
        {val.toFixed(1)} {unit}
      </span>
    );
  };

  return (
    <div data-testid="benchmark-comparison-view" className="space-y-8">
      {/* Methodology & Rigor Header Banner */}
      <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-5 shadow-lg backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">⚖️</span>
              <h2 className="text-lg font-bold text-white tracking-wide">
                Fair Three-Way Flight Control Benchmark Harness
              </h2>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl">
              Strictly controlled comparison between{" "}
              <strong className="text-slate-200">Manual Pilot</strong> (human checklist execution),{" "}
              <strong className="text-cyan-300">Reactive Autopilot</strong> (classic aerospace threshold-based FDIR),
              and <strong className="text-blue-400">LumenOS Predictive Control</strong> (5-min forward physics ODE scheduling).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-700/70 text-blue-300">
              ISOLATED SEEDS
            </span>
            <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-700/70 text-cyan-300">
              ZERO LOOKAHEAD LEAKAGE
            </span>
            <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-700/70 text-purple-300">
              IDENTICAL INITIAL STATE
            </span>
          </div>
        </div>

        {/* Methodology Notes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 text-xs text-slate-300">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 font-semibold block mb-0.5">1. Identical Test Conditions</span>
            Initial orbit, design, components, battery SoC, and temperature are strictly bit-exact across all three strategies.
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 font-semibold block mb-0.5">2. Decoupled Random Streams</span>
            Exogenous environmental events arrive on a separate precomputed stream. Controller actions consume an isolated RNG stream.
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 font-semibold block mb-0.5">3. State-Only Observation</span>
            No controller has knowledge of future random events. Predictive control projects only through physics integration from $S_t$.
          </div>
        </div>
      </div>

      {/* Control / Execution Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
              Mission Scenario
            </label>
            <select
              data-testid="benchmark-scenario-select"
              aria-label="Mission Scenario"
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.difficulty})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
              Random Seed
            </label>
            <input
              type="number"
              data-testid="benchmark-seed-input"
              aria-label="Random Seed"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
              className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
              Max Steps
            </label>
            <input
              type="number"
              data-testid="benchmark-steps-input"
              aria-label="Max Steps"
              value={maxSteps}
              onChange={(e) => setMaxSteps(parseInt(e.target.value) || 100)}
              className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="run-benchmark-btn"
            onClick={handleRunBenchmark}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/30 transition-all flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin text-sm">⏳</span>
                <span>Executing 3 Trials...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>Run 3-Way Benchmark</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/70 border border-rose-800 text-rose-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
          <span>⚠️</span>
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
              tagColor="bg-slate-800 text-slate-300 border-slate-600"
              trial={comparison.trials.manual_pilot}
              getGradeColor={getGradeColor}
              isHighlight={false}
            />

            {/* Reactive Autopilot */}
            <StrategyCard
              title="Reactive Autopilot"
              tag="Classic Threshold FDIR"
              tagColor="bg-cyan-950 text-cyan-300 border-cyan-700"
              trial={comparison.trials.reactive_autopilot}
              getGradeColor={getGradeColor}
              isHighlight={false}
            />

            {/* LumenOS Predictive Control */}
            <StrategyCard
              title="LumenOS Predictive"
              tag="Physics ODE Lookahead"
              tagColor="bg-blue-950 text-blue-300 border-blue-600"
              trial={comparison.trials.lumenos_predictive}
              getGradeColor={getGradeColor}
              isHighlight={true}
              showForecastStats={true}
            />
          </div>

          {/* Metric Comparison Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Head-to-Head Physical & Mission Metrics
                </h3>
                <p className="text-xs text-slate-400">
                  Comprehensive performance comparison across thermal, power, data, and mission objectives
                </p>
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                Seed: <span className="text-slate-200 font-semibold">{comparison.seed}</span> | Steps:{" "}
                <span className="text-slate-200 font-semibold">{comparison.max_steps}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                    <th className="py-2.5 px-4 font-semibold">Evaluation Metric</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Manual Pilot</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Reactive Autopilot</th>
                    <th className="py-2.5 px-4 font-semibold text-center text-blue-400">LumenOS Predictive</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Advantage vs Reactive</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Top Strategy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
                  {/* Mission Score */}
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-sans text-slate-300 font-medium">Mission Score</td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.mission_score.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.mission_score.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-blue-400">
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
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-sans text-slate-300 font-medium">Thermal Violations Count</td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.thermal_violations_count}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.thermal_violations_count}
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-blue-400">
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
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-sans text-slate-300 font-medium">Min Thermal Margin (°C)</td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.min_thermal_margin_c.toFixed(1)}°C
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.min_thermal_margin_c.toFixed(1)}°C
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-blue-400">
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
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-sans text-slate-300 font-medium">Battery Violations Count</td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.battery_violations_count}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.battery_violations_count}
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-blue-400">
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
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-sans text-slate-300 font-medium">Min Battery SoC (%)</td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.min_battery_soc_pct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.min_battery_soc_pct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-blue-400">
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
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-sans text-slate-300 font-medium">Useful Science Tasks</td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.useful_science_tasks}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.useful_science_tasks}
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-blue-400">
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
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-sans text-slate-300 font-medium">Science Downlinked (MB)</td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.science_data_downlinked_mb.toFixed(1)} MB
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.science_data_downlinked_mb.toFixed(1)} MB
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-blue-400">
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
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-sans text-slate-300 font-medium">Data Dropped (Overflow MB)</td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.data_dropped_overflow_mb.toFixed(1)} MB
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.data_dropped_overflow_mb.toFixed(1)} MB
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-blue-400">
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
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-sans text-slate-300 font-medium">Spacecraft Health (%)</td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.manual_pilot.metrics.final_spacecraft_health_pct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {comparison.trials.reactive_autopilot.metrics.final_spacecraft_health_pct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-blue-400">
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📋</span>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Benchmark Evaluation Summary
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-line bg-slate-950/70 p-4 rounded-lg border border-slate-800">
              {comparison.plain_language_summary}
            </p>
          </div>

          {/* Transparent Limitations & Trade-Offs Callout */}
          <div className="bg-amber-950/30 border border-amber-700/50 rounded-xl p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚖️</span>
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Benchmark Transparency & Limitations Disclaimer
              </h3>
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed font-sans mb-3">
              {comparison.limitations_disclaimer}
            </p>
            <div className="text-[11px] text-amber-300/70 grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-amber-800/40 font-sans">
              <div>
                <strong>When Reactive Matches LumenOS:</strong> In low-stress scenarios or nominal quiescent orbits without acute thermal excursions, reactive threshold triggers operate with zero computational overhead and achieve identical outcomes.
              </div>
              <div>
                <strong>Human Advantage Cases:</strong> Skilled human operators who take calculated short-term risks can sometimes complete urgent observations that autonomous algorithms conservatively defer.
              </div>
            </div>
          </div>

          {/* Toggleable Action Sequence Trace */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white">Execution Action Logs</h4>
                <p className="text-[11px] text-slate-400">
                  Inspect the step-by-step decisions made by each controller during the benchmark trial
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowActionLogs(!showActionLogs)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
              >
                {showActionLogs ? "Hide Action Trace ▲" : "View Action Trace ▼"}
              </button>
            </div>

            {showActionLogs && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setSelectedActionTab("lumenos_predictive")}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      selectedActionTab === "lumenos_predictive"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    LumenOS Predictive ({comparison.trials.lumenos_predictive.actions_count})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedActionTab("reactive_autopilot")}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      selectedActionTab === "reactive_autopilot"
                        ? "bg-cyan-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Reactive Autopilot ({comparison.trials.reactive_autopilot.actions_count})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedActionTab("manual_pilot")}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      selectedActionTab === "manual_pilot"
                        ? "bg-slate-700 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Manual Pilot ({comparison.trials.manual_pilot.actions_count})
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 divide-y divide-slate-800/40">
                  {comparison.trials[selectedActionTab].actions_log.length === 0 ? (
                    <div className="py-2 text-slate-500 italic">No discrete actions taken in this run.</div>
                  ) : (
                    comparison.trials[selectedActionTab].actions_log.map((action, idx) => (
                      <div key={idx} className="py-1.5 flex items-center justify-between">
                        <div>
                          <span className="text-slate-500 mr-2">[Step {action.step}]</span>
                          <span className="text-blue-400 font-semibold">{action.action_type}</span>
                          <span className="text-slate-400 ml-2">by {action.actor}</span>
                        </div>
                        <div className="text-slate-400 text-[10px] truncate max-w-xs">
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
      className={`rounded-xl border p-5 flex flex-col justify-between transition-all ${
        isHighlight
          ? "bg-blue-950/20 border-blue-600/80 shadow-lg shadow-blue-950/40 ring-1 ring-blue-500/30"
          : "bg-slate-900 border-slate-800 shadow-md"
      }`}
    >
      <div>
        {/* Card Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">{title}</h3>
            </div>
            <span className={`inline-block text-[10px] uppercase font-mono px-2 py-0.5 rounded border mt-1 ${tagColor}`}>
              {tag}
            </span>
          </div>

          <div
            className={`w-11 h-11 rounded-lg border flex flex-col items-center justify-center font-bold text-lg leading-none ${getGradeColor(
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
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
            <div className="text-[10px] font-sans text-slate-400">Health / Uptime</div>
            <div className="font-semibold text-white">
              {m.final_spacecraft_health_pct.toFixed(0)}% / {(m.uptime_fraction * 100).toFixed(0)}%
            </div>
          </div>

          <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
            <div className="text-[10px] font-sans text-slate-400">Thermal Margin</div>
            <div className={`font-semibold ${m.min_thermal_margin_c < 2 ? "text-rose-400" : "text-emerald-400"}`}>
              {m.min_thermal_margin_c.toFixed(1)}°C ({m.thermal_violations_count} viol)
            </div>
          </div>

          <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
            <div className="text-[10px] font-sans text-slate-400">Min Battery SoC</div>
            <div className={`font-semibold ${m.min_battery_soc_pct < 20 ? "text-rose-400" : "text-cyan-400"}`}>
              {m.min_battery_soc_pct.toFixed(1)}% ({m.battery_violations_count} viol)
            </div>
          </div>

          <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
            <div className="text-[10px] font-sans text-slate-400">Science Downlinked</div>
            <div className="font-semibold text-blue-300">
              {m.science_data_downlinked_mb.toFixed(1)} MB ({m.useful_science_tasks} tasks)
            </div>
          </div>
        </div>

        {/* Mode Distribution Mini Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-sans">
            <span>Operating Profile Distribution</span>
            <span>
              {m.time_in_full_pct.toFixed(0)}% FULL | {m.time_in_eco_pct.toFixed(0)}% ECO |{" "}
              {m.time_in_safe_pct.toFixed(0)}% SAFE
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden flex">
            <div style={{ width: `${m.time_in_full_pct}%` }} className="bg-emerald-500 h-full" title="FULL" />
            <div style={{ width: `${m.time_in_eco_pct}%` }} className="bg-cyan-500 h-full" title="ECO" />
            <div style={{ width: `${m.time_in_safe_pct}%` }} className="bg-amber-500 h-full" title="SAFE" />
          </div>
        </div>

        {/* Predictive Verification Stats (for LumenOS) */}
        {showForecastStats && (
          <div className="p-2.5 rounded-lg bg-blue-950/40 border border-blue-800/40 text-[11px] font-mono mb-2">
            <div className="text-[10px] font-sans uppercase tracking-wider text-blue-300 font-semibold mb-1">
              Predictive Verification (ODE Model)
            </div>
            <div className="grid grid-cols-2 gap-1 text-slate-300">
              <div>
                Temp MAE:{" "}
                <span className="text-white font-semibold">
                  {m.forecast_mae_temp_c != null ? `${m.forecast_mae_temp_c.toFixed(2)}°C` : "N/A"}
                </span>
              </div>
              <div>
                SoC MAE:{" "}
                <span className="text-white font-semibold">
                  {m.forecast_mae_soc_pct != null ? `${m.forecast_mae_soc_pct.toFixed(2)}%` : "N/A"}
                </span>
              </div>
              <div>
                Warning Precision:{" "}
                <span className="text-white font-semibold">
                  {m.warning_precision != null ? `${(m.warning_precision * 100).toFixed(0)}%` : "N/A"}
                </span>
              </div>
              <div>
                Avg Lead Time:{" "}
                <span className="text-white font-semibold">
                  {m.avg_warning_lead_time_s != null ? `${m.avg_warning_lead_time_s.toFixed(0)}s` : "N/A"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex justify-between font-mono">
        <span>Actions Executed: {trial.actions_count}</span>
        <span>Version: {trial.controller_version}</span>
      </div>
    </div>
  );
};

const WinnerBadge: React.FC<{ winner?: string }> = ({ winner }) => {
  if (!winner) return <span className="text-slate-500">—</span>;

  let color = "bg-slate-800 text-slate-300 border-slate-700";
  let label = "Manual";

  if (winner === "lumenos_predictive") {
    color = "bg-blue-950 border-blue-700 text-blue-300 font-bold";
    label = "LumenOS";
  } else if (winner === "reactive_autopilot") {
    color = "bg-cyan-950 border-cyan-700 text-cyan-300 font-bold";
    label = "Reactive";
  } else if (winner === "manual_pilot") {
    color = "bg-slate-800 border-slate-600 text-slate-200";
    label = "Manual";
  } else if (winner === "tie") {
    return <span className="text-slate-400 font-mono text-[10px]">TIE</span>;
  }

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] border ${color}`}>
      ★ {label}
    </span>
  );
};

