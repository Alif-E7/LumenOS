import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ResultsPage } from "../pages/ResultsPage";
import { ReplayPage } from "../pages/ReplayPage";
import * as client from "../api/client";
import * as missionLib from "../lib/mission";
import type {
  ScoreResponse,
  GameStateSummary,
  LifecycleCostModel,
  TeamContributionBreakdown,
  MissionTrajectoryRecord,
  WhatIfComparisonResult,
} from "../types";

vi.mock("../api/client");
vi.mock("../lib/mission");

const mockScore: ScoreResponse = {
  session_id: "ses_test_123",
  total_score: 92.5,
  max_score: 100.0,
  score_fraction: 0.925,
  grade: "A",
  stars: 3,
  star_criteria: ["1st Star ★: Threshold met", "2nd Star ★: High efficiency", "3rd Star ★: Mastery"],
  explanation: "Outstanding flight performance",
  primary_objectives_completed: 2,
  primary_objectives_total: 2,
  optional_objectives_completed: 1,
  optional_objectives_total: 2,
  safety_cap_triggered: false,
  safety_flags: [],
  primary_cause: "Nominal orbital execution and payload operations.",
  categories: [
    { category: "objectives", display_name: "Mission Objectives", weighted_score: 33.0, max_possible: 35.0, explanation: "94% achieved" },
    { category: "health", display_name: "Safety & Reliability", weighted_score: 19.0, max_possible: 20.0, explanation: "95% health" },
    { category: "data", display_name: "Comms & Data", weighted_score: 14.5, max_possible: 15.0, explanation: "480 MB" },
    { category: "time", display_name: "Timeline", weighted_score: 8.5, max_possible: 10.0, explanation: "Nominal" },
    { category: "events", display_name: "Coordination", weighted_score: 9.0, max_possible: 10.0, explanation: "All resolved" },
    { category: "budget", display_name: "Budget", weighted_score: 8.5, max_possible: 10.0, explanation: "Reserve preserved" },
  ],
};

const mockGameState: { game_state: GameStateSummary } = {
  game_state: {
    session_id: "ses_test_123",
    mission_id: "wildfire",
    step: 50,
    elapsed_seconds: 3000,
    status: "completed",
    budget_remaining: 5500,
    spacecraft_health_pct: 94.0,
    data_collected_mb: 500,
    data_downlinked_mb: 480,
    current_score: 92.5,
    control_mode: "lumenos_ai",
    active_event_count: 0,
    objectives_complete: 2,
    objectives_total: 2,
    outcome: "win",
    objectives: [],
  },
};

const mockCostModel: LifecycleCostModel = {
  bus_development_cost_usd: 14000000,
  launch_rideshare_cost_usd: 6000000,
  total_capex_usd: 20000000,
  design_lifespan_years: 3.0,
  design_lifetime_orbits: 15768,
  amortized_capex_per_orbit_usd: 1268.39,
  orbits_evaluated: 1.0,
  amortized_mission_capex_usd: 1268.39,
  mission_operational_spent_usd: 4500.0,
  total_amortized_mission_cost_usd: 5768.39,
  data_downlinked_mb: 480.0,
  alerts_delivered: 8,
  cost_per_mb_usd: 12.02,
  cost_per_alert_usd: 721.05,
  benchmark_flagship_cost_per_mb_usd: 185.0,
  cost_efficiency_gain_pct: 93.5,
  cost_efficiency_multiplier: 15.4,
  educational_assumptions: [
    "CapEx is amortized across 15,768 orbits over 3 years.",
    "LumenOS onboard edge processing filtered out background frames.",
  ],
};

