import { cn } from "../lib/utils";

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
      <div className="rounded-none border border-edge bg-panel/60 p-5">
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-ink">{rankLabel}</h3>
            {credits !== undefined && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-warn/10 border border-warn/30 text-warn font-mono">
                💰 {credits.toLocaleString()} Credits
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-muted">
            {xp.toLocaleString()} / {nextRankXp.toLocaleString()} XP
          </span>
        </div>
        <div className="h-2 rounded-full bg-raised overflow-hidden" role="progressbar" aria-valuenow={Math.round(xpPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Rank progress">
          <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full transition-all duration-700" style={{ width: `${xpPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">
          Career XP, rank, and Engineering Credits are tracked via persistent player profile.
        </p>
      </div>

      <div className="rounded-none border border-edge bg-panel/60 p-5">
        <h3 className="font-semibold text-ink mb-3">
          Mission Badges <span className="text-sm text-ink0 font-normal">({earnedCount}/{rewards.length} earned)</span>
        </h3>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {rewards.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex items-start gap-3 rounded-none border p-3",
                r.earned
                  ? "border-warn/40 bg-warn/10/20"
                  : "border-edge bg-panel/40 opacity-60"
              )}
              title={r.earned ? "Earned this mission" : "Not earned yet"}
            >
              <span className="text-xl" aria-hidden>{r.earned ? r.icon : "🔒"}</span>
              <div>
                <p className={cn("text-sm font-medium", r.earned ? "text-warn" : "text-muted")}>
                  {r.label}
                </p>
                <p className="text-xs text-ink0">{r.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
