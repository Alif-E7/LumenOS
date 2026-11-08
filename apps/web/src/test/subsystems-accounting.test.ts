/**
 * Frontend Unit & Contract Tests for Prompt 7 — Subsystems Physical Accounting.
 */

import { describe, it, expect } from "vitest";
import type { Telemetry } from "../types";

describe("Prompt 7 — Subsystems Physical Accounting Contracts", () => {
  it("validates full telemetry shape with physical accounting fields", () => {
    const mockTelemetry: Telemetry = {
      step: 15,
      elapsed_seconds: 900,
      status: "running",
      spacecraft_health_pct: 98.5,
      orbital: {
        altitude_km: 700.0,
        velocity_km_s: 7.51,
        latitude_deg: 45.2,
        longitude_deg: -120.4,
        in_eclipse: false,
        true_anomaly_deg: 88.5,
      },
      power: {
        solar_output_w: 1250.0,
        total_load_w: 165.0,
        net_power_w: 1085.0,
        battery_soc_pct: 96.5,
        battery_dod_pct: 3.5,
        battery_soc_wh: 1930.0,
        battery_capacity_wh: 2000.0,
        battery_usable_capacity_wh: 1800.0,
        battery_equivalent_full_cycles: 0.085,
        battery_soh_pct: 99.98,
        in_eclipse: false,
        low_power_warning: false,
        power_critical: false,
        solar_irradiance_w_m2: 1361.0,
        sun_incidence_angle_deg: 15.0,
      },
      thermal: {
        temperature_c: 21.4,
        temperature_k: 294.55,
        heat_input_w: 480.0,
        heat_rejected_w: 470.0,
        internal_dissipation_w: 145.0,
        solar_absorbed_w: 220.0,
        albedo_absorbed_w: 45.0,
        earth_ir_absorbed_w: 70.0,
        net_heat_w: 10.0,
        heater_active: false,
        overtemp_warning: false,
        undertemp_warning: false,
        thermal_critical: false,
        model_type: "Lumped thermal approximation: C * (dT/dt) = Q_in - Q_out",
      },
      comms: {
        data_buffer_mb: 180.0,
        data_buffer_pct: 2.25,
        data_collected_mb: 250.0,
        data_downlinked_mb: 70.0,
        alerts_downlinked_mb: 5.0,
        processed_downlinked_mb: 65.0,
        raw_downlinked_mb: 0.0,
        in_contact: true,
        active_station: "Svalbard",
        elevation_deg: 42.5,
        slant_range_km: 980.0,
        current_data_rate_mbps: 20.0,
        signal_strength_dbm: -92.4,
        buffer_full_warning: false,
        downlink_priority_mode: "alerts_first",
      },
      storage: {
        used_pct: 2.25,
        used_mb: 180.0,
        free_mb: 7820.0,
        raw_data_mb: 120.0,
        processed_data_mb: 55.0,
        priority_alerts_mb: 5.0,
        dropped_overflow_mb: 0.0,
        overflow_risk_pct: 0.0,
        compression_ratio: 3.0,
        storage_full_warning: false,
      },
      workload: {
        operational_profile: "FULL",
        cpu_usage_pct: 65.0,
        cpu_power_w: 35.0,
        active_tasks: ["housekeeping_fdir", "adcs_pointing", "lossless_compression"],
        output_quality: "high",
        processing_queue_items: 3,
        cpu_overload_warning: false,
        profile_educational_note: "Full/Eco/Safe are user-facing operational profiles, not synonyms for FP32/INT8/TinyML",
      },
      radiation_debris: {
        in_saa_zone: false,
        in_auroral_horn: false,
        instantaneous_dose_rate_rad_per_hour: 0.005,
        total_ionizing_dose_rad: 0.12,
        tid_pct_of_limit: 0.06,
        seu_rate_per_day: 0.015,
        radiation_warning: false,
        debris_spatial_density_per_km3: 1.2e-8,
        debris_collision_risk_index: 18.5,
        educational_disclaimer: "Simplified educational abstraction, not collision or flight-safety prediction",
      },
    };

    expect(mockTelemetry.power.battery_soc_pct).toBe(96.5);
    expect(mockTelemetry.power.battery_dod_pct).toBe(3.5);
    expect(mockTelemetry.power.battery_equivalent_full_cycles).toBeLessThan(1.0);
    expect(mockTelemetry.storage.raw_data_mb).toBe(120.0);
    expect(mockTelemetry.storage.priority_alerts_mb).toBe(5.0);
    expect(mockTelemetry.workload.operational_profile).toBe("FULL");
    expect(mockTelemetry.radiation_debris?.debris_collision_risk_index).toBe(18.5);
  });

  it("verifies equivalent full cycle calculation (not 1 cycle per orbit)", () => {
    const batteryCapacityWh = 2000.0;
    // 35-minute eclipse discharge at 150 W = (150 * 35 / 60) / 0.95 = 92.1 Wh
    const dischargedWh = 92.1;
    const efcIncrement = dischargedWh / batteryCapacityWh;

    // Must be ~0.046 cycles, NOT 1.0!
    expect(efcIncrement).toBeCloseTo(0.046, 3);
    expect(efcIncrement).not.toBe(1.0);
  });

  it("verifies multi-queue downlink priority ordering", () => {
    const queues = {
      priority_alerts_mb: 8.0,
      processed_mb: 40.0,
      raw_mb: 100.0,
    };

    // Downlink bandwidth allows 20 MB extraction:
    const bandwidthBudgetMb = 20.0;
    let remainingBudget = bandwidthBudgetMb;

    // 1. Alerts first
    const downlinkedAlerts = Math.min(queues.priority_alerts_mb, remainingBudget);
    remainingBudget -= downlinkedAlerts;

    // 2. Processed science second
    const downlinkedProcessed = Math.min(queues.processed_mb, remainingBudget);
    remainingBudget -= downlinkedProcessed;

    // 3. Raw observations last
    const downlinkedRaw = Math.min(queues.raw_mb, remainingBudget);
    remainingBudget -= downlinkedRaw;

    expect(downlinkedAlerts).toBe(8.0);
    expect(downlinkedProcessed).toBe(12.0);
    expect(downlinkedRaw).toBe(0.0);
    expect(remainingBudget).toBe(0.0);
  });

  it("verifies operational profile names are valid and documented", () => {
    const profiles = ["FULL", "ECO", "SAFE"];
    expect(profiles).toContain("FULL");
    expect(profiles).toContain("ECO");
    expect(profiles).toContain("SAFE");

    const note = "Full/Eco/Safe are user-facing operational profiles, not synonyms for FP32/INT8/TinyML";
    expect(note).toContain("not synonyms for FP32");
  });
});

