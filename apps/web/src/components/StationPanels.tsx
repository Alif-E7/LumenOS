/**
 * Station panels — the four role-specific control stations.
 *
 * Each panel is tailored to its role's permission matrix and telemetry needs:
 * - Systems Engineer: Power/Solar, Battery SoC & DoD & EFC cycles, Lumped Thermal balance,
 *   Survival heaters, and Flight Computer Workload Profiles (FULL / ECO / SAFE).
 * - Science Officer: Multi-queue Solid-State Storage (Raw, Processed, Priority Alerts),
 *   Ground Station RF Link, Elevation geometry, and Priority Downlink.
 * - Flight Controller: Orbital ephemeris, Thruster burns, Attitude modes,
 *   Radiation dose (TID / SAA / Auroras), and Multi-factor Debris encounter risk.
 * - Mission Director: Budget allocation, Objective priorities, and Mission health.
 *
 * The backend remains authoritative — every button posts an action with server validation.
 */

import { useState } from "react";
import type { Telemetry } from "../types";
import { Button } from "./Button";
import { BudgetMeter } from "./BudgetMeter";
import { ResourceMeter } from "./ResourceMeter";
import { Slider } from "./Slider";
import { Selector } from "./Selector";
import { StatusBadge } from "./StatusBadge";
import { Tooltip } from "./Tooltip";
import { ROLES, type RoleId } from "../lib/constants";

export interface StationProps {
  telemetry: Telemetry | null;
  budgetRemaining: number;
  budgetTotal: number;
  /** POST an action to the game session (solo REST or co-op WS). */
  onAction: (actionType: string, params: Record<string, unknown>, label: string) => void;
  /** Whether station input is currently accepted. */
  enabled: boolean;
  className?: string;
}

export type StationId = RoleId;

/** Ordered station registry used by the All-Stations tab set. */
export const STATION_ORDER: StationId[] = [
  "mission_director",
  "systems_engineer",
  "science_officer",
  "flight_controller",
];

// ── Mission Director ────────────────────────────────────────────────────────

export function DirectorStation({ telemetry, budgetRemaining, budgetTotal, onAction, enabled, className }: StationProps) {
  return (
 <div className={`space-y-4 ${className ?? ""}`}>
 <p className="text-sm text-muted">{ROLES.mission_director.description}</p>

 <BudgetMeter remaining={budgetRemaining} total={budgetTotal} />

 <div className="rounded-none border border-edge bg-panel/60 p-4 backdrop-blur-sm">
 <h4 className="text-sm font-semibold text-ink mb-2">Objective Priority</h4>
 <p className="text-xs text-muted mb-3">
          Rank what the crew optimizes for. Re-ranking is logged with the mission director.
 </p>
 <Selector
          label="Lead objective"
          value="primary"
          disabled={!enabled}
          options={[
            { value: "primary", label: "Primary objectives first (default)" },
            { value: "data", label: "Maximize science data" },
            { value: "health", label: "Preserve spacecraft health" },
            { value: "budget", label: "Conserve budget" },
          ]}
          onChange={(v) => onAction("set_priority", { objective_id: v }, "Set objective priority")}
        />
 </div>

 <div className="rounded-none border border-edge bg-panel/60 p-4 backdrop-blur-sm">
 <div className="flex items-center justify-between mb-2">
 <h4 className="text-sm font-semibold text-ink">LumenOS Orbital AI Consultation</h4>
 <Tooltip content="Executes a 5-step numerical ODE lookahead across thermal, battery SoC, and SSDR queues via the onboard Neural Compute Rack.">
 <span className="text-accent-hi cursor-help" aria-label="AI consultation info">ⓘ</span>
 </Tooltip>
 </div>
 <p className="text-xs text-muted mb-3">
          Request a 5-minute forward ODE flight risk forecast and autonomous mitigation recommendations from the onboard LumenOS Predictive Scheduler (costs 100 cr).
 </p>
 <Button
          size="sm"
          variant="secondary"
          disabled={!enabled || budgetRemaining < 100}
          onClick={() =>
            onAction(
              "request_ai_prediction",
              { horizon_steps: 5 },
              "Request AI Predictive Forecast"
            )
          }
 >
          Request AI Prediction (100 cr)
 </Button>
 </div>

      {telemetry && (
 <div className="rounded-none border border-edge bg-panel/60 p-4 backdrop-blur-sm">
 <h4 className="text-sm font-semibold text-ink mb-3">Director's Overview</h4>
 <div className="space-y-3">
 <ResourceMeter label="Spacecraft health" value={telemetry.spacecraft_health_pct} max={100} unit="%" />
 <ResourceMeter label="Data collected" value={telemetry.comms.data_collected_mb} max={Math.max(500, telemetry.comms.data_collected_mb)} unit="MB" decimals={1} />
 <ResourceMeter label="Data downlinked" value={telemetry.comms.data_downlinked_mb} max={Math.max(500, telemetry.comms.data_downlinked_mb)} unit="MB" decimals={1} />
 </div>
 </div>
 )}
 </div>
 );
}

