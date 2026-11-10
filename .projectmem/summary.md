# projectmem - LumenOS

_Last updated: 2026-11-10_

## Project purpose
LumenOS is an interactive 3D Earth-observation, satellite constellation, and Orbital AI Data Center simulation game targeted at an audience aged 16+. It combines physically grounded orbital mechanics (two-body Keplerian/J2 propagation, solar/eclipse geometry, Stefan-Boltzmann radiator thermal rejection, battery state-of-charge, NVMe storage, and ground-station RF + optical crosslink communications) with an onboard edge AI inference and predictive mission management runtime (`LumenOSPredictiveScheduler`) across four Earth-monitoring crisis missions: **Wildfire Scout**, **Flood Scout**, **Volcano Watch**, and **Solar Storm Sentinel**.

## Recent issues
- [DONE] #0014 3D spacecraft position uses arbitrary fs.progress angle while target proximity uses backend orbital lat/lon, causing target laser beam to cut through Earth and misalign with nadir cone. [apps/web/src/components/flight/UltraRealisticEarthFlight.tsx] -> Synchronized 3D target acquisition laser and nadir footprint cone to true 3D sub-satellite normal and added 3-node Optical ISL Relay Constellation. [apps/web/src/components/flight/UltraRealisticEarthFlight.tsx] (fixed)
- [DONE] #0013 MissionEndPage never calls recordMissionProgression, so Play Mode mission completions do not persist career XP, credits, or unlocks. [apps/web/src/pages/MissionEndPage.tsx] -> Wired MissionEndPage to call recordMissionProgression and display earned XP, Engineering Credits, and Orbital AI debrief telemetry. [apps/web/src/pages/MissionEndPage.tsx] (fixed)
- [DONE] #0012 DirectorStation Request AI Prediction button is hardcoded disabled with 'coming soon' instead of triggering request_ai_prediction action. [apps/web/src/components/StationPanels.tsx] -> Enabled DirectorStation Request AI Prediction button to dispatch request_ai_prediction action. [apps/web/src/components/StationPanels.tsx] (fixed)
- [DONE] #0011 OperatePage timeline progress divides activeGameState.step by activeGameState.step instead of max_steps, pinning timeline mark at 99.9%. [apps/web/src/pages/OperatePage.tsx] -> Fixed OperatePage timeline mark fraction to divide by activeClock.max_steps and derived missionHours and budgetTotal dynamically. [apps/web/src/pages/OperatePage.tsx] (fixed)
- [DONE] #0010 3D JS globe view and homepage visualizations hidden inside secondary tab instead of being displayed front-and-center on page load [dashboard/app.py] -> Homepage layout restored: 3D rotating WebGL globe, simulation controls, gauges, and race charts are mounted front-and-center on load. Multi-satellite fleet load balancer and API architecture guide are positioned seamlessly below the single-node flight deck. All unit tests passing 100%. (fixed)
- [DONE] #0009 Solar power gauge max hardcoded to 2000W instead of orbital profile max watts [dashboard/app.py:2125] -> Fixed solar power gauge vmax to dynamically match orbital profile max watts (e.g. 860W Mars, 1300W Lunar, 2000W LEO/GEO) (fixed)
- [DONE] #0008 OrbitalEngine.__init__ mutates global RADIATOR_AREA_M2 causing cross-instance state pollution [engine/orbital_engine.py:453] -> Removed global RADIATOR_AREA_M2 mutation in OrbitalEngine.__init__ so each engine instance maintains its own radiator_area_m2 without polluting global state (fixed)
- [DONE] #0007 Radiator card sink text display duplication in radiator_bar_html [dashboard/app.py:1118] -> Fixed radiator sink text display duplication in radiator_bar_html and RADIATOR_INFO (fixed)
- [DONE] #0006 pjm tooling: only CLI subcommand is 'log <summary> --at <path>'; there is no 'wall' command [C:\Users\Hp] -> Tooling note, not a code issue: pjm CLI commands confirmed (log/attempt/fix/decision/note/show/search). Closing as resolved. (fixed)
  - Partial attempt: Full verification attempt 1: smoke harness failed on off-by-one (the arming run itself ticks the fragment once) and a wrong cadence formula inside the test; adjusted expectations and all checks passed.
  - Partial attempt: Attempt 2: ran AppTest smoke, direct-import HTML checks, unit tests (test_orbital, test_scheduler, test_advanced_features), py_compile, worst-case chart size probe, and a live streamlit server check
  - Partial attempt: Attempt 3: populated .projectmem/PROJECT_MAP.md via PowerShell round-trip, which mangled Unicode arrows; rewrote the file with the editor write tool.
