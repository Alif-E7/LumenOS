import { cn } from "../lib/utils";

interface BudgetMeterProps {
  remaining: number;
  total: number;
  className?: string;
  /** Show the numeric breakdown (default true). */
  showNumbers?: boolean;
}

/** Mission budget gauge — spending visibility for the Mission Director. */
export function BudgetMeter({ remaining, total, className, showNumbers = true }: BudgetMeterProps) {
  const used = Math.max(0, total - remaining);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className={className} role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
      <div className="flex items-baseline justify-between text-sm mb-1">
        <span className="text-slate-300 font-medium">Mission Budget</span>
        {showNumbers && (
          <span className="font-mono text-xs text-slate-400">
            {Math.round(remaining).toLocaleString()} / {Math.round(total).toLocaleString()} cr
          </span>
        )}
      </div>
      <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showNumbers && (
        <p className="mt-1 text-xs text-slate-500">
          {Math.round(pct)}% spent · {Math.round(100 - pct)}% reserve
        </p>
      )}
    </div>
  );
}
