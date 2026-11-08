import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PredictiveAdvisoryPanel } from "../components/PredictiveAdvisoryPanel";
import type {
  ForecastWindow,
  AdvisoryRecommendation,
  AdvisoryMetricsSummary,
} from "../types/advisory";
import { DataProvenance } from "../types/provenance";

describe("Prompt 12 — LumenOS Predictive Mission Management & Advisory UI", () => {
  const mockForecast: ForecastWindow = {
    forecast_id: "fc_test_001",
    origin_step: 10,
    current_step: 10,
    horizon_steps: 5,
    time_step_seconds: 60.0,
    provenance: DataProvenance.MODEL_PREDICTION,
    model_provenance: DataProvenance.MODEL_PREDICTION,
    method: "Model-Based Numerical ODE & Extrapolation",
    created_at_utc: Date.now() / 1000,
    predicted_hazards: ["THERMAL_OVERHEAT"],
    predictions: [
      {
        step: 11,
        elapsed_seconds: 660,
        time_seconds: 660,
        horizon_seconds: 60,
        temperature_c: 44.5,
        battery_soc: 78.0,
        battery_soc_pct: 78.0,
        power_demand_w: 120,
        power_generation_w: 220,
        power_net_w: 100,
        net_power_w: 100,
        cpu_usage_pct: 45,
        storage_used_mb: 450,
        in_eclipse: false,
        uncertainty_temp_c: 0.5,
        uncertainty_soc_pct: 0.6,
        uncertainty_temperature_c: 0.5,
        uncertainty_battery_soc: 0.6,
        predicted_thermal_hazard: false,
        predicted_battery_hazard: false,
        predicted_storage_hazard: false,
      },
      {
        step: 12,
        elapsed_seconds: 720,
        time_seconds: 720,
        horizon_seconds: 120,
        temperature_c: 46.2,
        battery_soc: 77.0,
        battery_soc_pct: 77.0,
        power_demand_w: 120,
        power_generation_w: 220,
        power_net_w: 100,
        net_power_w: 100,
        cpu_usage_pct: 45,
        storage_used_mb: 460,
        in_eclipse: false,
        uncertainty_temp_c: 1.0,
        uncertainty_soc_pct: 1.2,
        uncertainty_temperature_c: 1.0,
        uncertainty_battery_soc: 1.2,
        predicted_thermal_hazard: false,
        predicted_battery_hazard: false,
        predicted_storage_hazard: false,
      },
      {
        step: 13,
        elapsed_seconds: 780,
        time_seconds: 780,
        horizon_seconds: 180,
        temperature_c: 49.5, // Thermal hazard approaching 50 C!
        battery_soc: 76.0,
        battery_soc_pct: 76.0,
        power_demand_w: 120,
        power_generation_w: 220,
        power_net_w: 100,
        net_power_w: 100,
        cpu_usage_pct: 45,
        storage_used_mb: 470,
        in_eclipse: false,
        uncertainty_temp_c: 1.5,
        uncertainty_soc_pct: 1.8,
        uncertainty_temperature_c: 1.5,
        uncertainty_battery_soc: 1.8,
        predicted_thermal_hazard: true,
        predicted_battery_hazard: false,
        predicted_storage_hazard: false,
      },
      {
        step: 14,
        elapsed_seconds: 840,
        time_seconds: 840,
        horizon_seconds: 240,
        temperature_c: 51.0,
        battery_soc: 75.0,
        battery_soc_pct: 75.0,
        power_demand_w: 120,
        power_generation_w: 220,
        power_net_w: 100,
        net_power_w: 100,
        cpu_usage_pct: 45,
        storage_used_mb: 480,
        in_eclipse: false,
        uncertainty_temp_c: 2.0,
        uncertainty_soc_pct: 2.4,
        uncertainty_temperature_c: 2.0,
        uncertainty_battery_soc: 2.4,
        predicted_thermal_hazard: true,
        predicted_battery_hazard: false,
        predicted_storage_hazard: false,
      },
      {
        step: 15,
        elapsed_seconds: 900,
        time_seconds: 900,
        horizon_seconds: 300,
        temperature_c: 52.5,
        battery_soc: 74.0,
        battery_soc_pct: 74.0,
        power_demand_w: 120,
        power_generation_w: 220,
        power_net_w: 100,
        net_power_w: 100,
        cpu_usage_pct: 45,
        storage_used_mb: 490,
        in_eclipse: false,
        uncertainty_temp_c: 2.5,
        uncertainty_soc_pct: 3.0,
        uncertainty_temperature_c: 2.5,
        uncertainty_battery_soc: 3.0,
        predicted_thermal_hazard: true,
        predicted_battery_hazard: false,
        predicted_storage_hazard: false,
      },
    ],
    steps: [],
    recommendations: [],
  };

  const mockRecommendation: AdvisoryRecommendation = {
    recommendation_id: "rec_thermal_01",
    origin_step: 10,
    step_created: 10,
    time_created: 600,
    lead_time_seconds: 180,
    horizon_seconds: 180,
    hazard_type: "THERMAL_OVERHEAT",
    category: "thermal",
    severity: "warning",
    title: "Predictive Load Throttle",
    action_type: "reduce_workload",
    params: { target_cpu_pct: 25.0 },
    parameters: { target_cpu_pct: 25.0 },
    target_role: "systems_engineer",
    priority: "HIGH",
    plain_language_explanation:
      "Thermal margin predicted to reach unsafe limit in about 3 minutes as bus temperature reaches 49.5°C.",
    explanation:
      "Thermal margin predicted to reach unsafe limit in about 3 minutes as bus temperature reaches 49.5°C.",
    expected_benefit:
      "Averts computer thermal throttling and protects optical payload sensor calibration.",
    possible_cost_tradeoff:
      "Slows background science processing and image compression throughput by ~30%.",
    cost_tradeoff:
      "Slows background science processing and image compression throughput by ~30%.",
    influencing_variables: ["temp_c", "total_power_draw_w", "cpu_usage_pct"],
    confidence_score: 0.92,
    status: "pending",
  };

  const mockMetrics: AdvisoryMetricsSummary = {
    total_forecasts_generated: 12,
    evaluated_predictions_count: 36,
    evaluation_records_count: 36,
    temperature_mae_c: 0.42,
    continuous_forecast_mae_temp_c: 0.42,
    continuous_mae_temp_c: 0.42,
    temperature_rmse_c: 0.58,
    continuous_forecast_rmse_temp_c: 0.58,
    battery_mae_pct: 0.65,
    continuous_forecast_mae_soc_pct: 0.65,
    battery_rmse_pct: 0.81,
    continuous_forecast_rmse_soc_pct: 0.81,
    hazard_warnings_issued: 3,
    true_positives: 2,
    true_positive_warnings: 2,
    false_positives: 0,
    false_positive_warnings: 0,
    false_negatives: 0,
    missed_warnings: 0,
    precision: 1.0,
    warning_precision: 1.0,
    recall: 1.0,
    warning_recall: 1.0,
    avg_warning_lead_time_seconds: 180.0,
    average_lead_time_seconds: 180.0,
    recommendations_accepted: 2,
    recommendations_rejected: 0,
    recommendations_modified: 0,
    recommendations_auto_executed: 0,
    critical_threshold_violations_avoided: 2,
    science_data_protected_mb: 700.0,
    model_provenance: DataProvenance.MODEL_PREDICTION,
  };

  it("renders panel with MODEL_PREDICTION provenance badge and 5-min horizon label", () => {
    render(
      <PredictiveAdvisoryPanel
        forecast={mockForecast}
        recommendations={[mockRecommendation]}
        metrics={mockMetrics}
        autoPilotEnabled={false}
        onRespond={vi.fn()}
        onToggleAutomation={vi.fn()}
      />
    );

    expect(screen.getByTestId("predictive-advisory-panel")).toBeInTheDocument();
    expect(screen.getByText("LumenOS Predictive Advisory")).toBeInTheDocument();
    expect(screen.getByText("5-MIN HORIZON")).toBeInTheDocument();
    expect(screen.getByText("MODEL OR AI PREDICTION")).toBeInTheDocument();
  });

  it("renders 5-minute forward steps with temperature and uncertainty bounds", () => {
    render(
      <PredictiveAdvisoryPanel
        forecast={mockForecast}
        recommendations={[]}
        metrics={mockMetrics}
        autoPilotEnabled={false}
        onRespond={vi.fn()}
        onToggleAutomation={vi.fn()}
      />
    );

    // Verify all 5 steps render
    expect(screen.getByTestId("forecast-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("forecast-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("forecast-step-3")).toBeInTheDocument();
    expect(screen.getByTestId("forecast-step-4")).toBeInTheDocument();
    expect(screen.getByTestId("forecast-step-5")).toBeInTheDocument();

    // Verify temperature values and hazard indicator on step 3
    expect(screen.getByText("44.5°C")).toBeInTheDocument();
    expect(screen.getByText("49.5°C")).toBeInTheDocument();
    expect(screen.getByText("±0.5°")).toBeInTheDocument();
  });

  it("renders tabs to switch between Thermal, Battery SoC, and Storage/CPU", () => {
    render(
      <PredictiveAdvisoryPanel
        forecast={mockForecast}
        recommendations={[]}
        metrics={mockMetrics}
        autoPilotEnabled={false}
        onRespond={vi.fn()}
        onToggleAutomation={vi.fn()}
      />
    );

    // Switch to Battery SoC tab
    fireEvent.click(screen.getByTestId("tab-power"));
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getAllByText("Net: +100W")[0]).toBeInTheDocument();

    // Switch to Storage/CPU tab
    fireEvent.click(screen.getByTestId("tab-storage"));
    expect(screen.getAllByText("45% CPU")[0]).toBeInTheDocument();
    expect(screen.getByText("450 MB")).toBeInTheDocument();
  });

  it("renders active recommendation card with explanation, expected benefit, and trade-off", () => {
    render(
      <PredictiveAdvisoryPanel
        forecast={mockForecast}
        recommendations={[mockRecommendation]}
        metrics={mockMetrics}
        autoPilotEnabled={false}
        onRespond={vi.fn()}
        onToggleAutomation={vi.fn()}
      />
    );

    expect(screen.getByText("Predictive Load Throttle")).toBeInTheDocument();
    expect(screen.getByText("Lead Time: ~180s")).toBeInTheDocument();
    expect(
      screen.getByText(/Thermal margin predicted to reach unsafe limit in about 3 minutes/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Averts computer thermal throttling/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Slows background science processing/)
    ).toBeInTheDocument();
    expect(screen.getByText("temp_c")).toBeInTheDocument();
  });

  it("triggers onRespond with accept when Accept Recommendation button is clicked", () => {
    const handleRespond = vi.fn();
    render(
      <PredictiveAdvisoryPanel
        forecast={mockForecast}
        recommendations={[mockRecommendation]}
        metrics={mockMetrics}
        autoPilotEnabled={false}
        onRespond={handleRespond}
        onToggleAutomation={vi.fn()}
      />
    );

    const acceptBtn = screen.getByTestId("accept-rec-btn-rec_thermal_01");
    fireEvent.click(acceptBtn);

    expect(handleRespond).toHaveBeenCalledWith("rec_thermal_01", "accept");
  });

  it("triggers onRespond with reject when Reject button is clicked", () => {
    const handleRespond = vi.fn();
    render(
      <PredictiveAdvisoryPanel
        forecast={mockForecast}
        recommendations={[mockRecommendation]}
        metrics={mockMetrics}
        autoPilotEnabled={false}
        onRespond={handleRespond}
        onToggleAutomation={vi.fn()}
      />
    );

    const rejectBtn = screen.getByTestId("reject-rec-btn-rec_thermal_01");
    fireEvent.click(rejectBtn);

    expect(handleRespond).toHaveBeenCalledWith("rec_thermal_01", "reject");
  });

  it("handles Modify workflow with slider adjustment and Apply & Dispatch", () => {
    const handleRespond = vi.fn();
    render(
      <PredictiveAdvisoryPanel
        forecast={mockForecast}
        recommendations={[mockRecommendation]}
        metrics={mockMetrics}
        autoPilotEnabled={false}
        onRespond={handleRespond}
        onToggleAutomation={vi.fn()}
      />
    );

    // Click Modify... button
    const modifyBtn = screen.getByTestId("modify-rec-btn-rec_thermal_01");
    fireEvent.click(modifyBtn);

    // Modifier tray opens
    expect(screen.getByTestId("modifier-tray-rec_thermal_01")).toBeInTheDocument();
    expect(screen.getByText("Tune Parameter (Target CPU Usage):")).toBeInTheDocument();

    // Confirm modify
    const confirmBtn = screen.getByTestId("confirm-modify-btn-rec_thermal_01");
    fireEvent.click(confirmBtn);

    expect(handleRespond).toHaveBeenCalledWith("rec_thermal_01", "modify", {
      target_cpu_pct: 25,
    });
  });

  it("toggles autopilot automation when autopilot button is clicked", () => {
    const handleToggle = vi.fn();
    const { rerender } = render(
      <PredictiveAdvisoryPanel
        forecast={mockForecast}
        recommendations={[]}
        metrics={mockMetrics}
        autoPilotEnabled={false}
        onRespond={vi.fn()}
        onToggleAutomation={handleToggle}
      />
    );

    const toggleBtn = screen.getByTestId("toggle-autopilot-btn");
    expect(screen.getByText("Autopilot: STANDBY")).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(handleToggle).toHaveBeenCalledWith(true);

    rerender(
      <PredictiveAdvisoryPanel
        forecast={mockForecast}
        recommendations={[]}
        metrics={mockMetrics}
        autoPilotEnabled={true}
        onRespond={vi.fn()}
        onToggleAutomation={handleToggle}
      />
    );

    expect(screen.getByText("Autopilot: ACTIVE")).toBeInTheDocument();
  });

  it("opens Verification Scorecard tray displaying MAE, RMSE, and precision/recall", () => {
    render(
      <PredictiveAdvisoryPanel
        forecast={mockForecast}
        recommendations={[]}
        metrics={mockMetrics}
        autoPilotEnabled={false}
        onRespond={vi.fn()}
        onToggleAutomation={vi.fn()}
      />
    );

    const scorecardBtn = screen.getByTestId("view-scorecard-btn");
    fireEvent.click(scorecardBtn);

    expect(screen.getByTestId("advisory-scorecard-tray")).toBeInTheDocument();
    expect(screen.getByText("MAE: 0.42°C")).toBeInTheDocument();
    expect(screen.getByText("RMSE: 0.58°C")).toBeInTheDocument();
    expect(screen.getByText("100% / 100%")).toBeInTheDocument();
    expect(screen.getByText("2 Avoided")).toBeInTheDocument();
  });
});
