"""LumenOS Protocol — Orbital AI Data Center: Mission Control Game.

NASA Space Apps 2026 — "Space Mission Design Game"
===================================================
An interactive, educational mission-control simulation. You are the MISSION
DIRECTOR of humanity's first Orbital AI Data Center. Your job: process as many
AI workloads as possible over one 90-minute mission window without letting the
server melt.

Mission theaters (multi-orbit support)
--------------------------------------
Pick the environment from the flight console — one parameterized physics
engine covers them all:
  * LEO · ISS-like 550 km    — power is plentiful; the radiator view factor is the killer.
  * GEO · Comms Belt         — equinox eclipse opens the window; deep-space cooling.
  * LUNAR · Gateway NRHO     — lunar IR warms the sinks; long eclipses.
  * MARS · Transit Cruise    — 43 % solar flux, no IR body: POWER becomes the bottleneck.

The brutal physics trade-off this game teaches
----------------------------------------------
Compute generates heat. In a vacuum there are no fans and no air — the only
way heat escapes is radiation, and the radiator's cooling capacity depends
entirely on what it is facing at that moment in the orbit:

    DEEP_SPACE   (3 K)   -> 909 W cooling   (heavy AI work is safe)
    EARTH_NIGHT  (220 K) -> 750 W cooling   (moderate)
    EARTH_DAY    (280 K) -> 491 W cooling   (thermal danger zone)

Meanwhile, solar power is at its *maximum* exactly when the orbit passes over
the day side — the same arc where the radiator is starved.

Operating modes and engineering tools
-------------------------------------
  * MANUAL OVERRIDE — you schedule tasks by hand, tempted by the solar power
    graph. A thermal shutdown at 95 °C ends the mission and destroys all
    in-flight work (no checkpoints). You hold the levers: compute precision
    (FP32 / INT8 / TINY / AUTO thermal-aware quantization) and the space-
    weather doctrine.
  * LUMENOS AI HYPERVISOR — a thermodynamics-aware OS with a 5-minute thermal
    look-ahead that checkpoints, pauses, resumes and *quantizes* workloads
    around orbital heat windows, and never loses a TFLOP.

Advanced features: multi-orbit profiles (``engine.orbital_engine``), thermal-
aware quantization (``engine.workload_profiler``), NOAA SWPC space-weather
safe mode (``engine.space_weather``), and battery state-of-health ageing
(``engine.thermal_engine``).

Physics engine reuse: this dashboard is a *game layer* on top of the
validated engine package (`engine.orbital_engine`, `engine.thermal_engine`,
`engine.workload_profiler`, `engine.lumen_scheduler`). The orbital trace,
cooling capacities, lumped-capacitance thermal model and battery model all
come from those modules — nothing here re-implements the physics.
"""

import html
import math
import os
import sys
import time
from typing import Any, Optional

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import streamlit as st  # noqa: E402

from engine.lumen_scheduler import LumenScheduler  # noqa: E402
from engine.orbital_engine import ORBITAL_PROFILES, get_orbital_profile  # noqa: E402
from engine.space_weather import SpaceWeatherStatus, fetch_space_weather  # noqa: E402
from engine.thermal_engine import (  # noqa: E402
    CRITICAL,
    NOMINAL,
    SHUTDOWN,
    SHUTDOWN_THRESHOLD_CELSIUS,
    WARNING,
    ThermalEngine,
)
from engine.workload_profiler import (  # noqa: E402
    AUTO,
    COLD,
    FP32,
    INT8,
    PRECISION_PROFILES,
    TINY,
    AIWorkload,
    WorkloadProfiler,
    resolve_precision,
)
from dashboard.orbit_view import create_orbit_figure  # noqa: E402

import plotly.graph_objects as go  # noqa: E402

# ─────────────────────────────────────────────────────────────────────────────
# PAGE CONFIG
# ─────────────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="LumenOS Protocol — Orbital AI Data Center",
    page_icon="🛰️",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS — mission profile & scoring model
# ─────────────────────────────────────────────────────────────────────────────
STEP_SECONDS = 30.0            # physics tick (matches LumenScheduler)
TOTAL_STEPS = 180              # 90-minute mission window (all theaters)
TURN_STEPS = 10                # one manual turn = 5 minutes

SHUTDOWN_C = SHUTDOWN_THRESHOLD_CELSIUS  # 95 °C
BASE_HEAT_W = 100.0

#: Scoring model: sustained AI throughput = 1 TFLOP/s per kilowatt of
#: workload power draw (heat is ~90% of that power).
TFLOPS_PER_WATT_SECOND = 1.0 / 1000.0

PLAYER_TASK_NAMES = [
    "LLM_Fine_Tuning",
    "Satellite_Image_Segmentation",
    "Data_Sorting",
]
TASK_BLURBS = {
    "LLM_Fine_Tuning": "Foundation-model fine-tune. Massive heat load — only safe over cold sky.",
    "Satellite_Image_Segmentation": "Earth-observation tile segmentation. Moderate heat.",
    "Data_Sorting": "Housekeeping data compaction. Tiny load — survives eclipse on battery.",
}

CYAN = "#00F0FF"
RED = "#FF2A2A"
AMBER = "#FFB800"
EMERALD = "#00FF88"
SLATE = "#7F93AD"
BG = "#05070A"

MODE_LABELS = {
    "manual": "👤 MANUAL OVERRIDE",
    "lumenos": "🧠 LUMENOS AI HYPERVISOR",
}
LABEL_TO_MODE = {v: k for k, v in MODE_LABELS.items()}

#: Mission theater selector options (Feature: multi-orbit support).
ORBIT_KEYS: list[str] = list(ORBITAL_PROFILES.keys())
ORBIT_LABELS: dict[str, str] = {key: profile.label for key, profile in ORBITAL_PROFILES.items()}

#: Space-weather source options for the badge/drill (Feature: NOAA SWPC feed).
WEATHER_LABELS = {
    "quiet": "🟢 QUIET (SIM)",
    "live": "📡 LIVE NOAA SWPC",
    "storm": "🔴 STORM DRILL",
}
WEATHER_ORDER: list[str] = ["quiet", "live", "storm"]

#: Compute precision selector options for MANUAL mode (Feature: thermal-aware
#: quantization). ``AUTO`` resolves per-step from temperature like LumenOS.
PRECISION_OPTIONS: list[str] = [FP32, "INT8", "TINY", AUTO]

#: Storm doctrine constants (mirror the LumenOS hypervisor policy).
STORM_BATTERY_RESERVE_PCT = 50.0
SOH_HEAVY_LOCKOUT_PCT = 80.0

STATUS_COLORS = {
    NOMINAL: EMERALD,
    WARNING: AMBER,
    CRITICAL: RED,
    SHUTDOWN: RED,
}

RADIATOR_INFO = {
    "DEEP_SPACE": {
        "icon": "❄️",
        "name": "DEEP SPACE",
        "sink": "K / cosmic background",
        "advice": "OPTIMAL COOLING — heavy AI workloads cleared for launch.",
        "css": "rad-deep",
        "color": EMERALD,
    },
    "EARTH_NIGHT": {
        "icon": "🌙",
        "name": "EARTH-NIGHT",
        "sink": "K / night-side IR",
        "advice": "MODERATE COOLING — medium workloads only.",
        "css": "rad-night",
        "color": CYAN,
    },
    "EARTH_DAY": {
        "icon": "🌍",
        "name": "EARTH-DAY",
        "sink": "K / day-side IR",
        "advice": "THERMAL DANGER — heavy AI will overheat the server.",
        "css": "rad-day",
        "color": RED,
    },
}

PLOTLY_CONFIG = {"displayModeBar": False, "responsive": True}

