import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSpacecraftCatalog,
  getDesignerPresets,
  evaluateDesign,
  reviewDesign,
} from "../api/client";
import type { SpacecraftDesign, LiveEngineeringMetrics, PreLaunchReviewReport } from "../types";

describe("Prompt 5 Spacecraft Designer & Pre-Launch Review Client Contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockDesign: SpacecraftDesign = {
    design_id: "wf_test_01",
    name: "Wildfire Test Scout",
    mission_id: "wildfire",
    launcher_id: "launcher_dedicated_light",
    orbit_id: "orbit_sso_650",
    instrument_ids: ["inst_thermal_infrared"],
    computer_id: "proc_dual_core_space",
    battery_id: "bat_li_ion_standard_2k",
    solar_id: "solar_deployable_flat_5m",
    thermal_id: "therm_heatpipe_radiator_2m",
    comms_id: "comm_xband_horn",
    storage_id: "stor_flash_array_256gb",
    shielding_id: "shield_standard_aluminum",
    chassis_dry_mass_kg: 100,
    fuel_mass_kg: 30,
  };

  it("fetches the 10-subsystem catalog via getSpacecraftCatalog", async () => {
    const mockCatalog = [
      {
        id: "launcher_dedicated_light",
        name: "Dedicated Light Launcher",
        subsystem: "launcher",
        category_label: "Launchers",
        description: "Small launch vehicle",
        mass_kg: 0,
        cost_credits: 2800,
        power_draw_w: 0,
        power_generation_w: 0,
        heat_contribution_w: 0,
        data_rate_kbps: 0,
        storage_capacity_mb: 0,
        battery_capacity_wh: 0,
        processing_mips: 0,
        heat_rejection_w: 0,
        performance_score: 1.0,
        reliability: 0.95,
        educational_notes: "Educational assumption on launcher mass margin",
        assumptions_and_units: "kg, credits",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCatalog,
    } as Response);

    const catalog = await getSpacecraftCatalog();
    expect(catalog).toHaveLength(1);
    expect(catalog[0].subsystem).toBe("launcher");
    expect(catalog[0].cost_credits).toBe(2800);
  });

  it("fetches viable preset builds via getDesignerPresets", async () => {
    const mockPresets = {
      wildfire: {
        agile_scout: mockDesign,
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPresets,
    } as Response);

    const presets = await getDesignerPresets();
    expect(presets.wildfire).toBeDefined();
    expect(presets.wildfire.agile_scout.name).toBe("Wildfire Test Scout");
  });

  it("calculates live engineering metrics via evaluateDesign", async () => {
    const mockMetrics: LiveEngineeringMetrics = {
      total_mass_kg: 289.5,
      launcher_capacity_kg: 600.0,
      mass_margin_kg: 310.5,
      mass_margin_pct: 51.7,
      total_cost_credits: 9800.0,
      contract_budget_credits: 10000.0,
      budget_remaining_credits: 200.0,
      budget_margin_pct: 2.0,
      power_generation_sunlight_w: 850.0,
      power_nominal_load_w: 215.0,
      power_peak_load_w: 290.2,
      net_power_sunlight_w: 635.0,
      battery_capacity_wh: 2200.0,
      eclipse_duration_minutes: 35.0,
      eclipse_energy_demand_wh: 125.4,
      eclipse_dod_pct: 5.7,
      eclipse_battery_reserve_pct: 94.3,
      heat_generated_w: 245.0,
      heat_rejected_w: 600.0,
      thermal_margin_pct: 144.9,
      data_generation_rate_kbps: 800.0,
      storage_capacity_mb: 256000.0,
      storage_hours_to_fill: 711.1,
      downlink_rate_kbps: 2200.0,
      downlink_per_pass_mb: 132.0,
      science_value_rating: 1.5,
      mission_suitability_pct: 100.0,
      reliability_rating: 85.0,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMetrics,
    } as Response);

    const metrics = await evaluateDesign(mockDesign, 10000);
    expect(metrics.total_mass_kg).toBe(289.5);
    expect(metrics.launcher_capacity_kg).toBe(600.0);
    expect(metrics.mission_suitability_pct).toBe(100.0);
  });

  it("performs 10-check review and returns launch readiness via reviewDesign", async () => {
    const mockReport: PreLaunchReviewReport = {
      design_name: "Wildfire Test Scout",
      mission_id: "wildfire",
      readiness: "FLIGHT_READY",
      can_launch: true,
      is_experimental: false,
      error_count: 0,
      warning_count: 0,
      pass_count: 10,
      checks: [
        {
          check_id: "launcher_payload_limit",
          category: "Mass & Structures",
          title: "Launcher Payload Mass Limit",
          status: "PASS",
          value_measured: "289.5 kg",
          threshold_required: "≤ 600.0 kg",
          explanation: "Within launcher limits",
        },
      ],
      active_risks: [],
      metrics: {
        total_mass_kg: 289.5,
        launcher_capacity_kg: 600.0,
        mass_margin_kg: 310.5,
        mass_margin_pct: 51.7,
        total_cost_credits: 9800.0,
        contract_budget_credits: 10000.0,
        budget_remaining_credits: 200.0,
        budget_margin_pct: 2.0,
        power_generation_sunlight_w: 850.0,
        power_nominal_load_w: 215.0,
        power_peak_load_w: 290.2,
        net_power_sunlight_w: 635.0,
        battery_capacity_wh: 2200.0,
        eclipse_duration_minutes: 35.0,
        eclipse_energy_demand_wh: 125.4,
        eclipse_dod_pct: 5.7,
        eclipse_battery_reserve_pct: 94.3,
        heat_generated_w: 245.0,
        heat_rejected_w: 600.0,
        thermal_margin_pct: 144.9,
        data_generation_rate_kbps: 800.0,
        storage_capacity_mb: 256000.0,
        storage_hours_to_fill: 711.1,
        downlink_rate_kbps: 2200.0,
        downlink_per_pass_mb: 132.0,
        science_value_rating: 1.5,
        mission_suitability_pct: 100.0,
        reliability_rating: 85.0,
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockReport,
    } as Response);

    const report = await reviewDesign(mockDesign, 10000);
    expect(report.readiness).toBe("FLIGHT_READY");
    expect(report.can_launch).toBe(true);
    expect(report.error_count).toBe(0);
    expect(report.checks).toHaveLength(1);
  });
});
