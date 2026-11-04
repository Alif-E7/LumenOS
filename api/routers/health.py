"""
Health-check and system information endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter

from api.config import settings

router = APIRouter(tags=["system"])


@router.get("/health")
async def health_check() -> dict:
    """Basic health check — confirms the API is reachable."""
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
    }


@router.get("/info")
async def system_info() -> dict:
    """Return system metadata and available missions directory."""
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "debug": settings.debug,
        "database": "sqlite" if "sqlite" in settings.database_url else "postgresql",
        "missions_dir": str(settings.missions_dir),
    }

