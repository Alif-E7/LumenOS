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
  Icon: (typeof DATA_PROVENANCE)["MODEL_PREDICTION"]["Icon"];
  className: string;
  disclaimer: string;
}

/**
 * Visual honesty badge indicating whether data is Real NASA Reference,
 * Simulated Spacecraft Observation, Simulated Environment, or Model/AI Prediction.
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
        Icon: DATA_PROVENANCE.SIMULATED.Icon,
        className: "text-muted border-edge-strong bg-raised",
        disclaimer: "",
      };

  const { Icon } = info;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
        info.className,
        className
      )}
      title={info.disclaimer || info.description}
    >
      {showIcon && <Icon aria-hidden className="h-3 w-3" />}
      <span>{customLabel || info.label}</span>
    </span>
  );
}
