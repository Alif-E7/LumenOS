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
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-slate-400 uppercase tracking-wide font-medium">Mission Clock</span>
        <span className="font-mono text-slate-300">{timeLabel}</span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-800 overflow-visible">
        {/* Progress fill derived from the active mark */}
        {(() => {
          const active = marks.find((m) => m.kind === "active");
          const frac = active ? active.fraction : 0;
          return (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-blue-600/70 transition-all duration-500"
              style={{ width: `${Math.min(100, frac * 100)}%` }}
            />
          );
        })()}
        {marks.map((m, i) => (
          <span
            key={`${m.label}-${i}`}
            className={cn(
              "absolute -top-1 h-4 w-1 rounded-full",
              m.kind === "done" && "bg-green-400",
              m.kind === "active" && "bg-blue-400",
              (!m.kind || m.kind === "planned") && "bg-slate-600"
            )}
            style={{ left: `${Math.min(100, Math.max(0, m.fraction * 100))}%` }}
            title={m.label}
          />
        ))}
      </div>
    </div>
  );
}
