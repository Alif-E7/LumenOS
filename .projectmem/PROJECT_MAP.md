# Project Map - LumenOS

## Project purpose
LumenOS is an interactive 3D Earth-observation, satellite constellation, and Orbital AI Data Center simulation game targeted at an audience aged 16+. It combines physically grounded orbital mechanics (two-body Keplerian/J2 propagation, solar/eclipse geometry, Stefan-Boltzmann radiator thermal rejection, battery state-of-charge, NVMe storage, and ground-station RF + optical crosslink communications) with an onboard edge AI inference and predictive mission management runtime (`LumenOSPredictiveScheduler`) across four Earth-monitoring crisis missions: **Wildfire Scout**, **Flood Scout**, **Volcano Watch**, and **Solar Storm Sentinel**.

## Structure
- `api/` — FastAPI backend service (`api/main.py`, `api/routers/`, `api/services/game_session.py`, `api/services/coop_room.py`, `api/services/benchmark_service.py`) exposing REST & WebSocket endpoints for solo sessions, co-op multiplayer rooms, predictive advisory forecasts, career progression, and control-strategy benchmarks.
- `simulation/` — Authoritative physics engine (`simulation/core.py`, `simulation/orbital.py`, `simulation/ground_station.py`, `simulation/events.py`, `simulation/physics/{power,thermal,comms,storage,workload}.py`) computing per-step orbital state, solar generation, radiator heat rejection, edge compute load, storage wear, and link budgets.
- `game/` — Gameplay layer (`game/runtime.py`, `game/actions.py`, `game/objectives.py`, `game/advisory.py`, `game/catalog.py`, `game/designer.py`, `game/progression.py`, `game/scoring.py`) handling spacecraft bus/payload design validation, mission objectives, 5-minute forward ODE predictive advisory, star/grade scoring, and persistent player progression.
- `missions/` — YAML mission configurations (`missions/{wildfire,flood,volcano,solar_storm}/config.yaml`) defining initial orbital elements, spacecraft parameters, events, ground stations, and mission objectives.
- `apps/web/` — React 19 + TypeScript + Vite + Three.js + Tailwind v4 frontend (`apps/web/src/pages/`, `apps/web/src/components/`, `apps/web/src/components/flight/UltraRealisticEarthFlight.tsx`, `apps/web/src/components/globe/PhotorealisticEarth.tsx`, `apps/web/src/lib/`).
- `tests/` & `apps/web/src/test/` — Backend pytest suite (390 tests) and frontend Vitest suite (106 tests).

## Relationships
- `missions/*/config.yaml` feeds into `simulation/config.py` -> `simulation/core.py` (`Simulation`) and `game/runtime.py` (`GameRuntime`), which are orchestrated by `api/services/game_session.py` (`GameSessionManager`).
- `game/advisory.py` (`LumenOSPredictiveScheduler`) reads `SimulationSnapshot` from `simulation/core.py` to project a 5-step (300s) lookahead forecast (`ForecastWindow`) and emit `AdvisoryRecommendation` items consumed by `apps/web/src/components/PredictiveAdvisoryPanel.tsx`.
- `apps/web/src/pages/PlayPage.tsx` and `apps/web/src/pages/OperatePage.tsx` drive the interactive mission loop via `apps/web/src/api/client.ts` (with offline simulation fallback in `apps/web/src/lib/mission.ts`) and render the 3D Earth/orbital environment via `UltraRealisticEarthFlight.tsx`, `PhotorealisticEarth.tsx`, and `CesiumMissionViewer.tsx`.
- `apps/web/src/pages/MissionEndPage.tsx`, `ResultsPage.tsx`, and `RewardsPage.tsx` interface with `api/routers/progression.py` and `game/progression.py` to persist XP, Engineering Credits, achievements, and spacecraft module unlocks in `data/profiles/`.