- [DONE] #0005 Live-sim polish shipped: cipher satellite visibility (enlarged mesh, glow/ring/tag sprite markers, motion trail, phase-locked orbit clock via play_cadence speed and start_fraction), 2-minute LIVE mission cadence (SIM_SPEEDS 30/60/120, play_cadence chunk/tick contract, tick floor 0.55s), live-only race charts (tracks and baselines slaved to flown minutes, AWAITING placeholder at mission start, 667ms lazy-timed frames synced to play_tick), verified via AppTest smoke + direct imports + streamlit server HTTP 200. [C:\Users\Hp] -> Satellite barely visible and live-sim charts/telemetry out of sync: enlarged spacecraft (330x330x470 body, 820px panels), added always-visible glow/ring/'ORBITAL DATA CENTER' tag sprites + motion trail (depthTest off), phase-locked the orbit clock to telemetry via create_browser_orbit_html(period_ms, start_fraction), added play_cadence(SIM_SPEEDS 30/60/120, default 120s = LIVE 2-MIN MISSION), rewrote race charts live-only (ghost baselines truncated to flown minutes, LIVE dot + NOW cursor, AWAITING LIVE TELEMETRY idle state, frame duration = play_tick). Verified: py_compile OK, _smoke_tmp.py PASSED (AppTest boot/arm/9 ticks, cadence exactness, orbit markers, empty-at-start, 667ms frames, lumen series recording, ghost truncation), tests/test_orbital.py + tests/test_scheduler.py + tests/test_advanced_features.py all pass, streamlit server responds HTTP 200. (fixed)
- [DONE] #0004 Dashboard live playback ignores the Simulation speed selector: the fragment advances 3 steps per 0.22 s tick so the full 90-min mission finishes in ~13 s instead of the promised 30/60/120 s real-time run; the 3D satellite loops its orbit every 60 s (ORBIT_PERIOD_MS=60000) so it is never in phase with the telemetry; race charts pre-draw the full LumenOS/Naive curves from T+0 so the graph is never empty at mission start and does not stream live; the Three.js satellite is ~4 px tall and easy to lose against Earth [dashboard/app.py:113] -> Orbit visible & live sync confirmed working; no further code issue. (fixed)
- [DONE] #0003 Built full Space Mission Design Game dashboard: Mission Scenario dropdown (LEO/Lunar/Mars), Hardware Config sliders, OS radio button, Mission Report Card banners (success/fail/marginal), Compute Efficiency Gain metric, dynamic chart updates, and live animation loop -> Fixed data flow from dashboard sidebar inputs into LumenScheduler.run_simulation() and underlying OrbitalEngine and ThermalEngine constructors. Verified test passed. (fixed)
- [DONE] #0002 UI is too complex; simplify dashboard layout, add visible Sun, deep space background, Earth day/night half lighting (warm bright heat vs dark grey), real-time simulation animation loop with selectable speed (30s, 1m, 2m for 90m orbit), and live telemetry updating [dashboard/app.py, dashboard/orbit_view.py] -> Fixed issue #0002: Simplified dashboard interface, added 3D Sun with radiation rays, deep space cosmos background, Earth half-day/night shading (warm bright 280K IR vs dark grey shadow), 30s/1m/2m real-time animation rotation loop for 90-min orbit, and instant telemetry HUD strip. (fixed)
- [DONE] #0001 Dashboard lacks explicit simulation runner with time duration controls, and 3D globe orbit path coloring / Earth rounding / AI data center radiator orientation visualization needs improvement [dashboard/app.py, dashboard/orbit_view.py] -> Resolved simulation runner and 3D Earth rounding / AI data center radiator orientation in dashboard. Upgraded UI to dark aerospace theme with time scrubber, instantaneous telemetry HUD, synchronized thermal graph, and Streamlit 1.65 support. (fixed)

