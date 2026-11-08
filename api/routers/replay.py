"""
Replay, What-If & Post-Mission Analysis REST Endpoints (Prompt 15).

Provides:
- GET /api/replay/{session_id}: Full recorded trajectory for scrubbing and telemetry inspection.
- POST /api/replay/{session_id}/what_if: Deterministic What-If branching with side-by-side comparison.
- GET /api/replay/{session_id}/cost_analysis: Educational lifecycle cost-per-result analysis.
- GET /api/replay/{session_id}/contributions: Co-op crew contribution breakdown.
- GET /api/replay: List of recorded sessions.
"""

from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from api.services.game_session import session_manager
from game.replay import (
    replay_store,
    WhatIfEngine,
    WhatIfBranchRequest,
    WhatIfComparisonResult,
    MissionTrajectoryRecord,
)
from game.cost_analysis import calculate_cost_per_useful_result, LifecycleCostModel
from game.team_contribution import calculate_team_contributions, TeamContributionBreakdown


router = APIRouter(prefix="/replay", tags=["replay"])


def _get_or_record_trajectory(session_id: str) -> MissionTrajectoryRecord:
    """Retrieve trajectory from store, or snapshot an active session into store."""
    record = replay_store.get_trajectory(session_id)
    if record:
        return record

    active_session = session_manager.get_session(session_id)
    if active_session:
        return replay_store.create_from_game_session(active_session)

    # Demo fallback if requested
    if session_id in ("demo", "showcase", "latest"):
        from game.runtime import SimulationRuntime
        from api.routers.missions import _load_missions
        missions = _load_missions()
        wf = missions.get("wildfire")
        if wf:
            rt = SimulationRuntime.from_mission(wf, seed=42)
            rt.step(30)
            return replay_store.create_from_runtime(rt)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Replay trajectory for session '{session_id}' not found.",
    )


@router.get("", response_model=list[dict[str, Any]])
async def list_replays():
    """List available recorded mission replays."""
    return replay_store.list_trajectories()


@router.get("/{session_id}", response_model=MissionTrajectoryRecord)
async def get_mission_replay(session_id: str):
    """Get complete step-by-step telemetry, events, and command history for scrubbing."""
    return _get_or_record_trajectory(session_id)


@router.post("/{session_id}/what_if", response_model=WhatIfComparisonResult)
async def branch_what_if(session_id: str, body: WhatIfBranchRequest):
    """
    Execute a deterministic What-If simulation branched at step K.
    Returns side-by-side comparison labeled 'NEW SIMULATION (WHAT-IF)'.
    """
    trajectory = _get_or_record_trajectory(session_id)
    result = WhatIfEngine.run_what_if(trajectory=trajectory, request=body)
    return result


@router.get("/{session_id}/cost_analysis", response_model=LifecycleCostModel)
async def get_cost_analysis(session_id: str):
    """Educational 'Is It Worth It?' amortized lifecycle cost-per-result analysis."""
    trajectory = _get_or_record_trajectory(session_id)
    if trajectory.cost_analysis:
        return LifecycleCostModel.model_validate(trajectory.cost_analysis)

    # Compute if not cached
    downlinked = 0.0
    if trajectory.steps:
        downlinked = trajectory.steps[-1].telemetry.get("comms", {}).get("data_downlinked_mb", 0.0)

    return calculate_cost_per_useful_result(
        data_downlinked_mb=downlinked,
        alerts_delivered=len([e for e in trajectory.key_events if e.category in ("anomaly", "event")]),
        budget_spent_credits=5000.0,
        steps_elapsed=trajectory.total_steps,
        time_step_seconds=trajectory.time_step_seconds,
    )


@router.get("/{session_id}/contributions", response_model=TeamContributionBreakdown)
async def get_team_contributions(session_id: str):
    """Cooperative crew contribution summary with anti-spam normalization."""
    trajectory = _get_or_record_trajectory(session_id)
    if trajectory.team_contributions:
        return TeamContributionBreakdown.model_validate(trajectory.team_contributions)

    return calculate_team_contributions(
        action_log=[act for s in trajectory.steps for act in s.actions],
        roles_map={"solo_operator": ["Mission Director", "Systems Engineer", "Science Officer", "Flight Controller"]},
        telemetry_summary={
            "data_downlinked_mb": trajectory.steps[-1].telemetry.get("comms", {}).get("data_downlinked_mb", 0.0) if trajectory.steps else 0.0,
            "spacecraft_health_pct": trajectory.steps[-1].spacecraft_health_pct if trajectory.steps else 100.0,
        },
    )
