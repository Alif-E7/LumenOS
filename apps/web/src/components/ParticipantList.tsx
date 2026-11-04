import type { ParticipantInfo } from "../types";
import { cn } from "../lib/utils";

interface ParticipantListProps {
  participants: ParticipantInfo[];
  /** Highlight this player in the list. */
  selfId?: string | null;
  className?: string;
}

/** Lobby roster — who's connected, who's ready, who hosts. */
export function ParticipantList({ participants, selfId, className }: ParticipantListProps) {
  return (
    <ul className={cn("space-y-2", className)} aria-label="Room participants">
      {participants.map((p) => (
        <li
          key={p.player_id}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
            p.player_id === selfId
              ? "border-blue-500/50 bg-blue-950/30"
              : "border-slate-800 bg-slate-900/50",
            !p.connected && "opacity-50"
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              p.connected ? "bg-green-500" : "bg-slate-600"
            )}
            title={p.connected ? "Connected" : "Disconnected"}
            aria-hidden
          />
          <span className="text-slate-200 font-medium flex-1">
            {p.display_name}
            {p.player_id === selfId && <span className="text-slate-500"> (you)</span>}
          </span>
          {p.is_host && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Host
            </span>
          )}
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full border",
              p.ready
                ? "bg-green-500/20 text-green-400 border-green-500/30"
                : "bg-slate-700/40 text-slate-400 border-slate-600/40"
            )}
          >
            {p.ready ? "✓ Ready" : "Not ready"}
          </span>
        </li>
      ))}
    </ul>
  );
}
