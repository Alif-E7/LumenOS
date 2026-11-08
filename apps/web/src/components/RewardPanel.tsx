import { cn } from "../lib/utils";
import { Lock, Unlock } from "lucide-react";

export interface Reward {
  id: string;
  label: string;
  description: string;
  /** Whether this reward was earned in the current mission. */
  earned: boolean;
  icon: string;
}

interface RewardPanelProps {
  rewards: Reward[];
  /** Total career XP across missions. */
  xp: number;
  /** XP needed for the next rank. */
  nextRankXp: number;
  rankLabel: string;
  credits?: number;
  className?: string;
}

/**
 * Rewards & progression. Displays earned badges, rank progress,
 * and persistent career metrics.
 */
export function RewardPanel({ rewards, xp, nextRankXp, rankLabel, credits, className }: RewardPanelProps) {
  const xpPct = Math.min(100, (xp / nextRankXp) * 100);
  const earnedCount = rewards.filter((r) => r.earned).length;

  return (
    <section className={cn("space-y-4", className)} aria-label="Rewards and progression">
      <div className="border border-edge bg-panel p-5">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-ink">{rankLabel}</h3>
            {credits !== undefined && (
              <span className="data-readout border border-warn/30 bg-warn/10 px-2 py-0.5 text-xs text-warn">
                {credits.toLocaleString()} cr
              </span>
            )}
          </div>
          <span className="data-readout text-xs text-muted">
            {xp.toLocaleString()} / {nextRankXp.toLocaleString()} XP
          </span>
        </div>
        <div
          className="h-1.5 bg-edge overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(xpPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Rank progress"
        >
          <div
            className="h-full bg-accent transition-all duration-700"
            style={{ width: `${xpPct}%` }}
          />
        </div>
        <p className="micro-label mt-2 text-faint">Career progression · persistent profile</p>
      </div>

      <div className="border border-edge bg-panel p-5">
        <h3 className="micro-label mb-3 text-faint">
          Mission Badges ({earnedCount}/{rewards.length} earned)
        </h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rewards.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex items-start gap-3 border p-3",
                r.earned ? "border-warn/40 bg-warn/10" : "border-edge bg-panel/40 opacity-60"
              )}
              title={r.earned ? "Earned this mission" : "Not earned yet"}
            >
              <span aria-hidden className={r.earned ? "text-warn" : "text-faint"}>
                {r.earned ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", r.earned ? "text-warn" : "text-muted")}>
                  {r.label}
                </p>
                <p className="text-xs text-faint">{r.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