## Decisions
- Orbital engine model: skyfield+sgp4 propagation from mean elements (no TLE download), analytic Sun vector (no ephemeris download), cylindrical shadow, single-axis sun-tracking array so P = 2000*cos(beta), radiator normal in orbit plane 90deg ahead of Sun projection (gives DEEP_SPACE / EARTH_DAY / EARTH_NIGHT each orbit). Default epoch fixed 2026-03-20 12:00 UTC for reproducibility.
- Project files live at workspace root (d:/projects/LumenOS), not a nested lumenos/ folder. Run modules as packages from root, e.g. python -m engine.orbital_engine.
- WorkloadProfiler.get_next_task interpretation: power_draw <= available_power always; if current_temp_celsius not passed -> require heat <= cooling; if passed -> category start limits (HEAVY<60, MEDIUM<80, COLD<95) AND predicted end-of-task temp (m*Cp=45000 J/K) <= max_temp_allowed. Lets heavy tasks briefly exceed cooling when there is thermal headroom.
- Thermal model v2: mass 15kg, base_heat 100W, Battery (500Wh, charges from excess solar, max 200W in eclipse, 0% -> SHUTDOWN). Radiator A=1.5, eps=0.80, T=340K (max 909W). Q_out is temperature-dependent: min(orbital max capacity, eps*sigma*A*(T_server^4 - T_sink^4)); without it naive never overheats (eclipse resets temperature).
- Radiator attitude flipped: radiator faces Earth noon->dusk->midnight so EARTH_DAY arc follows the sunlit deep-space heating phase. LumenScheduler starts at orbital sunrise (OrbitalEngine.next_sunrise). Result: naive hits 95.4C once and loses 14.5 min of work; LumenOS max 59.9C, 0 shutdowns.
- Scheduler semantics: recurring job stream (finished jobs re-queued), LumenOS pauses with checkpoint (progress kept), hard thermal SHUTDOWN destroys running job progress, shutdown latched until <70C. LumenOS uses 5-min look-ahead vs category limits (HEAVY 60, MEDIUM 80, COLD 95). Naive = power-aware but thermally blind.
- Dashboard v2 architecture: Interactive simulation runner with custom duration & presets, 3D Earth globe with continental references, color-coded orbit paths (DEEP_SPACE/EARTH_DAY/ECLIPSE), AI Data Center satellite with dynamic radiator normal vector & solar radiation vector, synchronized orbit time scrubber, and dark aerospace telemetry HUD.
- Streamlined UI architecture: Removed extraneous tabs in favor of a single unified screen featuring live real-time orbital playback (30s, 60s, 120s real-time for 90m orbit), physical 3D Sun, deep space stars, half-illuminated Earth (warm bright day / dark grey night), dynamic satellite radiator vector, and synchronized live thermal graph.
- Completed global consistency sweep aligning all docstrings, comments, tests, demo scripts, and UI labels across the project with the NASA Space Apps 2026 'Space Mission Design Game' challenge narrative.
- Standardized on make_demo_video.py (producing demo_video.mp4) as the single mission simulator demo video generator featuring the 4-quadrant live telemetry dashboard, and removed generate_demo_video.py and lumenos_demo.mp4.
- Replaced AI Data Center and LLM_Fine_Tuning with Orbital Compute Node and Primary Payload in dashboard UI layer.
- Refined UX wording in dashboard/app.py and dashboard/orbit_view.py: added scenario-specific Mission Briefs, updated satellite label to Orbital Data Center (Payload), and refined Mission Report Card status headers.
- Committed and pushed full Space Mission Design Game challenge alignment, UX refinements, and removed video binaries from git tracking.
- Replaced README.md content with project overview landing page link (https://mohammademon10.github.io/lumenos-space-apps-2026-Landingpage/) per user request
- Enhanced 3D Earth visualization (photorealistic continents, oceans, night-side city lights, and atmospheric glow) and upgraded Primary Payload Data Center satellite architecture and telemetry dashboard in dashboard/orbit_view.py and dashboard/app.py
- Live-sim cadence contract: play_cadence(speed_s) returns (steps_per_tick, tick_seconds) such that (180/steps_per_tick)*tick_seconds == speed_s exactly; DEFAULT_SIM_SPEED=120 turns the full 90-min orbit into a 2-minute wall-clock live run (chunk 1, tick 120/180). Supported speeds [30,60,120]; steps/tick adjusts so each tick stays above the 0.55s fragment floor.
- Live charts redraw policy: race charts are live-only - baselines (LUMENOS projected / NAIVE baseline) are truncated to flown minutes via _ghost_trails, an always-present LIVE dot plus NOW cursor animates the streaming live line, frames step at play_tick*1000 ms to stay in sync with the telemetry clock, and an empty state shows an AWAITING LIVE TELEMETRY placeholder instead of pre-drawn curves.
- Orbit phase-lock: render_orbit bakes start_fraction=from_idx/TOTAL_STEPS and period_ms=speed*1000 into the Three.js iframe once; the browser computes t=((now-T0_MS)%PERIOD)/PERIOD so satellite position, HUD altitude and trail stay in phase with the server telemetry clock without any per-step remounts.
- Implement multi-satellite orbital datacenter constellation engine (engine/constellation_engine.py) with real-time thermodynamic load balancing (LumenOS vs Naive), tracking heat emission, solar charge storage, and energy consumption per AI task (High, Medium, Low).
- Integrated dual 3D graphics pipeline: users can now seamlessly select between 'Three.js WebGL (NASA Look)' with procedural continents, cloud sphere, 2,600 stars, and 3D satellite, and 'Plotly 3D (Analytic)' directly from the Flight Controls. Ensured robust timeline serialization and dynamic camera controls for both engines.
- Cleared codebase to rebuild from scratch per user request. Previous work preserved in git branch archive/v1-pre-cleanup and git stash.
- Redesign LumenOS into a 16+ Orbital AI Data Center & Earth-Monitoring simulation while preserving existing test contracts and backward-compatible APIs. [apps/web/src/]

## Notes
- IDE (Pyrefly) uses Python 3.14 interpreter without packages -> false 'Cannot find module numpy/skyfield' lints. Project runs on 'python' = 3.11.9 where deps are installed.
- Prepared for Streamlit Cloud deployment: Added exact sys.path cloud fix to top of dashboard/app.py; converted requirements.txt from UTF-16LE to clean UTF-8 without BOM.
- Rewrote README.md with professional NASA Space Apps 2026 Space Mission Design Game documentation, badges, physics breakdown, how-to-play guide, tech stack, and team roster.
- Cleaned repository and updated .gitignore: removed tracked __pycache__ bytecode files, .jolli memory databases, and .gemini local configs from git index; added comprehensive rules for Python, virtualenvs, secrets, OS, and tool caches.
- Added 'Why a Game for Data Centers?' section to README.md bridging the core orbital data center hypervisor with the NASA Space Mission Design Game simulator.
- pjm CLI: 'log' always opens an ISSUE - use 'note' for observations and 'decision' for design choices; issue #0006 (pjm has no wall command) is tooling noise, not a code issue.
- Streamlit fragments: run_every below ~0.55s is unreliable; FRAGMENT_MIN_S floor added in dashboard/app.py.
- dashboard/orbit_view.py ~line 64 contains the <\\/script> backslash pair: JSON-encoded edit strings halve them, so never anchor an edit on that exact line.
- Standardize comparison modes across the dashboard as 'LumenOS' vs 'Naive' (thermally-blind baseline) per user specification.
- Clarified dataset requirements: self-contained offline physics for simulator/prototype; for real-flight operations, NASA CERES (Earth radiation/albedo) and Space-Track/Celestrak TLEs are the standard telemetry inputs.

## Key files
- `e.g`
- `engine.orbital`
- `0.85`
- `WorkloadProfiler.get`
- `47.8C`
- `1.5`
- `0.80`
- `OrbitalEngine.next`
- `95.4C`
- `14.5`
- `59.9C`
- `3.14`
- `3.11.9`
- `1.65`
- `LumenScheduler.run`
- `dashboard/app.py`
- `sys.path`
- `requirements.txt`
- `README.md`
- `make_demo_video.py`

## Open questions
- None logged yet.
