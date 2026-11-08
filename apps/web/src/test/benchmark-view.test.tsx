import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BenchmarkComparisonView } from "../components/BenchmarkComparisonView";
import * as client from "../api/client";
import type { BenchmarkComparisonResult, BenchmarkScenarioItem } from "../types/benchmark";

const mockScenarios: BenchmarkScenarioItem[] = [
  {
    id: "wildfire_scout",
    name: "Wildfire Scout — Eyes on Fire",
    description: "Detect active fire hotspots and manage high thermal loads",
    difficulty: "Standard",
    duration_hours: 12.0,
    orbit_altitude_km: 500.0,
    objectives_count: 4,
  },
  {
    id: "solar_storm_sentinel",
    name: "Solar Storm Sentinel — Watch the Sun",
    description: "Monitor CME and handle radiation degradation",
    difficulty: "Advanced",
    duration_hours: 24.0,
    orbit_altitude_km: 650.0,
    objectives_count: 5,
  },
];

const mockComparisonResult: BenchmarkComparisonResult = {
  comparison_id: "comp_test_123",
  scenario_id: "wildfire_scout",
  seed: 42,
  max_steps: 100,
  trials: {
    manual_pilot: {
      trial_id: "trial_man_42",
      controller_type: "manual_pilot",
      controller_name: "Manual Pilot (Human Crew Model)",
      controller_version: "1.0.0",
      software_version: "0.1.0",
      scenario_id: "wildfire_scout",
      seed: 42,
      max_steps: 100,
      actions_count: 14,
      actions_log: [
        {
          step: 12,
          actor: "flight_controller",
          action_type: "SET_WORKLOAD",
          params: { profile: "ECO" },
        },
      ],
      metrics: {
        thermal_violations_count: 2,
        thermal_violation_duration_s: 120,
        min_thermal_margin_c: 1.2,
        mean_thermal_margin_c: 8.5,
        max_temperature_c: 54.1,
        battery_violations_count: 1,
        critical_battery_violations_count: 0,
        min_battery_soc_pct: 18.5,
        mean_battery_soc_pct: 64.2,
        energy_generated_wh: 1250.0,
        energy_consumed_wh: 1100.0,
        net_energy_wh: 150.0,
        battery_equivalent_full_cycles: 1.8,
        useful_science_tasks: 8,
        science_data_collected_mb: 480.0,
        science_data_downlinked_mb: 420.0,
        data_dropped_overflow_mb: 25.0,
        mean_alert_latency_s: 45.0,
        final_spacecraft_health_pct: 92.0,
        mean_spacecraft_health_pct: 96.0,
        uptime_fraction: 0.94,
        time_in_full_pct: 65.0,
        time_in_eco_pct: 25.0,
        time_in_safe_pct: 10.0,
        primary_objectives_completed: 2,
        primary_objectives_total: 2,
        optional_objectives_completed: 1,
        optional_objectives_total: 2,
        objective_completion_pct: 75.0,
        mission_score: 74.5,
        grade: "C",
      },
      timestamp_utc: 1731000000,
    },
    reactive_autopilot: {
      trial_id: "trial_react_42",
      controller_type: "reactive_autopilot",
      controller_name: "Traditional Reactive Autopilot (Threshold FDIR)",
      controller_version: "1.0.0",
      software_version: "0.1.0",
      scenario_id: "wildfire_scout",
      seed: 42,
      max_steps: 100,
      actions_count: 18,
      actions_log: [
        {
          step: 18,
          actor: "fdir_reactive",
          action_type: "SET_WORKLOAD",
          params: { profile: "SAFE" },
        },
      ],
      metrics: {
        thermal_violations_count: 3,
        thermal_violation_duration_s: 180,
        min_thermal_margin_c: 0.8,
        mean_thermal_margin_c: 7.9,
        max_temperature_c: 54.8,
        battery_violations_count: 2,
        critical_battery_violations_count: 0,
        min_battery_soc_pct: 16.2,
        mean_battery_soc_pct: 62.1,
        energy_generated_wh: 1250.0,
        energy_consumed_wh: 1050.0,
        net_energy_wh: 200.0,
        battery_equivalent_full_cycles: 1.7,
        useful_science_tasks: 7,
        science_data_collected_mb: 420.0,
        science_data_downlinked_mb: 390.0,
        data_dropped_overflow_mb: 40.0,
        mean_alert_latency_s: 55.0,
        final_spacecraft_health_pct: 88.0,
        mean_spacecraft_health_pct: 93.0,
        uptime_fraction: 0.90,
        time_in_full_pct: 58.0,
        time_in_eco_pct: 22.0,
        time_in_safe_pct: 20.0,
        primary_objectives_completed: 2,
        primary_objectives_total: 2,
        optional_objectives_completed: 0,
        optional_objectives_total: 2,
        objective_completion_pct: 50.0,
        mission_score: 68.0,
        grade: "D",
      },
      timestamp_utc: 1731000000,
    },
    lumenos_predictive: {
      trial_id: "trial_pred_42",
      controller_type: "lumenos_predictive",
      controller_name: "LumenOS Predictive Control (Lookahead ODE)",
      controller_version: "1.0.0",
      software_version: "0.1.0",
      scenario_id: "wildfire_scout",
      seed: 42,
      max_steps: 100,
      actions_count: 12,
      actions_log: [
        {
          step: 8,
          actor: "lumenos_advisory",
          action_type: "SET_WORKLOAD",
          params: { profile: "ECO" },
        },
      ],
      metrics: {
        thermal_violations_count: 0,
        thermal_violation_duration_s: 0,
        min_thermal_margin_c: 4.8,
        mean_thermal_margin_c: 12.1,
        max_temperature_c: 50.2,
        battery_violations_count: 0,
        critical_battery_violations_count: 0,
        min_battery_soc_pct: 24.5,
        mean_battery_soc_pct: 72.0,
        energy_generated_wh: 1250.0,
        energy_consumed_wh: 1120.0,
        net_energy_wh: 130.0,
        battery_equivalent_full_cycles: 1.6,
        useful_science_tasks: 11,
        science_data_collected_mb: 580.0,
        science_data_downlinked_mb: 560.0,
        data_dropped_overflow_mb: 0.0,
        mean_alert_latency_s: 18.0,
        final_spacecraft_health_pct: 98.5,
        mean_spacecraft_health_pct: 99.1,
        uptime_fraction: 0.99,
        time_in_full_pct: 78.0,
        time_in_eco_pct: 20.0,
        time_in_safe_pct: 2.0,
        primary_objectives_completed: 2,
        primary_objectives_total: 2,
        optional_objectives_completed: 2,
        optional_objectives_total: 2,
        objective_completion_pct: 100.0,
        mission_score: 92.5,
        grade: "A",
        forecast_mae_temp_c: 0.42,
        forecast_rmse_temp_c: 0.58,
        forecast_mae_soc_pct: 0.75,
        warning_precision: 0.95,
        warning_recall: 0.92,
        avg_warning_lead_time_s: 240.0,
      },
      timestamp_utc: 1731000000,
    },
  },
  metric_deltas: {
    mission_score: { delta_vs_reactive: 24.5, delta_vs_manual: 18.0 },
    thermal_violations_count: { delta_vs_reactive: -3, delta_vs_manual: -2 },
    min_thermal_margin_c: { delta_vs_reactive: 4.0, delta_vs_manual: 3.6 },
    battery_violations_count: { delta_vs_reactive: -2, delta_vs_manual: -1 },
    min_battery_soc_pct: { delta_vs_reactive: 8.3, delta_vs_manual: 6.0 },
    useful_science_tasks: { delta_vs_reactive: 4, delta_vs_manual: 3 },
    science_data_downlinked_mb: { delta_vs_reactive: 170.0, delta_vs_manual: 140.0 },
    data_dropped_overflow_mb: { delta_vs_reactive: -40.0, delta_vs_manual: -25.0 },
    final_spacecraft_health_pct: { delta_vs_reactive: 10.5, delta_vs_manual: 6.5 },
  },
  winner_by_metric: {
    mission_score: "lumenos_predictive",
    thermal_violations_count: "lumenos_predictive",
    min_thermal_margin_c: "lumenos_predictive",
    battery_violations_count: "lumenos_predictive",
    min_battery_soc_pct: "lumenos_predictive",
    useful_science_tasks: "lumenos_predictive",
    science_data_downlinked_mb: "lumenos_predictive",
    data_dropped_overflow_mb: "lumenos_predictive",
    final_spacecraft_health_pct: "lumenos_predictive",
  },
  plain_language_summary:
    "LumenOS Predictive Control achieved higher mission score (92.5) by proactively adjusting workload before thermal thresholds were breached.",
  limitations_disclaimer:
    "Fairness Notice: All controllers evaluated under identical seeds and initial conditions. In quiescent scenarios, reactive control performs comparably.",
};

