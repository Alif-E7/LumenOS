import type { MissionDetail } from "../types";
import { Card } from "./Card";
import { StatusBadge } from "./StatusBadge";

interface ContractCardProps {
  mission: MissionDetail;
  /** Total mission budget in credits (backend contract value). */
  budget?: number;
  className?: string;
}

/**
 * The mission contract — objectives, constraints and budget, written
 * like a customer's statement of work. Primary pre-flight artifact.
 */
export function ContractCard({ mission, budget = 10000, className }: ContractCardProps) {
  return (
    <Card title="Mission Contract" subtitle={`Customer requirements — ${mission.codename}`} icon="📋" className={className}>
      <p className="text-sm text-slate-300 mb-4">{mission.description}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-sm">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Orbit</p>
          <p className="text-slate-200 font-mono">{mission.orbit_altitude_km} km / {mission.orbit_inclination_deg}°</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Duration</p>
          <p className="text-slate-200 font-mono">{mission.duration_hours} h</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Difficulty</p>
          <p className="text-slate-200">{"⭐".repeat(mission.difficulty)}{"☆".repeat(5 - mission.difficulty)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Budget Cap</p>
          <p className="text-slate-200 font-mono">{budget.toLocaleString()} cr</p>
        </div>
      </div>

      <h4 className="text-sm font-semibold text-slate-300 mb-2">Success Criteria</h4>
      <ul className="space-y-2 mb-4">
        {mission.objectives.map((obj) => (
          <li key={obj.id} className="flex items-start gap-2 text-sm">
            <StatusBadge label={obj.weight >= 0.8 ? "PRIMARY" : "BONUS"} variant={obj.weight >= 0.8 ? "warning" : "info"} />
            <span className="text-slate-300 flex-1">{obj.description}</span>
            <span className="text-slate-500 font-mono text-xs whitespace-nowrap">
              ≥ {obj.target_value} {obj.unit}
            </span>
          </li>
        ))}
      </ul>

      <h4 className="text-sm font-semibold text-slate-300 mb-2">Known Risks</h4>
      <ul className="space-y-1.5">
        {mission.event_pool.map((ev) => (
          <li key={ev.id} className="text-sm text-slate-400 flex items-center gap-2">
            <span aria-hidden>
              {ev.severity === "critical" ? "🔴" : ev.severity === "warning" ? "🟠" : "🟡"}
            </span>
            {ev.name}
            <span className="text-slate-600 text-xs ml-auto">p = {Math.round(ev.probability * 100)}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
