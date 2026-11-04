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
        "inline-flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/10",
        "px-2 py-0.5 text-[11px] font-medium text-purple-300",
        className
      )}
      title={reason}
    >
      <span aria-hidden>◈</span> MOCK DATA — {reason}
    </span>
  );
}
