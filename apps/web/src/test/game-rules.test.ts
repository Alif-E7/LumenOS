import { describe, it, expect } from "vitest";
import type {
  ScoreResponse,
  CampaignMissionNode,
  DifficultySetting,
  TutorialStepInfo,
} from "../types";

describe("Frontend Game Rules & Progression Contracts (Prompt 4)", () => {
  it("conforms to ScoreResponse with stars, criteria, and explanations", () => {
    const score: ScoreResponse = {
      session_id: "ses_wildfire_01",
      total_score: 94.5,
      max_score: 100.0,
      score_fraction: 0.945,
      grade: "A",
      stars: 3,
      star_criteria: [
        "1st Star ★: Minimum mission objective threshold met.",
        "2nd Star ★: High efficiency execution (Score ≥ 80%).",
        "3rd Star ★: Operational Mastery (Score ≥ 90%, Health preserved).",
      ],
      explanation: "Rating: ★★★ (3/3 Stars)\nGrade: A — 94.5/100.0 (95%)",
      categories: [
        {
          category: "objectives",
          weighted_score: 35.0,
          max_possible: 35.0,
          explanation: "100% of objectives achieved",
        },
        {
          category: "health",
          weighted_score: 19.0,
          max_possible: 20.0,
          explanation: "Spacecraft health at 95%",
        },
      ],
    };

    expect(score.stars).toBe(3);
    expect(score.star_criteria?.length).toBe(3);
    expect(score.categories[0].category).toBe("objectives");
  });

  it("conforms to CampaignMissionNode across the 4 scenarios", () => {
    const nodes: CampaignMissionNode[] = [
      {
        mission_id: "wildfire",
        name: "Wildfire Scout",
        codename: "Eyes on Fire",
        order: 1,
        difficulty_level: 2,
        icon: "🔥",
        summary: "Deploy a thermal imaging satellite into SSO.",
        prerequisite_mission_id: null,
        prerequisite_min_stars: 0,
        prerequisite_player_level: 1,
        xp_first_completion: 500,
        credits_first_completion: 800,
        xp_replay_mastery: 125,
        credits_replay_mastery: 200,
      },
      {
        mission_id: "flood",
        name: "Flood Scout",
        codename: "Rising Waters",
        order: 2,
        difficulty_level: 3,
        icon: "🌊",
        summary: "Operate a high-power SAR satellite.",
        prerequisite_mission_id: "wildfire",
        prerequisite_min_stars: 1,
        prerequisite_player_level: 2,
        xp_first_completion: 700,
        credits_first_completion: 1100,
        xp_replay_mastery: 175,
        credits_replay_mastery: 275,
      },
      {
        mission_id: "solar_storm",
        name: "Solar Storm Sentinel",
        codename: "Watch the Sun",
        order: 3,
        difficulty_level: 4,
        icon: "☀️",
        summary: "Position a polar UV spectrometer.",
        prerequisite_mission_id: "flood",
        prerequisite_min_stars: 1,
        prerequisite_player_level: 3,
        xp_first_completion: 900,
        credits_first_completion: 1400,
        xp_replay_mastery: 225,
        credits_replay_mastery: 350,
      },
      {
        mission_id: "volcano",
        name: "Volcano Watch",
        codename: "Fire Beneath the Earth",
        order: 4,
        difficulty_level: 3,
        icon: "🌋",
        summary: "Coordinate multispectral imagery.",
        prerequisite_mission_id: "solar_storm",
        prerequisite_min_stars: 1,
        prerequisite_player_level: 4,
        xp_first_completion: 1000,
        credits_first_completion: 1600,
        xp_replay_mastery: 250,
        credits_replay_mastery: 400,
      },
    ];

    expect(nodes.length).toBe(4);
    expect(nodes[0].mission_id).toBe("wildfire");
    expect(nodes[1].prerequisite_mission_id).toBe("wildfire");
    expect(nodes[3].mission_id).toBe("volcano");
  });

  it("conforms to DifficultySetting tiers with invariant physics", () => {
    const cadet: DifficultySetting = {
      difficulty: "cadet",
      level: 1,
      name: "Cadet",
      description: "Generous budget (+50%) and relaxed deadlines (+25%).",
      budget_multiplier: 1.5,
      deadline_multiplier: 1.25,
      event_rate_multiplier: 0.6,
      objective_target_multiplier: 0.85,
      min_health_fail_pct: 0,
      reward_multiplier: 0.8,
    };

    const engineer: DifficultySetting = {
      difficulty: "engineer",
      level: 2,
      name: "Engineer",
      description: "Standard baseline operational parameters.",
      budget_multiplier: 1.0,
      deadline_multiplier: 1.0,
      event_rate_multiplier: 1.0,
      objective_target_multiplier: 1.0,
      min_health_fail_pct: 0,
      reward_multiplier: 1.0,
    };

    expect(cadet.budget_multiplier).toBe(1.5);
    expect(engineer.budget_multiplier).toBe(1.0);
  });

  it("conforms to TutorialStepInfo for Sunrise Orbit onboarding", () => {
    const step: TutorialStepInfo = {
      id: "tut_step_1_orbit",
      stage: "orbit_basics",
      title: "Orbital Mechanics — Staying in Space",
      concept: "Forward velocity balances gravitational pull at 400 km.",
      explorer_guidance: "Welcome Cadet! Notice your orbital speed.",
      engineer_telemetry_focus: "v = sqrt(GM/r) = 7.67 km/s.",
      required_action: "verify_orbit",
      hint: "Check the altitude meter.",
    };

    expect(step.stage).toBe("orbit_basics");
    expect(step.required_action).toBe("verify_orbit");
  });
});

