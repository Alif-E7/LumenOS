import { cn } from "../lib/utils";
import { DATA_PROVENANCE, type ProvenanceType } from "../lib/constants";

interface ProvenanceBadgeProps {
  provenance: ProvenanceType | string;
  customLabel?: string;
  showIcon?: boolean;
  className?: string;
}

interface ProvenanceInfo {
  label: string;
  description: string;
  badgeColor: string;
  className: string;
  disclaimer: string;
}

/**
 * Standard visual honesty badge that clearly indicates whether data is
 * Real NASA Reference, Simulated Spacecraft Observation, Simulated Environment,
 * or Model/AI Prediction.
 */
export function ProvenanceBadge({
  provenance,
  customLabel,
  showIcon = true,
  className,
}: ProvenanceBadgeProps) {
  const provenanceKey = provenance in DATA_PROVENANCE ? (provenance as ProvenanceType) : null;
  const info: ProvenanceInfo = provenanceKey
    ? DATA_PROVENANCE[provenanceKey]
    : {
        label: provenance,
        description: "Data provenance indicator",
        badgeColor: "slate",
        className: "text-slate-400 border-slate-700 bg-slate-800/40",
        disclaimer: "",
      };

  const icons: Record<string, string> = {
    REAL_NASA_REFERENCE: "🛰️",
    REFERENCE: "🛰️",
    SIMULATED_SPACECRAFT: "📡",
    SIMULATED: "📡",
    SIMULATED_ENVIRONMENT: "🌍",
    GROUND_TRUTH: "🌍",
    MODEL_PREDICTION: "🤖",
    AI_PREDICTION: "🤖",
  };

  const icon = icons[provenance] || "◈";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide",
        info.className,
        className
      )}
      title={info.disclaimer || info.description}
    >
      {showIcon && <span aria-hidden>{icon}</span>}
      <span>{customLabel || info.label}</span>
    </span>
  );
}