const mockTeamSummary: TeamContributionBreakdown = {
  coordination_index: 0.92,
  cross_role_assistance_count: 4,
  tactical_pings_count: 3,
  summary_narrative: "Exceptional crew synchrony: active communication and shared vigilance.",
  participants: [
    {
      player_id: "p_dir",
      display_name: "Commander Alpha",
      roles: ["Mission Director"],
      total_actions: 8,
      effective_actions: 8,
      spam_filtered_count: 0,
      coordination_events: 5,
      standby_vigilance_points: 20.0,
      impact_metrics: {},
      role_highlights: ["Coordinated tactical priorities & anomaly responses."],
      raw_contribution_points: 52.0,
      contribution_percentage: 52.0,
    },
    {
      player_id: "p_eng",
      display_name: "Engineer Bravo",
      roles: ["Systems Engineer"],
      total_actions: 6,
      effective_actions: 6,
      spam_filtered_count: 0,
      coordination_events: 3,
      standby_vigilance_points: 20.0,
      impact_metrics: {},
      role_highlights: ["Maintained nominal bus equilibrium (94% health)."],
      raw_contribution_points: 48.0,
      contribution_percentage: 48.0,
    },
  ],
};

const mockTrajectory: MissionTrajectoryRecord = {
  session_id: "ses_test_123",
  mission_id: "wildfire",
  seed: 42,
  total_steps: 10,
  time_step_seconds: 60.0,
  status: "completed",
  outcome: "win",
  spacecraft_name: "Wildfire Scout Alpha",
  difficulty: "engineer",
  key_events: [
    {
      step: 3,
      elapsed_seconds: 180,
      category: "eclipse",
      title: "Eclipse Ingress",
      description: "Orbiter entered Earth shadow",
      severity: "warning",
    },
    {
      step: 7,
      elapsed_seconds: 420,
      category: "contact",
      title: "Ground Contact: Svalbard",
      description: "AOS established",
      severity: "nominal",
    },
  ],
  steps: Array.from({ length: 10 }).map((_, idx) => ({
    step: idx + 1,
    elapsed_seconds: (idx + 1) * 60,
    status: "running",
    spacecraft_health_pct: 95.0,
    budget_remaining: 8000,
    telemetry: {
      orbital: { altitude_km: 550, velocity_km_s: 7.6, in_eclipse: idx >= 3 && idx <= 5 },
      power: { solar_output_w: 120, total_load_w: 80, net_power_w: 40, battery_soc_pct: 92, battery_soc_wh: 360 },
      thermal: { temperature_c: 21.5, heat_input_w: 60, heat_rejected_w: 55, net_heat_w: 5, heater_active: false },
      comms: { in_contact: idx === 6, active_station: "Svalbard", data_buffer_mb: 80, data_downlinked_mb: 200 },
      storage: { used_pct: 30 },
      workload: { operational_profile: "FULL", cpu_usage_pct: 45 },
    },
    actions: [],
    events: [],
  })),
};

const mockWhatIfResult: WhatIfComparisonResult = {
  branch_step: 3,
  label: "Switch Operational Profile to ECO",
  semantic_tag: "NEW SIMULATION (WHAT-IF)",
  is_what_if: true,
  original_score: 82.0,
  modified_score: 94.5,
  score_delta: 12.5,
  original_grade: "B",
  modified_grade: "A",
  original_stars: 2,
  modified_stars: 3,
  stars_delta: 1,
  original_health_final: 78.0,
  modified_health_final: 94.0,
  health_delta: 16.0,
  original_downlink_mb: 320.0,
  modified_downlink_mb: 350.0,
  downlink_delta: 30.0,
  delta_explanation: "What-If Strategy Succeeded: Forking at Step 3 with ECO mode preserved battery SoC across the shadow pass.",
  original_trajectory: [],
  modified_trajectory: [],
};

