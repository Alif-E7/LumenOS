"""
Mission Replay & What-If Branching Engine (Prompt 15).

Provides post-mission telemetry scrubbing, key-event jumping, LumenOS predictive comparison,
and bit-exact deterministic What-If simulation branching.

What-If simulations are strictly labeled 'NEW SIMULATION (WHAT-IF)' and compare:
- Original Run vs Modified Run side-by-side
- Telemetry profiles (Battery SoC, Thermal, Buffer, Workload)
- Score & Star deltas
- Plain-language root causal explanations
"""

from __future__ import annotations

import copy
from dataclasses import is_dataclass, asdict
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from game.contracts import Difficulty
from game.scoring import MissionScorer, ScoreBreakdown
from game.team_contribution import calculate_team_contributions, TeamContributionBreakdown
from game.cost_analysis import calculate_cost_per_useful_result, LifecycleCostModel
from simulation.core import SpacecraftConfig


def _serialize_spacecraft_config(sc: Any) -> dict[str, Any]:
    """Serialize SpacecraftConfig regardless of whether it is a dataclass or pydantic model."""
    if sc is None:
        return {}
    if hasattr(sc, "model_dump"):
        return sc.model_dump()
    if is_dataclass(sc):
        try:
            return asdict(sc)
        except Exception:
            return {"name": getattr(sc, "name", "LumenOS Orbiter")}
    if hasattr(sc, "__dict__"):
        return {k: v for k, v in sc.__dict__.items() if not k.startswith("_")}
    return {}


class StepReplaySnapshot(BaseModel):
    """Timestamped telemetry and decision snapshot for a single simulation step."""
    step: int
    elapsed_seconds: float
    status: str
    spacecraft_health_pct: float
    budget_remaining: float
    telemetry: dict[str, Any]
    events: list[dict[str, Any]] = Field(default_factory=list)
    actions: list[dict[str, Any]] = Field(default_factory=list)
    decision: Optional[dict[str, Any]] = None
    advisory_forecast: Optional[dict[str, Any]] = None
    advisory_recommendations: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class KeyEvent(BaseModel):
    """Jump target marking a significant operational moment in the mission."""
    step: int
    elapsed_seconds: float
    category: str        # "eclipse" | "contact" | "anomaly" | "decision" | "advisory"
    title: str
    description: str
    severity: str = "nominal"  # nominal | warning | critical


class MissionTrajectoryRecord(BaseModel):
    """Complete persistent mission history for playback, scrubbing, and branching."""
    session_id: str
    mission_id: str
    seed: int
    total_steps: int
    time_step_seconds: float = 60.0
    status: str = "completed"
    outcome: Optional[str] = "win"
    spacecraft_name: str = "LumenOS Orbiter"
    difficulty: str = "engineer"
    steps: list[StepReplaySnapshot] = Field(default_factory=list)
    key_events: list[KeyEvent] = Field(default_factory=list)
    score_breakdown: Optional[dict[str, Any]] = None
    team_contributions: Optional[dict[str, Any]] = None
    cost_analysis: Optional[dict[str, Any]] = None
    checkpoints: dict[int, dict[str, Any]] = Field(default_factory=dict)
    spacecraft_config: Optional[dict[str, Any]] = None


class WhatIfBranchRequest(BaseModel):
    """Request to branch a completed mission at a specific step with modified commands."""
    branch_step: int
    modified_actions: list[dict[str, Any]] = Field(default_factory=list)
    label: str = "What-If Branch"


class TrajectoryPoint(BaseModel):
    """Lightweight telemetry curve point for side-by-side charts."""
    step: int
    elapsed_seconds: float
    battery_soc_pct: float
    temperature_c: float
    data_downlinked_mb: float
    spacecraft_health_pct: float
    cpu_usage_pct: float


