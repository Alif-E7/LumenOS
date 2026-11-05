import { describe, it, expect } from "vitest";
import {
  API_VERSION,
  type Spacecraft,
  type MissionContract,
  type Objective,
  type MissionEvent,
  type CommandRequest,
  type CommandResult,
  type SessionSnapshot,
  type MultiplayerRoom,
  type Participant,
  type PlayerProgress,
  type Telemetry,
  type ScoreResult,
} from "../types/canonical";

describe("Frontend Canonical Domain Contracts (Prompt 3)", () => {
  it("maintains versioning contract 'v1'", () => {
    expect(API_VERSION).toBe("v1");
  });

  it("conforms to canonical Spacecraft interface", () => {
    const sc: Spacecraft = {
      id: "sc_alpha",
      name: "Wildfire Sentinel",
      description: "SSO thermal observation platform",
      structure: { dry_mass_kg: 450, fuel_mass_kg: 60 },
      power: { solar_panel_area_m2: 5.5, battery_capacity_wh: 1800 },
      thermal: { radiator_area_m2: 2.2 },
      comms: { antenna_gain_dbi: 22.0, transmit_power_w: 12.0 },
      propulsion: { isp_s: 230, thrust_n: 1.2 },
      payload: { payload_type: "thermal_infrared", mass_kg: 35, power_w: 90 },
      components: [
        {
          id: "star_tracker",
          name: "Autonomous Star Tracker",
          subsystem: "avionics",
          mass_kg: 3.5,
          power_draw_w: 8.0,
          power_generation_w: 0,
          cost_credits: 150,
          required_level: 1,
          health_pct: 100,
          is_locked: false,
        },
      ],
      instruments: [
        {
          id: "tir_sensor",
          name: "Dual-Channel Thermal Sensor",
          instrument_type: "thermal_infrared",
          mass_kg: 25.0,
          power_draw_w: 75.0,
          data_rate_kbps: 400.0,
          cost_credits: 400,
          is_active: true,
          health_pct: 100,
        },
      ],
      total_mass_kg: 573.5,
      mass_budget_kg: 800.0,
      power_budget_w: 500.0,
      thermal_margin_pct: 25.0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(sc.id).toBe("sc_alpha");
    expect(sc.components.length).toBe(1);
    expect(sc.instruments[0].instrument_type).toBe("thermal_infrared");
  });

  it("conforms to canonical MissionContract with strict budget separation", () => {
    const contract: MissionContract = {
      mission_id: "wildfire",
      mission_name: "Wildfire Scout",
      story_context: "Emergency response monitoring across vulnerable biomes.",
      difficulty: "engineer",
      deadline_steps: 1440,
      deadline_hours: 24.0,
      mission_budget: 10000.0, // Strictly within-mission constraint
      allowed_components: ["solar_v1", "battery_v1"],
      locked_components: ["rtg_nuclear"],
      risk_level: "moderate",
      primary_objectives: [
        {
          id: "detect_fires",
          description: "Detect wildfire perimeter",
          is_primary: true,
          metric: "hotspots_detected",
          target_value: 10,
          current_value: 0,
          unit: "hotspots",
          weight: 1.0,
          partial_threshold: 0.5,
          is_complete: false,
          fraction: 0,
        },
      ],
      optional_objectives: [],
      win_condition: { min_primary_completion_pct: 1.0, min_overall_score_pct: 0.6 },
      fail_condition: {
        budget_exceeded: true,
        deadline_exceeded: true,
        spacecraft_destroyed: true,
        min_health_pct: 0,
      },
      partial_threshold: 0.5,
      event_pool: [],
      reward_rules: { xp_base: 500, credits_base: 250, bonus_multiplier_per_star: 0.25 },
      seed: 42,
    };

    expect(contract.mission_budget).toBe(10000.0);
    expect(contract.primary_objectives[0].metric).toBe("hotspots_detected");
  });

  it("conforms to canonical CommandRequest and CommandResult envelopes", () => {
    const req: CommandRequest = {
      version: API_VERSION,
      request_id: "req_001",
      session_id: "ses_001",
      player_id: "player_cmd",
      role: "systems_engineer",
      command_type: "action",
      payload: { action_type: "adjust_thermal", delta_m2: 0.5 },
      timestamp: Date.now(),
    };

    const res: CommandResult = {
      version: API_VERSION,
      request_id: req.request_id,
      command_type: req.command_type,
      success: true,
      consequence: {
        action_id: "act_001",
        success: true,
        effects: { radiator_area_delta: 0.5 },
        budget_spent: 50.0,
        budget_remaining: 9950.0,
        message: "Radiator extended by 0.5 m²",
        state_delta: {},
      },
      timestamp: Date.now(),
    };

    expect(req.version).toBe("v1");
    expect(res.version).toBe("v1");
    expect(res.consequence?.budget_remaining).toBe(9950.0);
  });

  it("conforms to canonical PlayerProgress and strictly isolates Engineering Credits", () => {
    const profile: PlayerProgress = {
      player_id: "usr_alice",
      callsign: "Valkyrie",
      rank: "Mission Specialist",
      level: 4,
      xp: 2200,
      xp_to_next_level: 800,
      engineering_credits: 4500, // Career progression currency, separate from mission_budget
      missions_completed: 6,
      missions_won: 5,
      achievements: [
        {
          id: "first_win",
          title: "First Mission Won",
          description: "Completed contract with passing grade",
          icon: "🏅",
          is_unlocked: true,
          xp_reward: 200,
          credits_reward: 100,
        },
      ],
      unlocked_component_ids: ["advanced_radiator", "high_gain_antenna"],
    };

    expect(profile.engineering_credits).toBe(4500);
    expect(profile.achievements[0].is_unlocked).toBe(true);
  });

  it("conforms to canonical Objective, MissionEvent, Telemetry, and ScoreResult", () => {
    const obj: Objective = {
      id: "obj_main",
      description: "Detect fire hotspots",
      is_primary: true,
      metric: "hotspots_detected",
      target_value: 10,
      current_value: 10,
      unit: "hotspots",
      weight: 1.0,
      partial_threshold: 0.5,
      is_complete: true,
      fraction: 1.0,
    };

    const evt: MissionEvent = {
      event_id: "evt_solar_storm",
      template_id: "tmpl_sep_01",
      name: "Solar Energetic Particle Event",
      seed: 1234,
      severity: "critical",
      cue: "Warning: High radiation flux detected approaching sensor bus",
      context_explanation: "Coronal mass ejection shock front arrival imminent.",
      trigger_conditions: { orbit_type: "sso" },
      probability: 0.25,
      earliest_step: 50,
      latest_step: 300,
      choices: [
        {
          id: "safe_mode",
          label: "Orient solar panels and power down sensitive optics",
          description: "Prevents sensor degradation at cost of 1 hour coverage",
          role_required: "systems_engineer",
          cost_budget: 0,
          effects: { sensor_degradation_pct: 0 },
          risk_description: "Loss of optical coverage for 60 minutes",
        },
      ],
      allowed_roles: ["flight_controller", "systems_engineer"],
      resolution_state: "pending",
    };

    const telem: Telemetry = {
      step: 120,
      elapsed_seconds: 7200,
      status: "NOMINAL",
      spacecraft_health_pct: 98.5,
      orbital: {
        altitude_km: 550,
        velocity_km_s: 7.6,
        latitude_deg: 34.0,
        longitude_deg: -118.0,
        in_eclipse: false,
        true_anomaly_deg: 45.0,
      },
      power: {
        solar_output_w: 450,
        total_load_w: 320,
        net_power_w: 130,
        battery_soc_pct: 91.6,
        in_eclipse: false,
        low_power_warning: false,
        power_critical: false,
      },
      thermal: {
        temperature_c: 24.1,
        heat_input_w: 200,
        heat_rejected_w: 180,
        overtemp_warning: false,
        undertemp_warning: false,
      },
      comms: {
        data_collected_mb: 250,
        data_downlinked_mb: 120,
        data_buffer_mb: 130,
        data_buffer_pct: 6.3,
        in_contact: true,
        active_station: "Svalbard",
        signal_strength_dbm: -75.0,
        buffer_full_warning: false,
      },
      workload: {
        cpu_usage_pct: 35.0,
        processing_queue_items: 2,
        cpu_overload_warning: false,
      },
      storage: {
        used_pct: 6.3,
        used_mb: 130,
        free_mb: 1918,
        storage_full_warning: false,
      },
      provenance: "simulated",
    };

    const score: ScoreResult = {
      session_id: "ses_001",
      total_score: 94.25,
      max_score: 100.0,
      score_fraction: 0.9425,
      grade: "A",
      categories: [
        {
          category: "Objectives",
          weighted_score: 40,
          max_possible: 40,
          explanation: "All primary objectives achieved",
        },
      ],
      objectives_met: 1,
      objectives_total: 1,
      events_handled_well: 1,
      provenance: "simulated",
    };

    expect(obj.is_complete).toBe(true);
    expect(evt.allowed_roles).toContain("flight_controller");
    expect(telem.provenance).toBe("simulated");
    expect(score.grade).toBe("A");
  });

  it("conforms to canonical MultiplayerRoom, Participant, and SessionSnapshot", () => {
    const participant: Participant = {
      player_id: "usr_alice",
      display_name: "Commander Alice",
      is_host: true,
      assigned_roles: ["mission_director"],
      connection_status: "connected",
      is_ready: true,
      last_ping: Date.now(),
      permissions: [
        {
          role: "mission_director",
          action_type: "abort_mission",
          can_execute: true,
          requires_approval: false,
          description: "Authoritative abort power",
        },
      ],
    };

    const room: MultiplayerRoom = {
      version: API_VERSION,
      room_code: "LUMN-4421",
      host_id: "usr_alice",
      host_name: "Commander Alice",
      phase: "lobby",
      participants: [participant],
      mission_id: "wildfire",
      created_at: Date.now(),
    };

    const snapshot: SessionSnapshot = {
      version: API_VERSION,
      session_id: "ses_001",
      step: 120,
      elapsed_seconds: 7200,
      mission_status: "running",
      spacecraft_health_pct: 98.5,
      budget_remaining: 8500.0,
      objectives: [],
      active_events: [],
      recent_actions: [],
      current_score: 94.25,
      provenance: "simulated",
    };

    expect(room.room_code).toBe("LUMN-4421");
    expect(participant.is_host).toBe(true);
    expect(snapshot.version).toBe("v1");
  });
});
