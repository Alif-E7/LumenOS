import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as THREE from "three";
import {
  deriveOrbitalAIDataCenterState,
  computeConstellationRelayNodes,
} from "../lib/ai-datacenter";
import { createOrbitalAIDataCenterSatellite } from "../lib/orbital-ai-satellite";
import { GLOBAL_EARTH_EVENTS } from "../components/flight/UltraRealisticEarthFlight";
import { DirectorStation } from "../components/StationPanels";
import type { Telemetry, GameStateSummary } from "../types";

const mockTelemetry: Telemetry = {
  step: 14,
  elapsed_seconds: 840,
  status: "running",
  spacecraft_health_pct: 96.0,
  orbital: {
    altitude_km: 550.0,
    velocity_km_s: 7.58,
    latitude_deg: -33.7,
    longitude_deg: 150.3,
    in_eclipse: false,
    true_anomaly_deg: 65.0,
  },
  power: {
    solar_output_w: 450.0,
    total_load_w: 220.0,
    net_power_w: 230.0,
    battery_soc_pct: 88.0,
    in_eclipse: false,
    low_power_warning: false,
    power_critical: false,
  },
  thermal: {
    temperature_c: 29.5,
    heat_input_w: 240.0,
    heat_rejected_w: 235.0,
    overtemp_warning: false,
    undertemp_warning: false,
  },
  comms: {
    data_collected_mb: 320.0,
    data_downlinked_mb: 240.0,
    data_buffer_mb: 80.0,
    data_buffer_pct: 40.0,
    in_contact: true,
    active_station: "Svalbard",
    signal_strength_dbm: -75.0,
    buffer_full_warning: false,
  },
  workload: {
    cpu_usage_pct: 75.0,
    processing_queue_items: 2,
    cpu_overload_warning: false,
    operational_profile: "FULL",
  },
  storage: {
    used_pct: 40.0,
    used_mb: 80.0,
    free_mb: 120.0,
    storage_full_warning: false,
  },
};

const mockGameState: GameStateSummary = {
  session_id: "s_ai_test",
  mission_id: "wildfire",
  status: "running",
  step: 14,
  elapsed_seconds: 840,
  spacecraft_health_pct: 96.0,
  budget_remaining: 9200,
  data_collected_mb: 320,
  data_downlinked_mb: 240,
  active_event_count: 0,
  active_events: [],
  objectives_complete: 1,
  objectives_total: 3,
  objectives: [],
  current_score: 78,
  control_mode: "manual",
  outcome: null,
};

