"""
Cooperative Multiplayer Team Contribution System (Prompt 15).

Provides a balanced, factual post-mission contribution breakdown:
- Evaluates role actions, cross-role assistance requests, tactical pings, and anomaly responses.
- Implements anti-spam & anti-monopoly diminishing returns so button spamming does not dominate.
- Credits baseline standby vigilance so roles whose specific event was not triggered are not unfairly penalized.
- Exposes transparent percentage contributions and human-readable role accomplishment highlights.
"""

from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field


class RoleContributionSummary(BaseModel):
    """Factual contribution metrics and highlights for one crew member."""
    player_id: str
    display_name: str
    roles: list[str] = Field(default_factory=list)
    total_actions: int = 0
    effective_actions: int = 0
    spam_filtered_count: int = 0
    coordination_events: int = 0
    standby_vigilance_points: float = 20.0
    impact_metrics: dict[str, Any] = Field(default_factory=dict)
    role_highlights: list[str] = Field(default_factory=list)
    raw_contribution_points: float = 0.0
    contribution_percentage: float = 0.0  # 0.0 to 100.0%


class TeamContributionBreakdown(BaseModel):
    """Complete crew contribution breakdown for Co-op Mission Results."""
    participants: list[RoleContributionSummary] = Field(default_factory=list)
    coordination_index: float = 1.0       # 0.0 to 1.0 team coordination rating
    cross_role_assistance_count: int = 0
    tactical_pings_count: int = 0
    summary_narrative: str = ""

    def get_participant(self, player_id: str) -> Optional[RoleContributionSummary]:
        for p in self.participants:
            if p.player_id == player_id:
                return p
        return None


