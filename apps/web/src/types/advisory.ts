/**
 * LumenOS Predictive Mission Management & Advisory Types (Prompt 12)
 */

export interface ForecastStepPrediction {
  step: number;
  elapsed_seconds: number;
  time_seconds: number;
  horizon_seconds: number;
  temperature_c: number;
  battery_soc: number;
  battery_soc_pct: number;
  power_demand_w: number;
  power_generation_w: number;
  power_net_w: number;
  net_power_w: number;
  cpu_usage_pct: number;
  storage_used_mb: number;
  in_eclipse: boolean;
  uncertainty_temp_c: number;
  uncertainty_soc_pct: number;
  uncertainty_temperature_c: number;
  uncertainty_battery_soc: number;
  predicted_thermal_hazard: boolean;
  predicted_battery_hazard: boolean;
  predicted_storage_hazard: boolean;
}

export interface AdvisoryRecommendation {
  recommendation_id: string;
  origin_step: number;
  step_created: number;
  time_created: number;
  lead_time_seconds: number;
  horizon_seconds: number;
  hazard_type: string;
  category: "thermal" | "power" | "storage" | "comms" | string;
  severity: "critical" | "warning" | "info" | string;
  title: string;
  action_type: string;
  params: Record<string, any>;
  parameters: Record<string, any>;
  target_role: string;
  priority: string;
  plain_language_explanation: string;
  explanation: string;
  expected_benefit: string;
  possible_cost_tradeoff: string;
  cost_tradeoff: string;
  influencing_variables: string[];
  confidence_score: number;
  status: "pending" | "accepted" | "rejected" | "modified" | "auto_executed" | "expired";
  decision_timestamp?: number | null;
  actor?: string | null;
  resolved_by?: string | null;
  resolved_step?: number | null;
  audit_notes?: string | null;
}

export interface ForecastWindow {
  forecast_id: string;
  origin_step: number;
  current_step: number;
  horizon_steps: number;
  time_step_seconds: number;
  predictions: ForecastStepPrediction[];
  steps: ForecastStepPrediction[];
  predicted_hazards: string[];
  recommendations: AdvisoryRecommendation[];
  provenance: string;
  model_provenance: string;
  method: string;
  created_at_utc: number;
}

export interface AdvisoryMetricsSummary {
  total_forecasts_generated: number;
  evaluated_predictions_count: number;
  evaluation_records_count: number;
  temperature_mae_c: number;
  continuous_forecast_mae_temp_c: number;
  continuous_mae_temp_c: number;
  temperature_rmse_c: number;
  continuous_forecast_rmse_temp_c: number;
  battery_mae_pct: number;
  continuous_forecast_mae_soc_pct: number;
  battery_rmse_pct: number;
  continuous_forecast_rmse_soc_pct: number;
  hazard_warnings_issued: number;
  true_positives: number;
  true_positive_warnings: number;
  false_positives: number;
  false_positive_warnings: number;
  false_negatives: number;
  missed_warnings: number;
  precision: number;
  warning_precision: number;
  recall: number;
  warning_recall: number;
  avg_warning_lead_time_seconds: number;
  average_lead_time_seconds: number;
  recommendations_accepted: number;
  recommendations_rejected: number;
  recommendations_modified: number;
  recommendations_auto_executed: number;
  critical_threshold_violations_avoided: number;
  science_data_protected_mb: number;
  model_provenance: string;
  provenance_metadata?: {
    provenance_type: string;
    source_id: string;
    product_name: string;
    provider: string;
    attribution_label: string;
    is_authoritative: boolean;
    educational_disclaimer: string;
    quality_flag?: string | null;
    confidence_pct?: number | null;
  } | null;
}

export interface AdvisoryState {
  forecast: ForecastWindow | null;
  recommendations: AdvisoryRecommendation[];
  active_recommendations?: AdvisoryRecommendation[];
  auto_pilot_enabled: boolean;
  metrics: AdvisoryMetricsSummary;
}