// ── Systems Engineer ────────────────────────────────────────────────────────

export function SystemsStation({ telemetry, budgetRemaining, onAction, enabled, className }: StationProps) {
  const [radiatorDelta, setRadiatorDelta] = useState(0);

  const power = telemetry?.power;
  const thermal = telemetry?.thermal;
  const workload = telemetry?.workload;

  const currentProfile = workload?.operational_profile ?? "FULL";

  return (
 <div className={`space-y-5 ${className ?? ""}`}>
 <p className="text-sm text-muted">{ROLES.systems_engineer.description}</p>

      {/* ── Subsystem Quick Telemetry Bar ── */}
      {telemetry ? (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
 <div className="rounded-none border border-ok/30 bg-ok/10 p-3">
 <div className="flex justify-between items-baseline mb-1">
 <span className="text-[11px] font-medium uppercase tracking-wider text-ok">Battery SoC</span>
 <span className="text-xs font-mono font-semibold text-ok">{power?.battery_soc_pct.toFixed(1)}%</span>
 </div>
 <div className="w-full bg-raised rounded-full h-1.5 overflow-hidden">
 <div
                className={`h-full transition-all duration-300 ${
                  (power?.battery_soc_pct ?? 100) < 20 ? "bg-crit" : (power?.battery_soc_pct ?? 100) < 35 ? "bg-warn" : "bg-ok"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, power?.battery_soc_pct ?? 0))}%` }}
              />
 </div>
 <p className="text-[10px] text-muted mt-1">DoD: {power?.battery_dod_pct?.toFixed(1) ?? "0.0"}%</p>
 </div>

 <div className="rounded-none border border-crit/30 bg-crit/10/20 p-3">
 <div className="flex justify-between items-baseline mb-1">
 <span className="text-[11px] font-medium uppercase tracking-wider text-crit">Bus Temp</span>
 <span className="text-xs font-mono font-semibold text-crit">{thermal?.temperature_c.toFixed(1)} °C</span>
 </div>
 <p className="text-[10px] text-muted">Net Heat: {(thermal?.net_heat_w ?? 0) > 0 ? "+" : ""}{thermal?.net_heat_w?.toFixed(1) ?? "0.0"} W</p>
 </div>

 <div className="rounded-none border border-warn/30 bg-warn/10 p-3">
 <div className="flex justify-between items-baseline mb-1">
 <span className="text-[11px] font-medium uppercase tracking-wider text-warn">Solar Gen</span>
 <span className="text-xs font-mono font-semibold text-warn">{power?.solar_output_w.toFixed(0)} W</span>
 </div>
 <p className="text-[10px] text-muted">{power?.in_eclipse ? "In Earth Shadow" : "Sunlit Arrays"}</p>
 </div>

 <div className="rounded-none border border-accent/30 bg-accent/10 p-3">
 <div className="flex justify-between items-baseline mb-1">
 <span className="text-[11px] font-medium uppercase tracking-wider text-accent">CPU Workload</span>
 <span className="text-xs font-mono font-semibold text-accent-hi">{workload?.cpu_usage_pct.toFixed(0)}%</span>
 </div>
 <p className="text-[10px] text-muted">Profile: <span className="font-semibold text-accent-hi">{currentProfile}</span></p>
 </div>
 </div>
 ) : (
 <p className="text-sm text-faint">Telemetry available after the first simulation step.</p>
 )}

      {/* ── Power & Physical Battery Accounting ── */}
 <div className="rounded-none border border-warn/20 bg-panel/60 p-4 backdrop-blur-sm space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="inline-block w-2.5 h-2.5 rounded-full bg-warn animate-pulse" />
 <h4 className="text-sm font-semibold text-warn">Electrical Power & Battery Accounting</h4>
 </div>
 <span className="text-[11px] font-mono text-muted">
            Net: {(power?.net_power_w ?? 0) >= 0 ? "+" : ""}{power?.net_power_w?.toFixed(1) ?? "0.0"} W
 </span>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
 <div className="bg-void/50 p-2.5 rounded-none border border-edge/80">
 <span className="text-[10px] text-faint block uppercase">SoC Energy</span>
 <span className="text-ink font-semibold">{power?.battery_soc_wh?.toFixed(0) ?? "2000"} Wh</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge/80">
 <span className="text-[10px] text-faint block uppercase">Usable Reserve</span>
 <span className="text-ink font-semibold">{power?.battery_usable_capacity_wh?.toFixed(0) ?? "1800"} Wh</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge/80">
 <div className="flex items-center gap-1">
 <span className="text-[10px] text-faint block uppercase">Equiv Full Cycles</span>
 <Tooltip content="Equivalent Full Cycles (EFC) tracks cumulative discharge throughput / capacity. Does not count each orbit as 1 full cycle.">
 <span className="text-[10px] text-muted cursor-help">ⓘ</span>
 </Tooltip>
 </div>
 <span className="text-ok font-semibold">{power?.battery_equivalent_full_cycles?.toFixed(3) ?? "0.000"}</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge/80">
 <span className="text-[10px] text-faint block uppercase">Battery SOH</span>
 <span className="text-ok font-semibold">{power?.battery_soh_pct?.toFixed(2) ?? "100.00"}%</span>
 </div>
 </div>

        {/* Power Mode & Operational Profile Controls */}
 <div className="pt-2">
 <div className="flex items-center justify-between mb-1.5">
 <h5 className="text-xs font-medium text-ink">Power Mode</h5>
 <span className="text-[10px] text-faint italic">User-facing profile, not an ML precision alias</span>
 </div>
 <div className="grid grid-cols-3 gap-2">
            {[
              { id: "FULL", label: "Normal", desc: "Max science (35 W)", mode: "normal" },
              { id: "ECO", label: "Low-Power Shed", desc: "Eco saving (15 W)", mode: "low_power" },
              { id: "SAFE", label: "Safe Survival", desc: "Minimal bus (5 W)", mode: "safe" },
            ].map((p) => {
              const active = currentProfile === p.id;
              return (
 <button
                  key={p.id}
                  type="button"
                  disabled={!enabled}
                  onClick={() => onAction("set_power_mode", { mode: p.mode }, `Power mode: ${p.label}`)}
                  className={`p-2.5 rounded-none border text-left transition-all ${
                    active
                      ? "border-accent bg-accent/10 text-accent-hi ring-1 ring-accent/50"
                      : "border-edge bg-void/40 text-muted hover:border-edge-strong hover:text-ink"
                  }`}
 >
 <p className="font-semibold text-xs">{p.label}</p>
 <p className="text-[10px] text-faint">{p.desc}</p>
 </button>
 );
            })}
 </div>
 </div>

        {/* Payload Power Toggle */}
 <div className="pt-1 flex items-center justify-between bg-void/40 p-2.5 rounded-none border border-edge">
 <div>
 <span className="text-xs font-medium text-ink">Payload Instrument Power</span>
 <p className="text-[10px] text-faint">Toggle primary sensor draw (80 W) to conserve battery during eclipse</p>
 </div>
 <div className="flex gap-1.5">
 <Button
              size="sm"
              variant="secondary"
              disabled={!enabled}
              onClick={() => onAction("toggle_subsystem", { active: true }, "Payload ON")}
 >
              ON
 </Button>
 <Button
              size="sm"
              variant="secondary"
              disabled={!enabled}
              onClick={() => onAction("toggle_subsystem", { active: false }, "Payload OFF")}
 >
              OFF
 </Button>
 </div>
 </div>
 </div>

      {/* ── Lumped Thermal Subsystem ── */}
 <div className="rounded-none border border-crit/20 bg-panel/60 p-4 backdrop-blur-sm space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="inline-block w-2.5 h-2.5 rounded-full bg-crit animate-pulse" />
 <h4 className="text-sm font-semibold text-crit">Thermal Subsystem (Lumped Approximation)</h4>
 </div>
 <span className="text-[10px] px-2 py-0.5 rounded-none bg-crit/10 text-crit font-mono border border-crit/30/40">
            C · dT/dt = Qin − Qout
 </span>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
 <div className="bg-void/50 p-2.5 rounded-none border border-edge/80">
 <span className="text-[10px] text-faint block uppercase">Internal Heat</span>
 <span className="text-crit font-semibold">{thermal?.internal_dissipation_w?.toFixed(1) ?? "0.0"} W</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge/80">
 <span className="text-[10px] text-faint block uppercase">Solar + Albedo</span>
 <span className="text-warn font-semibold">{((thermal?.solar_absorbed_w ?? 0) + (thermal?.albedo_absorbed_w ?? 0)).toFixed(1)} W</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge/80">
 <span className="text-[10px] text-faint block uppercase">Radiated Out</span>
 <span className="text-info font-semibold">{thermal?.heat_rejected_w?.toFixed(1) ?? "0.0"} W</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge/80">
 <span className="text-[10px] text-faint block uppercase">Heater State</span>
 <span className={`font-semibold ${thermal?.heater_active ? "text-warn" : "text-muted"}`}>
              {thermal?.heater_active ? "Active (Firing)" : "Standby (Off)"}
 </span>
 </div>
 </div>

        {/* Radiator Adjustment Slider */}
 <div className="pt-2">
 <div className="flex items-center justify-between mb-1">
 <h5 className="text-xs font-medium text-ink">Radiator Trim (Rejection Capacity)</h5>
 <span className="text-[10px] text-muted">Costs 50 cr per trim</span>
 </div>
 <Slider
            label="Radiator delta"
            value={radiatorDelta}
            min={-4}
            max={4}
            step={0.5}
            unit="m²"
            onChange={setRadiatorDelta}
            disabled={!enabled}
          />
 <Button
            size="sm"
            className="mt-2.5"
            disabled={!enabled || radiatorDelta === 0 || budgetRemaining < 50}
            onClick={() => {
              onAction("adjust_thermal", { delta_m2: radiatorDelta }, `Radiator ${radiatorDelta > 0 ? "+" : ""}${radiatorDelta} m²`);
              setRadiatorDelta(0);
            }}
 >
            Apply Radiator Trim (50 cr)
 </Button>
 </div>
 </div>
 </div>
 );
}

