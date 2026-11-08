import { cn } from "../lib/utils";

interface BudgetMeterProps {
  remaining: number;
  total: number;
  className?: string;
  /** Show the numeric breakdown (default true). */
  showNumbers?: boolean;
  /** Gauge label (defaults to Mission Budget). */
  label?: string;
  /** Unit suffix for the numeric readout (defaults to cr). */
  unit?: string;
}

/** Mission budget gauge — spending visibility for the Mission Director. */
export function BudgetMeter({
  remaining,
  total,
  className,
  showNumbers = true,
  label = "Mission Budget",
  unit = "cr",
}: BudgetMeterProps) {
  const used = Math.max(0, total - remaining);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const color = pct >= 90 ? "bg-crit" : pct >= 70 ? "bg-warn" : "bg-ok";

  return (
 <div
      className={className}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Budget used"
 >
 <div className="mb-1.5 flex items-baseline justify-between">
        <span className="micro-label text-faint">{label}</span>
        {showNumbers && (
          <span className="data-readout text-xs text-muted">
            {Math.round(remaining).toLocaleString()} / {Math.round(total).toLocaleString()} {unit}
          </span>
        )}
 </div>
 <div className="h-1.5 bg-edge overflow-hidden">
 <div
          className={cn("h-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
 </div>
      {showNumbers && (
 <p className="data-readout mt-1.5 text-[10px] text-faint">
          {Math.round(pct)}% SPENT · {Math.round(100 - pct)}% RESERVE
 </p>
 )}
 </div>
 );
}