describe("Prompt 13 — Three-Way Control Comparison Benchmark UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(client, "getBenchmarkScenarios").mockResolvedValue(mockScenarios);
    vi.spyOn(client, "getLatestBenchmark").mockResolvedValue(mockComparisonResult);
    vi.spyOn(client, "runBenchmarkComparison").mockResolvedValue(mockComparisonResult);
  });

  it("renders benchmark harness with methodology banner and fairness guarantees", async () => {
    render(<BenchmarkComparisonView />);

    expect(
      screen.getByText(/fair three-way flight control benchmark harness/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/isolated seeds/i)).toBeInTheDocument();
    expect(screen.getByText(/zero lookahead leakage/i)).toBeInTheDocument();
    expect(screen.getByText(/identical initial state/i)).toBeInTheDocument();
  });

  it("displays scenario options and execution inputs", async () => {
    render(<BenchmarkComparisonView />);

    await waitFor(() => {
      expect(screen.getByTestId("benchmark-scenario-select")).toBeInTheDocument();
    });

    const scenarioSelect = screen.getByTestId("benchmark-scenario-select") as HTMLSelectElement;
    expect(scenarioSelect).toBeInTheDocument();
    expect(screen.getByTestId("benchmark-seed-input")).toBeInTheDocument();
    expect(screen.getByTestId("benchmark-steps-input")).toBeInTheDocument();
    expect(screen.getByTestId("run-benchmark-btn")).toBeInTheDocument();
  });

  it("renders all three controller strategy cards with scores and grades", async () => {
    render(<BenchmarkComparisonView />);

    await waitFor(() => {
      expect(screen.getByText(/manual pilot/i)).toBeInTheDocument();
      expect(screen.getByText(/reactive autopilot/i)).toBeInTheDocument();
      expect(screen.getByText(/lumenos predictive/i)).toBeInTheDocument();
    });

    // Strategy grades
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();

    // Verification stats for LumenOS
    expect(screen.getByText(/predictive verification \(ode model\)/i)).toBeInTheDocument();
    expect(screen.getByText(/0.42°c/i)).toBeInTheDocument();
  });

  it("renders head-to-head metrics comparison table with advantage and winners", async () => {
    render(<BenchmarkComparisonView />);

    await waitFor(() => {
      expect(screen.getByText(/head-to-head physical & mission metrics/i)).toBeInTheDocument();
    });

    // Check table headers
    expect(screen.getByText(/evaluation metric/i)).toBeInTheDocument();
    expect(screen.getByText(/advantage vs reactive/i)).toBeInTheDocument();
    expect(screen.getByText(/top strategy/i)).toBeInTheDocument();

    // Check winner badges
    const winnerBadges = screen.getAllByText(/★ lumenos/i);
    expect(winnerBadges.length).toBeGreaterThan(0);
  });

  it("displays plain-language evaluation summary and limitations disclaimer", async () => {
    render(<BenchmarkComparisonView />);

    await waitFor(() => {
      expect(screen.getByText(/benchmark evaluation summary/i)).toBeInTheDocument();
      expect(screen.getByText(/benchmark transparency & limitations disclaimer/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/lumenos predictive control achieved higher mission score/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/when reactive matches lumenos:/i)).toBeInTheDocument();
    expect(screen.getByText(/human advantage cases:/i)).toBeInTheDocument();
  });

  it("allows toggling and viewing step-by-step action trace logs", async () => {
    render(<BenchmarkComparisonView />);

    await waitFor(() => {
      expect(screen.getByText(/execution action logs/i)).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole("button", { name: /view action trace/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/hide action trace/i)).toBeInTheDocument();
    expect(screen.getByText(/lumenos_advisory/i)).toBeInTheDocument();
    expect(screen.getByText(/\[step 8\]/i)).toBeInTheDocument();

    // Switch to Reactive Autopilot log tab
    const reactiveTabBtn = screen.getByRole("button", { name: /reactive autopilot \(18\)/i });
    fireEvent.click(reactiveTabBtn);

    expect(screen.getByText(/fdir_reactive/i)).toBeInTheDocument();
    expect(screen.getByText(/\[step 18\]/i)).toBeInTheDocument();
  });

  it("triggers benchmark run when Run 3-Way Benchmark button is clicked", async () => {
    render(<BenchmarkComparisonView />);

    const runBtn = screen.getByTestId("run-benchmark-btn");
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(client.runBenchmarkComparison).toHaveBeenCalledWith({
        scenario_id: "wildfire_scout",
        seed: 42,
        max_steps: 100,
      });
    });
  });

  it("handles execution errors gracefully", async () => {
    vi.spyOn(client, "runBenchmarkComparison").mockRejectedValueOnce(
      new Error("Simulated engine failure")
    );

    render(<BenchmarkComparisonView />);

    const runBtn = screen.getByTestId("run-benchmark-btn");
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/simulated engine failure/i)).toBeInTheDocument();
    });
  });
});
