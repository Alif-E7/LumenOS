"""
LumenOS API Configuration.

Centralised settings loaded from environment variables with sensible defaults
so the application runs locally without any `.env` file.
"""

from __future__ import annotations

import os
from pathlib import Path
from pydantic_settings import BaseSettings


_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_DATA_DIR = _PROJECT_ROOT / "data"
_DATA_DIR.mkdir(parents=True, exist_ok=True)

# ── Dynamic Environment Resolution ──────────────────────────────────────────
_raw_db = os.getenv("DATABASE_URL") or os.getenv("LUMENOS_DATABASE_URL")
if _raw_db:
    if _raw_db.startswith("postgres://"):
        _default_db = _raw_db.replace("postgres://", "postgresql+asyncpg://", 1)
    elif _raw_db.startswith("postgresql://") and "+asyncpg" not in _raw_db:
        _default_db = _raw_db.replace("postgresql://", "postgresql+asyncpg://", 1)
    else:
        _default_db = _raw_db
else:
    _default_db = f"sqlite+aiosqlite:///{_DATA_DIR / 'lumenos.db'}"

_raw_cors = os.getenv("CORS_ORIGINS") or os.getenv("LUMENOS_CORS_ORIGINS")
_default_cors = [
    "http://localhost:5173",   # Vite dev server
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
if _raw_cors:
    for o in _raw_cors.split(","):
        cleaned = o.strip()
        if cleaned and cleaned not in _default_cors:
            _default_cors.append(cleaned)


class Settings(BaseSettings):
    """Application-wide settings.  Override any value via env-vars or a `.env` file."""

    # ── General ──────────────────────────────────────────────────────────
    app_name: str = "LumenOS"
    app_version: str = "0.1.0"
    debug: bool = True

    # ── Database ─────────────────────────────────────────────────────────
    # SQLite for local development; automatic PostgreSQL on Render/hosted environments.
    database_url: str = _default_db

    # ── CORS ─────────────────────────────────────────────────────────────
    cors_origins: list[str] = _default_cors

    # ── Simulation ───────────────────────────────────────────────────────
    default_sim_seed: int = 42
    sim_time_step_seconds: float = 60.0  # 1 minute per step

    # ── Missions ─────────────────────────────────────────────────────────
    missions_dir: Path = _PROJECT_ROOT / "missions"

    model_config = {"env_prefix": "LUMENOS_", "env_file": ".env", "extra": "ignore"}


settings = Settings()

