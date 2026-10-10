# projectmem - LumenOS

_Last updated: 2026-10-10_

## Project purpose
Replace this placeholder with a concise description of what this project does, who it serves, and the main technologies or runtime assumptions.

## Recent issues
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

## Notes
- Stefan-Boltzmann cooling with eps=0.85, A=2m2, T_rad=350K gives ~1446W (DEEP_SPACE 3K), ~1221W (EARTH_NIGHT 220K), ~854W (EARTH_DAY 280K) - higher than the 650W example in the original story.
- Thermal tuning gotcha: with m*Cp=45000 J/K and cooling 854-1446W (> every task's heat, max 720W), the lumped model always cools and will sit at the -20C clamp; LLM 720W vs 650W for 30 min only rises 45->47.8C. Story numbers (45->78C) need a smaller thermal mass / larger heat load / temperature-dependent radiator rejection. Also: eclipse = 0W solar so no task fits unless a battery model is added.
- Workload power raised so heat <= power (energy conservation): LLM 1000W/900W, Data_Sorting 34W/30W, Log_Compression 28W/25W. AIWorkload now validates heat <= power.
- IDE (Pyrefly) uses Python 3.14 interpreter without packages -> false 'Cannot find module numpy/skyfield' lints. Project runs on 'python' = 3.11.9 where deps are installed.
- Prepared for Streamlit Cloud deployment: Added exact sys.path cloud fix to top of dashboard/app.py; converted requirements.txt from UTF-16LE to clean UTF-8 without BOM.
- Rewrote README.md with professional NASA Space Apps 2026 Space Mission Design Game documentation, badges, physics breakdown, how-to-play guide, tech stack, and team roster.
- Cleaned repository and updated .gitignore: removed tracked __pycache__ bytecode files, .jolli memory databases, and .gemini local configs from git index; added comprehensive rules for Python, virtualenvs, secrets, OS, and tool caches.
- Added 'Why a Game for Data Centers?' section to README.md bridging the core orbital data center hypervisor with the NASA Space Mission Design Game simulator.

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
