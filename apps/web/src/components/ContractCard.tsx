import type { MissionDetail } from "../types";
import { Card } from "./Card";
import { StatusBadge } from "./StatusBadge";
import { cn } from "../lib/utils";

interface ContractCardProps {
  mission: MissionDetail;
  /** Total mission budget in credits (backend contract value). */
  budget?: number;
  className?: string;
  /** Adds amber corner brackets. */
  frame?: boolean;
}

function DifficultyTicks({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Difficulty ${level} of 5`} role="img">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn("h-3 w-0.5", i < level ? "bg-accent" : "bg-edge-strong")}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

const severityDot = {
  critical: "bg-crit",
  warning: "bg-warn",
  info: "bg-info",
} as const;

/**
 * The mission contract — objectives, constraints and budget, written
 * like a customer's statement of work. Primary pre-flight artifact.
 */
export function ContractCard({ mission, budget = 10000, className, frame = false }: ContractCardProps) {
  return (
    <Card title="Mission Contract" subtitle={`Customer requirements — ${mission.codename}`} frame={frame} className={className}>
      <p className="mb-4 text-sm text-ink">{mission.description}</p>

      <div className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="micro-label mb-1 text-faint">Orbit</p>
          <p className="data-readout text-ink">{mission.orbit_altitude_km} km / {mission.orbit_inclination_deg}°</p>
        </div>
        <div>
          <p className="micro-label mb-1 text-faint">Duration</p>
          <p className="data-readout text-ink">{mission.duration_hours} h</p>
        </div>
        <div>
          <p className="micro-label mb-1 text-faint">Difficulty</p>
          <DifficultyTicks level={mission.difficulty} />
        </div>
        <div>
          <p className="micro-label mb-1 text-faint">Budget Cap</p>
          <p className="data-readout text-ink">{budget.toLocaleString()} cr</p>
        </div>
      </div>

      <h4 className="micro-label mb-2 text-faint">Success Criteria</h4>
      <ul className="mb-4 space-y-2">
        {mission.objectives.map((obj) => (
          <li key={obj.id} className="flex items-start gap-2 text-sm">
            <StatusBadge label={obj.weight >= 0.8 ? "PRIMARY" : "BONUS"} variant={obj.weight >= 0.8 ? "warning" : "info"} />
            <span className="flex-1 text-ink">{obj.description}</span>
            <span className="data-readout whitespace-nowrap text-xs text-faint">
              ≥ {obj.target_value} {obj.unit}
            </span>
          </li>
        ))}
      </ul>

      <h4 className="micro-label mb-2 text-faint">Known Risks</h4>
      <ul className="space-y-1.5">
        {mission.event_pool.map((ev) => (
          <li key={ev.id} className="flex items-center gap-2 text-sm text-muted">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 shrink-0", severityDot[ev.severity as keyof typeof severityDot] ?? "bg-info")}
            />
            {ev.name}
            <span className="data-readout ml-auto text-xs text-faint">p = {Math.round(ev.probability * 100)}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
