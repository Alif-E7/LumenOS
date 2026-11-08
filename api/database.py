"""
Database setup — async SQLAlchemy with SQLite (local) or PostgreSQL (production).

The schema is kept intentionally simple for Phase 1.  Tables are created
automatically on application startup via `init_db()`.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from api.config import settings


# Ensure parent directory exists if using SQLite
if "sqlite" in settings.database_url:
    # URL format: sqlite+aiosqlite:///path/to/db
    raw_path = settings.database_url.split("sqlite:///")[-1]
    db_file = Path(raw_path)
    if not db_file.is_absolute():
        db_file = Path.cwd() / db_file
    db_file.parent.mkdir(parents=True, exist_ok=True)


# ── Engine & session factory ─────────────────────────────────────────────────

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    # SQLite does not support pool_size; conditionally set for PG.
    **({}  if "sqlite" in settings.database_url else {"pool_size": 5, "max_overflow": 10}),
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── Declarative base ────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    """Base class for all ORM models."""


# ── Tables ──────────────────────────────────────────────────────────────────

class SpacecraftConfigRow(Base):
    """Persisted spacecraft configuration."""

    __tablename__ = "spacecraft_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(120), nullable=False)
    description = Column(Text, default="")

    # Mass & structure
    dry_mass_kg = Column(Float, nullable=False, default=500.0)
    fuel_mass_kg = Column(Float, nullable=False, default=50.0)

    # Power subsystem
    solar_panel_area_m2 = Column(Float, nullable=False, default=6.0)
    battery_capacity_wh = Column(Float, nullable=False, default=2000.0)

    # Thermal subsystem
    radiator_area_m2 = Column(Float, nullable=False, default=2.0)

    # Comms subsystem
    antenna_gain_dbi = Column(Float, nullable=False, default=25.0)
    transmit_power_w = Column(Float, nullable=False, default=10.0)

    # Propulsion
    isp_s = Column(Float, nullable=False, default=220.0)  # specific impulse
    thrust_n = Column(Float, nullable=False, default=1.0)

    # Payload
    payload_type = Column(String(60), default="multispectral_imager")
    payload_mass_kg = Column(Float, nullable=False, default=30.0)
    payload_power_w = Column(Float, nullable=False, default=80.0)

    # Metadata
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class MissionRunRow(Base):
    """Record of a completed or in-progress mission simulation run."""

    __tablename__ = "mission_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    mission_id = Column(String(60), nullable=False)          # e.g. "wildfire"
    spacecraft_config_id = Column(String(36), nullable=False)
    seed = Column(Integer, nullable=False, default=42)
    status = Column(String(20), nullable=False, default="pending")  # pending | running | completed | failed
    score = Column(Float, nullable=True)
    summary = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)


# ── Helpers ──────────────────────────────────────────────────────────────────

async def init_db() -> None:
    """Create all tables if they don't exist."""
    if "sqlite" in settings.database_url:
        raw_path = settings.database_url.split("sqlite:///")[-1]
        db_file = Path(raw_path)
        if not db_file.is_absolute():
            db_file = Path.cwd() / db_file
        db_file.parent.mkdir(parents=True, exist_ok=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:  # type: ignore[misc]
    """Yield an async DB session (for use as a FastAPI dependency)."""
    async with async_session() as session:
        yield session  # type: ignore[misc]

