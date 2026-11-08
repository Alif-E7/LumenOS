import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccessibleMissionMap } from "../components/AccessibleMissionMap";
import { CesiumMissionViewer } from "../components/CesiumMissionViewer";
import { MissionClockBar } from "../components/MissionClockBar";
import { ParticipantList } from "../components/ParticipantList";
import {
  calculateElevationAngleDeg,
  calculateFootprintRadiusKm,
  haversineDistanceKm,
  GROUND_STATIONS,
} from "../lib/mission-geometry";
import type { OrbitalTelemetry, CommsTelemetry, ClockState, ParticipantInfo } from "../types";

describe("Prompt 11 — Cesium 3D Mission View, Geometry & Accessible Fallback", () => {
  const mockOrbital: OrbitalTelemetry = {
    altitude_km: 550.0,
    velocity_km_s: 7.59,
    latitude_deg: -33.5,
    longitude_deg: 150.0,
    true_anomaly_deg: 120.0,
    in_eclipse: false,
  };

  const mockComms: CommsTelemetry = {
    in_contact: true,
    active_station: "Canberra",
    elevation_deg: 42.5,
    slant_range_km: 780.0,
    signal_strength_dbm: -85.0,
    current_data_rate_mbps: 15.0,
    data_buffer_mb: 240.0,
    data_buffer_pct: 3.0,
    data_collected_mb: 1800.0,
    data_downlinked_mb: 1560.0,
    buffer_full_warning: false,
  };

  const mockClock: ClockState = {
    status: "RUNNING",
    speed_multiplier: 1.0,
    time_step_seconds: 60.0,
    elapsed_seconds: 5400.0, // 1h 30m
    step_count: 90,
    max_steps: 1440,
  };

  it("calculates accurate orbital geometry: Haversine distance, footprint radius, and elevation angles", () => {
    // Distance from satellite nadir (-33.5, 150.0) to Canberra station (-35.4, 148.98)
    const canberra = GROUND_STATIONS.find((g) => g.id === "canberra")!;
    const distKm = haversineDistanceKm(-33.5, 150.0, canberra.latitude, canberra.longitude);
    expect(distKm).toBeGreaterThan(200);
    expect(distKm).toBeLessThan(300);

    // Footprint radius at 550 km altitude with 30 deg full FOV (half-angle 15 deg)
    const radiusKm = calculateFootprintRadiusKm(550.0, 30.0);
    expect(radiusKm).toBeCloseTo(550.0 * Math.tan((15.0 * Math.PI) / 180.0), 1);
    expect(radiusKm).toBeGreaterThan(140);
    expect(radiusKm).toBeLessThan(160);

    // Elevation angle from Canberra to nearby satellite
    const elDeg = calculateElevationAngleDeg(
      canberra.latitude,
      canberra.longitude,
      -33.5,
      150.0,
      550.0
    );
    expect(elDeg).toBeGreaterThan(40);
    expect(elDeg).toBeLessThan(75);
  });

  it("renders AccessibleMissionMap with SVG ground track, satellite reticle, and coordinates", () => {
    const trackPoints = [
      { latitude_deg: -30.0, longitude_deg: 148.0 },
      { latitude_deg: -33.5, longitude_deg: 150.0 },
      { latitude_deg: -37.0, longitude_deg: 152.0 },
    ];

    render(
      <AccessibleMissionMap
        orbital={mockOrbital}
        comms={mockComms}
        scenarioId="wildfire"
        groundTrackPoints={trackPoints}
      />
    );

    // Region heading & accessible label
    expect(screen.getByRole("region", { name: /2D Accessible Mission Map/i })).toBeInTheDocument();
    expect(screen.getByText(/2D Accessible Ground Track & Telemetry/i)).toBeInTheDocument();

    // Solar illumination status
    expect(screen.getByText(/Sunlit Orbit/i)).toBeInTheDocument();
    expect(screen.getByText(/Alt: 550.0 km/i)).toBeInTheDocument();

    // Satellite marker label
    expect(screen.getByText("LUMEN-1")).toBeInTheDocument();

    // Ground Station table contents
    expect(screen.getByRole("heading", { name: /Ground Station Network/i })).toBeInTheDocument();
    expect(screen.getAllByText("Svalbard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Canberra").length).toBeGreaterThan(0);
    expect(screen.getByText(/LINK ACTIVE/i)).toBeInTheDocument();

    // Scenario Observation Targets table
    expect(screen.getByText(/Observation Targets & Swath Geometry/i)).toBeInTheDocument();
    expect(screen.getAllByText("Fire").length).toBeGreaterThan(0);
  });

  it("handles eclipse (umbra) state gracefully in AccessibleMissionMap", () => {
    const eclipseOrbital = { ...mockOrbital, in_eclipse: true, sunlight_fraction: 0.0 };
    render(<AccessibleMissionMap orbital={eclipseOrbital} />);
    expect(screen.getByText(/In Eclipse \(Umbra\)/i)).toBeInTheDocument();
  });

  it("CesiumMissionViewer gracefully falls back to AccessibleMissionMap when WebGL is unavailable or forced", () => {
    render(
      <CesiumMissionViewer
        orbital={mockOrbital}
        comms={mockComms}
        clock={mockClock}
        forceFallback={true}
      />
    );

    // When WebGL is unavailable in jsdom/test or forced, AccessibleMissionMap renders cleanly
    expect(screen.getByRole("region", { name: /2D Accessible Mission Map/i })).toBeInTheDocument();
    expect(screen.getByText(/2D Accessible Ground Track & Telemetry/i)).toBeInTheDocument();
  });

  it("MissionClockBar synchronizes time, displays formatted MET, and fires control callbacks", () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onSetSpeed = vi.fn();
    const onStep = vi.fn();
    const onFastForward = vi.fn();
    const onSaveCheckpoint = vi.fn();
    const onRestoreCheckpoint = vi.fn();

    const { rerender } = render(
      <MissionClockBar
        clock={mockClock}
        onPause={onPause}
        onResume={onResume}
        onSetSpeed={onSetSpeed}
        onStep={onStep}
        onFastForward={onFastForward}
        onSaveCheckpoint={onSaveCheckpoint}
        onRestoreCheckpoint={onRestoreCheckpoint}
      />
    );

    // Formatted MET: 5400s -> T+01:30:00
    expect(screen.getByText("T+01:30:00")).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();

    // Pause toggle
    const pauseBtn = screen.getByRole("button", { name: /❚❚ Pause/i });
    fireEvent.click(pauseBtn);
    expect(onPause).toHaveBeenCalledTimes(1);

    // Step forward +1m and +5m
    const step1Btn = screen.getByRole("button", { name: /\+1m/i });
    fireEvent.click(step1Btn);
    expect(onStep).toHaveBeenCalledWith(1);

    const step5Btn = screen.getByRole("button", { name: /\+5m/i });
    fireEvent.click(step5Btn);
    expect(onStep).toHaveBeenCalledWith(5);

    // Speed multiplier buttons
    const speed5Btn = screen.getByRole("button", { name: "5x" });
    fireEvent.click(speed5Btn);
    expect(onSetSpeed).toHaveBeenCalledWith(5);

    // Event jump button
    const jumpBtn = screen.getByRole("button", { name: /Jump ⏭/i });
    fireEvent.click(jumpBtn);
    expect(onFastForward).toHaveBeenCalledWith({ event_type: "SUNSET" });

    // Checkpoint save and restore
    const saveBtn = screen.getByRole("button", { name: /💾 Save/i });
    fireEvent.click(saveBtn);
    expect(onSaveCheckpoint).toHaveBeenCalledTimes(1);

    const restoreBtn = screen.getByRole("button", { name: /↺ Restore/i });
    fireEvent.click(restoreBtn);
    expect(onRestoreCheckpoint).toHaveBeenCalledTimes(1);

    // Test paused clock status
    const pausedClock: ClockState = { ...mockClock, status: "PAUSED" };
    rerender(
      <MissionClockBar
        clock={pausedClock}
        onPause={onPause}
        onResume={onResume}
      />
    );
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    const resumeBtn = screen.getByRole("button", { name: /▶ Resume/i });
    fireEvent.click(resumeBtn);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("ParticipantList renders crew roles, connection pulses, pending authorizations and command audit feed", () => {
    const participants: ParticipantInfo[] = [
      {
        player_id: "player_host",
        display_name: "Commander Shepard",
        is_host: true,
        ready: true,
        connected: true,
      },
      {
        player_id: "player_eng",
        display_name: "Kaylee Frye",
        is_host: false,
        ready: true,
        connected: true,
      },
    ];

    const roles = {
      player_host: ["mission_director"],
      player_eng: ["systems_engineer"],
    };

    const pendingRequests = [
      {
        id: "req_01",
        requesterId: "player_eng",
        requesterName: "Kaylee Frye",
        role: "systems_engineer" as const,
        actionType: "fire_thruster",
        description: "Requesting prograde burn +2.0 m/s (costs 200 cr)",
        timestamp: "12:00:15",
      },
    ];

    const recentActions = [
      {
        actor: "Kaylee Frye",
        role: "systems_engineer",
        actionType: "Power mode: Safe Survival",
        timestamp: "11:58:30",
        result: "ACCEPTED" as const,
      },
    ];

    const onApprove = vi.fn();
    const onReject = vi.fn();

    render(
      <ParticipantList
        participants={participants}
        selfId="player_host"
        roles={roles}
        pendingRequests={pendingRequests}
        recentActions={recentActions}
        canApprove={true}
        onApproveRequest={onApprove}
        onRejectRequest={onReject}
      />
    );

    // Displays participant names and self indicator
    expect(screen.getByText(/Commander Shepard/i)).toBeInTheDocument();
    expect(screen.getByText(/\(you\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Kaylee Frye/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Host")).toBeInTheDocument();

    // Assigned roles
    expect(screen.getByText("Mission Director")).toBeInTheDocument();
    expect(screen.getAllByText("Systems Engineer").length).toBeGreaterThan(0);

    // Pending action request and authorization buttons
    expect(screen.getByText(/Pending Action Authorizations/i)).toBeInTheDocument();
    expect(screen.getByText(/Requesting prograde burn/i)).toBeInTheDocument();
    const approveBtn = screen.getByRole("button", { name: /Approve/i });
    fireEvent.click(approveBtn);
    expect(onApprove).toHaveBeenCalledWith("req_01");

    // Command audit feed
    expect(screen.getByText(/Command Audit Feed/i)).toBeInTheDocument();
    expect(screen.getByText(/Power mode: Safe Survival/i)).toBeInTheDocument();
    expect(screen.getByText("ACCEPTED")).toBeInTheDocument();
  });
});