# ─────────────────────────────────────────────────────────────────────────────
# CUSTOM CSS — deep-space glassmorphism mission-control skin
# ─────────────────────────────────────────────────────────────────────────────
st.markdown(
    """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

:root {
    --cyan: #00F0FF;
    --red: #FF2A2A;
    --amber: #FFB800;
    --emerald: #00FF88;
    --ink: #05070A;
    --panel: rgba(20, 30, 48, 0.7);
    --line: rgba(0, 240, 255, 0.16);
    --txt: #C9D6E8;
    --dim: #7F93AD;
}

html, body, [class*="css"], .stMarkdown, p, li, label, span {
    font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
}

.stApp {
    color: var(--txt);
    background-color: var(--ink);
    background-image:
        radial-gradient(circle at 18% 8%, rgba(0, 240, 255, 0.055), transparent 42%),
        radial-gradient(circle at 84% 92%, rgba(124, 58, 237, 0.06), transparent 44%),
        radial-gradient(1.3px 1.3px at 12px 18px, rgba(255, 255, 255, 0.55) 50%, transparent 51%),
        radial-gradient(1px 1px at 68px 84px, rgba(255, 255, 255, 0.38) 50%, transparent 51%),
        radial-gradient(1.5px 1.5px at 122px 42px, rgba(178, 230, 255, 0.5) 50%, transparent 51%),
        radial-gradient(0.9px 0.9px at 178px 128px, rgba(255, 255, 255, 0.32) 50%, transparent 51%),
        radial-gradient(1.1px 1.1px at 96px 150px, rgba(202, 240, 255, 0.45) 50%, transparent 51%),
        radial-gradient(1px 1px at 210px 66px, rgba(255, 255, 255, 0.3) 50%, transparent 51%),
        repeating-linear-gradient(0deg, rgba(0, 240, 255, 0.02) 0 1px, transparent 1px 42px),
        repeating-linear-gradient(90deg, rgba(0, 240, 255, 0.02) 0 1px, transparent 1px 42px);
    background-size: auto, auto, 230px 200px, 260px 240px, 240px 270px, 280px 250px, 250px 260px, 270px 280px, auto, auto;
}

#MainMenu, footer, header[data-testid="stHeader"], div[data-testid="stDecoration"],
div[data-testid="stToolbar"], div[data-testid="stStatusWidget"] {
    display: none !important;
}

.block-container {
    padding: 0.9rem 1.2rem 2.4rem 1.2rem;
    max-width: 2100px;
}

h1, h2, h3, h4 { color: #EAF6FF; letter-spacing: 0.02em; }

::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.03); }
::-webkit-scrollbar-thumb {
    background: rgba(0, 240, 255, 0.28);
    border-radius: 9px;
    border: 2px solid rgba(5, 7, 10, 0.8);
}

/* ── Glass panels ──────────────────────────────────────────────────── */
.glass {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), inset 0 0 28px rgba(0, 240, 255, 0.03);
    padding: 14px 16px;
    margin-bottom: 12px;
}

.panel-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--cyan);
    margin-bottom: 12px;
    white-space: nowrap;
}
.panel-title::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(0, 240, 255, 0.45), transparent);
}

/* ── Top bar ───────────────────────────────────────────────────────── */
.topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px 20px;
}
.brand {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-weight: 700;
    font-size: 1.05rem;
    letter-spacing: 0.16em;
    color: #EAFBFF;
}
.brand b { color: var(--cyan); text-shadow: 0 0 16px rgba(0, 240, 255, 0.7); }
.brand-sub {
    color: var(--dim);
    font-size: 0.72rem;
    font-weight: 500;
    letter-spacing: 0.2em;
    margin-left: 10px;
}
.pill {
    display: inline-block;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.66rem;
    letter-spacing: 0.12em;
    padding: 4px 11px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--dim);
    margin-left: 6px;
}
.pill-cyan { color: var(--cyan); border-color: rgba(0, 240, 255, 0.45); }
.pill-emerald { color: var(--emerald); border-color: rgba(0, 255, 136, 0.4); }
.pill-amber { color: var(--amber); border-color: rgba(255, 184, 0, 0.45); }
.pill-red { color: var(--red); border-color: rgba(255, 42, 42, 0.5); }

/* ── Circular gauges ───────────────────────────────────────────────── */
.gauge-wrap { position: relative; display: flex; justify-content: center; margin: 4px 0 6px 0; }
.gauge-wrap svg { display: block; filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.5)); }
.g-track { fill: none; stroke: rgba(148, 163, 184, 0.13); stroke-width: 9; }
.g-val {
    fill: none;
    stroke-width: 9;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: 60px 60px;
    transition: stroke-dasharray 0.35s ease, stroke 0.35s ease;
}
.g-inner { fill: rgba(8, 13, 24, 0.72); stroke: rgba(0, 240, 255, 0.08); stroke-width: 1; }
.g-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}
.g-num {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-weight: 700;
    font-size: 1.55rem;
    line-height: 1;
    text-shadow: 0 0 18px currentColor;
}
.g-unit { font-size: 0.78rem; font-weight: 500; margin-left: 2px; opacity: 0.85; }
.g-label {
    margin-top: 4px;
    font-size: 0.56rem;
    letter-spacing: 0.18em;
    color: var(--dim);
    text-transform: uppercase;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
}
.g-sub {
    text-align: center;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.64rem;
    letter-spacing: 0.14em;
    margin-bottom: 6px;
}
.dual-gauges { display: flex; gap: 8px; }
.dual-gauges > div { flex: 1; }

/* ── Orbital status badges ─────────────────────────────────────────── */
.badge-big {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-weight: 700;
    font-size: 0.82rem;
    letter-spacing: 0.14em;
    margin-bottom: 10px;
}
.badge-sun {
    background: rgba(255, 184, 0, 0.1);
    border: 1px solid rgba(255, 184, 0, 0.55);
    color: var(--amber);
    box-shadow: 0 0 22px rgba(255, 184, 0, 0.22), inset 0 0 18px rgba(255, 184, 0, 0.06);
}
.badge-eclipse {
    background: rgba(96, 126, 255, 0.1);
    border: 1px solid rgba(96, 126, 255, 0.55);
    color: #8FA8FF;
    box-shadow: 0 0 22px rgba(96, 126, 255, 0.22), inset 0 0 18px rgba(96, 126, 255, 0.06);
}

/* ── Radiator view card (the big, unmissable one) ──────────────────── */
.rad-card {
    border-radius: 14px;
    padding: 12px 14px;
    margin-bottom: 10px;
    border: 1.6px solid;
    text-align: center;
    position: relative;
    overflow: hidden;
}
.rad-card .rad-icon { font-size: 2.0rem; line-height: 1.15; }
.rad-card .rad-name {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 1.02rem;
    font-weight: 700;
    letter-spacing: 0.2em;
}
.rad-card .rad-sink {
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    color: var(--dim);
    margin-top: 2px;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
}
.rad-card .rad-cool {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 1.7rem;
    font-weight: 700;
    margin-top: 6px;
    text-shadow: 0 0 18px currentColor;
}
.rad-card .rad-advice { font-size: 0.7rem; margin-top: 6px; letter-spacing: 0.04em; }
.rad-deep {
    background: rgba(0, 255, 136, 0.08);
    border-color: rgba(0, 255, 136, 0.6);
    color: var(--emerald);
    box-shadow: 0 0 26px rgba(0, 255, 136, 0.18), inset 0 0 30px rgba(0, 255, 136, 0.05);
}
.rad-night {
    background: rgba(0, 240, 255, 0.07);
    border-color: rgba(0, 240, 255, 0.55);
    color: var(--cyan);
    box-shadow: 0 0 26px rgba(0, 240, 255, 0.16), inset 0 0 30px rgba(0, 240, 255, 0.05);
}
.rad-day {
    background: rgba(255, 42, 42, 0.1);
    border-color: rgba(255, 42, 42, 0.75);
    color: var(--red);
    animation: radpulse 1.3s ease-in-out infinite;
}
@keyframes radpulse {
    0%   { box-shadow: 0 0 14px rgba(255, 42, 42, 0.3); }
    50%  { box-shadow: 0 0 34px rgba(255, 42, 42, 0.75); }
    100% { box-shadow: 0 0 14px rgba(255, 42, 42, 0.3); }
}

/* ── Orbit progress bar ────────────────────────────────────────────── */
.op-bar {
    height: 8px;
    border-radius: 8px;
    background: rgba(148, 163, 184, 0.14);
    overflow: hidden;
    margin: 6px 0 4px 0;
    border: 1px solid rgba(0, 240, 255, 0.12);
}
.op-fill {
    height: 100%;
    border-radius: 8px;
    background: linear-gradient(90deg, #00A3B4, var(--cyan));
    box-shadow: 0 0 12px rgba(0, 240, 255, 0.7);
    transition: width 0.4s ease;
}
.op-meta {
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.62rem;
    color: var(--dim);
    letter-spacing: 0.1em;
}

/* ── HUD stat strip (center top) ───────────────────────────────────── */
.stat-row { display: flex; gap: 10px; flex-wrap: wrap; }
.stat {
    flex: 1 1 130px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    padding: 10px 14px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4), inset 0 0 22px rgba(0, 240, 255, 0.03);
}
.stat-k {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.56rem;
    letter-spacing: 0.2em;
    color: var(--dim);
    text-transform: uppercase;
}
.stat-v {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 1.35rem;
    font-weight: 700;
    color: #F2FAFF;
    margin-top: 3px;
    line-height: 1.15;
    white-space: nowrap;
}
.stat-v.small { font-size: 0.94rem; }
.stat-v.cyan { color: var(--cyan); text-shadow: 0 0 16px rgba(0, 240, 255, 0.5); }
.stat-v.emerald { color: var(--emerald); text-shadow: 0 0 16px rgba(0, 255, 136, 0.45); }
.stat-v.amber { color: var(--amber); text-shadow: 0 0 16px rgba(255, 184, 0, 0.5); }
.stat-v.red { color: var(--red); text-shadow: 0 0 16px rgba(255, 42, 42, 0.6); }
.stat-sub {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.58rem;
    color: var(--dim);
    margin-top: 3px;
    letter-spacing: 0.06em;
}

/* ── Mission control log ───────────────────────────────────────────── */
.log-scroll {
    display: flex;
    flex-direction: column-reverse;
    overflow-y: auto;
    height: 268px;
    padding-right: 6px;
}
.log-line {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.72rem;
    line-height: 1.5;
    padding: 2px 0;
    border-bottom: 1px dashed rgba(127, 147, 173, 0.08);
    word-break: break-word;
}
.log-t { color: #4E6E8E; margin-right: 7px; }
.lvl-info  .log-msg { color: #A9BCD4; }
.lvl-sys   .log-msg { color: var(--cyan); }
.lvl-ok    .log-msg { color: var(--emerald); }
.lvl-warn  .log-msg { color: var(--amber); }
.lvl-crit  .log-msg { color: var(--red); font-weight: 700; text-shadow: 0 0 10px rgba(255, 42, 42, 0.4); }

/* ── Task cards (right column) ─────────────────────────────────────── */
.task-card {
    border-radius: 14px;
    padding: 11px 13px;
    border: 1px solid rgba(127, 147, 173, 0.22);
    background: rgba(16, 26, 42, 0.65);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    margin-bottom: 4px;
}
.task-card.active {
    border-color: rgba(0, 240, 255, 0.7);
    box-shadow: 0 0 20px rgba(0, 240, 255, 0.22), inset 0 0 20px rgba(0, 240, 255, 0.05);
}
.task-card.danger-active {
    border-color: rgba(255, 42, 42, 0.75);
    box-shadow: 0 0 20px rgba(255, 42, 42, 0.3), inset 0 0 20px rgba(255, 42, 42, 0.06);
    animation: radpulse 1.6s ease-in-out infinite;
}
.task-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}
.task-name {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.8rem;
    font-weight: 700;
    color: #E8F6FF;
    letter-spacing: 0.04em;
}
.task-blurb { font-size: 0.66rem; color: var(--dim); margin-top: 3px; line-height: 1.4; }
.task-stats {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
}
.chip {
    display: inline-block;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.56rem;
    letter-spacing: 0.08em;
    padding: 2px 7px;
    border-radius: 6px;
    border: 1px solid;
}
.chip-cyan   { color: var(--cyan);   border-color: rgba(0, 240, 255, 0.4);  background: rgba(0, 240, 255, 0.07); }
.chip-amber  { color: var(--amber);  border-color: rgba(255, 184, 0, 0.4);  background: rgba(255, 184, 0, 0.07); }
.chip-red    { color: var(--red);    border-color: rgba(255, 42, 42, 0.45); background: rgba(255, 42, 42, 0.08); }
.chip-emerald{ color: var(--emerald);border-color: rgba(0, 255, 136, 0.4);  background: rgba(0, 255, 136, 0.07); }
.chip-dim    { color: var(--dim);    border-color: rgba(127, 147, 173, 0.35); background: rgba(127, 147, 173, 0.06); }
.task-bar {
    height: 6px;
    border-radius: 6px;
    background: rgba(148, 163, 184, 0.14);
    overflow: hidden;
    margin-top: 8px;
}
.task-bar-fill {
    height: 100%;
    border-radius: 6px;
    background: linear-gradient(90deg, #008B9B, var(--cyan));
    box-shadow: 0 0 10px rgba(0, 240, 255, 0.6);
}
.task-remain {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.6rem;
    color: var(--cyan);
    margin-top: 4px;
    letter-spacing: 0.08em;
}

/* ── Mission brief ─────────────────────────────────────────────────── */
.brief-h {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.92rem;
    font-weight: 700;
    color: #EAFBFF;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
}
.brief-p { font-size: 0.82rem; color: var(--txt); line-height: 1.55; margin-bottom: 8px; }
.brief-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.brief-item {
    font-size: 0.72rem;
    color: var(--txt);
    line-height: 1.45;
    background: rgba(10, 16, 28, 0.5);
    border: 1px solid rgba(127, 147, 173, 0.16);
    border-radius: 10px;
    padding: 8px 10px;
}
.brief-hint {
    margin-top: 10px;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.7rem;
    color: var(--amber);
    letter-spacing: 0.05em;
}

/* ── Report card ───────────────────────────────────────────────────── */
.report-grid { display: flex; gap: 10px; flex-wrap: wrap; }
.report-cell {
    flex: 1 1 170px;
    border-radius: 12px;
    border: 1px solid rgba(127, 147, 173, 0.2);
    background: rgba(10, 16, 28, 0.55);
    padding: 10px 14px;
}
.report-cell.hl-cyan { border-color: rgba(0, 240, 255, 0.5); box-shadow: 0 0 18px rgba(0, 240, 255, 0.12); }
.report-cell.hl-red { border-color: rgba(255, 42, 42, 0.55); box-shadow: 0 0 18px rgba(255, 42, 42, 0.14); }
.report-cell.hl-amber { border-color: rgba(255, 184, 0, 0.5); }
.report-k {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.18em;
    color: var(--dim);
    text-transform: uppercase;
}
.report-v {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 1.35rem;
    font-weight: 700;
    margin-top: 4px;
}
.report-s { font-size: 0.64rem; color: var(--dim); margin-top: 3px; }
.verdict {
    margin-top: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 0.86rem;
    line-height: 1.55;
    letter-spacing: 0.02em;
}
.verdict-fail {
    background: rgba(255, 42, 42, 0.1);
    border: 1.4px solid rgba(255, 42, 42, 0.65);
    color: #FFD9D9;
    box-shadow: 0 0 24px rgba(255, 42, 42, 0.15);
}
.verdict-ok {
    background: rgba(0, 255, 136, 0.08);
    border: 1.4px solid rgba(0, 255, 136, 0.55);
    color: #D9FFEC;
    box-shadow: 0 0 24px rgba(0, 255, 136, 0.12);
}
.verdict-warn {
    background: rgba(255, 184, 0, 0.09);
    border: 1.4px solid rgba(255, 184, 0, 0.55);
    color: #FFF3D6;
}

/* ── Streamlit widget skins ────────────────────────────────────────── */
div.stButton > button {
    width: 100%;
    background: rgba(0, 240, 255, 0.055);
    color: #9FEFFB;
    border: 1px solid rgba(0, 240, 255, 0.35);
    border-radius: 10px;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.5rem 0.6rem;
    transition: all 0.16s ease;
    box-shadow: inset 0 0 14px rgba(0, 240, 255, 0.05);
}
div.stButton > button:hover {
    background: rgba(0, 240, 255, 0.16);
    border-color: var(--cyan);
    color: #FFFFFF;
    box-shadow: 0 0 20px rgba(0, 240, 255, 0.35);
    transform: translateY(-1px);
}
div.stButton > button:active { transform: translateY(0); }
div.stButton > button[kind="primary"] {
    background: linear-gradient(180deg, rgba(0, 240, 255, 0.92), rgba(0, 148, 186, 0.9));
    color: #021119;
    border: 1px solid rgba(160, 250, 255, 0.85);
    font-weight: 800;
    box-shadow: 0 0 24px rgba(0, 240, 255, 0.4);
}
div.stButton > button[kind="primary"]:hover {
    background: linear-gradient(180deg, #4DF6FF, #00B8D4);
    color: #001018;
    box-shadow: 0 0 34px rgba(0, 240, 255, 0.65);
}
div.stButton > button:disabled,
div.stButton > button[disabled] {
    background: rgba(16, 26, 42, 0.5) !important;
    border-color: rgba(127, 147, 173, 0.22) !important;
    color: rgba(127, 147, 173, 0.55) !important;
    box-shadow: none !important;
    transform: none !important;
}

div[data-testid="stRadioGroup"] > div,
div[role="radiogroup"] {
    gap: 8px;
    flex-direction: column;
}
div[data-testid="stRadioGroup"] label,
div[role="radiogroup"] > label {
    background: rgba(16, 26, 42, 0.68);
    border: 1px solid rgba(127, 147, 173, 0.25);
    border-radius: 12px;
    padding: 9px 12px !important;
    transition: all 0.16s ease;
    cursor: pointer;
}
div[data-testid="stRadioGroup"] label:hover,
div[role="radiogroup"] > label:hover {
    border-color: rgba(0, 240, 255, 0.5);
}
div[data-testid="stRadioGroup"] label[data-checked="true"],
div[data-testid="stRadioGroup"] label:has(input:checked),
div[role="radiogroup"] > label:has(input:checked) {
    border-color: var(--cyan) !important;
    background: rgba(0, 240, 255, 0.1) !important;
    box-shadow: 0 0 18px rgba(0, 240, 255, 0.2);
}
div[data-testid="stRadioGroup"] p,
div[role="radiogroup"] p {
    font-family: 'JetBrains Mono', 'Courier New', monospace !important;
    font-size: 0.72rem !important;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: #D7F7FF !important;
}

div[data-testid="stPlotlyChart"] {
    background: rgba(10, 16, 28, 0.5);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 6px 6px 2px 6px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    margin-bottom: 12px;
}

div[data-testid="stDialog"] > div {
    border: 1.6px solid rgba(255, 42, 42, 0.55) !important;
    border-radius: 20px !important;
    background: rgba(8, 12, 22, 0.97) !important;
    box-shadow: 0 0 60px rgba(255, 42, 42, 0.25) !important;
}
.fail-hero {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--red);
    text-shadow: 0 0 26px rgba(255, 42, 42, 0.7);
    margin-bottom: 4px;
}
.fail-sub {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.74rem;
    letter-spacing: 0.2em;
    color: var(--dim);
    margin-bottom: 12px;
}
.fail-quote {
    margin: 12px 0;
    padding: 12px 16px;
    border-left: 3px solid var(--red);
    background: rgba(255, 42, 42, 0.07);
    border-radius: 0 12px 12px 0;
    font-size: 0.9rem;
    line-height: 1.6;
    color: #FFE1E1;
}
.fail-quote b { color: var(--red); }

.stCaption, div[data-testid="stCaptionContainer"] p {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.62rem !important;
    letter-spacing: 0.06em;
    color: var(--dim) !important;
}

.explain-card { height: 100%; }
.explain-h {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    margin-bottom: 6px;
}
.explain-p { font-size: 0.72rem; color: var(--txt); line-height: 1.55; }
</style>
""",
    unsafe_allow_html=True,
)

