import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export interface Warning {
  id: string;
  message: string;
  level: "critical" | "warning" | "info";
}

interface WarningPanelProps {
  warnings: Warning[];
  title?: string;
  className?: string;
}

const levelStyles = {
  critical: { row: "text-red-300", dot: "bg-red-500", label: "CRITICAL" },
  warning: { row: "text-amber-300", dot: "bg-amber-500", label: "CAUTION" },
  info: { row: "text-cyan-300", dot: "bg-cyan-500", label: "INFO" },
} as const;

/**
 * Master caution panel — aggregates live warnings from telemetry.
 * Sits above station controls so problems are seen before actions.
 */
export function WarningPanel({ warnings, title = "System Warnings", className }: WarningPanelProps) {
  if (warnings.length === 0) {
    return (
      <div className={cn("rounded-xl border border-green-500/30 bg-green-950/20 px-4 py-3 text-sm text-green-400 flex items-center gap-2", className)} role="status">
        <span aria-hidden>✓</span> All systems nominal — no active warnings.
      </div>
    );
  }

  return (
    <section
      className={cn("rounded-xl border border-red-500/40 bg-red-950/20 p-4", className)}
      role="alert"
      aria-label={title}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">
        {title} ({warnings.length})
      </h3>
      <ul className="space-y-1.5">
        {warnings.map((w) => {
          const s = levelStyles[w.level];
          return (
            <li key={w.id} className={cn("flex items-center gap-2 text-sm", s.row)}>
              <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", s.dot)} aria-hidden />
              <span className="text-[10px] font-mono opacity-70">{s.label}</span>
              {w.message}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