describe("Prompt 15 Results & Replay Frontend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(missionLib.loadMissionSession).mockReturnValue({
      mode: "solo",
      sessionId: "ses_test_123",
      missionId: "wildfire",
      missionName: "Wildfire Scout",
      spacecraftId: "sc_1",
      playerId: "commander",
      roomCode: null,
    });
    vi.mocked(client.getGameScore).mockResolvedValue(mockScore);
    vi.mocked(client.getGameState).mockResolvedValue(mockGameState as any);
    vi.mocked(client.getCostAnalysis).mockResolvedValue(mockCostModel);
    vi.mocked(client.getTeamContributions).mockResolvedValue(mockTeamSummary);
    vi.mocked(client.getMissionReplay).mockResolvedValue(mockTrajectory);
    vi.mocked(client.runWhatIf).mockResolvedValue(mockWhatIfResult);
  });

  it("renders ResultsPage with primary/optional objective metrics and cost model", async () => {
    render(
      <MemoryRouter>
        <ResultsPage />
      </MemoryRouter>
    );

    // Header & outcome
    expect(await screen.findByText("Mission Success")).toBeInTheDocument();

    // Objective fractions
    expect(screen.getByText("Primary Objectives")).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 2 Complete/)).toBeInTheDocument();
    expect(screen.getByText("Secondary / Optional Objectives")).toBeInTheDocument();

    // Educational cost model
    expect(screen.getByText(/Educational Economics: "Is It Worth It\?"/)).toBeInTheDocument();
    expect(screen.getByText(/\$12\.02/)).toBeInTheDocument(); // cost per MB
    expect(screen.getByText(/15\.4x More Cost-Efficient/)).toBeInTheDocument();

    // Co-op team contribution
    expect(screen.getByText(/Co-op Crew Contribution & Station Coordination/)).toBeInTheDocument();
    expect(screen.getByText("Commander Alpha")).toBeInTheDocument();
    expect(screen.getByText("Engineer Bravo")).toBeInTheDocument();
    expect(screen.getByText("52%")).toBeInTheDocument();
  });

  it("renders critical safety cap warning in ResultsPage when safety cap triggered", async () => {
    const safetyCapScore: ScoreResponse = {
      ...mockScore,
      total_score: 38.0,
      grade: "F",
      stars: 0,
      safety_cap_triggered: true,
      safety_cap_reason: "Loss of spacecraft structural/electrical integrity (0% Health).",
      safety_flags: ["CRITICAL: Total loss of spacecraft health (0.0%). Vehicle decommissioned."],
    };
    vi.mocked(client.getGameScore).mockResolvedValue(safetyCapScore);

    render(
      <MemoryRouter>
        <ResultsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("CRITICAL SAFETY CAP ENFORCED")).toBeInTheDocument();
    expect(screen.getByText(/Loss of spacecraft structural\/electrical integrity/)).toBeInTheDocument();
  });

  it("renders ReplayPage scrubber and jumps to key events", async () => {
    render(
      <MemoryRouter>
        <ReplayPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Mission Replay & What-If Studio")).toBeInTheDocument();
    expect(screen.getByText("Operational Timeline Scrubber")).toBeInTheDocument();

    // Key event chips
    expect(screen.getByText("Eclipse Ingress")).toBeInTheDocument();
    expect(screen.getByText("Ground Contact: Svalbard")).toBeInTheDocument();

    // Telemetry readouts
    expect(screen.getByText(/⚡ Power Bus/)).toBeInTheDocument();
    expect(screen.getByText(/🌡️ Thermal State/)).toBeInTheDocument();
  });

  it("runs What-If branching simulation and renders side-by-side comparison with semantic tag", async () => {
    render(
      <MemoryRouter>
        <ReplayPage />
      </MemoryRouter>
    );

    await screen.findByText("Mission Replay & What-If Studio");

    // Click Run What-If Branch button
    const branchBtn = screen.getByRole("button", { name: /Run What-If Branch from Step/i });
    fireEvent.click(branchBtn);

    // Verify side-by-side comparison output with exact semantic tag
    expect(await screen.findByText("NEW SIMULATION (WHAT-IF)")).toBeInTheDocument();
    expect(screen.getByText("+12.5 pts")).toBeInTheDocument();
    expect(screen.getByText(/was B/i)).toBeInTheDocument();
    expect(screen.getByText(/\+16\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/What-If Strategy Succeeded/)).toBeInTheDocument();
  });
});