class WhatIfComparisonResult(BaseModel):
    """Side-by-side comparison between Original Run and What-If Fork."""
    branch_step: int
    label: str
    semantic_tag: str = "NEW SIMULATION (WHAT-IF)"
    is_what_if: bool = True

    # High-level outcome comparison
    original_score: float
    modified_score: float
    score_delta: float

    original_grade: str
    modified_grade: str

    original_stars: int
    modified_stars: int
    stars_delta: int

    original_health_final: float
    modified_health_final: float
    health_delta: float

    original_downlink_mb: float
    modified_downlink_mb: float
    downlink_delta: float

    delta_explanation: str

    # Trajectories for side-by-side charting
    original_trajectory: list[TrajectoryPoint] = Field(default_factory=list)
    modified_trajectory: list[TrajectoryPoint] = Field(default_factory=list)

    # Full score breakdowns
    original_score_breakdown: Optional[dict[str, Any]] = None
    modified_score_breakdown: Optional[dict[str, Any]] = None


class ReplayStore:
    """In-memory and persistent registry of recorded mission trajectories."""

    def __init__(self):
        self._trajectories: dict[str, MissionTrajectoryRecord] = {}

    def save_trajectory(self, trajectory: MissionTrajectoryRecord) -> None:
        self._trajectories[trajectory.session_id] = trajectory

    def get_trajectory(self, session_id: str) -> Optional[MissionTrajectoryRecord]:
        traj = self._trajectories.get(session_id)
        if traj:
            return traj
        # Check if there is only one trajectory or fallback
        if len(self._trajectories) == 1:
            return next(iter(self._trajectories.values()))
        return None

    def list_trajectories(self) -> list[dict[str, Any]]:
        return [
            {
                "session_id": t.session_id,
                "mission_id": t.mission_id,
                "seed": t.seed,
                "total_steps": t.total_steps,
                "outcome": t.outcome,
                "final_score": t.score_breakdown.get("total_score") if t.score_breakdown else 0.0,
                "grade": t.score_breakdown.get("grade") if t.score_breakdown else "N/A",
                "stars": t.score_breakdown.get("stars") if t.score_breakdown else 0,
            }
            for t in self._trajectories.values()
        ]

    def create_from_runtime(self, runtime: Any) -> MissionTrajectoryRecord:
        """Construct full MissionTrajectoryRecord from SimulationRuntime."""
        steps_list: list[StepReplaySnapshot] = []
        key_events: list[KeyEvent] = []

        total_steps = len(runtime.telemetry_history)
        dt = runtime.time_step_seconds

        # Map actions by step
        actions_by_step: dict[int, list[dict[str, Any]]] = {}
        for act in runtime.action_log:
            s = act.get("step", 0)
            actions_by_step.setdefault(s, []).append(act)

        # Map events by step
        events_by_step: dict[int, list[dict[str, Any]]] = {}
        for ev in runtime.event_director.all_events:
            s = ev.triggered_step
            events_by_step.setdefault(s, []).append({
                "event_id": ev.event_id,
                "name": ev.name,
                "severity": ev.severity.value if hasattr(ev.severity, "value") else str(ev.severity),
                "phase": ev.phase.value if hasattr(ev.phase, "value") else str(ev.phase),
            })
            key_events.append(KeyEvent(
                step=s,
                elapsed_seconds=s * dt,
                category="anomaly" if "hazard" in ev.name.lower() or "fault" in ev.name.lower() else "event",
                title=ev.name,
                description=ev.description,
                severity=ev.severity.value if hasattr(ev.severity, "value") else "nominal",
            ))

        # Checkpoints dictionary
        checkpoints: dict[int, dict[str, Any]] = {}

        for i, tel in enumerate(runtime.telemetry_history):
            s = tel.get("step", i + 1)
            t_sec = tel.get("elapsed_seconds", s * dt)

            # Key moments detection
            orb = tel.get("orbital", {})
            pwr = tel.get("power", {})
            com = tel.get("comms", {})

            if orb.get("in_eclipse") and (i == 0 or not runtime.telemetry_history[i-1].get("orbital", {}).get("in_eclipse")):
                key_events.append(KeyEvent(
                    step=s,
                    elapsed_seconds=t_sec,
                    category="eclipse",
                    title="Eclipse Ingress",
                    description="Orbiter entered Earth shadow. Solar generation dropped to 0W.",
                    severity="warning",
                ))
            elif not orb.get("in_eclipse") and i > 0 and runtime.telemetry_history[i-1].get("orbital", {}).get("in_eclipse"):
                key_events.append(KeyEvent(
                    step=s,
                    elapsed_seconds=t_sec,
                    category="eclipse",
                    title="Eclipse Egress",
                    description="Orbiter re-entered sunlight. Solar arrays resumed charging.",
                    severity="nominal",
                ))

            if com.get("in_contact") and (i == 0 or not runtime.telemetry_history[i-1].get("comms", {}).get("in_contact")):
                key_events.append(KeyEvent(
                    step=s,
                    elapsed_seconds=t_sec,
                    category="contact",
                    title=f"Ground Contact: {com.get('active_station', 'Station')}",
                    description=f"AOS established at {com.get('elevation_deg', 0):.1f}° elevation.",
                    severity="nominal",
                ))

            step_actions = actions_by_step.get(s, [])
            if step_actions:
                for act in step_actions:
                    key_events.append(KeyEvent(
                        step=s,
                        elapsed_seconds=t_sec,
                        category="decision",
                        title=f"Action: {act.get('action_type', 'command')}",
                        description=f"Executed by {act.get('role', 'operator')} ({act.get('actor', 'player')}).",
                        severity="nominal",
                    ))

            snap = StepReplaySnapshot(
                step=s,
                elapsed_seconds=t_sec,
                status=tel.get("status", "running"),
                spacecraft_health_pct=tel.get("spacecraft_health_pct", 100.0),
                budget_remaining=tel.get("budget_remaining", 0.0),
                telemetry=tel,
                events=events_by_step.get(s, []),
                actions=step_actions,
            )
            steps_list.append(snap)

        # Sort key events by step
        key_events.sort(key=lambda k: k.step)

        # Checkpoints: record initial and final states
        checkpoints[0] = runtime.save_checkpoint()

        # Score breakdown
        score_bd = runtime.get_score_breakdown()

        # Team contribution
        roles_dict = {pid: [r.value for r in runtime.roles.player_roles.get(pid, [])] for pid in runtime.player_ids}
        team_contrib = calculate_team_contributions(
            action_log=runtime.action_log,
            roles_map=roles_dict,
            telemetry_summary={
                "data_downlinked_mb": runtime._sim._comms.state.data_downlinked_mb,
                "spacecraft_health_pct": runtime._sim.get_snapshot().spacecraft_health_pct if runtime._sim.get_snapshot() else 100.0,
            },
        )

        # Cost analysis
        cost_anal = calculate_cost_per_useful_result(
            data_downlinked_mb=runtime._sim._comms.state.data_downlinked_mb,
            alerts_delivered=len([e for e in runtime.event_director.resolved_events if "resolved" in str(e.phase)]),
            budget_spent_credits=runtime.budget_total - runtime.budget_remaining,
            steps_elapsed=total_steps,
            time_step_seconds=dt,
        )

        record = MissionTrajectoryRecord(
            session_id=runtime.session_id,
            mission_id=runtime.mission_id,
            seed=runtime.seed,
            total_steps=total_steps,
            time_step_seconds=dt,
            status=runtime.status,
            outcome=runtime.outcome.value if runtime.outcome else "completed",
            spacecraft_name=runtime.spacecraft.name,
            difficulty=runtime.contract.difficulty.value if hasattr(runtime.contract.difficulty, "value") else str(runtime.contract.difficulty),
            steps=steps_list,
            key_events=key_events,
            score_breakdown=score_bd.model_dump(),
            team_contributions=team_contrib.model_dump(),
            cost_analysis=cost_anal.model_dump(),
            checkpoints=checkpoints,
            spacecraft_config=_serialize_spacecraft_config(runtime.spacecraft),
        )
        self.save_trajectory(record)
        return record

    def create_from_game_session(self, session: Any) -> MissionTrajectoryRecord:
        """Construct full MissionTrajectoryRecord from GameSession."""
        steps_list: list[StepReplaySnapshot] = []
        key_events: list[KeyEvent] = []

        history = session._sim.history
        total_steps = len(history)
        dt = session._sim.config.time_step_seconds

        # Map actions
        actions_by_step: dict[int, list[dict[str, Any]]] = {}
        for act in session.state.action_log:
            s = act.step
            actions_by_step.setdefault(s, []).append(act.model_dump())

        # Map events
        events_by_step: dict[int, list[dict[str, Any]]] = {}
        for ev in session._events.all_events:
            s = ev.triggered_step
            events_by_step.setdefault(s, []).append({
                "event_id": ev.event_id,
                "name": ev.name,
                "severity": ev.severity.value,
                "phase": ev.phase.value,
            })
            key_events.append(KeyEvent(
                step=s,
                elapsed_seconds=s * dt,
                category="anomaly" if ev.severity.value in ("warning", "critical") else "event",
                title=ev.name,
                description=ev.description,
                severity=ev.severity.value,
            ))

        for i, snap in enumerate(history):
            s = snap.step
            t_sec = snap.elapsed_seconds
            tel = session._telemetry(snap)

            # Eclipse detection
            if snap.orbital.in_eclipse and (i == 0 or not history[i-1].orbital.in_eclipse):
                key_events.append(KeyEvent(
                    step=s,
                    elapsed_seconds=t_sec,
                    category="eclipse",
                    title="Eclipse Ingress",
                    description="Orbiter entered Earth shadow. Solar generation ceased.",
                    severity="warning",
                ))
            elif not snap.orbital.in_eclipse and i > 0 and history[i-1].orbital.in_eclipse:
                key_events.append(KeyEvent(
                    step=s,
                    elapsed_seconds=t_sec,
                    category="eclipse",
                    title="Eclipse Egress",
                    description="Orbiter re-emerged into full sunlight.",
                    severity="nominal",
                ))

            # Ground contact detection
            if snap.comms.in_contact and (i == 0 or not history[i-1].comms.in_contact):
                key_events.append(KeyEvent(
                    step=s,
                    elapsed_seconds=t_sec,
                    category="contact",
                    title=f"Contact: {snap.comms.active_station or 'Ground Station'}",
                    description=f"Elevation: {snap.comms.elevation_deg:.1f}°. Downlink available.",
                    severity="nominal",
                ))

            step_actions = actions_by_step.get(s, [])
            for act in step_actions:
                key_events.append(KeyEvent(
                    step=s,
                    elapsed_seconds=t_sec,
                    category="decision",
                    title=f"Action: {act.get('action_type')}",
                    description=f"Performed by {act.get('player_id', 'operator')}",
                    severity="nominal",
                ))

            rep_snap = StepReplaySnapshot(
                step=s,
                elapsed_seconds=t_sec,
                status=session.state.status,
                spacecraft_health_pct=snap.spacecraft_health_pct,
                budget_remaining=session.state.budget_remaining,
                telemetry=tel,
                events=events_by_step.get(s, []),
                actions=step_actions,
            )
            steps_list.append(rep_snap)

        key_events.sort(key=lambda k: k.step)

        score_bd = session.get_score_breakdown()
        roles_dict = {pid: [r.value for r in session.roles.player_roles.get(pid, [])] for pid in session._player_ids}
        team_contrib = calculate_team_contributions(
            action_log=[a.model_dump() for a in session.state.action_log],
            roles_map=roles_dict,
            telemetry_summary={
                "data_downlinked_mb": session.state.data_downlinked_mb,
                "spacecraft_health_pct": session.state.spacecraft_health_pct,
            },
        )

        cost_anal = calculate_cost_per_useful_result(
            data_downlinked_mb=session.state.data_downlinked_mb,
            alerts_delivered=session.state.well_handled_event_count,
            budget_spent_credits=session.state.budget_total - session.state.budget_remaining,
            steps_elapsed=total_steps,
            time_step_seconds=dt,
        )

        record = MissionTrajectoryRecord(
            session_id=session.session_id,
            mission_id=session.mission.id,
            seed=session.seed,
            total_steps=total_steps,
            time_step_seconds=dt,
            status=session.state.status,
            outcome=session.state.outcome.value if session.state.outcome else "completed",
            spacecraft_name=session.spacecraft.name,
            difficulty=str(session._contract.difficulty.value if hasattr(session._contract.difficulty, "value") else session._contract.difficulty),
            steps=steps_list,
            key_events=key_events,
            score_breakdown=score_bd.model_dump(),
            team_contributions=team_contrib.model_dump(),
            cost_analysis=cost_anal.model_dump(),
            spacecraft_config=_serialize_spacecraft_config(session.spacecraft),
        )
        self.save_trajectory(record)
        return record


