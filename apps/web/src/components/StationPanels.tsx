/**
 * Station panels — the four role-specific control stations.
 *
 * Each panel is intentionally different: it exposes only the actions that
 * role's permission matrix allows (mirroring game/roles.py), with the
 * telemetry that role actually needs. In co-op, players see only their
 * assigned stations; solo players see all four via All Stations.
 *
 * The backend remains authoritative — every button here posts an action
 * and surfaces the server's accept/reject response.
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
import { MockDataBadge } from "./MockDataBadge";
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
      <p className="text-sm text-slate-400">{ROLES.mission_director.description}</p>

      <BudgetMeter remaining={budgetRemaining} total={budgetTotal} />

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-sm font-medium text-slate-200 mb-2">Objective Priority</h4>
        <p className="text-xs text-slate-500 mb-3">
          Rank what the crew optimises for. Re-ranking is logged with the mission director.
        </p>
        <Selector
          label="Lead objective"
          value="primary"
          disabled={!enabled}
          options={[
            { value: "primary", label: "Primary objectives first (default)" },
            { value: "data", label: "Maximise science data" },
            { value: "health", label: "Preserve spacecraft health" },
            { value: "budget", label: "Conserve budget" },
          ]}
          onChange={(v) => onAction("set_priority", { objective_id: v }, "Set objective priority")}
        />
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-slate-200">AI Consultation</h4>
          <Tooltip content="The AI module is not wired into the live session yet — the button is disabled rather than pretending to consult a model.">
            <span className="text-slate-500 cursor-help" aria-label="AI consultation unavailable">ⓘ</span>
          </Tooltip>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Would request a health/power forecast from the LumenOS AI module (costs 100 cr).
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled
          title="AI predictions are not implemented yet — disabled instead of mocked"
        >
          Request AI Prediction (100 cr) — coming soon
        </Button>
      </div>

      {telemetry && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h4 className="text-sm font-medium text-slate-200 mb-3">Director's Overview</h4>
          <div className="space-y-2">
            <ResourceMeter label="Spacecraft health" value={telemetry.spacecraft_health_pct} max={100} unit="%" />
            <ResourceMeter label="Data collected" value={telemetry.comms.data_collected_mb} max={Math.max(500, telemetry.comms.data_collected_mb)} unit="MB" decimals={1} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Systems Engineer ────────────────────────────────────────────────────────

export function SystemsStation({ telemetry, budgetRemaining, onAction, enabled, className }: StationProps) {
  const [radiatorDelta, setRadiatorDelta] = useState(0);

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      <p className="text-sm text-slate-400">{ROLES.systems_engineer.description}</p>

      {telemetry ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ResourceMeter label="Battery" value={telemetry.power.battery_soc_pct} max={100} unit="%" />
          <ResourceMeter label="Bus temperature" value={telemetry.thermal.temperature_c} max={100} unit="°C" invert />
          <ResourceMeter label="Solar output" value={telemetry.power.solar_output_w} max={Math.max(500, telemetry.power.solar_output_w)} unit="W" />
          <ResourceMeter label="CPU load" value={telemetry.workload.cpu_usage_pct} max={100} unit="%" invert />
        </div>
      ) : (
        <p className="text-sm text-slate-500">Telemetry available after the first step.</p>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <h4 className="text-sm font-medium text-slate-200">Power Mode</h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!enabled}
            onClick={() => onAction("set_power_mode", { mode: "normal" }, "Power mode: normal")}
          >
            Normal
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!enabled}
            onClick={() => onAction("set_power_mode", { mode: "low_power" }, "Power mode: low-power shed")}
          >
            Low-Power Shed
          </Button>
        </div>
        <p className="text-xs text-slate-500">Low-power sheds the payload load to protect the battery in eclipse.</p>

        <h4 className="text-sm font-medium text-slate-200 pt-2">Payload</h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!enabled}
            onClick={() => onAction("toggle_subsystem", { active: true }, "Payload ON")}
          >
            Activate
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!enabled}
            onClick={() => onAction("toggle_subsystem", { active: false }, "Payload OFF")}
          >
            Deactivate
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-sm font-medium text-slate-200 mb-1">Thermal — Radiator Trim</h4>
        <p className="text-xs text-slate-500 mb-3">
          Resize the radiator array. Costs 50 cr per adjustment; bigger radiators
          reject more heat but add mass.
        </p>
        <Slider
          label="Radiator adjustment"
          value={radiatorDelta}
          min={-5}
          max={5}
          step={0.5}
          unit="m²"
          onChange={setRadiatorDelta}
          disabled={!enabled}
        />
        <Button
          size="sm"
          className="mt-3"
          disabled={!enabled || radiatorDelta === 0 || budgetRemaining < 50}
          onClick={() => {
            onAction("adjust_thermal", { delta_m2: radiatorDelta }, `Radiator ${radiatorDelta > 0 ? "+" : ""}${radiatorDelta} m²`);
            setRadiatorDelta(0);
          }}
        >
          Apply Adjustment (50 cr)
        </Button>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-slate-200">Subsystem Repair</h4>
          <MockDataBadge reason="health-per-subsystem telemetry not simulated yet" />
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Repairs cost 1000 cr and restore a degraded subsystem. Disabled until
          per-subsystem degradation is modelled — the aggregate health value
          alone can't tell you what to repair.
        </p>
        <Button size="sm" variant="secondary" disabled title="Per-subsystem health telemetry is not simulated yet">
          Repair Subsystem (1000 cr) — coming soon
        </Button>
      </div>
    </div>
  );
}

// ── Science Officer ─────────────────────────────────────────────────────────

export function ScienceStation({ telemetry, onAction, enabled, className }: StationProps) {
  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      <p className="text-sm text-slate-400">{ROLES.science_officer.description}</p>

      {telemetry && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ResourceMeter label="Data buffer" value={telemetry.comms.data_buffer_pct} max={100} unit="%" invert />
          <ResourceMeter label="Collected" value={telemetry.comms.data_collected_mb} max={Math.max(500, telemetry.comms.data_collected_mb)} unit="MB" decimals={1} />
          <ResourceMeter label="Downlinked" value={telemetry.comms.data_downlinked_mb} max={Math.max(500, telemetry.comms.data_downlinked_mb)} unit="MB" decimals={1} />
          <ResourceMeter label="Signal strength" value={telemetry.comms.signal_strength_dbm + 120} max={120} unit="dBm·" decimals={1} />
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-sm font-medium text-slate-200">Ground Contact</h4>
          {telemetry && (
            <StatusBadge
              label={telemetry.comms.in_contact ? `In contact — ${telemetry.comms.active_station}` : "No contact"}
              variant={telemetry.comms.in_contact ? "success" : "neutral"}
            />
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Downlink only works during ground-station contact. Transmitting costs 50 cr.
        </p>
        <Button
          size="sm"
          disabled={!enabled || (telemetry != null && !telemetry.comms.in_contact)}
          title={telemetry && !telemetry.comms.in_contact ? "No ground station in view — wait for contact" : undefined}
          onClick={() => onAction("downlink_data", { data_mb: telemetry?.comms.data_buffer_mb ?? 0 }, "Downlink buffer to ground")}
        >
          Downlink Buffer (50 cr)
        </Button>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-sm font-medium text-slate-200 mb-2">Observation Targeting</h4>
        <p className="text-xs text-slate-500 mb-3">
          Data collection runs through the payload — toggle it on the Systems
          station; the payload gathers data automatically while active.
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={!enabled}
          onClick={() => onAction("collect_data", { target_zone: "current", duration_steps: 1 }, "Manual data-collection tasking")}
        >
          Task Manual Collection
        </Button>
        <p className="text-[11px] text-slate-600 mt-2">
          Tasking is logged with the director; the physics effect flows through
          the payload state.
        </p>
      </div>
    </div>
  );
}

// ── Flight Controller ───────────────────────────────────────────────────────

export function FlightStation({ telemetry, budgetRemaining, onAction, enabled, className }: StationProps) {
  const [deltaV, setDeltaV] = useState(1);

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      <p className="text-sm text-slate-400">{ROLES.flight_controller.description}</p>

      {telemetry && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-sm">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-[10px] uppercase text-slate-500">Altitude</p>
            <p className="text-slate-200">{telemetry.orbital.altitude_km.toFixed(1)} km</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-[10px] uppercase text-slate-500">Velocity</p>
            <p className="text-slate-200">{telemetry.orbital.velocity_km_s.toFixed(2)} km/s</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-[10px] uppercase text-slate-500">Position</p>
            <p className="text-slate-200">{telemetry.orbital.latitude_deg.toFixed(1)}°, {telemetry.orbital.longitude_deg.toFixed(1)}°</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-[10px] uppercase text-slate-500">Sunlight</p>
            <p className={telemetry.orbital.in_eclipse ? "text-cyan-400" : "text-amber-300"}>
              {telemetry.orbital.in_eclipse ? "Eclipse" : "Sunlit"}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-sm font-medium text-slate-200 mb-1">Thruster Burn</h4>
        <p className="text-xs text-slate-500 mb-3">
          Prograde burn raises the orbit; retrograde lowers it. Costs 200 cr per burn.
        </p>
        <Slider label="Delta-v" value={deltaV} min={0.5} max={10} step={0.5} unit="m/s" onChange={setDeltaV} disabled={!enabled} />
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button
            size="sm"
            disabled={!enabled || budgetRemaining < 200}
            onClick={() => onAction("fire_thruster", { delta_v_ms: deltaV, direction: "prograde" }, `Prograde burn ${deltaV} m/s`)}
          >
            ▲ Prograde (200 cr)
          </Button>
          <Button
            size="sm"
            disabled={!enabled || budgetRemaining < 200}
            onClick={() => onAction("fire_thruster", { delta_v_ms: deltaV, direction: "retrograde" }, `Retrograde burn ${deltaV} m/s`)}
          >
            ▼ Retrograde (200 cr)
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-sm font-medium text-slate-200 mb-2">Attitude</h4>
        <p className="text-xs text-slate-500 mb-3">Re-point the spacecraft body. Free — uses reaction wheels.</p>
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

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-sm font-medium text-slate-200 mb-2">Orbital Manoeuvre</h4>
        <p className="text-xs text-slate-500 mb-3">
          Full plane/altitude change (500 cr). Reserved for contract changes —
          use thruster burns for routine station-keeping.
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={!enabled || budgetRemaining < 500}
          onClick={() => onAction("adjust_orbit", { delta_altitude_km: 10 }, "Orbit +10 km manoeuvre")}
        >
          Request Orbit Raise +10 km (500 cr)
        </Button>
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
