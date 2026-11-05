"""
Game session REST endpoints — start, step, action, score, and teardown.

Wraps the in-memory SessionManager with validated REST endpoints so that
solo play (and the lobby "start game" flow) can be driven entirely via HTTP.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from api.config import settings
from api.models.mission import MissionDetail
from api.routers.missions import _load_missions
from api.services.game_session import session_manager
from game.designer import SpacecraftDesign
from simulation.core import SpacecraftConfig
from simulation.physics.orbital import OrbitalElements


router = APIRouter(prefix="/game", tags=["game"])


# ── Request / Response models ────────────────────────────────────────────────


class GameStartRequest(BaseModel):
    """Request body for starting a new game session."""
    mission_id: str
    spacecraft_id: Optional[str] = None
    seed: Optional[int] = None
    player_ids: Optional[list[str]] = None
    difficulty: Optional[str] = None
    design: Optional[SpacecraftDesign] = None


class GameStartResponse(BaseModel):
    """Response returned when a game session is created."""
    session_id: str
    mission_id: str
    mission_name: str
    seed: int
    status: str
    game_state: dict[str, Any]


class StepRequest(BaseModel):
    """Request body for advancing the simulation."""
    steps: int = Field(default=1, ge=1, le=100)


class StepResponse(BaseModel):
    """Response returned after advancing the simulation."""
    session_id: str
    results: list[dict[str, Any]]


class ActionRequest(BaseModel):
    """Request body for performing a player action."""
    player_id: str
    action_type: str
    params: dict[str, Any] = Field(default_factory=dict)


class ActionResponse(BaseModel):
    """Response returned after performing a player action."""
    success: bool
    error: Optional[str] = None
    action_type: Optional[str] = None
    budget_cost: Optional[float] = None
    budget_remaining: Optional[float] = None
    sim_result: Optional[dict[str, Any]] = None
    player_roles: Optional[list[str]] = None


class EventResolveRequest(BaseModel):
    """Request body for resolving a mission event."""
    player_id: str
    event_id: str
    choice_id: str


class EventResolveResponse(BaseModel):
    """Response returned after resolving an event."""
    success: bool
    error: Optional[str] = None
    event_id: Optional[str] = None
    choice: Optional[str] = None
    effects: Optional[dict[str, float]] = None
    description: Optional[str] = None


class GameStateResponse(BaseModel):
    """Full game state snapshot."""
    session_id: str
    game_state: dict[str, Any]


class TelemetryResponse(BaseModel):
    """Latest telemetry snapshot for a session."""
    session_id: str
    telemetry: dict[str, Any]


class ScoreResponse(BaseModel):
    """Score breakdown for the current session."""
    session_id: str
    total_score: float
    max_score: float
    score_fraction: float
    grade: str
    stars: int = Field(default=0, ge=0, le=3)
    star_criteria: list[str] = Field(default_factory=list)
    explanation: str = ""
    categories: list[dict[str, Any]]


class SessionDeletedResponse(BaseModel):
    """Confirmation that a session was deleted."""
    session_id: str
    deleted: bool


# ── Helpers ──────────────────────────────────────────────────────────────────


def _get_session_or_404(session_id: str):
    """Retrieve a session by ID or raise 404."""
    session = session_manager.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game session '{session_id}' not found",
        )
    return session


def _build_default_spacecraft(mission: MissionDetail) -> SpacecraftConfig:
    """Build a default SpacecraftConfig derived from mission parameters."""
    return SpacecraftConfig(
        name=f"Default Orbiter — {mission.name}",
        orbital=OrbitalElements(
            semi_major_axis_km=6371.0 + mission.orbit_altitude_km,
            inclination_deg=mission.orbit_inclination_deg,
        ),
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/start", response_model=GameStartResponse, status_code=status.HTTP_201_CREATED)
async def start_game(body: GameStartRequest):
    """Create a new game session for the given mission."""
    # Load mission definition
    missions = _load_missions()
    mission = missions.get(body.mission_id)
    if mission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mission '{body.mission_id}' not found",
        )

    # Build spacecraft config from custom design or default
    if body.design is not None:
        spacecraft = body.design.to_spacecraft_config()
    else:
        spacecraft = _build_default_spacecraft(mission)

    # Create session
    session = session_manager.create_session(
        mission=mission,
        spacecraft_config=spacecraft,
        seed=body.seed,
        player_ids=body.player_ids,
        time_step_seconds=settings.sim_time_step_seconds,
        difficulty=body.difficulty,
    )

    return GameStartResponse(
        session_id=session.session_id,
        mission_id=mission.id,
        mission_name=mission.name,
        seed=session.seed,
        status=session.state.status,
        game_state=session.state.to_summary(),
    )


@router.post("/{session_id}/step", response_model=StepResponse)
async def step_simulation(session_id: str, body: StepRequest):
    """Advance the simulation by a number of steps."""
    session = _get_session_or_404(session_id)
    results = session.step(body.steps)
    return StepResponse(session_id=session_id, results=results)


@router.post("/{session_id}/action", response_model=ActionResponse)
async def perform_action(session_id: str, body: ActionRequest):
    """Perform a player action within a game session."""
    session = _get_session_or_404(session_id)
    result = session.perform_action(
        player_id=body.player_id,
        action_type=body.action_type,
        params=body.params,
    )
    return ActionResponse(**result)


@router.post("/{session_id}/event", response_model=EventResolveResponse)
async def resolve_event(session_id: str, body: EventResolveRequest):
    """Resolve a pending mission event with the player's choice."""
    session = _get_session_or_404(session_id)
    result = session.resolve_event(
        player_id=body.player_id,
        event_id=body.event_id,
        choice_id=body.choice_id,
    )
    return EventResolveResponse(**result)


@router.get("/{session_id}/state", response_model=GameStateResponse)
async def get_game_state(session_id: str):
    """Get the current game state for a session (summary + objectives + events)."""
    session = _get_session_or_404(session_id)
    return GameStateResponse(
        session_id=session_id,
        game_state=session.get_full_state(),
    )


@router.get("/{session_id}/telemetry", response_model=TelemetryResponse)
async def get_telemetry(session_id: str):
    """Get the latest full telemetry snapshot for a session."""
    session = _get_session_or_404(session_id)
    return TelemetryResponse(
        session_id=session_id,
        telemetry=session.get_telemetry(),
    )


@router.get("/{session_id}/score", response_model=ScoreResponse)
async def get_score(session_id: str):
    """Get the current score breakdown for a session."""
    session = _get_session_or_404(session_id)
    breakdown = session.get_score_breakdown()
    return ScoreResponse(
        session_id=session_id,
        total_score=breakdown.total_score,
        max_score=breakdown.max_score,
        score_fraction=breakdown.score_fraction,
        grade=breakdown.grade.value,
        stars=breakdown.stars,
        star_criteria=breakdown.star_criteria,
        explanation=breakdown.explanation,
        categories=[
            {
                "category": cat.category.value,
                "weighted_score": cat.weighted_score,
                "max_possible": cat.max_possible * cat.weight,
                "explanation": cat.explanation,
            }
            for cat in breakdown.categories
        ],
    )


@router.delete("/{session_id}", response_model=SessionDeletedResponse)
async def delete_session(session_id: str):
    """End and remove a game session."""
    removed = session_manager.remove_session(session_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game session '{session_id}' not found",
        )
    return SessionDeletedResponse(session_id=session_id, deleted=True)
