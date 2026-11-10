# LumenOS — plan

> Editable **intent** file: ideas + plans — what we *mean to do*.

## Ideas
- Future multi-satellite constellation formation flying with custom orbital plane phasing.
- Real-time custom shader atmospheric scattering tuning per solar cycle.

## Active plans

## Next
- Expand benchmark comparison scenarios with Orbital AI Data Center crosslink relay metrics.

## Someday / maybe

## Shipped
- [x] Phase 1: Complete Project-Wide Audit across backend (`simulation/`, `game/`, `api/`, `missions/`) and frontend (`apps/web/`).
- [x] Phase 2 & 3: Establish Comprehensive Redesign Plan & Prioritized Implementation Roadmap (`implementation_plan.md`).
- [x] Phase 4 — Stage 1 (Critical Bugs & Core Simulation/Objective Integrity):
  - [x] Fix `OperatePage.tsx` timeline progress bug (`step / max_steps`), dynamic `budgetTotal` and `missionHours`.
  - [x] Wire up `DirectorStation` "Request AI Prediction" button in `StationPanels.tsx` to execute `request_ai_prediction` action and refresh advisory forecast.
  - [x] Connect `MissionEndPage.tsx` to `recordMissionProgression` so completing missions in Play Mode persists XP, Engineering Credits, and unlocks.
  - [x] Add clean offline fallback for `getBenchmarkScenarios` in `apps/web/src/api/client.ts` and clean up stray `data/profiles/etcpasswd.json`.
- [x] Phase 4 — Stage 2 (Orbital AI Data Center & Constellation Infrastructure):
  - [x] Build the Orbital AI Data Center & Constellation telemetry/simulation model (`apps/web/src/lib/ai-datacenter.ts`) featuring Neural Compute Rack TOPS, mission-specific Edge AI Inference Pipelines, Active Thermal Radiator louver/rejection state, and 3-node Optical Inter-Satellite Link (`ISL`) Relay Constellation (`LUMEN-RELAY-1..3`).
  - [x] Upgrade 3D spacecraft model in `UltraRealisticEarthFlight.tsx` (remove `"TPP"` debug text plaque, add `"LUMEN-AI DC"` neural compute blade rack, temperature-reactive thermal radiator fins, and optical ISL laser terminal).
- [x] Phase 4 — Stage 3 (Earth Graphics, Orbital Physics Sync & Four Mission Overhaul):
  - [x] Synchronize 3D target acquisition laser and nadir footprint cone to true 3D sub-satellite normal in `UltraRealisticEarthFlight.tsx` so nadir sensor cones and target acquisition beams align accurately on the globe surface without cutting through Earth.
  - [x] Render 3D Orbital Relay Constellation nodes (`LUMEN-RELAY-1..3`) and optical crosslink laser beams.
  - [x] Differentiate the 4 missions (`wildfire`, `flood`, `volcano`, `solar_storm`) with mission-focused 3D overlays, scientific sensor modes, and telemetry metrics.
- [x] Phase 4 — Stage 4 (UI/UX Redesign for 16+ Audience):
  - [x] Elevate `HomePage.tsx`, `MissionsPage.tsx`, `HangarPage.tsx`, `PlayPage.tsx`, `MissionEndPage.tsx`, and `lib/kid.ts` to a cohesive 16+ Orbital AI & Earth-Monitoring Command Simulation while preserving 100% compatibility with existing unit/integration tests.
