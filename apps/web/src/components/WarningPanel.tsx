import { cn } from "../lib/utils";
import { ShieldCheck, TriangleAlert, OctagonX, Info } from "lucide-react";

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
  critical: { row: "text-crit", dot: "bg-crit", Icon: OctagonX, label: "CRITICAL" },
  warning: { row: "text-warn", dot: "bg-warn", Icon: TriangleAlert, label: "CAUTION" },
  info: { row: "text-info", dot: "bg-info", Icon: Info, label: "INFO" },
} as const;

/**
 * Master caution panel — aggregates live warnings from telemetry.
 * Sits above station controls so problems are seen before actions.
 * Guarantees non-color-only presentation (distinct icons + textual severity prefixes).
 */
export function WarningPanel({ warnings, title = "System Warnings", className }: WarningPanelProps) {
  if (warnings.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 border border-ok/30 bg-ok/[0.06] px-4 py-3 text-sm text-ok",
          className
        )}
        role="status"
      >
        <ShieldCheck aria-hidden className="h-4 w-4" />
        All systems nominal — no active warnings.
      </div>
    );
  }

  return (
    <section
      className={cn("border border-crit/40 bg-crit/[0.06] p-4", className)}
      role="alert"
      aria-label={title}
    >
      <h3 className="micro-label mb-2.5 flex items-center gap-2 text-crit">
        <TriangleAlert aria-hidden className="h-3.5 w-3.5" />
        <span>
          {title} ({warnings.length})
        </span>
      </h3>
      <ul className="space-y-2">
        {warnings.map((w) => {
          const s = levelStyles[w.level];
          const Icon = s.Icon;
          return (
            <li key={w.id} className={cn("flex items-center gap-2 text-sm", s.row)}>
              <span className={cn("h-1.5 w-1.5 animate-pulse-soft", s.dot)} aria-hidden="true" />
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="micro-label opacity-90">[{s.label}]</span>
              <span className="min-w-0 text-ink">{w.message}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
