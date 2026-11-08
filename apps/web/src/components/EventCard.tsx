import type { ActiveEvent, ActiveEventChoice } from "../types";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import { AlertOctagon, AlertTriangle, Radio, Timer } from "lucide-react";

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
    border: "border-crit/50",
    bg: "bg-crit/[0.06]",
    badge: "text-crit border-crit/40 bg-crit/10",
    Icon: AlertOctagon,
    bar: "bg-crit",
  },
  warning: {
    border: "border-warn/50",
    bg: "bg-warn/[0.05]",
    badge: "text-warn border-warn/40 bg-warn/10",
    Icon: AlertTriangle,
    bar: "bg-warn",
  },
  info: {
    border: "border-info/50",
    bg: "bg-info/[0.05]",
    badge: "text-info border-info/40 bg-info/10",
    Icon: Radio,
    bar: "bg-info",
  },
} as const;

/**
 * Live mission event with choices. Decision points surface here —
 * the most prominent element on the operate screen.
 */
export function EventCard({
  event,
  canResolve = false,
  onChoose,
  stepsRemaining,
  className,
}: EventCardProps) {
  const style = severityStyles[event.severity] ?? severityStyles.info;
  const { Icon } = style;
  const urgent = stepsRemaining != null && stepsRemaining <= 2;

  return (
    <div
      className={cn("relative overflow-hidden border p-5", style.border, style.bg, className)}
      role="alert"
      aria-label={`Event: ${event.name}`}
    >
      {/* Severity edge */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.5", style.bar)} />
      {/* Urgency sweep */}
      {urgent && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
        />
      )}

      <div className="mb-2 flex items-center gap-2.5">
        <Icon aria-hidden className="h-5 w-5" />
        <h3 className="flex-1 font-semibold text-ink">{event.name}</h3>
        <span
          className={cn(
            "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]",
            style.badge
          )}
        >
          {event.severity}
        </span>
      </div>
      <p className="mb-4 text-sm text-muted">{event.description}</p>

      {canResolve && event.choices.length > 0 ? (
        <div className="space-y-2" role="group" aria-label="Event choices">
          {event.choices.map((choice) => (
            <Button
              key={choice.id}
              variant="secondary"
              size="sm"
              className="!justify-start text-left"
              onClick={() => onChoose?.(choice)}
            >
              <span className="min-w-0">
                <span className="block text-ink">{choice.label}</span>
                <span className="block normal-case tracking-normal text-faint">{choice.description}</span>
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="font-mono text-[11px] text-faint">
          {event.is_pending
            ? "HOLDING — awaiting Mission Director decision"
            : "RESOLVED — effects applied"}
        </p>
      )}

      {stepsRemaining != null && (
        <p
          className={cn(
            "data-readout mt-3 flex items-center gap-1.5 text-[11px]",
            urgent ? "text-crit" : "text-faint"
          )}
        >
          <Timer aria-hidden className="h-3 w-3" />
          DEADLINE: STEP {event.deadline_step}
          {urgent && " — RESPONDS IN ≤2 STEPS"}
        </p>
      )}
    </div>
  );
}
