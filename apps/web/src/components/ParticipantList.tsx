import type { ParticipantInfo } from "../types";
import { cn } from "../lib/utils";
import { RoleBadge } from "./RoleBadge";
import type { RoleId } from "../lib/constants";
import { Button } from "./Button";

export interface PendingActionRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  role: RoleId;
  actionType: string;
  description: string;
  timestamp: string;
}

export interface ActionAuditEntry {
  actor: string;
  role: string;
  actionType: string;
  timestamp: string;
  result: "ACCEPTED" | "REJECTED";
  detail?: string;
}

interface ParticipantListProps {
  participants: ParticipantInfo[];
  /** Highlight this player in the list. */
  selfId?: string | null;
  /** Role assignments map: player_id -> role ids */
  roles?: Record<string, string[]>;
  /** Pending action requests awaiting crew/director authorization */
  pendingRequests?: PendingActionRequest[];
  /** Recent actions executed by team members */
  recentActions?: ActionAuditEntry[];
  /** Shared rolling activity feed */
  feed?: string[];
  onApproveRequest?: (requestId: string) => void;
  onRejectRequest?: (requestId: string) => void;
  onSendTacticalPing?: (pingType: string, message: string) => void;
  canApprove?: boolean;
  userRoles?: string[];
  className?: string;
}

/**
 * Co-op Crew Roster & Action Command Desk.
 * Displays participant name, role, ready/connected state, action requests,
 * approval status, who acted, tactical coordination pings, and the command result.
 */