# ─────────────────────────────────────────────────────────────────────────────
# MISSION BUNDLE — validated engine runs (cached once per server process)
# ─────────────────────────────────────────────────────────────────────────────
@st.cache_resource(show_spinner=False)
def load_mission_bundle(orbit_key: str = "LEO") -> dict[str, Any]:
    """Run the validated LumenOS + Naive schedulers for one 90-min mission.

    Everything the game needs is derived from these two engine runs: the
    orbital trace, the ghost timelines drawn on the comparison charts, and
    the projected TFLOPs scores. Cached per orbit theater.

    Args:
        orbit_key: Mission theater ('LEO', 'GEO', 'LUNAR', 'MARS').

    Returns:
        Bundle dict with states, timelines, score prefix arrays and markers.
    """
    profile = get_orbital_profile(orbit_key)
    scheduler = LumenScheduler(orbit_profile=profile, step_seconds=STEP_SECONDS)
    lumen = scheduler.run_simulation()
    naive = scheduler.compare_with_naive_scheduler()

    profiler = WorkloadProfiler()
    power_by_name = {task.name: task.power_draw_watts for task in profiler.get_all_tasks()}

    def _prefix_accrual(timeline: list[dict[str, Any]]) -> list[float]:
        """TFLOPs accrued after each step (index i -> score after i steps)."""
        values = [0.0]
        total = 0.0
        for row in timeline:
            name = row["task_running"] or row["task_completed"]
            if name:
                total += power_by_name[name] * TFLOPS_PER_WATT_SECOND * STEP_SECONDS
            values.append(total)
        return values

    lumen_prefix = _prefix_accrual(lumen["timeline"])
    naive_prefix = _prefix_accrual(naive["timeline"])

    naive_crashed = any(row["thermal_status"] == SHUTDOWN for row in naive["timeline"])
    naive_crash_idx = next(
        (i for i, row in enumerate(naive["timeline"]) if row["thermal_status"] == SHUTDOWN),
        len(naive["timeline"]) - 1,
    )
    crash_task = naive["timeline"][naive_crash_idx]["task_running"]
    lost_rate = power_by_name.get(crash_task or "", 0.0) * TFLOPS_PER_WATT_SECOND
    naive_lost_tflops = naive["lost_compute_seconds"] * lost_rate

    return {
        "orbit_key": profile.key,
        "profile": profile,
        "states": [row["orbital_state"] for row in lumen["timeline"]],
        "lumen": lumen["timeline"],
        "naive": naive["timeline"],
        "lumen_prefix": lumen_prefix,
        "naive_prefix": naive_prefix,
        "lumen_final_score": lumen_prefix[-1],
        "naive_score": max(naive_prefix[naive_crash_idx + 1] - naive_lost_tflops, 0.0),
        "naive_crashed": naive_crashed,
        "naive_crash_idx": naive_crash_idx,
        "naive_crash_time_min": (naive_crash_idx + 1) * STEP_SECONDS / 60.0,
        "naive_lost_tflops": naive_lost_tflops,
        "lumen_max_temp": lumen["max_temperature_reached"],
        "naive_max_temp": naive["max_temperature_reached"],
        "lumen_mean_accuracy": lumen["mean_accuracy"],
        "lumen_precision_seconds": lumen["precision_seconds"],
        "power_by_name": power_by_name,
        "tasks_by_name": {task.name: task for task in profiler.get_all_tasks()},
    }


# ─────────────────────────────────────────────────────────────────────────────
# SMALL HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def clamp(value: float, low: float, high: float) -> float:
    """Clamp a numeric value into [low, high]."""
    return max(low, min(high, value))


