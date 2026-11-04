"""
LumenOS API Configuration.

Centralised settings loaded from environment variables with sensible defaults
so the application runs locally without any `.env` file.
"""

from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings


_PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application-wide settings.  Override any value via env-vars or a `.env` file."""

    # ── General ──────────────────────────────────────────────────────────
    app_name: str = "LumenOS"
    app_version: str = "0.1.0"
    debug: bool = True

    # ── Database ─────────────────────────────────────────────────────────
    # SQLite for local development; swap the URL for PostgreSQL in production.
    database_url: str = f"sqlite+aiosqlite:///{_PROJECT_ROOT / 'data' / 'lumenos.db'}"

    # ── CORS ─────────────────────────────────────────────────────────────
    cors_origins: list[str] = [
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    # ── Simulation ───────────────────────────────────────────────────────
    default_sim_seed: int = 42
    sim_time_step_seconds: float = 60.0  # 1 minute per step

    # ── Missions ─────────────────────────────────────────────────────────
    missions_dir: Path = _PROJECT_ROOT / "missions"

    model_config = {"env_prefix": "LUMENOS_", "env_file": ".env", "extra": "ignore"}


settings = Settings()