def calculate_team_contributions(
    action_log: list[dict[str, Any]],
    roles_map: dict[str, list[str]],
    display_names: Optional[dict[str, str]] = None,
    cross_role_requests: Optional[list[dict[str, Any]]] = None,
    tactical_pings: Optional[list[dict[str, Any]]] = None,
    mission_events: Optional[list[dict[str, Any]]] = None,
    telemetry_summary: Optional[dict[str, Any]] = None,
) -> TeamContributionBreakdown:
    """
    Calculate explainable, balanced team contribution metrics for all co-op participants.
    """
    display_names = display_names or {}
    cross_role_requests = cross_role_requests or []
    tactical_pings = tactical_pings or []
    mission_events = mission_events or []
    telemetry_summary = telemetry_summary or {}

    participants: dict[str, RoleContributionSummary] = {}

    # Initialize all known participants
    for pid, roles in roles_map.items():
        name = display_names.get(pid, pid)
        participants[pid] = RoleContributionSummary(
            player_id=pid,
            display_name=name,
            roles=list(roles),
            standby_vigilance_points=20.0,
            raw_contribution_points=20.0,  # Baseline vigilance guarantee
            impact_metrics={
                "commands_executed": 0,
                "requests_coordinated": 0,
                "pings_broadcasted": 0,
                "event_resolutions": 0,
            },
        )

    if not participants:
        # Fallback if no roles supplied (e.g. solo run)
        participants["solo_operator"] = RoleContributionSummary(
            player_id="solo_operator",
            display_name="Solo Flight Director",
            roles=["Mission Director", "Systems Engineer", "Science Officer", "Flight Controller"],
            raw_contribution_points=100.0,
            contribution_percentage=100.0,
            role_highlights=["Solo flight: Full multi-station mission oversight."],
        )
        return TeamContributionBreakdown(
            participants=list(participants.values()),
            coordination_index=1.0,
            summary_narrative="Mission completed under single-operator command.",
        )

    # 1. Action evaluation with anti-spam / diminishing returns
    action_counts: dict[tuple[str, str], int] = {}

    for act in action_log:
        actor = act.get("actor") or act.get("player_id", "")
        action_type = act.get("action_type") or act.get("type", "unknown")
        status = str(act.get("status", "SUCCESS")).upper()

        if actor not in participants:
            # Dynamically register if actor wasn't in initial map
            participants[actor] = RoleContributionSummary(
                player_id=actor,
                display_name=display_names.get(actor, actor),
                roles=["Flight Specialist"],
                standby_vigilance_points=20.0,
                raw_contribution_points=20.0,
                impact_metrics={"commands_executed": 0, "requests_coordinated": 0, "pings_broadcasted": 0},
            )

        p = participants[actor]
        p.total_actions += 1

        if status not in ("SUCCESS", "OK", "EXECUTED"):
            # Failed or rejected commands do not grant progress points
            continue

        p.effective_actions += 1
        p.impact_metrics["commands_executed"] += 1

        # Spam detection: track repetitions of (actor, action_type)
        pair_key = (actor, action_type)
        prev_count = action_counts.get(pair_key, 0)
        action_counts[pair_key] = prev_count + 1

        if prev_count < 3:
            # Full value for strategic actions
            base_pts = 6.0
            if "event" in action_type or "safe_mode" in action_type:
                base_pts = 12.0
            elif "downlink" in action_type or "observe" in action_type:
                base_pts = 8.0
            p.raw_contribution_points += base_pts
        else:
            # Diminishing returns: spamming identical toggles grants marginal credit
            p.spam_filtered_count += 1
            p.raw_contribution_points += 0.5

    # 2. Cross-role requests & assistance
    assistance_count = 0
    for req in cross_role_requests:
        req_from = req.get("from_player_id") or req.get("actor", "")
        req_to = req.get("target_player_id") or req.get("assigned_to", "")
        st = req.get("status", "")

        if req_from in participants:
            participants[req_from].coordination_events += 1
            participants[req_from].impact_metrics["requests_coordinated"] += 1
            participants[req_from].raw_contribution_points += 4.0

        if req_to in participants and st in ("approved", "responded", "completed"):
            assistance_count += 1
            participants[req_to].coordination_events += 1
            participants[req_to].impact_metrics["requests_coordinated"] += 1
            participants[req_to].raw_contribution_points += 8.0

    # 3. Tactical pings
    ping_counts: dict[str, int] = {}
    for ping in tactical_pings:
        sender = ping.get("sender_id") or ping.get("player_id", "")
        if sender in participants:
            c = ping_counts.get(sender, 0)
            if c < 5:  # Cap ping credit at 5 to prevent spam
                ping_counts[sender] = c + 1
                participants[sender].coordination_events += 1
                participants[sender].impact_metrics["pings_broadcasted"] += 1
                participants[sender].raw_contribution_points += 2.0

    # 4. Role-specific highlights & narrative generation
    downlinked_mb = telemetry_summary.get("data_downlinked_mb", 0.0)
    health_pct = telemetry_summary.get("spacecraft_health_pct", 100.0)

    for pid, p in participants.items():
        roles_lower = [r.lower() for r in p.roles]

        if any("director" in r for r in roles_lower):
            p.role_highlights.append("Mission Director: Coordinated tactical priorities & anomaly responses.")
            if p.coordination_events > 0:
                p.role_highlights.append(f"Authored/authorized {p.coordination_events} cross-station coordination directives.")

        if any("systems" in r for r in roles_lower):
            p.role_highlights.append("Systems Engineer: Managed thermal louvers, battery DoD, and power bus.")
            if health_pct >= 80.0:
                p.role_highlights.append(f"Maintained nominal bus equilibrium ({health_pct:.0f}% spacecraft health).")

        if any("science" in r for r in roles_lower):
            p.role_highlights.append("Science Officer: Scheduled target observations and instrument modes.")
            if p.effective_actions > 0:
                p.role_highlights.append(f"Configured and queued observation tasks across mission horizon.")

        if any("flight" in r for r in roles_lower):
            p.role_highlights.append("Flight Controller: Managed telemetry downlink and ground station acquisition.")
            if downlinked_mb > 0:
                p.role_highlights.append(f"Safely transmitted {downlinked_mb:.0f} MB of science data to ground network.")

        if not p.role_highlights:
            p.role_highlights.append("Flight Specialist: Actively maintained station readiness and situational vigilance.")

        if p.spam_filtered_count > 0:
            p.role_highlights.append(f"Notice: {p.spam_filtered_count} redundant/rapid inputs normalized by telemetry filter.")

    # 5. Normalization of contribution percentages
    total_raw_points = sum(p.raw_contribution_points for p in participants.values())
    if total_raw_points > 0:
        for p in participants.values():
            pct = (p.raw_contribution_points / total_raw_points) * 100.0
            p.contribution_percentage = round(pct, 1)
    else:
        equal_share = round(100.0 / len(participants), 1)
        for p in participants.values():
            p.contribution_percentage = equal_share

    # Ensure percentages sum nicely
    diff = 100.0 - sum(p.contribution_percentage for p in participants.values())
    if abs(diff) > 0.01 and participants:
        first_p = next(iter(participants.values()))
        first_p.contribution_percentage = round(first_p.contribution_percentage + diff, 1)

    # Compute overall crew coordination index
    total_coord_events = sum(p.coordination_events for p in participants.values())
    coordination_index = min(1.0, round(0.5 + (total_coord_events * 0.08) + (assistance_count * 0.1), 2))

    if coordination_index >= 0.85:
        narrative = "Exceptional crew synchrony: active communication, timely cross-role approvals, and shared vigilance."
    elif coordination_index >= 0.65:
        narrative = "Effective mission collaboration: key decisions coordinated with solid station autonomy."
    else:
        narrative = "Standard independent station operations: minimal inter-station communication recorded."

    return TeamContributionBreakdown(
        participants=list(participants.values()),
        coordination_index=coordination_index,
        cross_role_assistance_count=assistance_count,
        tactical_pings_count=len(tactical_pings),
        summary_narrative=narrative,
    )