def fmt_mmss(seconds: float) -> str:
    """Format seconds as MM:SS."""
    seconds = max(0.0, seconds)
    minutes = int(seconds // 60)
    return f"{minutes:02d}:{int(seconds % 60):02d}"


def fmt_num(value: float) -> str:
    """Format a score with thousands separators."""
    return f"{value:,.0f}"


def task_rate_watts(task: AIWorkload, level: str = FP32) -> float:
    """TFLOP/s throughput of a workload at a precision (1 TFLOP/s per kW)."""
    return task.power_for_precision(level) * TFLOPS_PER_WATT_SECOND


def task_tflops(task: AIWorkload, level: str = FP32) -> float:
    """Full TFLOPs value of completing a workload end to end at a precision."""
    return task_rate_watts(task, level) * task.duration_minutes * 60.0


def status_for_temp(temp_c: float) -> str:
    """Classify a temperature the same way ThermalEngine does."""
    if temp_c >= SHUTDOWN_C:
        return SHUTDOWN
    if temp_c >= 80.0:
        return CRITICAL
    if temp_c >= 60.0:
        return WARNING
    return NOMINAL


def task_power_budget(thermal: ThermalEngine, orb: dict[str, Any]) -> float:
    """Watts available to workloads right now (mirrors the scheduler rule)."""
    available = thermal.battery.available_power(
        orb["is_sunlit"], orb["solar_power_watts"], STEP_SECONDS
    )
    return max(0.0, available - thermal.base_heat_watts)


def radiator_bar_html(
    facing: str, sink_k: float, cooling_w: float, sunlit: bool
) -> str:
    """Build the big, glowing radiator view-factor card."""
    info = RADIATOR_INFO[facing]
    eclipse_note = (
        "<div class='rad-advice' style='color:#8FA8FF'>In eclipse — no solar power. Battery bus only.</div>"
        if not sunlit
        else f"<div class='rad-advice' style='color:{info['color']}'>{info['advice']}</div>"
    )
    return f"""
    <div class="rad-card {info['css']}">
        <div class="rad-icon">{info['icon']}</div>
        <div class="rad-name">{info['name']}</div>
        <div class="rad-sink">VIEW FACTOR · SINK {sink_k:.0f} {info['sink']}</div>
        <div class="rad-cool">{cooling_w:.0f} W</div>
        <div style="font-size:0.62rem; letter-spacing:0.16em; color:#9FB4CC;">RADIATOR COOLING CAPACITY</div>
        {eclipse_note}
    </div>
    """


def gauge_html(
    label: str,
    value: float,
    vmax: float,
    unit: str,
    color: str,
    size: int = 168,
    decimals: int = 1,
    sub: Optional[str] = None,
) -> str:
    """Build a circular SVG progress gauge (no external component needed)."""
    fraction = clamp(value / vmax, 0.0, 1.0)
    circumference = 2.0 * math.pi * 52.0
    dash = circumference * fraction
    sub_html = f"<div class='g-sub' style='color:{color}'>{sub}</div>" if sub else ""
    return f"""
    <div class="gauge-wrap">
        <svg viewBox="0 0 120 120" width="{size}" height="{size}">
            <circle class="g-track" cx="60" cy="60" r="52"></circle>
            <circle class="g-inner" cx="60" cy="60" r="40"></circle>
            <circle class="g-val" cx="60" cy="60" r="52"
                    style="stroke:{color}; stroke-dasharray:{dash:.1f} {circumference:.1f};"></circle>
        </svg>
        <div class="g-center">
            <div class="g-num" style="color:{color}">{value:.{decimals}f}<span class="g-unit">{unit}</span></div>
            <div class="g-label">{label}</div>
        </div>
    </div>
    {sub_html}
    """


def log_line_html(t_seconds: float, level: str, message: str) -> str:
    """One terminal-style log line."""
    return (
        f"<div class='log-line lvl-{level}'>"
        f"<span class='log-t'>[T+{fmt_mmss(t_seconds)}]</span>"
        f"<span class='log-msg'>{html.escape(message)}</span></div>"
    )


# ─────────────────────────────────────────────────────────────────────────────
# GAME STATE
# ─────────────────────────────────────────────────────────────────────────────
def new_game(mode: str, mission: dict[str, Any]) -> dict[str, Any]:
    """Create a fresh game state for a new 90-minute mission window."""
    first_orb = mission["states"][0]
    profile = mission["profile"]
    thermal = ThermalEngine(
        mass_kg=profile.server_mass_kg,
        battery_capacity_wh=profile.battery_capacity_wh,
        base_heat_watts=BASE_HEAT_W,
    )
    log: list[tuple[float, str, str]] = [
        (0.0, "sys", f"LUMENOS PROTOCOL · Mission Control online. {profile.label} · {profile.altitude_km:,.0f} km."),
        (0.0, "info", "DIRECTIVE: maximize TFLOPs over one 90-min mission. Thermal shutdown at 95°C ENDS the mission."),
        (0.0, "warn", f"THERMODYNAMICS: {profile.eclipse_note}"),
    ]
    if mode == "manual":
        log.append(
            (0.0, "warn", "MANUAL OVERRIDE: no checkpoint subsystem. Aborting a task destroys its progress.")
        )
    else:
        log.append(
            (0.0, "sys", "LUMENOS HYPERVISOR: 5-min thermal look-ahead + checkpointing armed. You are a passenger now.")
        )
    return {
        "mode": mode,
        "orbit_key": mission["orbit_key"],
        "t_index": 0,
        "phase": "briefing",
        "thermal": thermal,
        "task": None,
        "task_remaining_s": 0.0,
        "task_starved": False,
        "accrued": 0.0,
        "discarded": 0.0,
        "accrued_at_task_start": 0.0,
        "completed": 0,
        "completed_by": {},
        "compute_seconds": 0.0,
        "max_temp": thermal.current_temp_celsius,
        "min_battery": 100.0,
        "log": log,
        "timeline": [],
        "temp_series": [],
        "score_series": [],
        "crash": None,
        "lost_tflops": 0.0,
        "prev_temp": thermal.current_temp_celsius,
        "prev_orb": first_orb,
        "last_task_log_t": -9999.0,
        "precision_mode": FP32,
        "precision_seconds": {FP32: 0.0, INT8: 0.0, TINY: 0.0},
        "last_level": FP32,
        "storm": False,
        "safe_mode_seconds": 0.0,
        "soh_events": [],
    }


def pending_tflops(G: dict[str, Any]) -> float:
    """TFLOPs accrued by the currently running task but not yet banked."""
    if G["task"] is None:
        return 0.0
    return max(0.0, G["accrued"] - G["accrued_at_task_start"])


def banked_tflops(G: dict[str, Any]) -> float:
    """Banked (survivable) TFLOPs of the manual run."""
    return max(0.0, G["accrued"] - G["discarded"] - pending_tflops(G))


def player_score(G: dict[str, Any], mission: dict[str, Any]) -> float:
    """Score displayed in the HUD for either mode."""
    if G["mode"] == "manual":
        return banked_tflops(G)
    return mission["lumen_prefix"][G["t_index"]]


def log_event(G: dict[str, Any], level: str, message: str, t_seconds: float) -> None:
    """Append one event to the mission log."""
    G["log"].append((t_seconds, level, message))
    if len(G["log"]) > 400:
        del G["log"][:100]


# ─────────────────────────────────────────────────────────────────────────────
# ORBITAL / THERMAL EVENT GENERATION
# ─────────────────────────────────────────────────────────────────────────────
def orbital_events(
    prev_orb: Optional[dict[str, Any]], orb: dict[str, Any], t_seconds: float
) -> list[tuple[str, str, float]]:
    """Log entries for sun/eclipse and radiator view-factor transitions."""
    events: list[tuple[str, str, float]] = []
    if prev_orb is None:
        events.append((
            "sys",
            f"MISSION START — solar array online at {orb['solar_power_watts']:.0f} W. "
            f"Radiator facing {orb['radiator_facing']} ({orb['max_cooling_capacity_watts']:.0f} W cooling).",
            t_seconds,
        ))
        return events
    if prev_orb["is_sunlit"] and not orb["is_sunlit"]:
        events.append(("warn", "ECLIPSE ENTRY — solar array offline. Battery bus online (max 200 W).", t_seconds))
    elif not prev_orb["is_sunlit"] and orb["is_sunlit"]:
        events.append(("ok", f"SUNRISE — solar array online ({orb['solar_power_watts']:.0f} W).", t_seconds))
    if prev_orb["radiator_facing"] != orb["radiator_facing"]:
        facing = orb["radiator_facing"]
        cooling = orb["max_cooling_capacity_watts"]
        if facing == "DEEP_SPACE":
            events.append(("ok", f"RADIATOR VIEW: deep space (3 K) — cooling capacity {cooling:.0f} W. HEAVY WORKLOAD WINDOW OPEN.", t_seconds))
        elif facing == "EARTH_NIGHT":
            events.append(("info", f"RADIATOR VIEW: night-side Earth (220 K) — cooling capacity {cooling:.0f} W. Moderate window.", t_seconds))
        else:
            events.append(("crit", f"RADIATOR VIEW: day-side Earth (280 K) — cooling capacity {cooling:.0f} W. THERMAL RISK — heavy AI will overheat.", t_seconds))
    return events


def threshold_events(prev_temp: float, new_temp: float, t_seconds: float) -> list[tuple[str, str, float]]:
    """Warning / critical crossing events for the manual run."""
    events: list[tuple[str, str, float]] = []
    if prev_temp < 60.0 <= new_temp:
        events.append(("warn", f"WARNING: server at {new_temp:.1f}°C — radiator margin shrinking.", t_seconds))
    if prev_temp < 80.0 <= new_temp:
        events.append(("crit", f"CRITICAL: server at {new_temp:.1f}°C — thermal shutdown at 95°C imminent.", t_seconds))
    return events


# ─────────────────────────────────────────────────────────────────────────────
# MANUAL MODE — live physics stepping (mirrors LumenScheduler._simulate)
# ─────────────────────────────────────────────────────────────────────────────
def manual_step(G: dict[str, Any], mission: dict[str, Any], i: int) -> None:
    """Advance the manual run by one 30 s physics step."""
    orb = mission["states"][i]
    thermal = G["thermal"]
    battery = thermal.battery
    dt = STEP_SECONDS

    events = orbital_events(G["prev_orb"], orb, (i + 1) * dt)
    G["prev_orb"] = orb

    temp = thermal.current_temp_celsius
    status = thermal.get_thermal_status(temp)
    power_budget = task_power_budget(thermal, orb)
    task = G["task"]

    # --- Resolve compute precision (thermal-aware quantization) -----------
    precision_mode = G.get("precision_mode", FP32)
    level = resolve_precision(temp) if precision_mode == AUTO else precision_mode
    if level != G.get("last_level", FP32):
        spec = PRECISION_PROFILES[level]
        if precision_mode == AUTO:
            events.append((
                "info",
                f"QUANTIZATION: AUTO → {level} at {temp:.1f}°C — heat ×{spec.heat_scale:.2f}, "
                f"power ×{spec.power_scale:.2f}, accuracy {spec.accuracy * 100:.0f}%.",
                (i + 1) * dt,
            ))
        G["last_level"] = level

    task_power = task.power_for_precision(level) if task else 0.0
    task_heat = task.heat_for_precision(level) if task else 0.0

    # --- Grounding gates: storm doctrine + ageing battery ------------------
    storm = G.get("storm", False)
    if storm:
        G["safe_mode_seconds"] = G.get("safe_mode_seconds", 0.0) + dt
    gate_reason: Optional[str] = None
    if task is not None:
        if storm and battery.percent <= STORM_BATTERY_RESERVE_PCT:
            gate_reason = (
                f"SAFE MODE: battery reserved for comms "
                f"({battery.percent:.0f}% ≤ {STORM_BATTERY_RESERVE_PCT:.0f}%) — {task.name} held."
            )
        elif storm and task.category != COLD:
            gate_reason = (
                f"SAFE MODE (geomagnetic storm): {task.name} grounded — heavy tasks paused, "
                "battery reserved for comms."
            )
        elif (
            not orb["is_sunlit"]
            and battery.state_of_health * 100.0 < SOH_HEAVY_LOCKOUT_PCT
            and task.category != COLD
        ):
            gate_reason = (
                f"BATTERY PROTECTION: SoH {battery.state_of_health * 100:.1f}% < "
                f"{SOH_HEAVY_LOCKOUT_PCT:.0f}% — heavy tasks locked out in eclipse."
            )
    if gate_reason is not None and gate_reason != G.get("gate_active"):
        events.append(("crit", gate_reason, (i + 1) * dt))
        G["gate_active"] = gate_reason
    elif gate_reason is None and G.get("gate_active") is not None:
        events.append(("ok", f"GROUNDING CLEARED — {task.name if task else 'queue'} released.", (i + 1) * dt))
        G["gate_active"] = None

    powered = task is not None and task_power <= power_budget + 1e-9
    if task is not None and not powered and not G["task_starved"]:
        events.append((
            "warn",
            f"POWER: bus cannot sustain {task.name} ({task_power:.0f} W > {power_budget:.0f} W budget) — "
            "held, progress preserved.",
            (i + 1) * dt,
        ))
        G["task_starved"] = True
    elif task is not None and powered and G["task_starved"]:
        events.append(("ok", f"POWER: {task.name} re-energized ({power_budget:.0f} W budget).", (i + 1) * dt))
        G["task_starved"] = False

    running = task is not None and powered and gate_reason is None
    heat_now = task_heat if running else 0.0
    q_in = thermal.total_heat_input(heat_now)
    load = thermal.base_heat_watts + (task_power if running else 0.0)
    q_out = thermal.radiator_heat_rejection(
        orb["sink_temperature_kelvin"], orb["max_cooling_capacity_watts"]
    )
    soh_before = battery.state_of_health
    battery.step(orb["is_sunlit"], orb["solar_power_watts"], load, dt, temp_celsius=temp)
    if battery.state_of_health < soh_before:
        events.append((
            "warn",
            f"BATTERY AGEING: hot eclipse entry at {temp:.1f}°C — cells degraded "
            f"−{(soh_before - battery.state_of_health) * 100:.2f}% SoH "
            f"(now {battery.state_of_health * 100:.1f}%).",
            (i + 1) * dt,
        ))
        G["soh_events"].append(((i + 1) * dt, battery.state_of_health))
    new_temp = thermal.update_temperature(q_in, q_out, dt)

    if running:
        G["precision_seconds"][level] = G["precision_seconds"].get(level, 0.0) + dt
        G["accrued"] += task_power * TFLOPS_PER_WATT_SECOND * dt
        G["compute_seconds"] += dt
        G["task_remaining_s"] -= dt
        if G["task_remaining_s"] <= 1e-9:
            events.append((
                "ok",
                f"TASK COMPLETE: {task.name} [{level}] +{fmt_num(task_tflops(task, level))} TFLOPs banked "
                f"({task.duration_minutes:.0f} min run).",
                (i + 1) * dt,
            ))
            G["completed"] += 1
            G["completed_by"][task.name] = G["completed_by"].get(task.name, 0) + 1
            G["task"] = None
            G["task_remaining_s"] = 0.0
            G["accrued_at_task_start"] = G["accrued"]

    events += threshold_events(temp, new_temp, (i + 1) * dt)

    battery_pct = battery.percent
    if G["min_battery"] >= 25.0 > battery_pct:
        events.append(("warn", f"BATTERY: {battery_pct:.0f}% remaining — conserve energy.", (i + 1) * dt))

    G["timeline"].append({
        "time": orb["timestamp"],
        "orbital_state": orb,
        "temperature_c": temp,
        "task_running": task.name if running else None,
        "task_heat_watts": heat_now,
        "cooling_watts": q_out,
        "thermal_status": status,
        "battery_percent": battery_pct,
        "battery_soh": battery.state_of_health,
        "power_available_watts": battery.available_power(orb["is_sunlit"], orb["solar_power_watts"], dt),
        "precision": level if running else None,
        "safe_mode": storm,
        "decision": "MANUAL",
        "task_completed": None,
    })

    G["max_temp"] = max(G["max_temp"], new_temp)
    G["min_battery"] = min(G["min_battery"], battery_pct)
    G["temp_series"].append(new_temp)
    G["score_series"].append(banked_tflops(G))
    G["prev_temp"] = new_temp

    if new_temp >= SHUTDOWN_C:
        lost = pending_tflops(G)
        G["discarded"] += lost
        G["lost_tflops"] = lost
        G["phase"] = "failed"
        G["crash"] = {
            "type": "THERMAL_SHUTDOWN",
            "temp": new_temp,
            "t_min": (i + 1) * dt / 60.0,
            "task": task.name if task else None,
        }
        events.append((
            "crit",
            f"*** THERMAL SHUTDOWN at {new_temp:.1f}°C *** Hardware protection tripped. "
            f"All in-flight work destroyed ({fmt_num(lost)} TFLOPs lost). MISSION OVER.",
            (i + 1) * dt,
        ))
        G["task"] = None
        G["task_remaining_s"] = 0.0
        G["accrued_at_task_start"] = G["accrued"]
    elif thermal.battery.is_depleted:
        lost = pending_tflops(G)
        G["discarded"] += lost
        G["lost_tflops"] = lost
        G["phase"] = "failed"
        G["crash"] = {
            "type": "POWER_FAILURE",
            "temp": new_temp,
            "t_min": (i + 1) * dt / 60.0,
            "task": task.name if task else None,
        }
        events.append((
            "crit",
            "*** POWER FAILURE — battery depleted *** The compute bus is dead. MISSION OVER.",
            (i + 1) * dt,
        ))
        G["task"] = None
        G["task_remaining_s"] = 0.0
        G["accrued_at_task_start"] = G["accrued"]

    for level, message, t in events:
        log_event(G, level, message, t)


def turn_summary_event(G: dict[str, Any], mission: dict[str, Any], i: int) -> tuple[str, str, float]:
    """One-liner telemetry summary appended at every full 5-min turn boundary."""
    t = (i + 1) * STEP_SECONDS
    view = current_view(G, mission)
    score = player_score(G, mission)
    return (
        "sys",
        f"TURN {int(t // (TURN_STEPS * STEP_SECONDS))}/18 — T+{fmt_mmss(t)} · "
        f"{view['temp']:.1f}°C [{view['status']}] · battery {view['battery']:.0f}% · score {fmt_num(score)} TFLOPs",
        t,
    )


# ─────────────────────────────────────────────────────────────────────────────
# LUMENOS MODE — replay of the validated hypervisor timeline
# ─────────────────────────────────────────────────────────────────────────────
def lumen_replay_step(G: dict[str, Any], mission: dict[str, Any]) -> None:
    """Advance the LumenOS run by one 30 s step of the validated timeline."""
    i = G["t_index"]
    tl = mission["lumen"]
    row = tl[i]
    prev_row = tl[i - 1] if i > 0 else None
    t = (i + 1) * STEP_SECONDS

    for level, message, et in orbital_events(
        prev_row["orbital_state"] if prev_row else None, row["orbital_state"], t
    ):
        log_event(G, level, message, et)

    if prev_row is not None:
        new_status = row["thermal_status"]
        old_status = prev_row["thermal_status"]
        if new_status != old_status:
            if new_status == WARNING:
                log_event(G, "warn", f"THERMAL: {row['temperature_c']:.1f}°C crossing 60°C — hypervisor throttling heavy categories.", t)
            elif new_status == CRITICAL:
                log_event(G, "crit", f"THERMAL: {row['temperature_c']:.1f}°C crossing 80°C — emergency pacing; heat rejection maxed.", t)

        new_prec = row.get("precision")
        old_prec = prev_row.get("precision")
        if new_prec is not None and old_prec is not None and new_prec != old_prec:
            spec = PRECISION_PROFILES.get(new_prec)
            if spec is not None:
                log_event(
                    G, "info",
                    f"QUANTIZATION: hypervisor switched {old_prec} → {new_prec} at "
                    f"{row['temperature_c']:.1f}°C — heat ×{spec.heat_scale:.2f}, "
                    f"accuracy {spec.accuracy * 100:.0f}%.",
                    t,
                )

        soh_now = row.get("battery_soh", 1.0)
        soh_prev = prev_row.get("battery_soh", 1.0)
        if soh_now < soh_prev:
            log_event(
                G, "warn",
                f"BATTERY AGEING: hot eclipse entry — cells degraded "
                f"−{(soh_prev - soh_now) * 100:.2f}% SoH (now {soh_now * 100:.1f}%).",
                t,
            )

        cur_task = row["task_running"]
        prev_task = prev_row["task_running"]
        if cur_task != prev_task:
            since = t - G["last_task_log_t"]
            if cur_task is None and prev_task is not None and since > 60:
                log_event(
                    G, "sys",
                    f"HYPERVISOR: checkpoint {prev_task} — 5-min look-ahead sees the thermal ceiling. "
                    "Progress saved, task paused.",
                    t,
                )
                G["last_task_log_t"] = t
            elif cur_task is not None and prev_task is None and since > 60:
                log_event(G, "ok", f"HYPERVISOR: resume {cur_task} from checkpoint — thermal margin restored.", t)
                G["last_task_log_t"] = t
            elif cur_task is not None and prev_task is not None and since > 150:
                log_event(G, "info", f"HYPERVISOR: preempt {prev_task} → {cur_task} (thermal + priority fit).", t)
                G["last_task_log_t"] = t

    if row["task_completed"]:
        task = mission["tasks_by_name"][row["task_completed"]]
        level = row.get("precision") or FP32
        log_event(G, "ok", f"TASK COMPLETE: {task.name} [{level}] +{fmt_num(task_tflops(task, level))} TFLOPs banked — zero work lost.", t)

    G["t_index"] = i + 1


# ─────────────────────────────────────────────────────────────────────────────
# VIEW MODEL
# ─────────────────────────────────────────────────────────────────────────────
def current_view(G: dict[str, Any], mission: dict[str, Any]) -> dict[str, Any]:
    """Unified read model for the HUD, gauges and badges."""
    i = min(G["t_index"], TOTAL_STEPS - 1)
    orb = mission["states"][i]
    if G["mode"] == "manual":
        thermal = G["thermal"]
        temp = thermal.current_temp_celsius
        battery = thermal.battery.percent
        soh = thermal.battery.state_of_health
        task = G["task"]
        status = thermal.get_thermal_status(temp)
        level = G.get("last_level", FP32)
    else:
        tl = mission["lumen"]
        temp = tl[min(G["t_index"], TOTAL_STEPS - 1)]["temperature_c"]
        if G["t_index"] >= TOTAL_STEPS:
            temp = tl[TOTAL_STEPS - 1]["temperature_c"]
        row = tl[i]
        battery = row["battery_percent"]
        soh = row.get("battery_soh", 1.0)
        row_task = row["task_running"]
        task = mission["tasks_by_name"].get(row_task) if row_task else None
        status = status_for_temp(temp)
        level = row.get("precision") or FP32
    return {
        "temp": temp,
        "battery": battery,
        "soh": soh,
        "precision": level,
        "storm": G.get("storm", False),
        "solar": orb["solar_power_watts"],
        "sunlit": orb["is_sunlit"],
        "facing": orb["radiator_facing"],
        "sink_k": orb["sink_temperature_kelvin"],
        "cooling": orb["max_cooling_capacity_watts"],
        "status": status,
        "task": task,
        "time": (G["t_index"]) * STEP_SECONDS,
        "remaining_s": max(0.0, (TOTAL_STEPS - G["t_index"]) * STEP_SECONDS),
    }


# ─────────────────────────────────────────────────────────────────────────────
# CHART BUILDERS
# ─────────────────────────────────────────────────────────────────────────────
def create_comparison_figure(G: dict[str, Any], mission: dict[str, Any]) -> go.Figure:
    """Temperature race: You vs LumenOS vs the Naive baseline."""
    fig = go.Figure()
    xs = [i * 0.5 for i in range(TOTAL_STEPS)]
    lumen_temps = [row["temperature_c"] for row in mission["lumen"]]
    naive_crashed = mission.get("naive_crashed", True)
    crash_idx = mission["naive_crash_idx"]
    naive_temps = [row["temperature_c"] for row in mission["naive"]]
    if naive_crashed:
        naive_temps = naive_temps[: crash_idx + 1]

    fig.add_hrect(y0=95.0, y1=112.0, fillcolor="rgba(255, 42, 42, 0.13)", line_width=0, layer="below")
    fig.add_hline(y=95.0, line_dash="dash", line_color="rgba(255,42,42,0.85)", line_width=1.2)
    fig.add_hline(y=80.0, line_dash="dot", line_color="rgba(255,184,0,0.55)", line_width=1)
    fig.add_hline(y=60.0, line_dash="dot", line_color="rgba(255,255,255,0.18)", line_width=1)

    fig.add_trace(go.Scatter(
        x=xs, y=lumen_temps, mode="lines", name="LUMENOS AI",
        line=dict(color=CYAN, width=2.2),
        hovertemplate="LumenOS %{y:.1f}°C @ %{x:.0f} min<extra></extra>",
    ))
    fig.add_trace(go.Scatter(
        x=xs[: len(naive_temps)], y=naive_temps, mode="lines", name="NAIVE BASELINE",
        line=dict(color=RED, width=1.6, dash="dot"),
        hovertemplate="Naive %{y:.1f}°C @ %{x:.0f} min<extra></extra>",
    ))
    if naive_crashed:
        fig.add_trace(go.Scatter(
            x=[mission["naive_crash_time_min"]], y=[mission["naive_max_temp"]],
            mode="markers+text", name="NAIVE SHUTDOWN",
            marker=dict(color=RED, size=11, symbol="x"),
            text=[f"SHUTDOWN {mission['naive_max_temp']:.1f}°C"],
            textposition="top right",
            textfont=dict(color=RED, size=9, family="JetBrains Mono, monospace"),
            hoverinfo="skip",
        ))

    if G["mode"] == "manual" and G["temp_series"]:
        xs_you = [i * 0.5 for i in range(1, len(G["temp_series"]) + 1)]
        fig.add_trace(go.Scatter(
            x=xs_you, y=G["temp_series"], mode="lines", name="YOU (MANUAL)",
            line=dict(color=AMBER, width=3),
            hovertemplate="You %{y:.1f}°C @ %{x:.0f} min<extra></extra>",
        ))

    now_min = min(G["t_index"] * 0.5, 90.0)
    if G["t_index"] > 0:
        fig.add_vline(x=now_min, line_color="rgba(255,255,255,0.3)", line_width=1)

    fig.update_layout(
        height=286,
        margin=dict(l=44, r=14, t=30, b=26),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(6,10,18,0.6)",
        font=dict(color="#B9C8DC", family="JetBrains Mono, monospace", size=10),
        title=dict(
            text="THERMAL RACE · °C vs ORBIT MINUTES",
            font=dict(color="#E8F6FF", size=11, family="JetBrains Mono, monospace"),
            x=0.02,
        ),
        legend=dict(orientation="h", y=1.12, x=0.0, bgcolor="rgba(0,0,0,0)", font=dict(size=9)),
        hovermode="x unified",
        xaxis=dict(range=[0, 90], gridcolor="rgba(255,255,255,0.05)", zeroline=False),
        yaxis=dict(range=[-10, 112], gridcolor="rgba(255,255,255,0.05)", zeroline=False),
    )
    fig.add_annotation(
        x=88.5, y=103, text="SHUTDOWN ZONE", showarrow=False,
        font=dict(color="rgba(255,80,80,0.85)", size=8, family="JetBrains Mono, monospace"),
    )
    return fig


def create_score_figure(G: dict[str, Any], mission: dict[str, Any]) -> go.Figure:
    """Compute race: cumulative TFLOPs for You vs LumenOS vs Naive."""
    fig = go.Figure()
    xs_lumen = [i * 0.5 for i in range(TOTAL_STEPS + 1)]
    fig.add_trace(go.Scatter(
        x=xs_lumen, y=mission["lumen_prefix"], mode="lines", name="LUMENOS AI",
        line=dict(color=CYAN, width=2.0), fill="tozeroy", fillcolor="rgba(0,240,255,0.06)",
        hovertemplate="LumenOS %{y:,.0f} TFLOPs<extra></extra>",
    ))

    crash_idx = mission["naive_crash_idx"]
    if mission.get("naive_crashed", True):
        xs_naive = [i * 0.5 for i in range(crash_idx + 2)]
        ys_naive = mission["naive_prefix"][: crash_idx + 2]
        ys_naive = ys_naive[: crash_idx + 1] + [mission["naive_score"]]
    else:
        xs_naive = [i * 0.5 for i in range(TOTAL_STEPS + 1)]
        ys_naive = mission["naive_prefix"]
    fig.add_trace(go.Scatter(
        x=xs_naive, y=ys_naive, mode="lines", name="NAIVE BASELINE",
        line=dict(color=RED, width=1.6, dash="dot"),
        hovertemplate="Naive %{y:,.0f} TFLOPs<extra></extra>",
    ))
    if mission.get("naive_crashed", True):
        fig.add_annotation(
            x=mission["naive_crash_time_min"], y=mission["naive_score"],
            text=f"SHUTDOWN · −{fmt_num(mission['naive_lost_tflops'])} TFLOPs",
            showarrow=True, arrowhead=2, arrowsize=0.8, arrowcolor=RED,
            ax=30, ay=-24,
            font=dict(color=RED, size=8, family="JetBrains Mono, monospace"),
        )

    if G["mode"] == "manual" and G["score_series"]:
        xs_you = [i * 0.5 for i in range(1, len(G["score_series"]) + 1)]
        fig.add_trace(go.Scatter(
            x=xs_you, y=G["score_series"], mode="lines", name="YOU (MANUAL)",
            line=dict(color=AMBER, width=2.8),
            hovertemplate="You %{y:,.0f} TFLOPs<extra></extra>",
        ))

    now_min = min(G["t_index"] * 0.5, 90.0)
    if G["t_index"] > 0:
        fig.add_vline(x=now_min, line_color="rgba(255,255,255,0.3)", line_width=1)

    fig.update_layout(
        height=220,
        margin=dict(l=52, r=14, t=30, b=26),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(6,10,18,0.6)",
        font=dict(color="#B9C8DC", family="JetBrains Mono, monospace", size=10),
        title=dict(
            text="COMPUTE RACE · TFLOPs vs ORBIT MINUTES",
            font=dict(color="#E8F6FF", size=11, family="JetBrains Mono, monospace"),
            x=0.02,
        ),
        legend=dict(orientation="h", y=1.16, x=0.0, bgcolor="rgba(0,0,0,0)", font=dict(size=9)),
        hovermode="x unified",
        xaxis=dict(range=[0, 90], gridcolor="rgba(255,255,255,0.05)", zeroline=False),
        yaxis=dict(gridcolor="rgba(255,255,255,0.05)", zeroline=False, rangemode="tozero"),
    )
    return fig


def orbit_display_timeline(G: dict[str, Any], mission: dict[str, Any]) -> list[dict[str, Any]]:
    """Full-orbit timeline for the 3D view: actual past + LumenOS ghost future."""
    rows: list[dict[str, Any]] = []
    for i in range(TOTAL_STEPS):
        if G["mode"] == "manual" and i < len(G["timeline"]):
            rows.append(G["timeline"][i])
        else:
            rows.append(mission["lumen"][i])
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# HTML RENDERERS
# ─────────────────────────────────────────────────────────────────────────────
def left_panel_html(G: dict[str, Any], mission: dict[str, Any], view: dict[str, Any]) -> str:
    """LEFT column — system telemetry: gauges, orbital badge, radiator card."""
    temp = view["temp"]
    status = view["status"]
    temp_color = STATUS_COLORS[status]
    battery = view["battery"]
    solar = view["solar"]
    soh = view.get("soh", 1.0)

    batt_color = EMERALD if battery > 40 else (AMBER if battery > 15 else RED)
    solar_color = AMBER if solar > 50 else SLATE
    soh_color = EMERALD if soh > 0.95 else (AMBER if soh > 0.80 else RED)

    if view["sunlit"]:
        orb_badge = "<div class='badge-big badge-sun'>☀️ SUNLIT · SOLAR ARRAY ONLINE</div>"
    else:
        orb_badge = "<div class='badge-big badge-eclipse'>🌑 ECLIPSE · BATTERY BUS ACTIVE</div>"
    storm_badge = ""
    if view.get("storm"):
        storm_badge = (
            "<div class='badge-big' style='background:rgba(255,42,42,0.12);"
            "border:1px solid rgba(255,42,42,0.6);color:#FF6B6B;'>"
            "⚡ GEOMAGNETIC STORM · SAFE MODE DOCTRINE</div>"
        )

    progress = 100.0 * G["t_index"] / TOTAL_STEPS
    warn_sub = {
        NOMINAL: "THERMAL STATE NOMINAL",
        WARNING: "WARNING · MARGIN SHRINKING",
        CRITICAL: "CRITICAL · SHUTDOWN AT 95°C",
        SHUTDOWN: "SHUTDOWN",
    }[status]

    return f"""
    <div class="glass">
        <div class="panel-title">SYSTEM TELEMETRY</div>
        {gauge_html("SERVER TEMP", temp, 120.0, "°C", temp_color, size=176, sub=warn_sub)}
        <div class="dual-gauges">
            <div>{gauge_html("BATTERY", battery, 100.0, "%", batt_color, size=124, decimals=0)}</div>
            <div>{gauge_html("SOLAR PWR", solar, 2000.0, "W", solar_color, size=124, decimals=0)}</div>
        </div>
        <div class="op-meta" style="margin:2px 0 8px 0">
            <span>BATTERY STATE OF HEALTH</span>
            <span style="color:{soh_color}">{soh * 100:.1f}%</span>
        </div>
        {orb_badge}
        {storm_badge}
        {radiator_bar_html(view["facing"], view["sink_k"], view["cooling"], view["sunlit"])}
        <div class="op-bar"><div class="op-fill" style="width:{progress:.1f}%"></div></div>
        <div class="op-meta">
            <span>MISSION {progress:.0f}%</span>
            <span>T+{fmt_mmss(G['t_index'] * STEP_SECONDS)} / {fmt_mmss(TOTAL_STEPS * STEP_SECONDS)}</span>
        </div>
    </div>
    """


def hud_html(G: dict[str, Any], mission: dict[str, Any], view: dict[str, Any]) -> str:
    """CENTER top — mission timer, TFLOPs, active workload, thermal state."""
    score = player_score(G, mission)
    pending = pending_tflops(G) if G["mode"] == "manual" else 0.0
    pending_txt = f"pending +{fmt_num(pending)}" if pending > 0.01 else "pending 0"
    if G["mode"] == "manual":
        tasks_txt = str(G["completed"])
    else:
        tasks_txt = str(sum(1 for row in mission["lumen"][: G["t_index"]] if row["task_completed"]))

    task_txt = "— IDLE —"
    task_sub = "no workload scheduled"
    if G["mode"] == "manual":
        if G["task"] is not None:
            task_txt = G["task"].name.replace("_", " ")
            task_sub = f"{G['task_remaining_s'] / 60.0:.1f} min remaining"
        else:
            task_sub = "pick a workload on the right"
    else:
        row = mission["lumen"][min(G["t_index"], TOTAL_STEPS - 1)]
        name = row["task_running"] or row["task_completed"]
        if name:
            task_txt = name.replace("_", " ")
            task_sub = "hypervisor-managed"
        else:
            task_sub = "hypervisor holding fire (thermal)"

    status = view["status"]
    status_color = STATUS_COLORS[status]
    remaining_s = max(0.0, (TOTAL_STEPS - G["t_index"]) * STEP_SECONDS)
    elapsed_s = G["t_index"] * STEP_SECONDS

    level = view["precision"]
    spec = PRECISION_PROFILES.get(level, PRECISION_PROFILES[FP32])
    prec_color = CYAN if level == FP32 else (AMBER if level == "INT8" else RED)
    if G["mode"] == "manual" and G.get("precision_mode", FP32) == AUTO:
        prec_sub = f"AUTO policy → {level} · acc {spec.accuracy * 100:.0f}%"
    else:
        prec_sub = f"heat ×{spec.heat_scale:.2f} · acc {spec.accuracy * 100:.0f}%"

    return f"""
    <div class="stat-row">
        <div class="stat">
            <div class="stat-k">MISSION TIMER</div>
            <div class="stat-v">{fmt_mmss(remaining_s)}</div>
            <div class="stat-sub">T+{fmt_mmss(elapsed_s)} elapsed</div>
        </div>
        <div class="stat">
            <div class="stat-k">TFLOPs PROCESSED</div>
            <div class="stat-v cyan">{fmt_num(score)}</div>
            <div class="stat-sub">{pending_txt}</div>
        </div>
        <div class="stat">
            <div class="stat-k">TASKS COMPLETE</div>
            <div class="stat-v emerald">{tasks_txt}</div>
            <div class="stat-sub">recurring queue</div>
        </div>
        <div class="stat">
            <div class="stat-k">COMPUTE PRECISION</div>
            <div class="stat-v" style="color:{prec_color}; text-shadow:0 0 16px {prec_color}88;">{level}</div>
            <div class="stat-sub">{prec_sub}</div>
        </div>
        <div class="stat" style="flex:1.6 1 210px">
            <div class="stat-k">ACTIVE WORKLOAD</div>
            <div class="stat-v small">{html.escape(task_txt)}</div>
            <div class="stat-sub">{html.escape(task_sub)}</div>
        </div>
        <div class="stat">
            <div class="stat-k">THERMAL STATE</div>
            <div class="stat-v" style="color:{status_color}; text-shadow:0 0 16px {status_color}88;">{status}</div>
            <div class="stat-sub">{view['temp']:.1f}°C · cap {view['cooling']:.0f} W</div>
        </div>
    </div>
    """


def brief_html(mission: dict[str, Any]) -> str:
    """CENTER — mission briefing card (visible until the first turn)."""
    profile = mission["profile"]
    return f"""
    <div class="glass">
        <div class="panel-title">MISSION BRIEF · ORBITAL AI DATA CENTER “AURORA-1”</div>
        <div class="brief-h">You are the MISSION DIRECTOR — theater: {html.escape(profile.label)}.</div>
        <div class="brief-p">
            {html.escape(profile.description)} Process as many AI workloads as possible over one
            90-minute mission window — without letting the server melt. Compute generates heat,
            and in a vacuum the only way out is radiation.
        </div>
        <div class="brief-grid">
            <div class="brief-item"><span class="chip chip-cyan">POWER</span><br>
                Solar array: {profile.solar_array_max_watts:,.0f} W in sunlight, 0 W in eclipse.
                Battery: {profile.battery_capacity_wh:,.0f} Wh, 200 W discharge bus.</div>
            <div class="brief-item"><span class="chip chip-amber">HEAT</span><br>
                Radiator capacity depends on view factor — check the big card on the left as the
                mission clock runs. {html.escape(profile.eclipse_note)}</div>
            <div class="brief-item"><span class="chip chip-red">DANGER</span><br>
                Server starts at 25°C. At 95°C hardware protection trips — the mission ends and
                in-flight work is destroyed. Space weather storms add safe-mode grounding;
                hot eclipse cycles age the battery (SoH).</div>
            <div class="brief-item"><span class="chip chip-emerald">TOOLS</span><br>
                MANUAL mode gives you a precision selector: run FP32 for full fidelity, or
                quantize (INT8 / TINY / AUTO) to cut heat and power at some accuracy cost.
                LumenOS does this automatically.</div>
        </div>
        <div class="brief-hint">▸ MANUAL: pick a workload → press NEXT TURN. When (not if) it melts down,
        activate the LUMENOS AI hypervisor and watch it schedule around the physics. Switch theater,
        weather, or precision from the right-hand console.</div>
    </div>
    """


def log_panel_html(G: dict[str, Any]) -> str:
    """CENTER bottom — scrolling terminal log (newest at the bottom)."""
    lines = [
        log_line_html(t, level, message)
        for (t, level, message) in reversed(G["log"][-150:])
    ]
    return f"""
    <div class="glass">
        <div class="panel-title">MISSION CONTROL LOG</div>
        <div class="log-scroll">{''.join(lines)}</div>
    </div>
    """


def task_card_html(G: dict[str, Any], mission: dict[str, Any], task: AIWorkload) -> str:
    """RIGHT — one workload card with live state chips."""
    running = G["mode"] == "manual" and G["task"] is not None and G["task"].name == task.name
    view = current_view(G, mission)
    level = view["precision"]
    spec = PRECISION_PROFILES.get(level, PRECISION_PROFILES[FP32])
    heat = task.heat_for_precision(level)
    power = task.power_for_precision(level)
    active_class = ""
    if running:
        danger = view["cooling"] < heat
        active_class = "danger-active" if danger else "active"

    heat_chip = "chip-emerald" if heat <= 491 else ("chip-amber" if heat <= 750 else "chip-red")
    head_chip = (
        "<span class='chip chip-cyan'>RUNNING</span>" if running
        else "<span class='chip chip-dim'>QUEUED</span>"
    )
    level_chip = (
        f"<span class='chip chip-amber'>{level} · {spec.accuracy * 100:.0f}% ACC</span>"
        if level != FP32
        else "<span class='chip chip-dim'>FP32 · 100% ACC</span>"
    )

    progress_html = ""
    if running:
        total = task.duration_minutes * 60.0
        done = clamp(1.0 - G["task_remaining_s"] / total, 0.0, 1.0)
        progress_html = (
            f"<div class='task-bar'><div class='task-bar-fill' style='width:{done * 100:.1f}%'></div></div>"
            f"<div class='task-remain'>{G['task_remaining_s'] / 60.0:.1f} min remaining · "
            f"{fmt_num(task_tflops(task, level) * done)} TFLOPs pending</div>"
        )

    return f"""
    <div class="task-card {active_class}">
        <div class="task-head">
            <span class="task-name">{task.name.replace('_', ' ')}</span>
            {head_chip}
        </div>
        <div class="task-blurb">{TASK_BLURBS.get(task.name, '')}</div>
        <div class="task-stats">
            <span class="chip chip-cyan">PWR {power:.0f} W</span>
            <span class="chip {heat_chip}">HEAT {heat:.0f} W</span>
            <span class="chip chip-dim">{task.duration_minutes:.0f} MIN</span>
            <span class="chip chip-emerald">+{fmt_num(task_tflops(task, level))} TF</span>
            {level_chip}
        </div>
        {progress_html}
    </div>
    """


def report_html(G: dict[str, Any], mission: dict[str, Any]) -> str:
    """Full-width mission report (after completion or failure)."""
    lumen_score = mission["lumen_final_score"]
    naive_score = mission["naive_score"]
    naive_crashed = mission.get("naive_crashed", True)

    if G["mode"] == "manual":
        your_score = banked_tflops(G)
    else:
        your_score = mission["lumen_prefix"][G["t_index"]]

    if your_score > 0:
        delta_lumen = (lumen_score - your_score) / your_score * 100.0
        delta_naive = (naive_score - your_score) / your_score * 100.0
    else:
        delta_lumen = 100.0
        delta_naive = 100.0

    if G["mode"] == "manual":
        prec_secs = G.get("precision_seconds", {})
        soh_final = G["thermal"].battery.state_of_health
        safe_min = G.get("safe_mode_seconds", 0.0) / 60.0
    else:
        prec_secs = mission.get("lumen_precision_seconds", {})
        soh_final = mission["lumen"][-1].get("battery_soh", 1.0)
        safe_min = 0.0
    mix_txt = " · ".join(
        f"{level} {secs / 60.0:.1f}m" for level, secs in prec_secs.items() if secs > 0.5
    ) or "—"
    soh_color = EMERALD if soh_final > 0.95 else (AMBER if soh_final > 0.80 else RED)

    if G["phase"] == "failed":
        crash = G["crash"] or {}
        crash_t = crash.get("t_min", 0.0)
        crash_temp = crash.get("temp", SHUTDOWN_C)
        verdict = f"""
        <div class="verdict verdict-fail">
            <b>MISSION FAILED — {html.escape(str(crash.get('type', 'SHUTDOWN'))).replace('_', ' ')}.</b>
            The server hit {crash_temp:.1f}°C at T+{fmt_mmss(crash_t * 60)}.
            All in-flight work was destroyed ({fmt_num(G['lost_tflops'])} TFLOPs lost).
            You ignored orbital thermodynamics: power was never the bottleneck — <b>HEAT is</b>.
            LumenOS would have delivered <b>{fmt_num(lumen_score)} TFLOPs</b> over the full orbit
            (+{delta_lumen:.0f}% vs your {fmt_num(your_score)}).
        </div>
        """
    elif G["mode"] == "lumenos":
        if naive_crashed:
            naive_line = (
                f"A thermally-blind baseline crashes at T+{fmt_mmss(mission['naive_crash_time_min'] * 60)} — "
                "compare the score race on the right."
            )
        else:
            naive_line = (
                "A thermally-blind baseline never even fits the heavy jobs on this orbit — "
                "here, <b>POWER</b> is the bottleneck and quantization is the way through."
            )
        verdict = f"""
        <div class="verdict verdict-ok">
            <b>AUTOPILOT NOMINAL — MISSION COMPLETE.</b>
            The LumenOS hypervisor delivered <b>{fmt_num(lumen_score)} TFLOPs</b> over the mission window with
            <b>0 shutdowns and 0 TFLOPs lost</b>, peaking at only {mission['lumen_max_temp']:.1f}°C
            (mean precision accuracy {mission.get('lumen_mean_accuracy', 1.0) * 100:.1f}%).
            {naive_line}
        </div>
        """
    else:
        verdict = f"""
        <div class="verdict verdict-warn">
            <b>ORBIT SURVIVED — MISSION MARGINAL.</b>
            You banked <b>{fmt_num(your_score)} TFLOPs</b> at a peak of {G['max_temp']:.1f}°C.
            {"LumenOS projected " + fmt_num(lumen_score) + " TFLOPs (+" + f"{delta_lumen:.0f}" + "% vs you) by pacing the day-side heat instead of brute-forcing through it."
            if delta_lumen > 0 else "You out-scheduled the hypervisor — mission engineering at its finest."}
        </div>
        """

    peak = G["max_temp"] if G["mode"] == "manual" else mission["lumen_max_temp"]
    uptime_min = G["compute_seconds"] / 60.0 if G["mode"] == "manual" else 90.0
    naive_sub = (
        f"shutdown at T+{fmt_mmss(mission['naive_crash_time_min'] * 60)} · {delta_naive:+.0f}% vs you"
        if naive_crashed
        else f"power-starved, no shutdown · {delta_naive:+.0f}% vs you"
    )
    safe_cell = (
        f"""
            <div class="report-cell hl-red">
                <div class="report-k">SAFE MODE</div>
                <div class="report-v" style="color:{RED}">{safe_min:.1f} min</div>
                <div class="report-s">space weather doctrine active</div>
            </div>"""
        if safe_min > 0.01
        else ""
    )

    return f"""
    <div class="glass">
        <div class="panel-title">MISSION REPORT · {html.escape(mission['profile'].label.upper())}</div>
        <div class="report-grid">
            <div class="report-cell hl-amber">
                <div class="report-k">YOUR SCORE</div>
                <div class="report-v" style="color:{AMBER}">{fmt_num(your_score)}</div>
                <div class="report-s">TFLOPs · {"MANUAL" if G['mode'] == 'manual' else "LUMENOS"}</div>
            </div>
            <div class="report-cell hl-cyan">
                <div class="report-k">LUMENOS PROJECTION</div>
                <div class="report-v" style="color:{CYAN}">{fmt_num(lumen_score)}</div>
                <div class="report-s">full-mission TFLOPs · {delta_lumen:+.0f}% vs you</div>
            </div>
            <div class="report-cell hl-red">
                <div class="report-k">NAIVE BASELINE</div>
                <div class="report-v" style="color:{RED}">{fmt_num(naive_score)}</div>
                <div class="report-s">{naive_sub}</div>
            </div>
            <div class="report-cell">
                <div class="report-k">PEAK TEMPERATURE</div>
                <div class="report-v" style="color:{RED if peak >= 95 else (AMBER if peak >= 80 else EMERALD)}">{peak:.1f}°C</div>
                <div class="report-s">shutdown threshold 95°C</div>
            </div>
            <div class="report-cell">
                <div class="report-k">ACTIVE COMPUTE</div>
                <div class="report-v" style="color:{EMERALD}">{uptime_min:.1f} min</div>
                <div class="report-s">of 90:00 mission</div>
            </div>
            <div class="report-cell">
                <div class="report-k">PRECISION MIX</div>
                <div class="report-v small" style="color:{CYAN}">{mix_txt}</div>
                <div class="report-s">thermal-aware quantization time</div>
            </div>
            <div class="report-cell">
                <div class="report-k">BATTERY SoH</div>
                <div class="report-v" style="color:{soh_color}">{soh_final * 100:.1f}%</div>
                <div class="report-s">after hot eclipse cycles</div>
            </div>
            {safe_cell}
        </div>
        {verdict}
    </div>
    """


# ─────────────────────────────────────────────────────────────────────────────
# SESSION / FLOW GLUE
# ─────────────────────────────────────────────────────────────────────────────
@st.cache_data(ttl=300, show_spinner=False)
def get_weather(mode: str) -> SpaceWeatherStatus:
    """Resolve the space-weather status for the selected source.

    ``"quiet"`` / ``"storm"`` are deterministic simulations; ``"live"`` fetches
    NOAA SWPC (cached 5 min, degrades to OFFLINE-quiet without a network).
    """
    return fetch_space_weather(force=None if mode == "live" else mode)


_pending_orbit = st.session_state.pop("_pending_orbit", None)
if _pending_orbit is not None:
    st.session_state["orbit_key"] = _pending_orbit

mission = load_mission_bundle(st.session_state.get("orbit_key", "LEO"))

_autoplay_flag = st.session_state.pop("_autoplay", False)
_pending_mode = st.session_state.pop("_pending_mode", None)
_pending_reset = st.session_state.pop("_pending_reset", False)

if "orbit_sel" not in st.session_state:
    st.session_state["orbit_sel"] = mission["orbit_key"]

G: Optional[dict[str, Any]] = st.session_state.get("game")
if _pending_mode is not None or (_pending_orbit is not None) or (
    G is not None and G.get("orbit_key") != mission["orbit_key"]
):
    base_mode = (
        _pending_mode
        if _pending_mode is not None
        else (G["mode"] if G is not None else "manual")
    )
    G = new_game(base_mode, mission)
    st.session_state["game"] = G
    st.session_state["mode_sel"] = MODE_LABELS[G["mode"]]
elif _pending_reset and G is not None:
    G = new_game(G["mode"], mission)
    st.session_state["game"] = G
elif G is None:
    G = new_game("manual", mission)
    st.session_state["game"] = G
    st.session_state["mode_sel"] = MODE_LABELS["manual"]

assert G is not None

weather_mode = st.session_state.get("weather_sel", "quiet")
weather = get_weather(weather_mode)
G["storm"] = weather.safe_mode
G["precision_mode"] = st.session_state.get("precision_sel", FP32)


def on_mode_change() -> None:
    """Radio callback: stage a full mission reset in the new OS mode."""
    selected = st.session_state.get("mode_sel", MODE_LABELS["manual"])
    new_mode = LABEL_TO_MODE.get(selected, "manual")
    current = st.session_state.get("game", {}).get("mode")
    if new_mode != current:
        st.session_state["_pending_mode"] = new_mode
        st.session_state["_pending_reset"] = True


def on_orbit_change() -> None:
    """Theater selectbox callback: stage a reset into the new orbit."""
    selected = st.session_state.get("orbit_sel", "LEO")
    current = st.session_state.get("game", {}).get("orbit_key", "LEO")
    if selected != current:
        st.session_state["_pending_orbit"] = selected


def reset_game_now() -> None:
    """Reset the mission, keeping the current mode."""
    st.session_state["_pending_reset"] = True
    st.rerun()


# ─────────────────────────────────────────────────────────────────────────────
# HEADER
# ─────────────────────────────────────────────────────────────────────────────
view_now = current_view(G, mission)
profile = mission["profile"]
mode_pill = (
    "<span class='pill pill-amber'>MODE · MANUAL</span>"
    if G["mode"] == "manual"
    else "<span class='pill pill-emerald'>MODE · LUMENOS AI</span>"
)
orbit_pill = f"<span class='pill pill-cyan'>{html.escape(profile.key)} · {profile.altitude_km:,.0f} KM</span>"
eclipse_short = html.escape(profile.eclipse_note.split(" — ")[0])
if weather.safe_mode:
    weather_pill = (
        f"<span class='pill pill-red'>☀ SWPC · G{weather.storm_level} STORM · SAFE MODE</span>"
    )
elif weather.source == "OFFLINE":
    weather_pill = "<span class='pill'>☀ SWPC OFFLINE · QUIET ASSUMED</span>"
elif (weather.kp_index or 0.0) >= 5.0:
    weather_pill = (
        f"<span class='pill pill-amber'>☀ Kp {weather.kp_index:.1f} · G{weather.storm_level} ELEVATED</span>"
    )
else:
    kp_txt = f"Kp {weather.kp_index:.1f}" if weather.kp_index is not None else "QUIET"
    weather_pill = f"<span class='pill pill-emerald'>☀ {kp_txt} · NOMINAL</span>"
st.markdown(
    f"""
    <div class="glass topbar">
        <div class="brand">◈ <b>LUMENOS</b> PROTOCOL
            <span class="brand-sub">// ORBITAL AI DATA CENTER · MISSION CONTROL</span>
        </div>
        <div>
            {orbit_pill}
            <span class="pill">{eclipse_short}</span>
            <span class="pill">RADIATOR {profile.radiator_area_m2:.1f} m² · ε 0.80</span>
            {weather_pill}
            {mode_pill}
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

# ─────────────────────────────────────────────────────────────────────────────
# LAYOUT — 3-column command center
# ─────────────────────────────────────────────────────────────────────────────
left_col, center_col, right_col = st.columns([1.0, 1.9, 1.25], gap="small")

# Placeholders (renderers write into these on every frame / animation step)
with left_col:
    left_ph = st.empty()

with center_col:
    hud_ph = st.empty()
    brief_ph = st.empty()
    orbit_ph = st.empty()
    log_ph = st.empty()

with right_col:
    st.markdown("<div class='panel-title' style='color:#E8F6FF'>MISSION THEATER</div>", unsafe_allow_html=True)
    st.selectbox(
        "Mission theater",
        options=ORBIT_KEYS,
        format_func=lambda key: ORBIT_LABELS[key],
        key="orbit_sel",
        on_change=on_orbit_change,
        label_visibility="collapsed",
    )
    st.caption(profile.description)

    st.markdown("<div class='panel-title' style='color:#E8F6FF'>SPACE WEATHER · NOAA SWPC</div>", unsafe_allow_html=True)
    st.selectbox(
        "Weather source",
        options=WEATHER_ORDER,
        format_func=lambda key: WEATHER_LABELS[key],
        key="weather_sel",
        label_visibility="collapsed",
    )
    if weather.safe_mode:
        st.caption("⚠ Geomagnetic storm doctrine: heavy tasks grounded, battery reserved for comms.")
    elif weather_mode == "live":
        st.caption(f"Live SWPC feed · Kp {weather.kp_index if weather.kp_index is not None else '—'} · {weather.note}")
    else:
        st.caption("Simulated conditions. STORM DRILL demonstrates safe-mode doctrine.")

    st.markdown("<div class='panel-title' style='color:#E8F6FF'>COMPUTE PRECISION</div>", unsafe_allow_html=True)
    if G["mode"] == "manual":
        st.radio(
            "Compute precision",
            options=PRECISION_OPTIONS,
            key="precision_sel",
            horizontal=True,
            label_visibility="collapsed",
        )
        _policy = st.session_state.get("precision_sel", FP32)
        if _policy == AUTO:
            st.caption("AUTO: FP32 below 60°C → INT8 (heat ×0.50) → TINY above 80°C, per temperature.")
        else:
            _spec = PRECISION_PROFILES.get(_policy, PRECISION_PROFILES[FP32])
            st.caption(
                f"{_spec.label} · power ×{_spec.power_scale:.2f} · heat ×{_spec.heat_scale:.2f} · "
                f"accuracy {_spec.accuracy * 100:.0f}%. Lower precision runs cooler but banks fewer TFLOPs."
            )
    else:
        st.caption(
            "Hypervisor-managed: LumenOS quantizes automatically (FP32 → INT8 → TINY) as the "
            "server warms, instead of idling through heat windows."
        )

    st.markdown("<div class='panel-title' style='color:#E8F6FF'>OS SELECTION</div>", unsafe_allow_html=True)
    mode_choice = st.radio(
        "Operating system",
        options=list(MODE_LABELS.values()),
        key="mode_sel",
        on_change=on_mode_change,
        label_visibility="collapsed",
    )
    st.caption("Switching OS or theater restarts the mission from T+00:00.")

    st.markdown("<div class='panel-title' style='color:#E8F6FF'>WORKLOAD QUEUE</div>", unsafe_allow_html=True)
    task_phs: dict[str, Any] = {}
    task_buttons: dict[str, bool] = {}
    for name in PLAYER_TASK_NAMES:
        task = mission["tasks_by_name"][name]
        task_phs[name] = st.empty()
        task_buttons[name] = st.button(
            f"▶ RUN · {task.name.replace('_', ' ')}",
            key=f"run_{name}",
            disabled=(G["mode"] != "manual"),
            help="Select this workload for the next turns (Manual mode)."
            if G["mode"] == "manual"
            else "Autopilot engaged — the hypervisor owns the queue.",
        )

    st.markdown("<div class='panel-title' style='color:#E8F6FF'>FLIGHT CONTROLS</div>", unsafe_allow_html=True)
    if G["mode"] == "manual":
        next_turn_clicked = st.button("⏭ NEXT TURN · +5:00", type="primary", key="next_turn")
        auto_clicked = False
        pause_clicked = st.button("⏸ PAUSE TASK · NO CHECKPOINT", key="pause_task")
    else:
        auto_clicked = st.button("⚡ AUTO-PLAY FULL ORBIT · ~10 s", type="primary", key="autoplay")
        next_turn_clicked = st.button("⏭ NEXT TURN · AUTOPILOT", key="next_turn_lumen")
        pause_clicked = False
    reset_clicked = st.button("🔄 RESET MISSION", key="reset_mission")

    turn_no = min(int(G["t_index"] // TURN_STEPS) + 1, 18)
    st.caption(f"TURN {turn_no}/18 · mission clock T+{fmt_mmss(G['t_index'] * STEP_SECONDS)}")
    cmp_ph = st.empty()
    score_ph = st.empty()

report_ph = st.empty()

# ─────────────────────────────────────────────────────────────────────────────
# FRAME RENDERING
# ─────────────────────────────────────────────────────────────────────────────
_CHART_STATE: dict[str, Any] = {"key": None}


def refresh_frame(charts: bool = True) -> None:
    """Re-render every placeholder from the current game state.

    Charts are only redrawn when their content would actually change —
    Streamlit rejects two ``plotly_chart`` calls with identical parameters
    in the same script run.
    """
    view = current_view(G, mission)
    left_ph.markdown(left_panel_html(G, mission, view), unsafe_allow_html=True)
    hud_ph.markdown(hud_html(G, mission, view), unsafe_allow_html=True)
    log_ph.markdown(log_panel_html(G), unsafe_allow_html=True)
    if G["t_index"] < 1 and G["phase"] == "briefing":
        brief_ph.markdown(brief_html(mission), unsafe_allow_html=True)
    else:
        brief_ph.empty()
    for name, ph in task_phs.items():
        ph.markdown(task_card_html(G, mission, mission["tasks_by_name"][name]), unsafe_allow_html=True)

    chart_key = (
        G["t_index"],
        G["mode"],
        len(G["temp_series"]),
        len(G["score_series"]),
    )
    if charts and chart_key != _CHART_STATE["key"]:
        _CHART_STATE["key"] = chart_key
        orbit_ph.plotly_chart(
            create_orbit_figure(
                orbit_display_timeline(G, mission),
                current_step_idx=min(G["t_index"], TOTAL_STEPS - 1),
            ),
            width="stretch",
            config=PLOTLY_CONFIG,
        )
        cmp_ph.plotly_chart(create_comparison_figure(G, mission), width="stretch", config=PLOTLY_CONFIG)
        score_ph.plotly_chart(create_score_figure(G, mission), width="stretch", config=PLOTLY_CONFIG)
    report_ph.markdown(
        report_html(G, mission) if G["phase"] in ("failed", "complete") else "",
        unsafe_allow_html=True,
    )


def advance_manual(G: dict[str, Any], mission: dict[str, Any], n_steps: int, animate: bool = True) -> None:
    """Advance the manual run up to ``n_steps`` physics steps, optionally animated."""
    for k in range(1, n_steps + 1):
        if G["t_index"] >= TOTAL_STEPS or G["phase"] == "failed":
            break
        manual_step(G, mission, G["t_index"])
        G["t_index"] += 1
        if G["t_index"] % TURN_STEPS == 0 and G["phase"] != "failed":
            level, msg, t = turn_summary_event(G, mission, G["t_index"] - 1)
            log_event(G, level, msg, t)
        if animate:
            refresh_frame(charts=False)
            time.sleep(0.055)
            if k % 5 == 0 or k == n_steps or G["phase"] == "failed":
                refresh_frame(charts=True)
    if G["t_index"] >= TOTAL_STEPS and G["phase"] != "failed":
        G["phase"] = "complete"
        checkpoints = "all work preserved" if G["mode"] == "manual" else "zero TFLOPs lost"
        log_event(G, "ok", f"ORBIT COMPLETE — 90 minutes survived. Final score {fmt_num(player_score(G, mission))} TFLOPs ({checkpoints}).", G["t_index"] * STEP_SECONDS)
    if G["phase"] not in ("failed", "complete"):
        G["phase"] = "running"


def autoplay_lumenos(G: dict[str, Any], mission: dict[str, Any]) -> None:
    """Replay the validated LumenOS orbit in roughly ten seconds."""
    if G["t_index"] >= TOTAL_STEPS:
        return
    G["phase"] = "running"
    frame = 0
    while G["t_index"] < TOTAL_STEPS:
        for _ in range(6):
            if G["t_index"] >= TOTAL_STEPS:
                break
            lumen_replay_step(G, mission)
            if G["t_index"] % TURN_STEPS == 0:
                level, msg, t = turn_summary_event(G, mission, G["t_index"] - 1)
                log_event(G, level, msg, t)
        frame += 1
        refresh_frame(charts=(frame % 2 == 0))
        time.sleep(0.06)
    G["phase"] = "complete"
    log_event(G, "ok", f"ORBIT COMPLETE — hypervisor delivered {fmt_num(player_score(G, mission))} TFLOPs with 0 shutdowns.", TOTAL_STEPS * STEP_SECONDS)
    refresh_frame(charts=True)


def advance_lumen_turn(G: dict[str, Any], mission: dict[str, Any]) -> None:
    """One 5-minute autopilot turn (animated)."""
    G["phase"] = "running"
    for k in range(TURN_STEPS):
        if G["t_index"] >= TOTAL_STEPS:
            break
        lumen_replay_step(G, mission)
        if k % 5 == 4:
            refresh_frame(charts=False)
            time.sleep(0.08)
    if G["t_index"] % TURN_STEPS == 0:
        level, msg, t = turn_summary_event(G, mission, G["t_index"] - 1)
        log_event(G, level, msg, t)
    if G["t_index"] >= TOTAL_STEPS:
        G["phase"] = "complete"
        log_event(G, "ok", f"ORBIT COMPLETE — hypervisor delivered {fmt_num(player_score(G, mission))} TFLOPs with 0 shutdowns.", TOTAL_STEPS * STEP_SECONDS)
    refresh_frame(charts=True)


# ─────────────────────────────────────────────────────────────────────────────
# INITIAL FRAME
# ─────────────────────────────────────────────────────────────────────────────
refresh_frame(charts=True)

# ─────────────────────────────────────────────────────────────────────────────
# ACTION HANDLING
# ─────────────────────────────────────────────────────────────────────────────
def handle_run_task(task: AIWorkload) -> None:
    """Manual RUN button: validate power at the active precision, engage the workload."""
    if G["phase"] in ("failed", "complete"):
        return
    if G["task"] is not None and G["task"].name == task.name:
        log_event(G, "info", f"MANUAL: {task.name} already engaged.", G["t_index"] * STEP_SECONDS)
        st.rerun()
    orb = mission["states"][min(G["t_index"], TOTAL_STEPS - 1)]
    budget = task_power_budget(G["thermal"], orb)
    temp = G["thermal"].current_temp_celsius
    policy = G.get("precision_mode", FP32)
    level = resolve_precision(temp) if policy == AUTO else policy
    task_power = task.power_for_precision(level)
    if task_power > budget + 1e-9:
        log_event(
            G, "warn",
            f"INSUFFICIENT POWER — {task.name} [{level}] needs {task_power:.0f} W, bus supplies "
            f"{budget:.0f} W. Wait for sunrise, or quantize to cut the draw.",
            G["t_index"] * STEP_SECONDS,
        )
        st.rerun()
    if G["task"] is not None:
        lost = pending_tflops(G)
        lost_txt = fmt_num(lost) if lost > 0.01 else "0"
        log_event(
            G, "warn",
            f"MANUAL OS: no checkpointing — {lost_txt} TFLOPs of {G['task'].name} progress discarded.",
            G["t_index"] * STEP_SECONDS,
        )
        G["discarded"] += lost
    G["task"] = task
    G["task_remaining_s"] = task.duration_minutes * 60.0
    G["accrued_at_task_start"] = G["accrued"]
    G["task_starved"] = False
    G["phase"] = "running"
    log_event(
        G, "info",
        f"MANUAL: engaged {task.name} [{level}] ({task_power:.0f} W draw / "
        f"{task.heat_for_precision(level):.0f} W heat).",
        G["t_index"] * STEP_SECONDS,
    )
    st.rerun()


def handle_pause_task() -> None:
    """Manual PAUSE: discard in-flight progress (no checkpoint subsystem)."""
    if G["phase"] in ("failed", "complete"):
        return
    if G["task"] is None:
        log_event(G, "info", "MANUAL: nothing to pause — server already coasting.", G["t_index"] * STEP_SECONDS)
    else:
        lost = pending_tflops(G)
        G["discarded"] += lost
        log_event(
            G, "warn",
            f"MANUAL: paused {G['task'].name} — no checkpoint subsystem, {fmt_num(lost)} TFLOPs discarded.",
            G["t_index"] * STEP_SECONDS,
        )
        G["task"] = None
        G["task_remaining_s"] = 0.0
        G["accrued_at_task_start"] = G["accrued"]
    st.rerun()


for name, clicked in task_buttons.items():
    if clicked:
        handle_run_task(mission["tasks_by_name"][name])

if reset_clicked:
    reset_game_now()

if pause_clicked:
    handle_pause_task()

if next_turn_clicked and G["phase"] != "failed":
    if G["mode"] == "manual":
        advance_manual(G, mission, TURN_STEPS, animate=True)
    else:
        advance_lumen_turn(G, mission)
    refresh_frame(charts=True)

if auto_clicked and G["mode"] == "lumenos" and G["phase"] not in ("failed", "complete"):
    autoplay_lumenos(G, mission)

if _autoplay_flag and G["mode"] == "lumenos" and G["phase"] not in ("failed", "complete"):
    autoplay_lumenos(G, mission)

# ─────────────────────────────────────────────────────────────────────────────
# FAILURE DIALOG — the educational "aha" moment
# ─────────────────────────────────────────────────────────────────────────────
def failure_content() -> None:
    """Modal body: mission failure, physics explanation, next steps."""
    crash = G["crash"] or {}
    crash_temp = crash.get("temp", SHUTDOWN_C)
    crash_t = crash.get("t_min", 0.0)
    lumen_score = mission["lumen_final_score"]
    your_score = banked_tflops(G)
    gain = (lumen_score - your_score) / your_score * 100.0 if your_score > 0 else 100.0

    st.markdown(
        f"""
        <div class="fail-hero">MISSION FAILED — THERMAL SHUTDOWN</div>
        <div class="fail-sub">HARDWARE PROTECTION TRIPPED AT {crash_temp:.1f}°C · T+{fmt_mmss(crash_t * 60)}</div>
        <div class="fail-quote">
            You ignored orbital thermodynamics. You ran a <b>900 W heat load</b> while the radiator was
            staring at warm day-side Earth (sink 280 K → <b>491 W of cooling capacity</b>).
            Solar power was at its peak — and that was the trap.
            <br><br>
            <b>In space, power is not the bottleneck — HEAT is.</b>
        </div>
        """,
        unsafe_allow_html=True,
    )
    c1, c2, c3 = st.columns(3)
    c1.metric("TFLOPs BANKED", fmt_num(your_score))
    c2.metric("TFLOPs DESTROYED", fmt_num(G["lost_tflops"]))
    c3.metric("LUMENOS PROJECTION", fmt_num(lumen_score), delta=f"+{gain:.0f}% vs your run")
    st.caption(
        "The LumenOS AI Hypervisor uses a 5-minute thermal look-ahead, checkpoints every workload, "
        "and pauses heavy jobs before the radiator view factor turns lethal."
    )
    b1, b2 = st.columns(2)
    with b1:
        if st.button("🧠 ACTIVATE LUMENOS AI · RELAUNCH", type="primary", key="dlg_lumenos"):
            st.session_state["_pending_mode"] = "lumenos"
            st.session_state["_pending_reset"] = True
            st.session_state["_autoplay"] = True
            st.rerun()
    with b2:
        if st.button("🔄 RETRY MANUAL RUN", key="dlg_retry"):
            st.session_state["_pending_reset"] = True
            st.rerun()


if G["phase"] == "failed" and G["crash"] is not None:
    if hasattr(st, "dialog"):
        @st.dialog("⚠ MISSION FAILED: THERMAL SHUTDOWN", width="large")
        def _failure_dialog() -> None:
            failure_content()

        _failure_dialog()
    else:  # pragma: no cover - older Streamlit fallback
        st.markdown("<div class='glass'>", unsafe_allow_html=True)
        failure_content()
        st.markdown("</div>", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# EDUCATIONAL FOOTER
# ─────────────────────────────────────────────────────────────────────────────
st.markdown(
    f"""
    <div class="glass">
        <div class="panel-title">WHY ORBITAL COMPUTE IS HARD · THE PHYSICS BEHIND THE GAME</div>
        <div class="brief-grid">
            <div class="brief-item explain-card">
                <div class="explain-h" style="color:{CYAN}">1 · NO AIR TO CARRY HEAT</div>
                <div class="explain-p">
                    In a vacuum, convection and conduction are gone. Heat can only leave as infrared
                    radiation: Q = ε·σ·A·(T⁴ − T_sink⁴). The {profile.radiator_area_m2:.1f} m² radiator at
                    ε 0.80 rejects 909 W into deep space — but far less when it faces a warm body:
                    Earth-day 491 W, lunar-surface 575 W, and so on.
                </div>
            </div>
            <div class="brief-item explain-card">
                <div class="explain-h" style="color:{AMBER}">2 · POWER VS HEAT: THE FLIP</div>
                <div class="explain-p">
                    In LEO the solar array gives {profile.solar_array_max_watts:,.0f} W exactly when the
                    radiator view factor is worst — power abundance masks the thermal trap. Change theater
                    and the bottleneck flips: on MARS transit ({profile.solar_array_max_watts:,.0f} W) even
                    POWER becomes scarce, and only quantized workloads fit the bus.
                </div>
            </div>
            <div class="brief-item explain-card">
                <div class="explain-h" style="color:{EMERALD}">3 · SCHEDULING SAVES THE MISSION</div>
                <div class="explain-p">
                    LumenOS treats cooling as the scarce resource: 5-minute thermal look-ahead, checkpoint
                    &amp; pause before thresholds, resume at sunrise or over cold sky. Projection for this
                    theater: {fmt_num(mission['lumen_final_score'])} TFLOPs, peak {mission['lumen_max_temp']:.1f}°C,
                    0 shutdowns{' — vs the naive baseline shutdown at T+' + fmt_mmss(mission['naive_crash_time_min'] * 60) if mission.get('naive_crashed', True) else ' — the naive baseline is power-starved and never even launches the heavy jobs'}.
                </div>
            </div>
            <div class="brief-item explain-card">
                <div class="explain-h" style="color:{RED}">4 · SHUTDOWN = LOST SCIENCE</div>
                <div class="explain-p">
                    A hard thermal trip above 95°C is not a hiccup on orbit: in-flight computation is
                    destroyed and — in this game — the mission ends. That is why the OS, not the GPU,
                    is the real engineering decision for orbital data centers.
                </div>
            </div>
            <div class="brief-item explain-card">
                <div class="explain-h" style="color:{AMBER}">5 · QUANTIZE, DON'T IDLE</div>
                <div class="explain-p">
                    When the server warms, LumenOS doesn't just pause HEAVY work — it co-designs the AI
                    stack with the thermal budget: INT8 cuts heat to 50 % at 98 % accuracy, TINY to 25 %
                    at 90 %. A hot server still produces science. The naive OS has no such lever.
                </div>
            </div>
            <div class="brief-item explain-card">
                <div class="explain-h" style="color:{CYAN}">6 · WEATHER &amp; AGEING</div>
                <div class="explain-p">
                    Real missions watch NOAA's planetary K index: a G3+ geomagnetic storm triggers safe
                    mode — heavy tasks grounded, battery reserved for comms. And every hot eclipse entry
                    costs battery capacity (SoH); fly too rough and the packs can no longer carry heavy
                    work through the dark arc at all.
                </div>
            </div>
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

st.caption(
    "LUMENOS PROTOCOL · NASA Space Apps 2026 — Space Mission Design Game · "
    "physics: engine.orbital_engine / engine.thermal_engine / engine.lumen_scheduler (validated) · "
    "scoring: 1 TFLOP/s per kW of workload draw"
)
