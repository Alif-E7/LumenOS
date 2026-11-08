import type { ObjectiveProgress } from "../types";
import { cn } from "../lib/utils";
import { Star, Check } from "lucide-react";

interface ObjectiveTrackerProps {
  objectives: ObjectiveProgress[];
  /** Compact variant for sidebars. */
  compact?: boolean;
  className?: string;
}

function barColor(fraction: number, isPrimary: boolean) {
  if (fraction >= 1) return "bg-ok";
  if (fraction >= 0.5) return isPrimary ? "bg-accent" : "bg-info";
  return "bg-warn";
}

/**
 * Live objective progress list — the player's primary success signal.
 * Progress comes from the backend objective evaluator (real data).
 */
export function ObjectiveTracker({ objectives, compact = false, className }: ObjectiveTrackerProps) {
  if (objectives.length === 0) {
    return (
 <p className={cn("font-mono text-[11px] text-faint", className)}>
        NO OBJECTIVES TRACKED — START THE MISSION
 </p>
 );
  }

  return (
 <ul className={cn("space-y-3.5", className)} aria-label="Mission objectives">
      {objectives.map((obj) => {
        const pct = Math.min(100, Math.round(obj.fraction * 100));
        return (
 <li key={obj.objective_id}>
 <div className="flex items-baseline justify-between gap-2 text-sm">
 <span className="text-ink">
                {obj.is_primary && (
 <Star
                    className="mr-1 inline h-3.5 w-3.5 text-accent"
                    aria-label="Primary objective"
                    fill="currentColor"
                  />
 )}
                {obj.description}
 </span>
 <span
                className={cn(
                  "data-readout whitespace-nowrap text-xs",
                  obj.is_complete ? "text-ok" : "text-muted"
 )}
 >
                {obj.is_complete && <Check className="mr-0.5 inline h-3 w-3" aria-hidden />}
                {Number(obj.current_value.toFixed(1))}/{obj.target_value} {obj.unit}
 </span>
 </div>
            {!compact && (
 <div
                className="mt-1.5 h-1 bg-edge overflow-hidden"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progress: ${obj.description}`}
 >
 <div
                  className={cn("h-full transition-all duration-500", barColor(obj.fraction, obj.is_primary))}
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
