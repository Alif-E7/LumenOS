"""LumenOS: Space Mission Trade-off Simulator
NASA Space Apps 2026 — "Space Mission Design Game"

Interactive mission designer: choose your orbit, hardware, and OS,
then watch the simulation play out in real-time.
"""

import sys
import os
import time

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import streamlit as st
import engine.orbital_engine as oe
from engine.orbital_engine import OrbitalEngine
from engine.thermal_engine import ThermalEngine
from engine.workload_profiler import WorkloadProfiler
from engine.lumen_scheduler import LumenScheduler
from dashboard.orbit_view import create_orbit_figure
from dashboard.thermal_graph import create_thermal_figure

# ─────────────────────────────────────────────────────────────────────────────
# PAGE CONFIG
# ─────────────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="LumenOS — Space Mission Simulator",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─────────────────────────────────────────────────────────────────────────────
# GLOBAL STYLING
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
    .stApp { background: #07091a; color: #e2e8f0;
             font-family: 'Inter', -apple-system, sans-serif; }

    /* Sidebar */
    section[data-testid="stSidebar"] { background: #0d1326; border-right: 1px solid rgba(99,179,237,0.18); }
    section[data-testid="stSidebar"] h1,
    section[data-testid="stSidebar"] h2,
    section[data-testid="stSidebar"] h3 { color: #90cdf4; }

    /* Metric cards */
    div[data-testid="stMetric"] {
        background: linear-gradient(135deg, rgba(17,25,55,0.85), rgba(9,14,35,0.95));
        border: 1px solid rgba(99,179,237,0.22);
        border-radius: 10px; padding: 14px 18px;
        box-shadow: 0 4px 18px rgba(0,0,0,0.35);
    }
    div[data-testid="stMetricLabel"] { color: #94a3b8 !important; font-size: .82rem !important;
        text-transform: uppercase; letter-spacing: .05em; }
    div[data-testid="stMetricValue"] { color: #f8fafc !important; font-weight: 700 !important; }

    /* Divider */
    hr { border: 0; border-top: 1px solid rgba(255,255,255,.08); margin: 12px 0; }

    /* Report card banners */
    .banner { border-radius: 10px; padding: 16px 24px; margin: 10px 0;
              font-size: 1.1rem; font-weight: 700; letter-spacing: .02em; }
    .banner-success { background: rgba(34,197,94,.18); border: 1.5px solid #22c55e; color: #4ade80; }
    .banner-fail    { background: rgba(239,68,68,.18);  border: 1.5px solid #ef4444; color: #f87171; }
    .banner-warn    { background: rgba(234,179,8,.18);  border: 1.5px solid #eab308; color: #fde047; }

    /* Phase badges */
    .badge { display:inline-block; padding:3px 10px; border-radius:12px;
             font-size:.76rem; font-weight:700; letter-spacing:.04em; }
    .badge-space  { background:rgba(34,197,94,.18);  color:#4ade80; border:1px solid #22c55e; }
    .badge-earth  { background:rgba(239,68,68,.18);  color:#f87171; border:1px solid #ef4444; }
    .badge-eclipse{ background:rgba(59,130,246,.18); color:#60a5fa; border:1px solid #3b82f6; }

    /* HUD strip */
    .hud { background:rgba(15,23,42,.8); border:1px solid rgba(99,179,237,.22);
           border-radius:8px; padding:10px 18px; margin-bottom:10px; font-size:.9rem; }
</style>
""", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# MISSION SCENARIO PROFILES
# ─────────────────────────────────────────────────────────────────────────────
MISSION_PROFILES = {
    "🌍 LEO Earth Observer": {
        "altitude_km": 550.0,
        "inclination_deg": 53.0,
        "sim_minutes": 90.0,
        "description": "Classic ISS-like low Earth orbit. Eclipse ~35 min per orbit. Strong solar & decent cooling.",
        "orbital_period_label": "~95.6 min",
    },
    "🌕 Lunar Gateway (NRHO)": {
        "altitude_km": 350_000.0,   # approximated via high alt; no ecliptic dependency below
        "inclination_deg": 90.0,
        "sim_minutes": 180.0,
        "description": "Near-Rectilinear Halo Orbit around the Moon. Longer eclipse stretches, weaker solar (1/r² falloff). Critical power margins.",
        "orbital_period_label": "~7 days (180 min sim)",
    },
    "🔴 Mars Transit (Heliocentric)": {
        "altitude_km": 1000.0,
        "inclination_deg": 5.0,
        "sim_minutes": 120.0,
        "description": "Deep-space cruise to Mars. Solar power halved (1.52 AU). Near-zero eclipse. Thermal stress from solar heating only.",
        "orbital_period_label": "~7-month transit (120 min sim)",
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR — MISSION DESIGNER
# ─────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## 🚀 Mission Designer")
    st.markdown("---")

    # 1. Mission Scenario
    st.markdown("### 🌐 Mission Scenario")
    scenario_name = st.selectbox(
        "Select Orbit Profile:",
        list(MISSION_PROFILES.keys()),
        index=0,
        help="Determines orbital altitude, inclination, eclipse fraction, and simulation duration."
    )
    profile = MISSION_PROFILES[scenario_name]
    st.info(profile["description"])

    st.markdown("---")

    # 2. Hardware Configuration
    st.markdown("### ⚙️ Hardware Configuration")

    radiator_area = st.slider(
        "Radiator Area (m²)",
        min_value=0.5, max_value=3.0, value=1.5, step=0.1,
        help="Larger radiator → more heat rejection via Stefan-Boltzmann radiation."
    )
    battery_capacity_wh = st.slider(
        "Battery Capacity (Wh)",
        min_value=200, max_value=1500, value=500, step=50,
        help="Larger battery → more power headroom during eclipse passes."
    )
    server_mass_kg = st.slider(
        "Server Chassis Mass (kg)",
        min_value=5, max_value=30, value=15, step=1,
        help="Higher thermal mass slows temperature swings (buffer against thermal shock)."
    )

    st.markdown("---")

    # 3. Operating System Selection
    st.markdown("### 🖥️ Operating System")
    os_choice = st.radio(
        "Scheduler OS:",
        ["LumenOS (AI-Aware)", "Naive Scheduler (Legacy)"],
        index=0,
        help="LumenOS uses 5-min thermal look-ahead + checkpoint. Naive runs blindly until meltdown."
    )
    is_lumenos = os_choice.startswith("LumenOS")

    st.markdown("---")

    # 4. Playback Speed
    st.markdown("### ▶️ Simulation Playback")
    speed_opt = st.selectbox(
        "Animation Speed (for selected orbit duration):",
        ["30 Seconds (Fast)", "1 Minute (Normal)", "2 Minutes (Cinematic)"],
        index=0
    )
    run_sim = st.button("🚀 Launch Mission", type="primary", use_container_width=True)
    reset_btn = st.button("🔄 Reset", use_container_width=True)

    st.markdown("---")
    st.caption(f"Orbital Period: {profile['orbital_period_label']}")
    st.caption("Sim Duration: %.0f min" % profile["sim_minutes"])

# ─────────────────────────────────────────────────────────────────────────────
# CACHE KEY: Any sidebar change triggers fresh simulation
# ─────────────────────────────────────────────────────────────────────────────
cache_key = (scenario_name, radiator_area, battery_capacity_wh, server_mass_kg, os_choice)

@st.cache_data(show_spinner=False)
def run_both_schedulers(scenario, area_m2, batt_wh, mass_kg, os_type):
    """Passes sidebar parameters directly into LumenScheduler and run_simulation."""
    prof = MISSION_PROFILES[scenario]
    dur  = prof["sim_minutes"]

    # 1. Primary scheduler run based on user's OS selection
    sched_primary = LumenScheduler(
        scenario=scenario,
        radiator_area=area_m2,
        battery_capacity=batt_wh,
        server_mass=mass_kg,
        os_type=os_type,
    )
    primary_res = sched_primary.run_simulation(
        dur,
        scenario=scenario,
        radiator_area=area_m2,
        battery_capacity=batt_wh,
        server_mass=mass_kg,
        os_type=os_type,
    )

    # 2. Always run LumenOS for trade-off / efficiency delta comparison
    sched_lumen = LumenScheduler(
        scenario=scenario,
        radiator_area=area_m2,
        battery_capacity=batt_wh,
        server_mass=mass_kg,
        os_type="LumenOS",
    )
    lumen_res = sched_lumen.run_simulation(
        dur,
        scenario=scenario,
        radiator_area=area_m2,
        battery_capacity=batt_wh,
        server_mass=mass_kg,
        os_type="LumenOS",
    )

    # 3. Always run Naive for trade-off / efficiency delta comparison
    sched_naive = LumenScheduler(
        scenario=scenario,
        radiator_area=area_m2,
        battery_capacity=batt_wh,
        server_mass=mass_kg,
        os_type="Naive",
    )
    naive_res = sched_naive.compare_with_naive_scheduler(
        dur,
        scenario=scenario,
        radiator_area=area_m2,
        battery_capacity=batt_wh,
        server_mass=mass_kg,
        os_type="Naive",
    )

    return lumen_res, naive_res, primary_res

# ─────────────────────────────────────────────────────────────────────────────
# SESSION STATE
# ─────────────────────────────────────────────────────────────────────────────
if "current_step" not in st.session_state or reset_btn:
    st.session_state["current_step"] = 0
if "last_cache_key" not in st.session_state:
    st.session_state["last_cache_key"] = None

# Force re-render if sidebar changed
if st.session_state["last_cache_key"] != cache_key:
    st.session_state["current_step"] = 0
    st.session_state["last_cache_key"] = cache_key

# ─────────────────────────────────────────────────────────────────────────────
# HEADER
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("<h1 style='margin: 0 0 4px 0; color: #38bdf8;'>🚀 LumenOS: Space Mission Trade-off Simulator</h1>",
            unsafe_allow_html=True)
st.markdown(
    "<p style='margin: 0 0 12px 0; color: #94a3b8;'>"
    "Design your spacecraft, choose your OS, and see if your mission survives the thermal extremes of space."
    "</p>",
    unsafe_allow_html=True
)
st.markdown("<hr>", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# RUN SIMULATION
# ─────────────────────────────────────────────────────────────────────────────
with st.spinner("⚡ Computing orbital mechanics & thermal physics…"):
    lumen_res, naive_res, primary_res = run_both_schedulers(
        scenario_name, radiator_area, battery_capacity_wh, server_mass_kg, os_choice
    )

timeline_lumen = lumen_res["timeline"]
timeline_naive = naive_res["timeline"]
timeline_primary = primary_res["timeline"]
total_steps = len(timeline_primary)

max_temp_primary = primary_res["max_temperature_reached"]
useful_mins_lumen = lumen_res["total_compute_seconds"] / 60.0
useful_mins_naive = naive_res["total_compute_seconds"] / 60.0
lost_mins = naive_res["lost_compute_seconds"] / 60.0

gain_pct = 0.0
if useful_mins_naive > 0:
    gain_pct = (useful_mins_lumen - useful_mins_naive) / useful_mins_naive * 100.0

# ─────────────────────────────────────────────────────────────────────────────
# MISSION REPORT CARD
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("### 📋 Mission Report Card")

if max_temp_primary >= 95.0:
    st.markdown(
        "<div class='banner banner-fail'>"
        "🔴 MISSION FAILED: THERMAL SHUTDOWN — Hardware temperature reached "
        f"{max_temp_primary:.1f}°C, exceeding the 95°C hard limit. "
        f"{primary_res['thermal_shutdowns']} shutdown event(s) destroyed "
        f"{primary_res['lost_compute_seconds']/60:.1f} min of active compute."
        "</div>",
        unsafe_allow_html=True
    )
elif is_lumenos:
    st.markdown(
        "<div class='banner banner-success'>"
        "🟢 MISSION SUCCESS: All thermal constraints managed — "
        f"LumenOS kept the server at {max_temp_primary:.1f}°C peak "
        f"with 0 crashes. {useful_mins_lumen:.1f} min of useful computation completed."
        "</div>",
        unsafe_allow_html=True
    )
else:
    st.markdown(
        "<div class='banner banner-warn'>"
        "🟡 MISSION MARGINAL: Naive Scheduler scraped through — "
        f"Peak {max_temp_primary:.1f}°C, {primary_res['thermal_shutdowns']} shutdowns. "
        "Switch to LumenOS for reliable thermal control."
        "</div>",
        unsafe_allow_html=True
    )

# ─────────────────────────────────────────────────────────────────────────────
# KPI METRICS ROW
# ─────────────────────────────────────────────────────────────────────────────
mc1, mc2, mc3, mc4, mc5 = st.columns(5)
mc1.metric("🌡️ Peak Temperature", f"{max_temp_primary:.1f}°C",
           delta="SAFE" if max_temp_primary < 80 else ("WARNING" if max_temp_primary < 95 else "SHUTDOWN"),
           delta_color="normal" if max_temp_primary < 80 else "inverse")
mc2.metric("⏱️ Useful Compute", f"{primary_res['total_compute_seconds']/60:.1f} min",
           delta=f"{primary_res['thermal_shutdowns']} crash(es)", delta_color="inverse")
mc3.metric("🔋 Min Battery", f"{primary_res['min_battery_percent']:.0f}%",
           delta="Eclipse survived" if primary_res["min_battery_percent"] > 0 else "Battery drained!")
mc4.metric("⚡ Compute Efficiency Gain",
           f"+{gain_pct:.0f}%" if gain_pct >= 0 else f"{gain_pct:.0f}%",
           delta=f"LumenOS vs Naive | +{useful_mins_lumen - useful_mins_naive:.1f} min",
           delta_color="normal")
mc5.metric("💥 Lost Compute (Naive)", f"{lost_mins:.1f} min",
           delta=f"{naive_res['thermal_shutdowns']} shutdown(s)", delta_color="inverse")

st.markdown("<hr>", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# PLAYBACK CONTROLS
# ─────────────────────────────────────────────────────────────────────────────
pc1, pc2, pc3 = st.columns([3, 1, 1])
with pc1:
    scrub = st.slider(
        "⏩ Orbit Time Inspector:",
        min_value=0, max_value=total_steps - 1,
        value=st.session_state["current_step"],
        format="Step %d",
        help="Drag to inspect any point in the mission. Auto-advances during simulation."
    )
    if not run_sim:
        st.session_state["current_step"] = scrub

with pc2:
    st.write("")
    if run_sim:
        st.success("Simulating…")
    else:
        st.caption(f"t = {st.session_state['current_step'] * 0.5:.1f} min / {profile['sim_minutes']:.0f} min")

with pc3:
    # Jump to interesting events
    event_jump = st.selectbox("Jump to:", ["— Select Event —",
                                           "Orbital Sunrise",
                                           "Radiator → Earth Day (Hot)",
                                           "Eclipse Entry",
                                           "Naive Shutdown Moment"])
    if event_jump == "Orbital Sunrise":
        st.session_state["current_step"] = 0
    elif event_jump == "Radiator → Earth Day (Hot)":
        for i, s in enumerate(timeline_primary):
            if s["orbital_state"]["radiator_facing"] == "EARTH_DAY":
                st.session_state["current_step"] = i; break
    elif event_jump == "Eclipse Entry":
        for i, s in enumerate(timeline_primary):
            if not s["orbital_state"]["is_sunlit"]:
                st.session_state["current_step"] = i; break
    elif event_jump == "Naive Shutdown Moment":
        for i, s in enumerate(timeline_naive):
            if s["thermal_status"] == "SHUTDOWN":
                st.session_state["current_step"] = i; break

# ─────────────────────────────────────────────────────────────────────────────
# PLACEHOLDER CONTAINERS FOR LIVE UPDATE
# ─────────────────────────────────────────────────────────────────────────────
hud_ph = st.empty()
col_orb, col_therm = st.columns([1, 1], gap="medium")
orb_ph = col_orb.empty()
therm_ph = col_therm.empty()

# ─────────────────────────────────────────────────────────────────────────────
# RENDER FUNCTION — called once per frame
# ─────────────────────────────────────────────────────────────────────────────
def render_frame(idx: int):
    idx = max(0, min(idx, total_steps - 1))
    step_p = timeline_primary[idx]
    step_n = timeline_naive[idx]
    state   = step_p["orbital_state"]
    t_min   = idx * 0.5

    facing  = state["radiator_facing"]
    is_sun  = state["is_sunlit"]
    temp_p  = step_p["temperature_c"]
    temp_n  = step_n["temperature_c"]
    cool    = state["max_cooling_capacity_watts"]
    solar   = state["solar_power_watts"]
    batt    = step_p.get("battery_percent", 100.0)
    task    = step_p.get("task_running") or "Idle"
    task_n  = step_n.get("task_running") or "OFF"

    if not is_sun:
        env = "<span class='badge badge-eclipse'>🌑 ECLIPSE (Shadow, 0W Solar, Battery Mode)</span>"
    elif facing == "DEEP_SPACE":
        env = "<span class='badge badge-space'>❄️ DEEP SPACE (3K Cold Sky, 909W Cooling)</span>"
    else:
        env = "<span class='badge badge-earth'>☀️ EARTH DAY (280K Earth IR, 491W Cooling)</span>"

    naive_label = ("🔥 <b style='color:#f87171;'>THERMAL SHUTDOWN</b>"
                   if step_n["thermal_status"] == "SHUTDOWN"
                   else f"<b style='color:#fde047;'>{temp_n:.1f}°C</b>")

    hud_ph.markdown(f"""
    <div class='hud'>
    <b>⏱ Mission Time:</b> <span style='color:#38bdf8;'>{t_min:.1f} min</span> &nbsp;|&nbsp;
    {env} &nbsp;|&nbsp;
    <b>Cooling:</b> <b style='color:#4ade80;'>{cool:.0f} W</b> &nbsp;|&nbsp;
    <b>Solar:</b> {solar:.0f} W &nbsp;|&nbsp;
    <b>Battery:</b> {batt:.0f}% &nbsp;|&nbsp;
    <b>{os_choice.split()[0]}:</b> <b style='color:#38bdf8;'>{temp_p:.1f}°C</b> | <code>{task}</code> &nbsp;|&nbsp;
    <b>Naive:</b> {naive_label} | <code>{task_n}</code>
    </div>
    """, unsafe_allow_html=True)

    fig_o = create_orbit_figure(timeline_primary, current_step_idx=idx)
    fig_t = create_thermal_figure(timeline_lumen, timeline_naive, current_step_idx=idx)

    orb_ph.plotly_chart(fig_o, width="stretch")
    therm_ph.plotly_chart(fig_t, width="stretch")


# ─────────────────────────────────────────────────────────────────────────────
# LIVE SIMULATION LOOP or STATIC FRAME
# ─────────────────────────────────────────────────────────────────────────────
if run_sim:
    if "30 Seconds" in speed_opt:
        step_inc, delay = 3, 0.50
    elif "1 Minute" in speed_opt:
        step_inc, delay = 2, 0.65
    else:
        step_inc, delay = 1, 0.65

    prog = st.progress(0.0)
    for i in range(0, total_steps, step_inc):
        st.session_state["current_step"] = i
        prog.progress(i / max(total_steps - 1, 1))
        render_frame(i)
        time.sleep(delay)
    st.session_state["current_step"] = total_steps - 1
    prog.progress(1.0)
    render_frame(total_steps - 1)
    prog.empty()
else:
    render_frame(st.session_state["current_step"])

# ─────────────────────────────────────────────────────────────────────────────
# EXPLAINER — Context Cards
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("<hr>", unsafe_allow_html=True)
col_a, col_b, col_c = st.columns(3)

with col_a:
    st.markdown("""
    #### 🎯 The Trade-off Challenge
    In vacuum, **fans don't work** — heat exits only via radiative infrared.
    When the radiator faces the warm sunlit Earth (280 K), cooling capacity **drops 46%**.
    Overloaded hardware → **thermal shutdown → mission data lost**.
    """)

with col_b:
    st.markdown(f"""
    #### 🔥 Naive Scheduler Result
    * Blindly runs high-priority tasks regardless of temperature.
    * Pushed past **95°C** → **{naive_res['thermal_shutdowns']} hard crash(es)**.
    * Lost **{lost_mins:.1f} min** of active computation with no checkpoint recovery.
    * Total useful work: **{useful_mins_naive:.1f} min**.
    """)

with col_c:
    st.markdown(f"""
    #### 💡 LumenOS Result
    * 5-minute predictive thermal look-ahead.
    * Checkpoint & pause — **0 crashes, 0 data lost**.
    * Resumed jobs when radiator swung to cold deep space (3 K).
    * Total useful work: **{useful_mins_lumen:.1f} min** — **+{gain_pct:.0f}% gain**.
    """)

st.markdown("<hr>", unsafe_allow_html=True)
st.caption("Built for NASA Space Apps Challenge 2026 | LumenOS — Orbital AI Computing | Open Source MIT")
