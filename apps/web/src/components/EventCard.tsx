import type { ActiveEvent, ActiveEventChoice } from "../types";
import { cn } from "../lib/utils";
import { Button } from "./Button";

interface EventCardProps {
  event: ActiveEvent;
  /** Whether the current player may resolve this event. */
  canResolve?: boolean;
  onChoose?: (choice: ActiveEventChoice) => void;
  /** Steps remaining before auto-resolve, if known. */
  stepsRemaining?: number;
  className?: string;
}

const severityStyles = {
  critical: {
    border: "border-red-500/50",
    bg: "bg-red-950/40",
    badge: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: "🚨",
  },
  warning: {
    border: "border-amber-500/50",
    bg: "bg-amber-950/30",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    icon: "⚠️",
  },
  info: {
    border: "border-cyan-500/50",
    bg: "bg-cyan-950/20",
    badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    icon: "📡",
  },
} as const;

/**
 * Live mission event with choices. Decision points surface here —
 * the most prominent element on the operate screen.
 */
export function EventCard({ event, canResolve = false, onChoose, stepsRemaining, className }: EventCardProps) {
  const style = severityStyles[event.severity] ?? severityStyles.info;
  const urgency =
    stepsRemaining != null && stepsRemaining <= 2
      ? " — responds in ≤2 steps!"
      : "";

  return (
    <div
      className={cn("rounded-xl border p-5", style.border, style.bg, className)}
      role="alert"
      aria-label={`Event: ${event.name}`}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xl" aria-hidden>{style.icon}</span>
        <h3 className="font-semibold text-white flex-1">{event.name}</h3>
        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border uppercase", style.badge)}>
          {event.severity}
        </span>
      </div>
      <p className="text-sm text-slate-300 mb-4">{event.description}</p>

      {canResolve && event.choices.length > 0 ? (
        <div className="space-y-2" role="group" aria-label="Event choices">
          {event.choices.map((choice) => (
            <Button
              key={choice.id}
              variant="secondary"
              size="sm"
              className="w-full !justify-start text-left"
              onClick={() => onChoose?.(choice)}
            >
              <span>
                <span className="text-slate-200 font-medium">{choice.label}</span>
                <span className="text-slate-400 text-xs block">{choice.description}</span>
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic">
          {event.is_pending
            ? "Waiting for the Mission Director's decision…"
            : "Resolved — effects applied."}
        </p>
      )}

      {stepsRemaining != null && (
        <p className={cn("mt-3 text-xs", urgency ? "text-red-400 font-medium" : "text-slate-500")}>
          Deadline: step {event.deadline_step}{urgency}
        </p>
      )}
    </div>
  );
}
