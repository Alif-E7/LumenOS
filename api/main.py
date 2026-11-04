"""
LumenOS — FastAPI Application Entry Point.

Registers all routers, configures CORS, and runs database initialisation
on startup.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.database import init_db
from api.routers import health, missions, spacecraft


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    # Startup: create DB tables
    await init_db()
    yield
    # Shutdown: nothing to clean up yet


# ── App factory ──────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Orbital Mission Architect — Educational space mission design & simulation API",
    lifespan=lifespan,
)

# CORS — allow the Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────

app.include_router(health.router, prefix="/api")
app.include_router(spacecraft.router, prefix="/api")
app.include_router(missions.router, prefix="/api")

