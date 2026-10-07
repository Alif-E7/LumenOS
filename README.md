# LumenOS

**LumenOS: A Thermodynamics-Aware Orbital Hypervisor for Space Data Centers.**
It schedules AI workloads based on orbital position, solar power availability,
and radiator view factor to prevent thermal shutdown in vacuum.

## Architecture

Every simulation step (default 30 s) runs this pipeline:

1. **Orbital Engine** (`engine/orbital_engine.py`) — where is the satellite? Sunlit or in eclipse? Where is the radiator facing, and how much heat can it reject?
2. **Thermal Engine** (`engine/thermal_engine.py`) — current server temperature and thermal status (NOMINAL / WARNING / CRITICAL / SHUTDOWN).
3. **Workload Profiler** (`engine/workload_profiler.py`) — queue of AI jobs with power draw, heat output and duration.
4. **Lumen Scheduler** (`engine/lumen_scheduler.py`) — decides which jobs to run right now.
5. **Dashboard** (`dashboard/`) — 3D orbit view, temperature graph, and LumenOS vs. naive scheduling comparison.

## Project layout

```
data/            # cached data (ephemerides, simulation outputs)
engine/          # simulation + scheduling core
dashboard/       # Streamlit dashboard
tests/           # unit tests
```

## Setup

```bash
pip install -r requirements.txt
```