// ── Science Officer ─────────────────────────────────────────────────────────

export function ScienceStation({ telemetry, onAction, enabled, className }: StationProps) {
  const comms = telemetry?.comms;
  const storage = telemetry?.storage;

  const rawMb = storage?.raw_data_mb ?? 0;
  const procMb = storage?.processed_data_mb ?? 0;
  const alertMb = storage?.priority_alerts_mb ?? 0;
  const freeMb = storage?.free_mb ?? 8000;
  const totalMb = (storage?.used_mb ?? 0) + freeMb;

  const rawPct = (rawMb / totalMb) * 100;
  const procPct = (procMb / totalMb) * 100;
  const alertPct = (alertMb / totalMb) * 100;

  return (
 <div className={`space-y-5 ${className ?? ""}`}>
 <p className="text-sm text-muted">{ROLES.science_officer.description}</p>

      {/* ── Multi-Queue Storage Breakdown Card ── */}
 <div className="rounded-none border border-violet-500/20 bg-panel/60 p-4 backdrop-blur-sm space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-400 animate-pulse" />
 <h4 className="text-sm font-semibold text-violet-200">Onboard Solid-State Storage (SSDR)</h4>
 </div>
 <span className="text-xs font-mono text-muted">
            {storage?.used_mb.toFixed(1) ?? "0.0"} / {totalMb.toFixed(0)} MB ({storage?.used_pct.toFixed(1) ?? "0.0"}%)
 </span>
 </div>

        {/* Visual Segmented Storage Bar */}
 <div className="w-full h-3 rounded-full bg-raised overflow-hidden flex shadow-inner">
 <div
            title={`Priority Alerts: ${alertMb.toFixed(1)} MB`}
            style={{ width: `${alertPct}%` }}
            className="h-full bg-crit transition-all duration-300"
          />
 <div
            title={`Processed Science: ${procMb.toFixed(1)} MB`}
            style={{ width: `${procPct}%` }}
            className="h-full bg-violet-500 transition-all duration-300"
          />
 <div
            title={`Raw Observations: ${rawMb.toFixed(1)} MB`}
            style={{ width: `${rawPct}%` }}
            className="h-full bg-warn transition-all duration-300"
          />
 </div>

        {/* Legend & Queue Meters */}
 <div className="grid grid-cols-3 gap-2 text-xs font-mono">
 <div className="bg-void/50 p-2.5 rounded-none border border-crit/25">
 <div className="flex items-center gap-1.5 mb-1">
 <span className="w-2 h-2 rounded-full bg-crit inline-block" />
 <span className="text-[10px] uppercase text-crit">Priority Alerts</span>
 </div>
 <span className="font-semibold text-ink">{alertMb.toFixed(1)} MB</span>
 </div>

 <div className="bg-void/50 p-2.5 rounded-none border border-violet-950/40">
 <div className="flex items-center gap-1.5 mb-1">
 <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
 <span className="text-[10px] uppercase text-violet-300">Processed Science</span>
 </div>
 <span className="font-semibold text-ink">{procMb.toFixed(1)} MB</span>
 </div>

 <div className="bg-void/50 p-2.5 rounded-none border border-warn/25">
 <div className="flex items-center gap-1.5 mb-1">
 <span className="w-2 h-2 rounded-full bg-warn inline-block" />
 <span className="text-[10px] uppercase text-warn">Raw Sensor Data</span>
 </div>
 <span className="font-semibold text-ink">{rawMb.toFixed(1)} MB</span>
 </div>
 </div>

 <div className="flex items-center justify-between text-xs text-muted pt-1">
 <span>Compression Ratio: <strong className="text-violet-300 font-mono">{storage?.compression_ratio?.toFixed(1) ?? "2.5"}:1</strong></span>
 <span>Overflow Risk: <strong className={`font-mono ${(storage?.overflow_risk_pct ?? 0) > 25 ? "text-crit" : "text-ok"}`}>{storage?.overflow_risk_pct?.toFixed(1) ?? "0.0"}%</strong></span>
 </div>
 </div>

      {/* ── Ground Station RF Link & Priority Downlink Card ── */}
 <div className="rounded-none border border-info/20 bg-panel/60 p-4 backdrop-blur-sm space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className={`inline-block w-2.5 h-2.5 rounded-full ${comms?.in_contact ? "bg-info animate-ping" : "bg-edge-strong"}`} />
 <h4 className="text-sm font-semibold text-info">Ground Contact & RF Downlink</h4>
 </div>
 <StatusBadge
            label={comms?.in_contact ? `Active Contact — ${comms.active_station}` : "No Ground Contact"}
            variant={comms?.in_contact ? "success" : "neutral"}
          />
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
 <div className="bg-void/50 p-2.5 rounded-none border border-edge">
 <span className="text-[10px] text-faint block uppercase">Elevation</span>
 <span className="text-info font-semibold">{comms?.elevation_deg?.toFixed(1) ?? "--"}°</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge">
 <span className="text-[10px] text-faint block uppercase">Slant Range</span>
 <span className="text-info font-semibold">{comms?.slant_range_km?.toFixed(0) ?? "--"} km</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge">
 <span className="text-[10px] text-faint block uppercase">Data Rate</span>
 <span className="text-info font-semibold">{comms?.current_data_rate_mbps?.toFixed(1) ?? "0.0"} Mbps</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge">
 <span className="text-[10px] text-faint block uppercase">Downlinked</span>
 <span className="text-ok font-semibold">{comms?.data_downlinked_mb?.toFixed(1) ?? "0.0"} MB</span>
 </div>
 </div>

 <div className="flex items-center justify-between pt-2">
 <div className="text-xs text-muted">
            Priority Queue: <span className="text-info font-semibold">Alerts ➔ Processed Products ➔ Raw</span>
 </div>
 <Button
            size="sm"
            disabled={!enabled || (comms != null && !comms.in_contact)}
            onClick={() => onAction("downlink_data", { data_mb: comms?.data_buffer_mb ?? 0 }, "Downlink buffer to ground")}
 >
            Downlink Buffer (50 cr)
 </Button>
 </div>
 </div>
 </div>
 );
}

