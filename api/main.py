"""
LumenOS — FastAPI Application Entry Point.

Registers all routers, configures CORS, and runs database initialisation
on startup.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.database import init_db
from api.routers import health, missions, spacecraft
from api.routers import game as game_router
from api.routers import rooms as rooms_router
from api.routers import data_sources as data_sources_router
from api.routers import benchmark as benchmark_router
from api.routers import replay as replay_router
from api.routers import progression as progression_router


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

# CORS — allow Vite dev server, configured origins, and all Vercel deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    """Add standard HTTP security hardening headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# ── Routers ──────────────────────────────────────────────────────────────────

app.include_router(health.router, prefix="/api")
app.include_router(spacecraft.router, prefix="/api")
app.include_router(missions.router, prefix="/api")
app.include_router(game_router.router, prefix="/api")
app.include_router(rooms_router.router, prefix="/api")
app.include_router(data_sources_router.router, prefix="/api")
app.include_router(benchmark_router.router, prefix="/api")
app.include_router(replay_router.router, prefix="/api")
app.include_router(progression_router.router, prefix="/api")


# ── WebSocket health endpoint ────────────────────────────────────────────────
# NOTE: When deploying behind a reverse proxy (nginx, Caddy, Traefik), make sure
# to proxy /ws/* paths with WebSocket upgrade support:
#   location /ws/ {
#       proxy_pass http://backend;
#       proxy_http_version 1.1;
#       proxy_set_header Upgrade $http_upgrade;
#       proxy_set_header Connection "upgrade";
#   }


@app.websocket("/ws/health")
async def ws_health(websocket: WebSocket):
    """WebSocket smoke/health endpoint for connectivity verification."""
    await websocket.accept()
    await websocket.send_json({
        "type": "connected",
        "status": "ok",
        "app": "LumenOS",
    })
    try:
        data = await websocket.receive_text()
        message = json.loads(data)
        if message.get("type") == "ping":
            await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, json.JSONDecodeError):
        pass
    await websocket.close()
