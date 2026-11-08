import { cn } from "../lib/utils";

interface MockDataBadgeProps {
  /** Short explanation of what is mocked and why. */
  reason: string;
  className?: string;
}

/**
 * Honesty label — marks UI regions whose data is illustrative only.
 * Required anywhere we show content the backend doesn't produce yet.
 */
export function MockDataBadge({ reason, className }: MockDataBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border border-edge-strong bg-raised px-2 py-0.5",
        "font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted",
        className
      )}
      title={reason}
    >
      <span aria-hidden className="text-accent">◈</span> MOCK — {reason}
    </span>
  );
}
