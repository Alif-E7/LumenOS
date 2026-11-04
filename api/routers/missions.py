"""
Mission listing and detail endpoints.

Missions are loaded from YAML config files in the missions/ directory,
making them data-driven rather than hard-coded.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException

from api.config import settings
from api.models.mission import MissionBrief, MissionDetail

router = APIRouter(prefix="/missions", tags=["missions"])


# ── Mission loader ───────────────────────────────────────────────────────────

_mission_cache: dict[str, MissionDetail] | None = None


def _load_missions() -> dict[str, MissionDetail]:
    """Load all mission definitions from YAML files."""
    global _mission_cache
    if _mission_cache is not None and not settings.debug:
        return _mission_cache

    missions: dict[str, MissionDetail] = {}
    missions_dir = Path(settings.missions_dir)

    if not missions_dir.exists():
        return missions

    for subdir in sorted(missions_dir.iterdir()):
        config_path = subdir / "config.yaml"
        if not config_path.exists():
            continue
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            mission = MissionDetail(**data)
            missions[mission.id] = mission
        except Exception as exc:
            # In debug mode, log but don't crash
            if settings.debug:
                print(f"[WARN] Failed to load mission from {config_path}: {exc}")
            continue

    _mission_cache = missions
    return missions


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[MissionBrief])
async def list_missions():
    """List all available missions (summary only)."""
    missions = _load_missions()
    return [MissionBrief(**m.model_dump()) for m in missions.values()]


@router.get("/{mission_id}", response_model=MissionDetail)
async def get_mission(mission_id: str):
    """Get full details for a specific mission."""
    missions = _load_missions()
    mission = missions.get(mission_id)
    if mission is None:
        raise HTTPException(status_code=404, detail=f"Mission '{mission_id}' not found")
    return mission