describe("Orbital AI Data Center & 4-Mission Phenomenology Engine", () => {
  it("computes 3-node Optical ISL Relay Constellation with valid orbital geometry", () => {
    const nodes = computeConstellationRelayNodes(840, -33.7, 150.3, 550);
    expect(nodes).toHaveLength(3);
    expect(nodes[0].name).toBe("LUMEN-RELAY-1");
    expect(nodes[1].name).toBe("LUMEN-RELAY-2");
    expect(nodes[2].name).toBe("LUMEN-RELAY-3");
    nodes.forEach((n) => {
      expect(n.latitudeDeg).toBeGreaterThanOrEqual(-90);
      expect(n.latitudeDeg).toBeLessThanOrEqual(90);
      expect(n.longitudeDeg).toBeGreaterThanOrEqual(-180);
      expect(n.longitudeDeg).toBeLessThanOrEqual(180);
      expect(n.distanceKm).toBeGreaterThan(0);
    });
  });

  it("derives distinct scientific phenomenology & AI pipelines for all 4 missions", () => {
    const wf = deriveOrbitalAIDataCenterState("wildfire", mockTelemetry, mockGameState);
    expect(wf.activePipelineName).toContain("FireNet-SWIR");
    expect(wf.metrics.some((m) => m.label.includes("Fire Radiative Power"))).toBe(true);
    expect(wf.activeTops).toBeCloseTo(18.0, 1);

    const fl = deriveOrbitalAIDataCenterState("flood", mockTelemetry, mockGameState);
    expect(fl.activePipelineName).toContain("HydroMask-SAR");
    expect(fl.compressionRatio).toBe(50);
    expect(fl.metrics.some((m) => m.label.includes("Inundated Basin Area"))).toBe(true);

    const vo = deriveOrbitalAIDataCenterState("volcano", mockTelemetry, mockGameState);
    expect(vo.activePipelineName).toContain("PlumeCast-UV/IR");
    expect(vo.metrics.some((m) => m.label.includes("SO₂ Column Density"))).toBe(true);

    const ss = deriveOrbitalAIDataCenterState("solar_storm", mockTelemetry, mockGameState);
    expect(ss.activePipelineName).toContain("HelioShield-MHD");
    expect(ss.metrics.some((m) => m.label.includes("Planetary Kp Index"))).toBe(true);
    expect(ss.edacSeuScrubbed).toBeGreaterThanOrEqual(1);
  });

  it("dispatches request_ai_prediction when Request AI Prediction button is clicked in DirectorStation", () => {
    const onAction = vi.fn();
    render(
      <DirectorStation
        telemetry={mockTelemetry}
        budgetRemaining={8000}
        budgetTotal={10000}
        onAction={onAction}
        enabled={true}
      />
    );

    const btn = screen.getByRole("button", { name: /request ai prediction \(100 cr\)/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledWith(
      "request_ai_prediction",
      { horizon_steps: 5 },
      "Request AI Predictive Forecast"
    );
  });

  it("provides interactive 3D crisis intercept targets across all 4 missions", () => {
    expect(GLOBAL_EARTH_EVENTS.length).toBeGreaterThanOrEqual(12);
    for (const mission of ["wildfire", "flood", "volcano", "solar_storm"] as const) {
      const matching = GLOBAL_EARTH_EVENTS.filter(
        (e) => e.scenarioId === mission || e.type === mission
      );
      expect(matching.length).toBeGreaterThanOrEqual(3);
      matching.forEach((ev) => {
        expect(ev.lat).toBeGreaterThanOrEqual(-90);
        expect(ev.lat).toBeLessThanOrEqual(90);
        expect(ev.lon).toBeGreaterThanOrEqual(-180);
        expect(ev.lon).toBeGreaterThanOrEqual(-180);
        expect(ev.lon).toBeLessThanOrEqual(180);
      });
    }
  });

  it("constructs modular OrbitalAIDataCenterSatellite with InstancedMesh hardware, 3-level LOD, and 5-stage deployment kinematics", () => {
    const sat = createOrbitalAIDataCenterSatellite({
      id: "test_scout_dc",
      name: "LUMEN-SCOUT-1",
      role: "flagship_datacenter",
      scale: 0.65,
      orbitRadius: 6.2,
      orbitalInclination: 0.85,
      orbitalSpeed: 0.002,
      radiatorConfig: { wingCount: 4, thermalLoadC: 28 },
      communicationRange: 10.0,
      autoDeployOnEnter: true,
    });

    // Verify 5 distinct engineering sub-assemblies
    expect(sat.computeModuleGroup.name).toBe("computeModule");
    expect(sat.solarAssemblyGroup.name).toBe("solarArrays");
    expect(sat.radiatorAssemblyGroup.name).toBe("thermalRadiators");
    expect(sat.commsAssemblyGroup.name).toBe("communicationSystems");
    expect(sat.propulsionGroup.name).toBe("propulsionAndHardware");

    // Verify 3-level LOD (High, Medium, Low silhouette)
    expect(sat.lod.levels).toHaveLength(3);

    // Verify InstancedMesh usage for server blades, LEDs, brackets, radiator cooling channels, and RCS nozzles
    let instancedMeshCount = 0;
    sat.highDetailGroup.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        instancedMeshCount += 1;
      }
    });
    expect(instancedMeshCount).toBeGreaterThanOrEqual(5);

    // Verify 5-stage mechanical deployment progression (Stage 1 -> Stage 5)
    expect(sat.getDeploymentStatus().stageIndex).toBe(1);
    expect(sat.getDeploymentStatus().isDeployed).toBe(false);

    sat.updateDeployment(1.2); // Advances to Stage 2 (Solar Arrays)
    expect(sat.getDeploymentStatus().stageIndex).toBe(2);

    sat.updateDeployment(1.2); // Advances to Stage 3 (Thermal Radiators)
    expect(sat.getDeploymentStatus().stageIndex).toBe(3);

    sat.updateDeployment(3.0); // Completes Stage 5 (Nominal Operation)
    expect(sat.getDeploymentStatus().isDeployed).toBe(true);
    expect(sat.getDeploymentStatus().stageIndex).toBe(5);

    // Verify Sun-tracking solar array orientation and thermal state update
    sat.updateOrbitalSystems(new THREE.Vector3(1, 0.2, 0.5).normalize(), 46.0);
    expect(sat.radiatorConfig.thermalLoadC).toBe(46.0);
  });
});
