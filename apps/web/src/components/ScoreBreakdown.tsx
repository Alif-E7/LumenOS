import type { ScoreCategory, ScoreResponse } from "../types";
import { cn } from "../lib/utils";

interface ScoreBreakdownProps {
  score: ScoreResponse;
  className?: string;
}

const gradeColor: Record<string, string> = {
  A: "text-green-400",
  B: "text-cyan-400",
  C: "text-amber-400",
  D: "text-orange-400",
  F: "text-red-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  objectives: "Mission Objectives / Science Return",
  health: "Safety & Reliability",
  spacecraft_health: "Safety & Reliability",
  data: "Communication & Data Delivery",
  data_value: "Science Data Value",
  time: "Resource Efficiency — Timeline",
  time_efficiency: "Time Efficiency",
  events: "Engineering Reasoning & Coordination",
  event_handling: "Engineering Reasoning & Coordination",
  budget: "Resource Efficiency — Budget Control",
  budget_efficiency: "Budget Efficiency",
};

/** End-of-mission score card — full category breakdown from the scorer. */
export function ScoreBreakdown({ score, className }: ScoreBreakdownProps) {
  const pct = Math.round(score.score_fraction * 100);
  const gradeClass = gradeColor[score.grade[0]] ?? "text-slate-300";

  return (
    <section className={cn("rounded-xl border border-slate-800 bg-slate-900/60 p-6", className)} aria-label="Mission score">
      {score.safety_cap_triggered && (
        <div className="mb-6 p-4 rounded-lg bg-red-950/80 border border-red-500/60 text-red-200">
          <div className="flex items-center gap-2 font-bold text-red-300 text-sm mb-1">
            <span>⚠️</span>
            <span>CRITICAL SAFETY CAP ENFORCED</span>
          </div>
          <p className="text-xs text-red-300 leading-relaxed">
            {score.safety_cap_reason ?? "A critical safety violation occurred. By flight governance rules, vehicle loss or severe safety breaches cap the score at 40%, Grade F, and 0 Stars regardless of science return."}
          </p>
          {score.safety_flags && score.safety_flags.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs text-red-400 space-y-0.5">
              {score.safety_flags.map((flag, i) => (
                <li key={i}>{flag}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {Math.round(score.total_score).toLocaleString()}
            <span className="text-sm text-slate-500 font-normal"> / {Math.round(score.max_score).toLocaleString()} pts</span>
          </h2>
          <p className="text-sm text-slate-400">{pct}% mission success</p>
          {score.stars !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-amber-400 text-lg tracking-widest" aria-label={`${score.stars} of 3 stars`}>
                {"★".repeat(score.stars)}{"☆".repeat(3 - score.stars)}
              </span>
              <span className="text-xs text-slate-400 font-medium">({score.stars}/3 Stars)</span>
            </div>
          )}
        </div>
        <div className={cn("text-6xl font-black", gradeClass)} aria-label={`Grade ${score.grade}`}>
          {score.grade}
        </div>
      </div>

      {score.primary_cause && (
        <div className="mb-4 p-3 rounded-lg bg-blue-950/40 border border-blue-900/50 text-xs">
          <span className="text-blue-400 font-semibold">Primary Outcome: </span>
          <span className="text-slate-300">{score.primary_cause}</span>
        </div>
      )}

      {score.star_criteria && score.star_criteria.length > 0 && (
        <div className="mb-6 p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-1">
          <p className="font-semibold text-slate-300">Rating Breakdown:</p>
          {score.star_criteria.map((crit, idx) => (
            <p key={idx} className="text-slate-400">{crit}</p>
          ))}
        </div>
      )}

      <ul className="space-y-4">
        {score.categories.map((cat: ScoreCategory) => {
          const catPct = cat.max_possible > 0 ? (cat.weighted_score / cat.max_possible) * 100 : 0;
          const label = cat.display_name ?? CATEGORY_LABELS[cat.category] ?? cat.category;
          return (
            <li key={cat.category}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="text-slate-200 font-medium">{label}</span>
                <span className="font-mono text-slate-400">
                  {Math.round(cat.weighted_score)} / {Math.round(cat.max_possible)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    catPct >= 80 ? "bg-green-500" : catPct >= 50 ? "bg-amber-500" : "bg-red-500"
                  )}
                  style={{ width: `${Math.min(100, catPct)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{cat.explanation}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