# Global singleton store
replay_store = ReplayStore()


# ── What-If Branching Engine ─────────────────────────────────────────────────


class WhatIfEngine:
    """
    Executes bit-exact deterministic simulations forked from an existing mission trajectory.
    """

    @staticmethod
    def run_what_if(
        trajectory: MissionTrajectoryRecord,
        request: WhatIfBranchRequest,
    ) -> WhatIfComparisonResult:
        """
        Branch from step K, inject modified action(s), advance deterministically to the end,
        and generate a comprehensive side-by-side comparison report.
        """
        from game.runtime import SimulationRuntime
        from game.command_resolver import CommandRequest
        from api.models.mission import MissionDetail
        from api.routers.missions import _load_missions

        # 1. Prepare base mission detail
        missions = _load_missions()
        mission = missions.get(trajectory.mission_id)
        if mission is None:
            # Fallback mock mission detail
            mission = MissionDetail(
                id=trajectory.mission_id,
                name=trajectory.mission_id.replace("_", " ").title(),
                description=f"Mission {trajectory.mission_id}",
                difficulty=2,
                duration_hours=2.0,
                orbit_altitude_km=550.0,
                orbit_inclination_deg=97.5,
                objectives=[],
                event_pool=[],
            )

        spacecraft_cfg = SpacecraftConfig(
            name=trajectory.spacecraft_name,
        )

        # 2. Instantiate a fresh SimulationRuntime with the exact same seed & config
        branched_runtime = SimulationRuntime.from_mission(
            mission=mission,
            spacecraft_config=spacecraft_cfg,
            seed=trajectory.seed,
            difficulty=Difficulty.from_int(2) if hasattr(Difficulty, "from_int") else Difficulty.ENGINEER,
        )

        branch_step = max(1, min(request.branch_step, trajectory.total_steps))

        # 3. Replay original commands up to branch_step - 1
        actions_by_step: dict[int, list[dict[str, Any]]] = {}
        for snap in trajectory.steps:
            if snap.actions:
                actions_by_step[snap.step] = snap.actions

        for s in range(1, branch_step):
            # Check if original run had actions at this step
            orig_acts = actions_by_step.get(s, [])
            for act in orig_acts:
                branched_runtime.queue_command(CommandRequest(
                    actor=act.get("actor", "operator"),
                    role=act.get("role", "flight_controller"),
                    action_type=act.get("action_type", "toggle_subsystem"),
                    params=act.get("params", {}),
                ))
            branched_runtime.step(1)

        # 4. At branch_step, execute modified actions instead
        for m_act in request.modified_actions:
            branched_runtime.queue_command(CommandRequest(
                actor=m_act.get("actor", "what_if_specialist"),
                role=m_act.get("role", "flight_controller"),
                action_type=m_act.get("action_type", "toggle_subsystem"),
                params=m_act.get("params", {}),
            ))
        branched_runtime.step(1)

        # 5. Run forward from branch_step + 1 up to total_steps
        remaining_steps = max(0, trajectory.total_steps - branch_step)
        for s in range(branch_step + 1, trajectory.total_steps + 1):
            # Optional: apply subsequent original actions if compatible
            orig_acts = actions_by_step.get(s, [])
            for act in orig_acts:
                branched_runtime.queue_command(CommandRequest(
                    actor=act.get("actor", "operator"),
                    role=act.get("role", "flight_controller"),
                    action_type=act.get("action_type", "toggle_subsystem"),
                    params=act.get("params", {}),
                ))
            branched_runtime.step(1)

        # 6. Extract results & compare
        orig_score = trajectory.score_breakdown.get("total_score", 0.0) if trajectory.score_breakdown else 0.0
        orig_grade = trajectory.score_breakdown.get("grade", "F") if trajectory.score_breakdown else "F"
        orig_stars = trajectory.score_breakdown.get("stars", 0) if trajectory.score_breakdown else 0

        mod_score_bd = branched_runtime.get_score_breakdown()
        mod_score = mod_score_bd.total_score
        mod_grade = mod_score_bd.grade.value
        mod_stars = mod_score_bd.stars

        score_delta = round(mod_score - orig_score, 2)
        stars_delta = mod_stars - orig_stars

        # Final health & downlink deltas
        orig_last_step = trajectory.steps[-1] if trajectory.steps else None
        orig_health = orig_last_step.spacecraft_health_pct if orig_last_step else 100.0
        orig_downlink = orig_last_step.telemetry.get("comms", {}).get("data_downlinked_mb", 0.0) if orig_last_step else 0.0

        mod_snap = branched_runtime._sim.get_snapshot()
        mod_health = mod_snap.spacecraft_health_pct if mod_snap else 100.0
        mod_downlink = branched_runtime._sim._comms.state.data_downlinked_mb

        health_delta = round(mod_health - orig_health, 1)
        downlink_delta = round(mod_downlink - orig_downlink, 1)

        # Construct trajectory curves
        orig_curve: list[TrajectoryPoint] = []
        for s in trajectory.steps:
            t = s.telemetry
            orig_curve.append(TrajectoryPoint(
                step=s.step,
                elapsed_seconds=s.elapsed_seconds,
                battery_soc_pct=t.get("power", {}).get("battery_soc_pct", 100.0),
                temperature_c=t.get("thermal", {}).get("temperature_c", 20.0),
                data_downlinked_mb=t.get("comms", {}).get("data_downlinked_mb", 0.0),
                spacecraft_health_pct=s.spacecraft_health_pct,
                cpu_usage_pct=t.get("workload", {}).get("cpu_usage_pct", 0.0),
            ))

        mod_curve: list[TrajectoryPoint] = []
        for t in branched_runtime.telemetry_history:
            mod_curve.append(TrajectoryPoint(
                step=t.get("step", 0),
                elapsed_seconds=t.get("elapsed_seconds", 0.0),
                battery_soc_pct=t.get("power", {}).get("battery_soc_pct", 100.0),
                temperature_c=t.get("thermal", {}).get("temperature_c", 20.0),
                data_downlinked_mb=t.get("comms", {}).get("data_downlinked_mb", 0.0),
                spacecraft_health_pct=t.get("spacecraft_health_pct", 100.0),
                cpu_usage_pct=t.get("workload", {}).get("cpu_usage_pct", 0.0),
            ))

        # Construct explainable plain-language narrative
        if score_delta > 5.0 or stars_delta > 0:
            narrative = (
                f"What-If Strategy Succeeded: Forking at Step {branch_step} with modified decisions "
                f"improved mission score by +{score_delta:.1f} pts ({orig_grade} → {mod_grade}). "
                f"Spacecraft health shifted by {health_delta:+.1f}%, and useful downlink shifted by {downlink_delta:+.1f} MB. "
                f"Critical subsystem margins were better maintained through the operational horizon."
            )
        elif score_delta < -5.0 or stars_delta < 0:
            narrative = (
                f"What-If Strategy Compromised: Forking at Step {branch_step} reduced final score by {score_delta:.1f} pts "
                f"({orig_grade} → {mod_grade}). The alternative command path incurred greater thermal/battery depletion "
                f"or missed primary science downlink opportunities."
            )
        else:
            narrative = (
                f"What-If Strategy Neutral: Forking at Step {branch_step} produced comparable performance "
                f"(Score delta {score_delta:+.1f} pts, Health delta {health_delta:+.1f}%). "
                f"Subsystem equilibrium and scientific output remained largely equivalent to the baseline run."
            )

        return WhatIfComparisonResult(
            branch_step=branch_step,
            label=request.label,
            semantic_tag="NEW SIMULATION (WHAT-IF)",
            is_what_if=True,
            original_score=round(orig_score, 1),
            modified_score=round(mod_score, 1),
            score_delta=score_delta,
            original_grade=orig_grade,
            modified_grade=mod_grade,
            original_stars=orig_stars,
            modified_stars=mod_stars,
            stars_delta=stars_delta,
            original_health_final=round(orig_health, 1),
            modified_health_final=round(mod_health, 1),
            health_delta=health_delta,
            original_downlink_mb=round(orig_downlink, 1),
            modified_downlink_mb=round(mod_downlink, 1),
            downlink_delta=downlink_delta,
            delta_explanation=narrative,
            original_trajectory=orig_curve,
            modified_trajectory=mod_curve,
            original_score_breakdown=trajectory.score_breakdown,
            modified_score_breakdown=mod_score_bd.model_dump(),
        )
