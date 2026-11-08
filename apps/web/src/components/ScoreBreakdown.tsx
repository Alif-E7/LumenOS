import type { ScoreCategory, ScoreResponse } from "../types";
import { cn } from "../lib/utils";

interface ScoreBreakdownProps {
  score: ScoreResponse;
  className?: string;
}

const gradeColor: Record<string, string> = {
  A: "text-ok",
  B: "text-info",
  C: "text-warn",
  D: "text-warn",
  F: "text-crit",
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
  const gradeClass = gradeColor[score.grade[0]] ?? "text-ink";

  return (
 <section className={cn("rounded-none border border-edge bg-panel/60 p-6", className)} aria-label="Mission score">
      {score.safety_cap_triggered && (
 <div className="mb-6 p-4 rounded-none bg-crit/10 border border-crit/60 text-crit">
 <div className="flex items-center gap-2 font-bold text-crit text-sm mb-1">
 <span></span>
 <span>CRITICAL SAFETY CAP ENFORCED</span>
 </div>
 <p className="text-xs text-crit leading-relaxed">
            {score.safety_cap_reason ?? "A critical safety violation occurred. By flight governance rules, vehicle loss or severe safety breaches cap the score at 40%, Grade F, and 0 Stars regardless of science return."}
 </p>
          {score.safety_flags && score.safety_flags.length > 0 && (
 <ul className="mt-2 list-disc list-inside text-xs text-crit space-y-0.5">
              {score.safety_flags.map((flag, i) => (
 <li key={i}>{flag}</li>
 ))}
 </ul>
 )}
 </div>
 )}

 <div className="flex items-center justify-between mb-6">
 <div>
 <h2 className="text-2xl font-bold text-ink">
            {Math.round(score.total_score).toLocaleString()}
 <span className="text-sm text-faint font-normal"> / {Math.round(score.max_score).toLocaleString()} pts</span>
 </h2>
 <p className="text-sm text-muted">{pct}% mission success</p>
          {score.stars !== undefined && (
 <div className="mt-2 flex items-center gap-2">
 <span className="text-warn text-lg tracking-widest" aria-label={`${score.stars} of 3 stars`}>
                {"★".repeat(score.stars)}{"☆".repeat(3 - score.stars)}
 </span>
 <span className="text-xs text-muted font-medium">({score.stars}/3 Stars)</span>
 </div>
 )}
 </div>
 <div className={cn("text-6xl font-black", gradeClass)} aria-label={`Grade ${score.grade}`}>
          {score.grade}
 </div>
 </div>

      {score.primary_cause && (
 <div className="mb-4 p-3 rounded-none bg-accent/10 border border-accent/30/50 text-xs">
 <span className="text-accent font-semibold">Primary Outcome: </span>
 <span className="text-ink">{score.primary_cause}</span>
 </div>
 )}

      {score.star_criteria && score.star_criteria.length > 0 && (
 <div className="mb-6 p-3 rounded-none bg-void/60 border border-edge text-xs space-y-1">
 <p className="font-semibold text-ink">Rating Breakdown:</p>
          {score.star_criteria.map((crit, idx) => (
 <p key={idx} className="text-muted">{crit}</p>
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
 <span className="text-ink font-medium">{label}</span>
 <span className="font-mono text-muted">
                  {Math.round(cat.weighted_score)} / {Math.round(cat.max_possible)}
 </span>
 </div>
 <div className="h-2 rounded-full bg-raised overflow-hidden">
 <div
                  className={cn(
                    "h-full rounded-full",
                    catPct >= 80 ? "bg-ok" : catPct >= 50 ? "bg-warn" : "bg-crit"
 )}
                  style={{ width: `${Math.min(100, catPct)}%` }}
                />
 </div>
 <p className="mt-1 text-xs text-faint">{cat.explanation}</p>
 </li>
 );
        })}
 </ul>
 </section>
 );
}
