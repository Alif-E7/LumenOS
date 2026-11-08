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
  const color = !good ? "bg-crit" : !warn ? "bg-warn" : "bg-ok";
  const text = !good ? "text-crit" : !warn ? "text-warn" : "text-ok";

  return (
    <div
      className={className}
      role="meter"
      aria-label={label}
      aria-valuenow={Number(value.toFixed(decimals))}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="micro-label text-faint">{label}</span>
        <span className={cn("data-readout text-xs", text)}>
          {value.toFixed(decimals)}
          {unit && ` ${unit}`}
        </span>
      </div>
      <div className="h-1 bg-edge overflow-hidden">
        <div
          className={cn("h-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
