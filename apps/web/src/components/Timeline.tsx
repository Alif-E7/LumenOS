import { cn } from "../lib/utils";

export interface TimelineMark {
  label: string;
  /** 0..1 position on the timeline. */
  fraction: number;
  kind?: "done" | "active" | "planned";
}

interface TimelineProps {
  marks: TimelineMark[];
  /** Formatted elapsed time, e.g. "04:12 / 24:00 h". */
  timeLabel: string;
  className?: string;
}

/** Mission timeline — elapsed vs. deadline with event markers. */
export function Timeline({ marks, timeLabel, className }: TimelineProps) {
  return (
    <div className={className} aria-label="Mission timeline">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="micro-label text-faint">Mission Clock</span>
        <span className="data-readout text-xs text-ink">{timeLabel}</span>
      </div>
      <div className="relative h-1.5 bg-edge overflow-visible">
        {/* Progress fill derived from the active mark */}
        {(() => {
          const active = marks.find((m) => m.kind === "active");
          const frac = active ? active.fraction : 0;
          return (
            <div
              className="absolute inset-y-0 left-0 bg-accent/70 transition-all duration-500"
              style={{ width: `${Math.min(100, frac * 100)}%` }}
            />
          );
        })()}
        {marks.map((m, i) => (
          <span
            key={`${m.label}-${i}`}
            className={cn(
              "absolute -top-1 h-3.5 w-1",
              m.kind === "done" && "bg-ok",
              m.kind === "active" && "bg-accent glow-accent",
              (!m.kind || m.kind === "planned") && "bg-edge-strong"
            )}
            style={{ left: `${Math.min(100, Math.max(0, m.fraction * 100))}%` }}
            title={m.label}
          />
        ))}
      </div>
    </div>
  );
}
