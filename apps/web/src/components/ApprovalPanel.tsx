import type { ParticipantInfo } from "../types";
import { cn } from "../lib/utils";

interface ApprovalPanelProps {
  /** The request being voted on (e.g. "Start Mission"). */
  requestLabel: string;
  /** Players whose approval is required. */
  participants: ParticipantInfo[];
  /** Which participant is issuing the request (usually the host). */
  requesterId: string | null;
  /** Can the current player approve/deny right now? */
  canRespond?: boolean;
  onApprove?: () => void;
  onDeny?: () => void;
  className?: string;
}

/**
 * Request/approval panel — makes group consent explicit.
 * In the lobby it powers the "everyone ready" start check; each
 * player's approval state comes from the live room, not local guesswork.
 */
export function ApprovalPanel({
  requestLabel,
  participants,
  requesterId,
  canRespond = false,
  onApprove,
  onDeny,
  className,
}: ApprovalPanelProps) {
  const approved = participants.filter((p) => p.ready).length;
  const total = participants.length;

  return (
 <section
      className={cn("rounded-none border border-edge-strong bg-panel/70 p-5", className)}
      aria-label={requestLabel}
 >
 <div className="flex items-center justify-between mb-3">
 <h3 className="text-sm font-semibold text-ink">{requestLabel}</h3>
 <span className="text-xs font-mono text-muted">
          {approved}/{total} approved
 </span>
 </div>
 <div className="space-y-1.5 mb-4">
        {participants.map((p) => (
 <div key={p.player_id} className="flex items-center gap-2 text-sm">
 <span aria-hidden>{p.ready ? "" : ""}</span>
 <span className="text-ink">
              {p.display_name}
              {p.player_id === requesterId && (
 <span className="text-faint text-xs"> — requested</span>
 )}
 </span>
 </div>
 ))}
 </div>
      {canRespond && (
 <div className="flex gap-2">
 <button
            onClick={onApprove}
            className="flex-1 rounded-none bg-ok/80 hover:bg-ok text-ink text-sm font-medium py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-ok"
 >
            Approve
 </button>
 <button
            onClick={onDeny}
            className="flex-1 rounded-none bg-edge-strong hover:bg-edge-strong text-ink text-sm font-medium py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
 >
            Hold
 </button>
 </div>
 )}
 </section>
 );
}
