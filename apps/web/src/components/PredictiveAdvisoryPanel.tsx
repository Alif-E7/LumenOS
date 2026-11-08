import React, { useState } from "react";
import type {
  AdvisoryRecommendation,
  ForecastWindow,
  AdvisoryMetricsSummary,
} from "../types/advisory";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { DataProvenance } from "../types/provenance";

interface PredictiveAdvisoryPanelProps {
  forecast: ForecastWindow | null;
  recommendations: AdvisoryRecommendation[];
  metrics: AdvisoryMetricsSummary | null;
  autoPilotEnabled: boolean;
  onRespond: (
    recommendationId: string,
    action: "accept" | "reject" | "modify",
    modifiedParams?: Record<string, any>
  ) => void;
  onToggleAutomation: (enabled: boolean) => void;
}

export const PredictiveAdvisoryPanel: React.FC<PredictiveAdvisoryPanelProps> = ({
  forecast,
  recommendations,
  metrics,
  autoPilotEnabled,
  onRespond,
  onToggleAutomation,
}) => {
  const [activeTab, setActiveTab] = useState<"thermal" | "power" | "storage">("thermal");
  const [showScorecard, setShowScorecard] = useState(false);
  const [modifyingRecId, setModifyingRecId] = useState<string | null>(null);
  const [modifiedCpuPct, setModifiedCpuPct] = useState<number>(30);

  const pendingRecs = recommendations.filter(
    (r) => r.status === "pending" || !r.status
  );

  return (
    <div
      data-testid="predictive-advisory-panel"
      className="bg-slate-900 border border-slate-700 rounded-lg p-4 shadow-xl text-slate-100 flex flex-col gap-4"
    >
      {/* Header with Semantic Provenance Badge & Autopilot Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="text-xl">⚡</div>
          <div>
            <h2 className="text-base font-semibold text-white tracking-wide flex items-center gap-2">
              LumenOS Predictive Advisory
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-400 font-mono">
                5-MIN HORIZON
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Interpretable physics/model-based forecasting with epistemic uncertainty
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ProvenanceBadge
            provenance={DataProvenance.MODEL_PREDICTION}
          />

          <button
            type="button"
            data-testid="toggle-autopilot-btn"
            onClick={() => onToggleAutomation(!autoPilotEnabled)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 border ${
              autoPilotEnabled
                ? "bg-amber-950/80 border-amber-600 text-amber-300 shadow-[0_0_10px_rgba(217,119,6,0.2)]"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                autoPilotEnabled ? "bg-amber-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            Autopilot: {autoPilotEnabled ? "ACTIVE" : "STANDBY"}
          </button>

          <button
            type="button"
            data-testid="view-scorecard-btn"
            onClick={() => setShowScorecard(!showScorecard)}
            className="px-2.5 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
          >
            {showScorecard ? "Hide Scorecard" : "Verification Scorecard"}
          </button>
        </div>
      </div>

      {/* Verification Scorecard Modal / Tray */}
      {showScorecard && metrics && (
        <div
          data-testid="advisory-scorecard-tray"
          className="bg-slate-950/90 border border-cyan-900/60 rounded-md p-3 text-xs flex flex-col gap-2.5"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
              📊 Verification & Accuracy Scorecard
            </span>
            <span className="text-[11px] text-slate-400">
              Evaluations: {metrics.evaluated_predictions_count || metrics.evaluation_records_count || 0}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Temp Forecast Error</span>
              <span className="text-white font-mono text-sm">
                MAE: {metrics.continuous_forecast_mae_temp_c ?? metrics.temperature_mae_c ?? 0}°C
              </span>
              <span className="text-slate-400 block text-[10px]">
                RMSE: {metrics.continuous_forecast_rmse_temp_c ?? metrics.temperature_rmse_c ?? 0}°C
              </span>
            </div>

            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Battery SoC Error</span>
              <span className="text-white font-mono text-sm">
                MAE: {metrics.continuous_forecast_mae_soc_pct ?? metrics.battery_mae_pct ?? 0}%
              </span>
              <span className="text-slate-400 block text-[10px]">
                RMSE: {metrics.continuous_forecast_rmse_soc_pct ?? metrics.battery_rmse_pct ?? 0}%
              </span>
            </div>

            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Warning Precision / Recall</span>
              <span className="text-emerald-400 font-mono text-sm">
                {Math.round((metrics.warning_precision ?? metrics.precision ?? 1) * 100)}% /{" "}
                {Math.round((metrics.warning_recall ?? metrics.recall ?? 1) * 100)}%
              </span>
              <span className="text-slate-400 block text-[10px]">
                FP: {metrics.false_positives ?? 0} | FN: {metrics.missed_warnings ?? metrics.false_negatives ?? 0}
              </span>
            </div>

            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Mission Benefits</span>
              <span className="text-cyan-400 font-mono text-sm">
                {metrics.critical_threshold_violations_avoided ?? 0} Avoided
              </span>
              <span className="text-slate-400 block text-[10px]">
                Lead Time: ~{metrics.avg_warning_lead_time_seconds ?? metrics.average_lead_time_seconds ?? 0}s
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5-Minute Forecast Trajectory Chart */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-md p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              data-testid="tab-thermal"
              onClick={() => setActiveTab("thermal")}
              className={`px-2.5 py-1 rounded transition-colors font-medium ${
                activeTab === "thermal"
                  ? "bg-rose-950 border border-rose-700 text-rose-300"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Thermal Trend (°C)
            </button>
            <button
              type="button"
              data-testid="tab-power"
              onClick={() => setActiveTab("power")}
              className={`px-2.5 py-1 rounded transition-colors font-medium ${
                activeTab === "power"
                  ? "bg-amber-950 border border-amber-700 text-amber-300"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Battery SoC & Net Power
            </button>
            <button
              type="button"
              data-testid="tab-storage"
              onClick={() => setActiveTab("storage")}
              className={`px-2.5 py-1 rounded transition-colors font-medium ${
                activeTab === "storage"
                  ? "bg-blue-950 border border-blue-700 text-blue-300"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Storage & CPU Load
            </button>
          </div>

          <span className="text-[11px] text-slate-500 font-mono">
            Origin Step: {forecast?.origin_step ?? forecast?.current_step ?? 0}
          </span>
        </div>

        {/* Multi-step trajectory bars / timeline */}
        <div className="grid grid-cols-5 gap-2 pt-2">
          {(forecast?.predictions || forecast?.steps || []).map((step, idx) => {
            const stepNum = idx + 1;
            const isHazard =
              step.predicted_thermal_hazard ||
              step.predicted_battery_hazard ||
              step.predicted_storage_hazard;

            return (
              <div
                key={step.step || idx}
                data-testid={`forecast-step-${stepNum}`}
                className={`p-2 rounded border flex flex-col justify-between ${
                  isHazard
                    ? "bg-rose-950/40 border-rose-600/70 shadow-[0_0_10px_rgba(225,29,72,0.15)]"
                    : "bg-slate-900 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
                  <span>+{stepNum}m</span>
                  {isHazard && (
                    <span className="text-rose-400 font-bold" title="Predicted hazard crossing!">
                      ⚠️
                    </span>
                  )}
                </div>

                {activeTab === "thermal" && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold font-mono text-white">
                      {step.temperature_c.toFixed(1)}°C
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ±{(step.uncertainty_temperature_c || step.uncertainty_temp_c || 0.5).toFixed(1)}°
                    </span>
                  </div>
                )}

                {activeTab === "power" && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold font-mono text-amber-300">
                      {(step.battery_soc || step.battery_soc_pct || 100).toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Net: {(step.net_power_w || step.power_net_w || 0) > 0 ? "+" : ""}
                      {(step.net_power_w || step.power_net_w || 0).toFixed(0)}W
                    </span>
                  </div>
                )}

                {activeTab === "storage" && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold font-mono text-cyan-300">
                      {step.cpu_usage_pct.toFixed(0)}% CPU
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {step.storage_used_mb.toFixed(0)} MB
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Recommendations Feed */}
      <div>
        <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-2 flex items-center justify-between">
          <span>Active Recommendations ({pendingRecs.length})</span>
          {pendingRecs.length > 0 && (
            <span className="text-rose-400 lowercase font-normal">action required</span>
          )}
        </h3>

        {pendingRecs.length === 0 ? (
          <div
            data-testid="no-advisories-msg"
            className="p-3 rounded border border-slate-800 bg-slate-950/40 text-xs text-slate-400 flex items-center gap-2"
          >
            <span className="text-emerald-400 font-bold">✓</span>
            All subsystems nominal — No critical safety violations projected in 5-minute horizon.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {pendingRecs.map((rec) => {
              const isModifying = modifyingRecId === rec.recommendation_id;

              return (
                <div
                  key={rec.recommendation_id}
                  data-testid={`recommendation-card-${rec.recommendation_id}`}
                  className="bg-slate-950 border border-slate-700 hover:border-slate-600 rounded-lg p-3 transition-colors flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          rec.severity === "critical"
                            ? "bg-rose-950 border border-rose-600 text-rose-300 animate-pulse"
                            : "bg-amber-950 border border-amber-600 text-amber-300"
                        }`}
                      >
                        {rec.severity}
                      </span>
                      <h4 className="text-sm font-semibold text-white">
                        {rec.title || rec.action_type}
                      </h4>
                    </div>

                    <span className="text-xs font-mono text-cyan-400">
                      Lead Time: ~{Math.round(rec.lead_time_seconds || rec.horizon_seconds || 180)}s
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {rec.plain_language_explanation || rec.explanation}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] bg-slate-900/70 p-2 rounded border border-slate-800/80">
                    <div>
                      <span className="text-emerald-400 font-medium">Expected Benefit: </span>
                      <span className="text-slate-300">{rec.expected_benefit}</span>
                    </div>
                    <div>
                      <span className="text-amber-400 font-medium">Trade-off / Cost: </span>
                      <span className="text-slate-300">
                        {rec.possible_cost_tradeoff || rec.cost_tradeoff}
                      </span>
                    </div>
                  </div>

                  {rec.influencing_variables && rec.influencing_variables.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400">
                      <span>Influenced by:</span>
                      {rec.influencing_variables.map((varName) => (
                        <span
                          key={varName}
                          className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono"
                        >
                          {varName}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Inline Parameter Modifier */}
                  {isModifying && (
                    <div
                      data-testid={`modifier-tray-${rec.recommendation_id}`}
                      className="bg-slate-900 border border-cyan-800 rounded p-2.5 mt-1 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-cyan-300 font-medium">
                          Tune Parameter (Target CPU Usage):
                        </span>
                        <span className="font-mono text-white">{modifiedCpuPct}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="80"
                        step="5"
                        value={modifiedCpuPct}
                        onChange={(e) => setModifiedCpuPct(Number(e.target.value))}
                        className="w-full accent-cyan-400"
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setModifyingRecId(null)}
                          className="px-2 py-1 text-xs text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          data-testid={`confirm-modify-btn-${rec.recommendation_id}`}
                          onClick={() => {
                            onRespond(rec.recommendation_id, "modify", {
                              target_cpu_pct: modifiedCpuPct,
                            });
                            setModifyingRecId(null);
                          }}
                          className="px-3 py-1 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded"
                        >
                          Apply & Dispatch
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions buttons */}
                  {!isModifying && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        data-testid={`reject-rec-btn-${rec.recommendation_id}`}
                        onClick={() => onRespond(rec.recommendation_id, "reject")}
                        className="px-3 py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      >
                        Reject
                      </button>

                      <button
                        type="button"
                        data-testid={`modify-rec-btn-${rec.recommendation_id}`}
                        onClick={() => {
                          setModifyingRecId(rec.recommendation_id);
                          setModifiedCpuPct(
                            rec.parameters?.target_cpu_pct || rec.params?.target_cpu_pct || 30
                          );
                        }}
                        className="px-3 py-1.5 text-xs font-medium rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700"
                      >
                        Modify...
                      </button>

                      <button
                        type="button"
                        data-testid={`accept-rec-btn-${rec.recommendation_id}`}
                        onClick={() => onRespond(rec.recommendation_id, "accept")}
                        className="px-4 py-1.5 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                      >
                        Accept Recommendation
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
