import { cn } from "../lib/utils";

interface StatProps {
  label: string;
  value: string | number;
  unit?: string;
  /** Semantic tint for the value. */
  tone?: "ink" | "ok" | "warn" | "crit" | "info" | "accent";
  className?: string;
}

const tones: Record<NonNullable<StatProps["tone"]>, string> = {
  ink: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  crit: "text-crit",
  info: "text-info",
  accent: "text-accent",
};

/** Single telemetry readout: uppercase label over a large mono value. */
export function Stat({ label, value, unit, tone = "ink", className }: StatProps) {
  return (
 <div className={cn("min-w-0", className)}>
 <div className="micro-label mb-1.5 text-faint">{label}</div>
 <div
        className={cn(
          "data-readout flex items-baseline gap-1 text-xl font-medium leading-none",
          tones[tone]
 )}
 >
 <span className="truncate">{value}</span>
        {unit && <span className="text-[11px] text-faint">{unit}</span>}
 </div>
 </div>
 );
}
