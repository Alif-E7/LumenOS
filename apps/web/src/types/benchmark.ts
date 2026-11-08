/**
 * Three-Way Flight Control Benchmark Types (Prompt 13).
 */

export interface BenchmarkMetrics {
  thermal_violations_count: number;
  thermal_violation_duration_s: number;
  min_thermal_margin_c: number;
  mean_thermal_margin_c: number;
  max_temperature_c: number;

  battery_violations_count: number;
  critical_battery_violations_count: number;
  min_battery_soc_pct: number;
  mean_battery_soc_pct: number;
  energy_generated_wh: number;
  energy_consumed_wh: number;
  net_energy_wh: number;
  battery_equivalent_full_cycles: number;

  useful_science_tasks: number;
  science_data_collected_mb: number;
  science_data_downlinked_mb: number;
  data_dropped_overflow_mb: number;
  mean_alert_latency_s: number;

  final_spacecraft_health_pct: number;
  mean_spacecraft_health_pct: number;
  uptime_fraction: number;
  time_in_full_pct: number;
  time_in_eco_pct: number;
  time_in_safe_pct: number;

  primary_objectives_completed: number;
  primary_objectives_total: number;
  optional_objectives_completed: number;
  optional_objectives_total: number;
  objective_completion_pct: number;
  mission_score: number;
  grade: string;

  forecast_mae_temp_c?: number | null;
  forecast_rmse_temp_c?: number | null;
  forecast_mae_soc_pct?: number | null;
  warning_precision?: number | null;
  warning_recall?: number | null;
  avg_warning_lead_time_s?: number | null;
}

export interface BenchmarkTrialResult {
  trial_id: string;
  controller_type: "manual_pilot" | "reactive_autopilot" | "lumenos_predictive";
  controller_name: string;
  controller_version: string;
  software_version: string;
  scenario_id: string;
  seed: number;
  max_steps: number;
  actions_count: number;
  actions_log: Array<{
    step: number;
    actor: string;
    action_type: string;
    params: Record<string, any>;
  }>;
  metrics: BenchmarkMetrics;
  timestamp_utc: number;
}

export interface BenchmarkComparisonResult {
  comparison_id: string;
  scenario_id: string;
  seed: number;
  max_steps: number;
  trials: {
    manual_pilot: BenchmarkTrialResult;
    reactive_autopilot: BenchmarkTrialResult;
    lumenos_predictive: BenchmarkTrialResult;
  };
  metric_deltas: Record<string, Record<string, any>>;
  winner_by_metric: Record<string, string>;
  plain_language_summary: string;
  limitations_disclaimer: string;
}

export interface BenchmarkScenarioItem {
  id: string;
  name: string;
  description: string;
  difficulty: number | string;
  duration_hours: number;
  orbit_altitude_km: number;
  objectives_count: number;
}
