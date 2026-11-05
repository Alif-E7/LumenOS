import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSimulationClock,
  pauseSimulationClock,
  resumeSimulationClock,
  setSimulationClockSpeed,
  fastForwardSimulation,
  getForecastTimeline,
  getGroundTrack,
  saveSimulationCheckpoint,
  restoreSimulationCheckpoint,
} from "../api/client";
import type { ClockState, TimelineEvent, GroundTrackPoint, CheckpointData } from "../types";

describe("Prompt 6 Simulation Clock, Timeline & Observation Geometry Client Contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockClock: ClockState = {
    status: "RUNNING",
    speed_multiplier: 1.0,
    time_step_seconds: 60.0,
    elapsed_seconds: 1200.0,
    step_count: 20,
    max_steps: 1440,
  };

  it("fetches simulation clock state via getSimulationClock", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: "ses_01", clock: mockClock }),
    } as Response);

    const res = await getSimulationClock("ses_01");
    expect(res.clock.status).toBe("RUNNING");
    expect(res.clock.speed_multiplier).toBe(1.0);
    expect(res.clock.step_count).toBe(20);
  });

  it("pauses and resumes clock via pauseSimulationClock and resumeSimulationClock", async () => {
    const pausedClock = { ...mockClock, status: "PAUSED" as const };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: "ses_01", status: "PAUSED", clock: pausedClock }),
    } as Response);

    const pauseRes = await pauseSimulationClock("ses_01");
    expect(pauseRes.clock.status).toBe("PAUSED");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: "ses_01", status: "RUNNING", clock: mockClock }),
    } as Response);

    const resumeRes = await resumeSimulationClock("ses_01");
    expect(resumeRes.clock.status).toBe("RUNNING");
  });

  it("sets speed multiplier via setSimulationClockSpeed", async () => {
    const fastClock = { ...mockClock, speed_multiplier: 10.0 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: "ses_01", clock: fastClock }),
    } as Response);

    const res = await setSimulationClockSpeed("ses_01", 10.0);
    expect(res.clock.speed_multiplier).toBe(10.0);
  });

  it("fast-forwards clock via fastForwardSimulation", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: "ses_01",
        result: { elapsed_seconds: 3600, step: 60, spacecraft_health_pct: 100 },
      }),
    } as Response);

    const res = await fastForwardSimulation("ses_01", { target_seconds: 3600 });
    expect(res.result.elapsed_seconds).toBe(3600);
    expect(res.result.step).toBe(60);
  });

  it("fetches forward timeline forecast via getForecastTimeline", async () => {
    const mockEvents: TimelineEvent[] = [
      {
        event_id: "sunset_1200",
        event_type: "SUNSET",
        timestamp_seconds: 1200,
        step: 20,
        label: "Sunset (Eclipse Ingress)",
        description: "Enters Earth shadow cone",
        is_forecast: true,
        forecast_confidence: 1.0,
      },
      {
        event_id: "gs_aos_svalbard_2400",
        event_type: "GROUND_STATION_AOS",
        timestamp_seconds: 2400,
        step: 40,
        label: "AOS Svalbard",
        description: "Ground station pass start",
        is_forecast: true,
        forecast_confidence: 1.0,
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: "ses_01",
        horizon_seconds: 28800,
        timeline_events: mockEvents,
      }),
    } as Response);

    const res = await getForecastTimeline("ses_01", 28800);
    expect(res.timeline_events).toHaveLength(2);
    expect(res.timeline_events[0].event_type).toBe("SUNSET");
    expect(res.timeline_events[1].label).toBe("AOS Svalbard");
  });

  it("fetches orbit ground track points via getGroundTrack", async () => {
    const mockPoints: GroundTrackPoint[] = [
      {
        timestamp_seconds: 0,
        latitude_deg: 0.0,
        longitude_deg: 10.0,
        altitude_km: 650.0,
        velocity_km_s: 7.53,
        in_eclipse: false,
        sunlight_fraction: 1.0,
        in_saa: false,
      },
      {
        timestamp_seconds: 60,
        latitude_deg: 3.8,
        longitude_deg: 9.8,
        altitude_km: 650.0,
        velocity_km_s: 7.53,
        in_eclipse: false,
        sunlight_fraction: 1.0,
        in_saa: false,
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: "ses_01",
        points: mockPoints,
      }),
    } as Response);

    const res = await getGroundTrack("ses_01", 50);
    expect(res.points).toHaveLength(2);
    expect(res.points[0].altitude_km).toBe(650.0);
    expect(res.points[1].latitude_deg).toBe(3.8);
  });

  it("saves and restores simulation checkpoints via saveSimulationCheckpoint and restoreSimulationCheckpoint", async () => {
    const mockCheckpoint: CheckpointData = {
      session_id: "ses_01",
      mission_id: "wildfire",
      sim_checkpoint: { step: 20, elapsed_seconds: 1200 },
      game_state: { step: 20, budget_remaining: 10000 },
      created_at: 1000000,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: "ses_01", checkpoint: mockCheckpoint }),
    } as Response);

    const saveRes = await saveSimulationCheckpoint("ses_01");
    expect(saveRes.checkpoint.sim_checkpoint.step).toBe(20);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: "ses_01",
        restored: true,
        clock: mockClock,
      }),
    } as Response);

    const restoreRes = await restoreSimulationCheckpoint("ses_01", mockCheckpoint);
    expect(restoreRes.restored).toBe(true);
    expect(restoreRes.clock.step_count).toBe(20);
  });
});
