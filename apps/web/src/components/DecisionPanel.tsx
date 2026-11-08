import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  cost?: number;
  disabled?: boolean;
  disabledReason?: string;
}

interface DecisionPanelProps {
  title: string;
  context?: ReactNode;
  options: DecisionOption[];
  onDecide: (optionId: string) => void;
  /** Who owns this decision (display only). */
  ownerLabel?: string;
  className?: string;
}

/**
 * Structured decision prompt — one clear question, discrete options.
 * Used for events, contract priorities, and station choices.
 */
export function DecisionPanel({ title, context, options, onDecide, ownerLabel, className }: DecisionPanelProps) {
  return (
 <section
      className={cn("rounded-none border border-accent/30 bg-panel/70 p-5", className)}
      aria-label={title}
 >
 <div className="flex items-baseline justify-between mb-1">
 <h3 className="font-semibold text-ink">{title}</h3>
        {ownerLabel && <span className="text-xs text-accent">{ownerLabel}</span>}
 </div>
      {context && <div className="text-sm text-muted mb-4">{context}</div>}
 <div className="grid gap-2 sm:grid-cols-2">
        {options.map((opt) => (
 <button
            key={opt.id}
            onClick={() => !opt.disabled && onDecide(opt.id)}
            disabled={opt.disabled}
            className={cn(
              "rounded-none border border-edge-strong bg-raised/60 p-3 text-left transition-colors",
              "hover:border-accent/60 hover:bg-raised",
              "focus:outline-none focus:ring-2 focus:ring-accent",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-edge-strong"
 )}
            title={opt.disabled ? opt.disabledReason : undefined}
 >
 <span className="block text-sm font-medium text-ink">
              {opt.label}
              {opt.cost != null && opt.cost > 0 && (
 <span className="ml-2 text-xs text-warn font-mono">−{opt.cost} cr</span>
 )}
 </span>
            {opt.description && (
 <span className="block text-xs text-faint mt-0.5">
                {opt.disabled && opt.disabledReason ? opt.disabledReason : opt.description}
 </span>
 )}
 </button>
 ))}
 </div>
 </section>
 );
}
