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
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-white">{rankLabel}</h3>
            {credits !== undefined && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono">
                💰 {credits.toLocaleString()} Credits
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-slate-400">
            {xp.toLocaleString()} / {nextRankXp.toLocaleString()} XP
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(xpPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Rank progress">
          <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full transition-all duration-700" style={{ width: `${xpPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Career XP, rank, and Engineering Credits are tracked via persistent player profile.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="font-semibold text-white mb-3">
          Mission Badges <span className="text-sm text-slate-500 font-normal">({earnedCount}/{rewards.length} earned)</span>
        </h3>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {rewards.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3",
                r.earned
                  ? "border-amber-500/40 bg-amber-950/20"
                  : "border-slate-800 bg-slate-900/40 opacity-60"
              )}
              title={r.earned ? "Earned this mission" : "Not earned yet"}
            >
              <span className="text-xl" aria-hidden>{r.earned ? r.icon : "🔒"}</span>
              <div>
                <p className={cn("text-sm font-medium", r.earned ? "text-amber-300" : "text-slate-400")}>
                  {r.label}
                </p>
                <p className="text-xs text-slate-500">{r.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
