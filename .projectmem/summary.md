# projectmem - LumenOS

_Last updated: 2026-10-07_

## Project purpose
Replace this placeholder with a concise description of what this project does, who it serves, and the main technologies or runtime assumptions.

## Recent issues
- No issues logged yet.

## Decisions
- Orbital engine model: skyfield+sgp4 propagation from mean elements (no TLE download), analytic Sun vector (no ephemeris download), cylindrical shadow, single-axis sun-tracking array so P = 2000*cos(beta), radiator normal in orbit plane 90deg ahead of Sun projection (gives DEEP_SPACE / EARTH_DAY / EARTH_NIGHT each orbit). Default epoch fixed 2026-03-20 12:00 UTC for reproducibility.
- Project files live at workspace root (d:/projects/LumenOS), not a nested lumenos/ folder. Run modules as packages from root, e.g. python -m engine.orbital_engine.
- WorkloadProfiler.get_next_task interpretation: power_draw <= available_power always; if current_temp_celsius not passed -> require heat <= cooling; if passed -> category start limits (HEAVY<60, MEDIUM<80, COLD<95) AND predicted end-of-task temp (m*Cp=45000 J/K) <= max_temp_allowed. Lets heavy tasks briefly exceed cooling when there is thermal headroom.
- Thermal model v2: mass 15kg, base_heat 100W, Battery (500Wh, charges from excess solar, max 200W in eclipse, 0% -> SHUTDOWN). Radiator A=1.5, eps=0.80, T=340K (max 909W). Q_out is temperature-dependent: min(orbital max capacity, eps*sigma*A*(T_server^4 - T_sink^4)); without it naive never overheats (eclipse resets temperature).
- Radiator attitude flipped: radiator faces Earth noon->dusk->midnight so EARTH_DAY arc follows the sunlit deep-space heating phase. LumenScheduler starts at orbital sunrise (OrbitalEngine.next_sunrise). Result: naive hits 95.4C once and loses 14.5 min of work; LumenOS max 59.9C, 0 shutdowns.
- Scheduler semantics: recurring job stream (finished jobs re-queued), LumenOS pauses with checkpoint (progress kept), hard thermal SHUTDOWN destroys running job progress, shutdown latched until <70C. LumenOS uses 5-min look-ahead vs category limits (HEAVY 60, MEDIUM 80, COLD 95). Naive = power-aware but thermally blind.

## Notes
- Stefan-Boltzmann cooling with eps=0.85, A=2m2, T_rad=350K gives ~1446W (DEEP_SPACE 3K), ~1221W (EARTH_NIGHT 220K), ~854W (EARTH_DAY 280K) - higher than the 650W example in the original story.
- Thermal tuning gotcha: with m*Cp=45000 J/K and cooling 854-1446W (> every task's heat, max 720W), the lumped model always cools and will sit at the -20C clamp; LLM 720W vs 650W for 30 min only rises 45->47.8C. Story numbers (45->78C) need a smaller thermal mass / larger heat load / temperature-dependent radiator rejection. Also: eclipse = 0W solar so no task fits unless a battery model is added.
- Workload power raised so heat <= power (energy conservation): LLM 1000W/900W, Data_Sorting 34W/30W, Log_Compression 28W/25W. AIWorkload now validates heat <= power.
- IDE (Pyrefly) uses Python 3.14 interpreter without packages -> false 'Cannot find module numpy/skyfield' lints. Project runs on 'python' = 3.11.9 where deps are installed.

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

## Open questions
- None logged yet.
