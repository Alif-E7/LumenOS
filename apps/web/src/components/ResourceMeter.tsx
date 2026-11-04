import { cn } from "../lib/utils";

interface ResourceMeterProps {
  label: string;
  value: number;
  max: number;
  unit?: string;
  /** Higher-is-better (default) or lower-is-better metrics. */
  invert?: boolean;
  decimals?: number;
  className?: string;
}

/**
 * Horizontal resource gauge (battery, buffer, health, CPU...).
 * Color thresholds: >60% good, >25% warn, else critical (inverted for
 * lower-is-better metrics like temperature or buffer fill).
 */
export function ResourceMeter({
  label,
  value,
  max,
  unit = "",
  invert = false,
  decimals = 0,
  className,
}: ResourceMeterProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const good = invert ? pct <= 60 : pct >= 25;
  const warn = invert ? pct <= 85 : pct >= 60;
  const color = !good ? "bg-red-500" : !warn ? "bg-amber-500" : "bg-cyan-500";
  const text = !good ? "text-red-400" : !warn ? "text-amber-400" : "text-cyan-300";

  return (
    <div className={className} role="meter" aria-label={label} aria-valuenow={Number(value.toFixed(decimals))} aria-valuemin={0} aria-valuemax={max}>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={cn("font-mono", text)}>
          {value.toFixed(decimals)}
          {unit && ` ${unit}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
