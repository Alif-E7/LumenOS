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
      className={cn("rounded-xl border border-blue-500/30 bg-slate-900/70 p-5", className)}
      aria-label={title}
    >
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-semibold text-white">{title}</h3>
        {ownerLabel && <span className="text-xs text-blue-400">{ownerLabel}</span>}
      </div>
      {context && <div className="text-sm text-slate-400 mb-4">{context}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => !opt.disabled && onDecide(opt.id)}
            disabled={opt.disabled}
            className={cn(
              "rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-left transition-colors",
              "hover:border-blue-500/60 hover:bg-slate-800",
              "focus:outline-none focus:ring-2 focus:ring-blue-500",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-700"
            )}
            title={opt.disabled ? opt.disabledReason : undefined}
          >
            <span className="block text-sm font-medium text-slate-200">
              {opt.label}
              {opt.cost != null && opt.cost > 0 && (
                <span className="ml-2 text-xs text-amber-400 font-mono">−{opt.cost} cr</span>
              )}
            </span>
            {opt.description && (
              <span className="block text-xs text-slate-500 mt-0.5">
                {opt.disabled && opt.disabledReason ? opt.disabledReason : opt.description}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
