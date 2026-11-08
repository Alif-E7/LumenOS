"""
Progression and Player Profile REST Endpoints.

Provides persistent player progression, XP calculations, Engineering Credits,
achievement tracking, and unlockable subsystems.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from game.progression import (
    ACHIEVEMENT_CATALOG,
    UNLOCK_CATALOG,
    AchievementDefinition,
    AchievementProgress,
    PlayerProfile,
    UnlockDefinition,
    credits_from_grade,
    level_from_xp,
    xp_for_level,
    xp_from_grade,
)
from game.scoring import Grade

router = APIRouter(prefix="/progression", tags=["progression"])

PROFILES_DIR = Path("data/profiles")
_PROFILES_CACHE: dict[str, PlayerProfile] = {}


def get_or_create_profile(player_id: str = "pilot-local") -> PlayerProfile:
    """Retrieve an existing profile from cache/disk or initialize a new one."""
    if player_id in _PROFILES_CACHE:
        return _PROFILES_CACHE[player_id]

    profile_file = PROFILES_DIR / f"{player_id}.json"
    if profile_file.exists():
        try:
            profile = PlayerProfile.load_from_file(profile_file)
            _PROFILES_CACHE[player_id] = profile
            return profile
        except Exception:
            pass

    # Create new profile
    profile = PlayerProfile(
        player_id=player_id,
        display_name="Cadet Operator",
        total_xp=0,
        engineering_credits=500,  # Starting credits to test unlock system
    )
    # Populate initial achievement definitions with progress=0
    for a_id, defn in ACHIEVEMENT_CATALOG.items():
        profile.achievements[a_id] = AchievementProgress(
            achievement_id=a_id,
            unlocked=False,
            progress_value=0.0,
            target_value=1.0,
        )
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    profile.save_to_file(profile_file)
    _PROFILES_CACHE[player_id] = profile
    return profile


def save_profile_disk(profile: PlayerProfile) -> None:
    """Persist profile to disk."""
    _PROFILES_CACHE[profile.player_id] = profile
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    profile_file = PROFILES_DIR / f"{profile.player_id}.json"
    profile.save_to_file(profile_file)


# ── Schemas ───────────────────────────────────────────────────────────────────

class AchievementItemResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    icon: str
    xp_reward: int
    credit_reward: int
    unlocked: bool
    unlock_date: Optional[str] = None
    progress_value: float = 0.0
    target_value: float = 1.0


class UnlockItemResponse(BaseModel):
    id: str
    name: str
    description: str
    unlock_type: str
    credit_cost: int
    required_level: int
    icon: str
    unlocked: bool = False


class ProfileResponse(BaseModel):
    player_id: str
    display_name: str
    total_xp: int
    level: int
    xp_to_next_level: int
    engineering_credits: int
    missions_completed: int
    achievements: list[AchievementItemResponse]
    unlocks: list[UnlockItemResponse]
    campaign: dict[str, Any]


class RecordMissionRequest(BaseModel):
    player_id: str = "pilot-local"
    mission_id: str
    grade: str
    stars: int = Field(default=1, ge=0, le=3)
    is_win: bool = True
    spacecraft_health_pct: float = 100.0
    budget_spent_pct: float = 50.0
    score: float = 85.0
    difficulty_multiplier: float = 1.0


class UnlockRequest(BaseModel):
    player_id: str = "pilot-local"
    unlock_id: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/profile", response_model=ProfileResponse)
async def get_profile(player_id: str = Query(default="pilot-local")):
    """Get active player career profile, rank, XP, credits, and unlocked items."""
    profile = get_or_create_profile(player_id)

    # Format achievements
    achievements_list: list[AchievementItemResponse] = []
    for a_id, defn in ACHIEVEMENT_CATALOG.items():
        prog = profile.achievements.get(a_id)
        is_unlocked = prog.unlocked if prog else False
        p_val = prog.progress_value if prog else 0.0
        t_val = prog.target_value if prog else 1.0
        u_date = prog.unlock_date if prog else None
        achievements_list.append(
            AchievementItemResponse(
                id=a_id,
                name=defn.name,
                description=defn.description,
                category=defn.category.value,
                icon=defn.icon,
                xp_reward=defn.xp_reward,
                credit_reward=defn.credit_reward,
                unlocked=is_unlocked,
                unlock_date=u_date,
                progress_value=p_val,
                target_value=t_val,
            )
        )

    # Format unlocks
    unlocks_list: list[UnlockItemResponse] = []
    for u_id, defn in UNLOCK_CATALOG.items():
        unlocks_list.append(
            UnlockItemResponse(
                id=u_id,
                name=defn.name,
                description=defn.description,
                unlock_type=defn.unlock_type.value,
                credit_cost=defn.credit_cost,
                required_level=defn.required_level,
                icon=defn.icon,
                unlocked=(u_id in profile.unlocks),
            )
        )

    return ProfileResponse(
        player_id=profile.player_id,
        display_name=profile.display_name or (
            "Veteran Flight Director" if profile.level >= 3
            else "Mission Specialist" if profile.level >= 2
            else "Cadet Operator"
        ),
        total_xp=profile.total_xp,
        level=profile.level,
        xp_to_next_level=profile.xp_to_next_level,
        engineering_credits=profile.engineering_credits,
        missions_completed=profile.missions_completed,
        achievements=achievements_list,
        unlocks=unlocks_list,
        campaign=profile.campaign.model_dump(),
    )


@router.get("/achievements", response_model=list[dict[str, Any]])
async def list_achievements():
    """List static catalog of achievements."""
    return [
        {
            "id": defn.id,
            "name": defn.name,
            "description": defn.description,
            "category": defn.category.value,
            "icon": defn.icon,
            "xp_reward": defn.xp_reward,
            "credit_reward": defn.credit_reward,
            "hidden": defn.hidden,
        }
        for defn in ACHIEVEMENT_CATALOG.values()
    ]


@router.get("/unlocks", response_model=list[dict[str, Any]])
async def list_unlocks():
    """List static catalog of unlockable spacecraft components and capabilities."""
    return [
        {
            "id": defn.id,
            "name": defn.name,
            "description": defn.description,
            "unlock_type": defn.unlock_type.value,
            "credit_cost": defn.credit_cost,
            "required_level": defn.required_level,
            "icon": defn.icon,
        }
        for defn in UNLOCK_CATALOG.values()
    ]


@router.post("/record_mission")
async def record_mission(body: RecordMissionRequest):
    """
    Process mission debrief into persistent player profile.
    Awards XP, Engineering Credits, updates campaign unlocks, and checks achievements.
    """
    profile = get_or_create_profile(body.player_id)

    # Convert grade string to Grade enum
    try:
        grade_enum = Grade(body.grade)
    except ValueError:
        grade_enum = Grade.B

    rewards_summary = profile.process_mission_completion(
        grade=grade_enum,
        difficulty_multiplier=body.difficulty_multiplier,
        mission_id=body.mission_id,
        stars=body.stars,
        is_win=body.is_win,
        spacecraft_health_pct=body.spacecraft_health_pct,
        budget_spent_pct=body.budget_spent_pct,
        score=body.score,
    )
    save_profile_disk(profile)

    return {
        "player_id": profile.player_id,
        "rewards": rewards_summary,
        "current_level": profile.level,
        "total_xp": profile.total_xp,
        "engineering_credits": profile.engineering_credits,
    }


@router.post("/unlock")
async def purchase_unlock(body: UnlockRequest):
    """Purchase a module unlock using earned Engineering Credits."""
    profile = get_or_create_profile(body.player_id)
    success = profile.try_unlock(body.unlock_id)
    if not success:
        defn = UNLOCK_CATALOG.get(body.unlock_id)
        reason = "Module already unlocked" if body.unlock_id in profile.unlocks else (
            f"Requires Level {defn.required_level}" if defn and profile.level < defn.required_level else
            f"Insufficient credits ({profile.engineering_credits}/{defn.credit_cost if defn else 0})"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unlock failed: {reason}",
        )
    save_profile_disk(profile)
    return {
        "success": True,
        "unlock_id": body.unlock_id,
        "remaining_credits": profile.engineering_credits,
        "unlocked": profile.unlocks,
    }

