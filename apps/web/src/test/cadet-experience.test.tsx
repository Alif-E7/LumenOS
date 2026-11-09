import { describe, it, expect, beforeEach } from "vitest";
import {
  kidGauges,
  coinsLeft,
  kidGoals,
  missionStory,
  missionGoal,
  missionClock,
  situationTip,
  kidEvent,
  kidScoreStory,
  worstGauge,
} from "../lib/kid";
import { isHighDetailEarthEnabled, setHighDetailEarthEnabled } from "../lib/earth-imagery";
import type { Telemetry, GameStateSummary, ObjectiveProgress } from "../types";

describe("Cadet Experience — Translation Layer (kid.ts)", () => {
  const mockTelemetry = {
    step: 5,
    timestamp: "2026-11-09T12:00:00Z",
    power: {
      battery_soc_pct: 85,
      solar_output_w: 120,
      total_load_w: 45,
      net_power_w: 75,
      in_eclipse: false,
      low_power_warning: false,
      power_critical: false,
    },
    thermal: {
      temperature_c: 22,
      heat_input_w: 50,
      heat_rejected_w: 48,
      overtemp_warning: false,
      undertemp_warning: false,
      thermal_critical: false,
    },
    orbital: {
      altitude_km: 520,
      velocity_km_s: 7.6,
      latitude_deg: -12.5,
      longitude_deg: 130.2,
      in_eclipse: false,
      true_anomaly_deg: 120,
    },
    comms: {
      in_contact: true,
      active_station: "Svalbard",
      data_buffer_mb: 20,
      data_buffer_pct: 20,
      data_collected_mb: 100,
      data_downlinked_mb: 80,
      signal_strength_dbm: -80,
      buffer_full_warning: false,
    },
    storage: {
      used_pct: 5,
      used_mb: 12000,
      free_mb: 244000,
      storage_full_warning: false,
    },
    spacecraft_health_pct: 98,
    active_payload: "multi_spectral_imager",
    active_mode: "NOMINAL",
    subsystem_status: {},
  } as unknown as Telemetry;

  it("translates healthy telemetry into 5 friendly gauges with good status", () => {
    const gauges = kidGauges(mockTelemetry);
    expect(gauges).toHaveLength(5);

    const [battery, heat, signal, memory, health] = gauges;
    expect(battery.status).toBe("good");
    expect(battery.value).toBe(85);
    expect(battery.line).toContain("sunshine");

    expect(heat.status).toBe("good");
    expect(signal.status).toBe("good");
    expect(memory.status).toBe("good");
    expect(health.status).toBe("good");
    expect(health.value).toBe(98);
  });

  it("handles warning and critical battery states gracefully without physics jargon", () => {
    const lowPowerTel: Telemetry = {
      ...mockTelemetry,
      power: {
        ...mockTelemetry.power,
        battery_soc_pct: 20,
        low_power_warning: true,
      },
    };
    const lowGauges = kidGauges(lowPowerTel);
    const batGauge = lowGauges.find((g) => g.id === "battery");
    expect(batGauge?.status).toBe("bad");
    expect(batGauge?.line).toContain("empty");

    const worst = worstGauge(lowGauges);
    expect(worst?.id).toBe("battery");
  });

  it("derives coins left, goals, and clock formatting correctly", () => {
    const mockState = {
      session_id: "s_123",
      mission_id: "wildfire",
      status: "running",
      step: 12,
      score: 75,
      budget_remaining: 14500,
      science_points: 350,
      active_events: [],
      active_event_count: 0,
      objectives_complete: 1,
      objectives_total: 3,
      health_pct: 95,
      primary_target: "Wildfire Zone",
      orbit_valid: true,
      in_eclipse: false,
    } as unknown as GameStateSummary;

    expect(coinsLeft(mockState)).toBe(14500);

    const goals = kidGoals([
      {
        objective_id: "obj_1",
        description: "Collect 3 wildfire images over Australia",
        weight: 0.5,
        target_value: 3,
        current_value: 3,
        fraction: 1.0,
        unit: "images",
        is_complete: true,
        is_primary: true,
      },
      {
        objective_id: "obj_2",
        description: "Downlink 500 MB of science telemetry to Svalbard",
        weight: 0.5,
        target_value: 500,
        current_value: 200,
        fraction: 0.4,
        unit: "MB",
        is_complete: false,
        is_primary: false,
      },
    ] as ObjectiveProgress[]);
    expect(goals).toHaveLength(2);
    expect(goals[0].done).toBe(true);
    expect(goals[1].progress).toBe(40);

    expect(missionClock(125)).toBe("2m");
    expect(missionClock(3665)).toBe("1h 1m");
  });

  it("provides kid-friendly tips depending on flight situation", () => {
    const gauges = kidGauges(mockTelemetry);
    const eclipseTip = situationTip(
      [
        { id: "battery", label: "Battery", value: 40, status: "warn", line: "Low" },
        ...gauges.slice(1),
      ],
      null,
      true
    );
    expect(eclipseTip?.text).toContain("shadow");

    const normalTip = situationTip(gauges, null, false);
    expect(normalTip?.text).toContain("All systems happy");
  });

  it("formats story and goals for missions", () => {
    expect(missionStory("wildfire")).toContain("fires are burning");
    expect(missionGoal("wildfire")).toContain("Photograph");
  });

  it("translates mission score into star ratings and cheerful outcomes", () => {
    const perfectScore = kidScoreStory(
      "WIN",
      95,
      ["Captured all wildfire imagery"],
      null
    );
    expect(perfectScore.stars).toBe(3);
    expect(perfectScore.headline).toBeDefined();

    const failedScore = kidScoreStory(
      "FAIL",
      30,
      [],
      "Battery depletion in eclipse"
    );
    expect(failedScore.stars).toBe(0);
    expect(failedScore.sentence).toContain("Battery depletion in eclipse");
  });

  it("converts backend event into kid choices with icons and friendly text", () => {
    const ev = kidEvent({
      event_id: "ev_flare",
      name: "Solar Radiation Spike",
      description: "Sunspot flare releasing high energetic particles towards the solar array.",
      severity: "warning",
      choices: [
        { id: "opt_shield", label: "Turn off non-essential instruments", description: "Protects equipment" },
        { id: "opt_ignore", label: "Ignore warning", description: "Keep instruments running" },
      ],
    });

    expect(ev.title).toBe("Solar Radiation Spike");
    expect(ev.choices).toHaveLength(2);
    expect(ev.choices[0].label).toContain("Turn off");
  });
});

describe("Cadet Experience — Earth Imagery (earth-imagery.ts)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to high-detail Earth enabled and allows toggling", () => {
    expect(isHighDetailEarthEnabled()).toBe(true);

    setHighDetailEarthEnabled(false);
    expect(isHighDetailEarthEnabled()).toBe(false);

    setHighDetailEarthEnabled(true);
    expect(isHighDetailEarthEnabled()).toBe(true);
  });
});