// ── Flight Controller ───────────────────────────────────────────────────────

export function FlightStation({ telemetry, budgetRemaining, onAction, enabled, className }: StationProps) {
  const [deltaV, setDeltaV] = useState(1);
  const orbital = telemetry?.orbital;
  const radDebris = telemetry?.radiation_debris;

  return (
 <div className={`space-y-5 ${className ?? ""}`}>
 <p className="text-sm text-muted">{ROLES.flight_controller.description}</p>

      {/* Orbital Ephemeris HUD */}
      {orbital && (
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-sm">
 <div className="rounded-none border border-edge bg-panel/60 p-3 backdrop-blur-sm">
 <p className="text-[10px] uppercase text-faint tracking-wider">Altitude</p>
 <p className="text-ink font-semibold">{orbital.altitude_km.toFixed(1)} km</p>
 </div>
 <div className="rounded-none border border-edge bg-panel/60 p-3 backdrop-blur-sm">
 <p className="text-[10px] uppercase text-faint tracking-wider">Velocity</p>
 <p className="text-ink font-semibold">{orbital.velocity_km_s.toFixed(2)} km/s</p>
 </div>
 <div className="rounded-none border border-edge bg-panel/60 p-3 backdrop-blur-sm">
 <p className="text-[10px] uppercase text-faint tracking-wider">Sub-Sat Lat/Lon</p>
 <p className="text-ink font-semibold">{orbital.latitude_deg.toFixed(1)}°, {orbital.longitude_deg.toFixed(1)}°</p>
 </div>
 <div className="rounded-none border border-edge bg-panel/60 p-3 backdrop-blur-sm">
 <p className="text-[10px] uppercase text-faint tracking-wider">Illumination</p>
 <p className={`font-semibold ${orbital.in_eclipse ? "text-info" : "text-warn"}`}>
              {orbital.in_eclipse ? "Eclipse (Umbra)" : "Sunlit"}
 </p>
 </div>
 </div>
 )}

      {/* ── Radiation & Orbital Debris Environmental Accounting ── */}
 <div className="rounded-none border border-yellow-500/20 bg-panel/60 p-4 backdrop-blur-sm space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />
 <h4 className="text-sm font-semibold text-yellow-200">Space Radiation & Debris Risk Accounting</h4>
 </div>
 <div className="flex items-center gap-2">
            {radDebris?.in_saa_zone && (
 <span className="px-2 py-0.5 rounded-none text-[10px] font-mono bg-crit/10/80 text-crit border border-crit/40">
                SAA Zone
 </span>
 )}
            {radDebris?.in_auroral_horn && (
 <span className="px-2 py-0.5 rounded-none text-[10px] font-mono bg-raised/80 text-muted border border-edge-strong">
                Auroral Horn
 </span>
 )}
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
 <div className="bg-void/50 p-2.5 rounded-none border border-edge">
 <span className="text-[10px] text-faint block uppercase">Total Ionizing Dose</span>
 <span className="text-ink font-semibold">{radDebris?.total_ionizing_dose_rad.toFixed(2) ?? "0.00"} rad</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge">
 <span className="text-[10px] text-faint block uppercase">TID Tolerance Used</span>
 <span className="text-ink font-semibold">{radDebris?.tid_pct_of_limit.toFixed(2) ?? "0.00"}%</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge">
 <span className="text-[10px] text-faint block uppercase">SEU Rate</span>
 <span className="text-ink font-semibold">{radDebris?.seu_rate_per_day.toFixed(3) ?? "0.015"}/day</span>
 </div>
 <div className="bg-void/50 p-2.5 rounded-none border border-edge">
 <span className="text-[10px] text-faint block uppercase">Debris Risk Index</span>
 <span className="text-warn font-semibold">{radDebris?.debris_collision_risk_index.toFixed(1) ?? "12.5"} / 100</span>
 </div>
 </div>

 <p className="text-[10px] text-faint italic">
          Educational abstraction incorporating altitude shell flux, inclination crossing angles, and Whipple bumper shielding.
 </p>
 </div>

      {/* Thruster Burn Controls */}
 <div className="rounded-none border border-edge bg-panel/60 p-4 backdrop-blur-sm space-y-3">
 <h4 className="text-sm font-semibold text-ink">Thruster Burn</h4>
 <p className="text-xs text-muted">
          Prograde burn raises orbit altitude; retrograde lowers it. Costs 200 cr per burn.
 </p>
 <Slider label="Delta-v" value={deltaV} min={0.5} max={10} step={0.5} unit="m/s" onChange={setDeltaV} disabled={!enabled} />
 <div className="grid grid-cols-2 gap-2 pt-1">
 <Button
            size="sm"
            disabled={!enabled || budgetRemaining < 200}
            onClick={() => onAction("fire_thruster", { delta_v_ms: deltaV, direction: "prograde" }, `Prograde burn ${deltaV} m/s`)}
 >
            ▲ Prograde Burn (200 cr)
 </Button>
 <Button
            size="sm"
            disabled={!enabled || budgetRemaining < 200}
            onClick={() => onAction("fire_thruster", { delta_v_ms: deltaV, direction: "retrograde" }, `Retrograde Burn ${deltaV} m/s`)}
 >
            ▼ Retrograde Burn (200 cr)
 </Button>
 </div>
 </div>

      {/* Attitude Modes */}
 <div className="rounded-none border border-edge bg-panel/60 p-4 backdrop-blur-sm space-y-3">
 <h4 className="text-sm font-semibold text-ink">Attitude Pointing Mode</h4>
 <p className="text-xs text-muted">Re-orient spacecraft body via reaction wheels.</p>
 <div className="grid grid-cols-3 gap-2">
          {["Sun-facing", "Nadir (Earth)", "Radiator-safe"].map((mode) => (
 <Button
              key={mode}
              size="sm"
              variant="secondary"
              disabled={!enabled}
              onClick={() => onAction("set_attitude", { mode }, `Attitude: ${mode}`)}
 >
              {mode}
 </Button>
 ))}
 </div>
 </div>
 </div>
 );
}

/** Map of station id → panel component. */
export const STATION_COMPONENTS: Record<StationId, (props: StationProps) => React.JSX.Element> = {
  mission_director: DirectorStation,
  systems_engineer: SystemsStation,
  science_officer: ScienceStation,
  flight_controller: FlightStation,
};