export function ParticipantList({
  participants,
  selfId,
  roles = {},
  pendingRequests = [],
  recentActions = [],
  feed = [],
  onApproveRequest,
  onRejectRequest,
  onSendTacticalPing,
  canApprove = false,
  userRoles = [],
  className,
}: ParticipantListProps) {
  return (
 <div className={cn("space-y-4", className)}>
      {/* Crew Members List */}
 <ul className="space-y-2" aria-label="Room participants and role assignments">
        {participants.map((p) => {
          const pRoles = (roles[p.player_id] ?? p.roles ?? []) as RoleId[];
          return (
 <li
              key={p.player_id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-none border px-3 py-2 text-sm",
                p.player_id === selfId
                  ? "border-accent/50 bg-accent/10"
                  : "border-edge bg-panel/50",
                !p.connected && "opacity-60 bg-void/40 border-crit/30"
 )}
 >
 <div className="flex items-center gap-2.5">
 <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    p.connected ? "bg-ok animate-pulse" : "bg-crit"
 )}
                  title={p.connected ? "Connected" : "Disconnected (reconnecting...)"}
                  aria-hidden
                />
 <span className="text-ink font-medium">
                  {p.display_name}
                  {p.player_id === selfId && <span className="text-accent"> (you)</span>}
 </span>
                {p.is_host && (
 <span className="text-xs px-2 py-0.5 rounded-full bg-warn/20 text-warn border border-warn/30 font-mono">
                    Host
 </span>
 )}
                {!p.connected && (
 <span className="text-[10px] px-1.5 py-0.5 rounded-none bg-crit/10 text-crit border-crit/40 font-mono">
                    DISCONNECTED
 </span>
 )}
 </div>

              {/* Roles Badges */}
 <div className="flex items-center gap-1.5 flex-wrap">
                {pRoles.length > 0 ? (
                  pRoles.map((r) => <RoleBadge key={r} role={r} size="sm" />)
 ) : (
 <span className="text-xs text-faint italic">Assigning role...</span>
 )}
 <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full border font-mono",
                    p.ready
                      ? "bg-ok/20 text-ok border-ok/30"
                      : "bg-edge-strong/40 text-muted border-edge-strong/40"
 )}
 >
                  {p.ready ? "Ready" : "Standby"}
 </span>
 </div>
 </li>
 );
        })}
 </ul>

      {/* Quick Tactical Coordination Pings */}
      {onSendTacticalPing && (
 <div className="p-2.5 rounded-none border border-edge bg-void/40">
 <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
            Tactical Coordination Pings
 </div>
 <div className="flex flex-wrap gap-1.5">
 <button
              type="button"
              onClick={() => onSendTacticalPing("NEED_POWER", "Requesting additional power allocation")}
              className="px-2 py-1 bg-raised hover:bg-edge-strong text-ink text-xs rounded-none border border-edge-strong transition-colors"
 >
              Need Power
 </button>
 <button
              type="button"
              onClick={() => onSendTacticalPing("STATION_PASS", "Ground station contact in <60s")}
              className="px-2 py-1 bg-raised hover:bg-edge-strong text-ink text-xs rounded-none border border-edge-strong transition-colors"
 >
              Station Pass
 </button>
 <button
              type="button"
              onClick={() => onSendTacticalPing("THERMAL_WARN", "Thermal bus margin low")}
              className="px-2 py-1 bg-raised hover:bg-edge-strong text-ink text-xs rounded-none border border-edge-strong transition-colors"
 >
              Thermal Margin
 </button>
 <button
              type="button"
              onClick={() => onSendTacticalPing("DOWNLINK_STANDBY", "Standby for science downlink")}
              className="px-2 py-1 bg-raised hover:bg-edge-strong text-ink text-xs rounded-none border border-edge-strong transition-colors"
 >
              Downlink Standby
 </button>
 <button
              type="button"
              onClick={() => onSendTacticalPing("HOLD_STEP", "Requesting hold simulation")}
              className="px-2 py-1 bg-raised hover:bg-edge-strong text-ink text-xs rounded-none border border-edge-strong transition-colors"
 >
              Hold / Pause
 </button>
 </div>
 </div>
 )}

      {/* Pending Action Requests & Authorizations */}
      {pendingRequests.length > 0 && (
 <div className="rounded-none border border-warn/30 bg-warn/10 p-3 space-y-2">
 <div className="flex items-center justify-between">
 <h4 className="text-xs font-semibold text-warn uppercase tracking-wider flex items-center gap-1.5">
              Pending Action Authorizations
 </h4>
 <span className="text-[10px] font-mono text-warn/80">
              {pendingRequests.length} pending
 </span>
 </div>
 <div className="space-y-2">
            {pendingRequests.map((req) => {
              const userCanAuthorize = canApprove || userRoles.includes(req.role);
              return (
 <div
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-3 bg-void/80 border border-warn/20 p-2.5 rounded-none text-xs"
 >
 <div>
 <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
 <span className="font-semibold text-ink">{req.requesterName}</span>
 <RoleBadge role={req.role} size="sm" />
 <span className="text-muted font-mono text-[11px]">{req.actionType}</span>
 </div>
 <p className="text-ink text-[11px]">{req.description}</p>
 </div>
                  {userCanAuthorize && (
 <div className="flex items-center gap-1.5">
 <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onApproveRequest?.(req.id)}
 >
                        Approve
 </Button>
 <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRejectRequest?.(req.id)}
 >
                        Reject
 </Button>
 </div>
 )}
 </div>
 );
            })}
 </div>
 </div>
 )}

      {/* Team Activity & Log Feed */}
      {(feed.length > 0 || recentActions.length > 0) && (
 <div className="rounded-none border border-edge bg-void/60 p-3 space-y-2">
 <h4 className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center justify-between">
 <span>Team Activity & Command Audit Feed</span>
 <span className="text-[10px] font-mono text-faint">REAL-TIME</span>
 </h4>

          {feed.length > 0 && (
 <div className="max-h-36 overflow-y-auto space-y-1 text-xs font-mono text-ink">
              {feed.slice(0, 8).map((line, idx) => (
 <div
                  key={idx}
                  className="px-2 py-1 rounded-none bg-panel/60 border border-edge/40 text-[11px] text-ink"
 >
                  {line}
 </div>
 ))}
 </div>
 )}

          {recentActions.length > 0 && (
 <ul className="space-y-1 text-xs font-mono pt-1">
              {recentActions.slice(0, 4).map((act, idx) => (
 <li
                  key={idx}
                  className="flex items-center justify-between text-ink border-b border-edge/40 pb-1"
 >
 <div className="flex items-center gap-2">
 <span className="text-ink font-medium">{act.actor}</span>
 <span className="text-faint">[{act.role}]</span>
 <span className="text-info">{act.actionType}</span>
 </div>
 <div className="flex items-center gap-2">
 <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-none font-bold",
                        act.result === "ACCEPTED"
                          ? "bg-ok/20 text-ok"
                          : "bg-crit/10 text-crit"
 )}
 >
                      {act.result}
 </span>
 <span className="text-faint text-[10px]">{act.timestamp}</span>
 </div>
 </li>
 ))}
 </ul>
 )}
 </div>
 )}
 </div>
 );
}
