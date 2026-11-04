import type { ObjectiveProgress } from "../types";
import { cn } from "../lib/utils";

interface ObjectiveTrackerProps {
  objectives: ObjectiveProgress[];
  /** Compact variant for sidebars. */
  compact?: boolean;
  className?: string;
}

function barColor(fraction: number, isPrimary: boolean) {
  if (fraction >= 1) return "bg-green-500";
  if (fraction >= 0.5) return isPrimary ? "bg-blue-500" : "bg-cyan-500";
  return "bg-amber-500";
}

/**
 * Live objective progress list — the player's primary success signal.
 * Progress comes from the backend objective evaluator (real data).
 */
export function ObjectiveTracker({ objectives, compact = false, className }: ObjectiveTrackerProps) {
  if (objectives.length === 0) {
    return (
      <p className={cn("text-sm text-slate-500", className)}>
        No objectives tracked yet — start the mission to see progress.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-3", className)} aria-label="Mission objectives">
      {objectives.map((obj) => {
        const pct = Math.min(100, Math.round(obj.fraction * 100));
        return (
          <li key={obj.objective_id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-slate-200">
                {obj.is_primary && (
                  <span className="text-amber-400 mr-1" title="Primary objective">★</span>
                )}
                {obj.description}
              </span>
              <span
                className={cn(
                  "font-mono text-xs whitespace-nowrap",
                  obj.is_complete ? "text-green-400" : "text-slate-400"
                )}
              >
                {obj.is_complete ? "✓ " : ""}
                {Number(obj.current_value.toFixed(1))}/{obj.target_value} {obj.unit}
              </span>
            </div>
            {!compact && (
              <div
                className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progress: ${obj.description}`}
              >
                <div
                  className={cn("h-full rounded-full transition-all duration-500", barColor(obj.fraction, obj.is_primary))}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
