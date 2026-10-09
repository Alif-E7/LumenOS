import sys
import os

# --- Project root in sys.path ---
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import streamlit as st
import pandas as pd
import engine.orbital_engine as oe
from engine.orbital_engine import OrbitalEngine
from engine.thermal_engine import ThermalEngine
from engine.workload_profiler import WorkloadProfiler
from engine.lumen_scheduler import LumenScheduler
from dashboard.orbit_view import create_orbit_figure
from dashboard.thermal_graph import create_thermal_figure

# Streamlit Page Config
st.set_page_config(
    page_title="LumenOS — Orbital Data Center Hypervisor",
    page_icon="🛰️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom Aerospace Glassmorphism Styling
st.markdown("""
<style>
    /* Dark aerospace theme background */
    .stApp {
        background-color: #080d1a;
        color: #e6edf3;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    /* Metrics and cards styling */
    div[data-testid="stMetric"] {
        background: linear-gradient(135deg, rgba(16, 26, 46, 0.75) 0%, rgba(9, 14, 26, 0.9) 100%);
        border: 1px solid rgba(0, 229, 255, 0.2);
        border-radius: 10px;
        padding: 14px 18px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }
    div[data-testid="stMetric"]:hover {
        border-color: rgba(0, 229, 255, 0.5);
    }
    div[data-testid="stMetricLabel"] {
        color: #8b949e !important;
        font-size: 0.85rem !important;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    div[data-testid="stMetricValue"] {
        color: #ffffff !important;
        font-weight: 700 !important;
        font-size: 1.6rem !important;
    }
    div[data-testid="stMetricDelta"] {
        font-size: 0.8rem !important;
    }

    /* Telemetry HUD card */
    .telemetry-card {
        background: rgba(13, 21, 38, 0.85);
        border: 1px solid rgba(56, 139, 253, 0.25);
        border-radius: 8px;
        padding: 14px 18px;
        margin-bottom: 12px;
    }
    .badge-green {
        background-color: rgba(46, 160, 67, 0.25);
        color: #3fb950;
        border: 1px solid #2ea043;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .badge-red {
        background-color: rgba(248, 81, 73, 0.25);
        color: #f85149;
        border: 1px solid #da3633;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .badge-blue {
        background-color: rgba(56, 139, 253, 0.25);
        color: #58a6ff;
        border: 1px solid #388bfd;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .badge-amber {
        background-color: rgba(210, 153, 34, 0.25);
        color: #d29922;
        border: 1px solid #bb8009;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
    }
</style>
""", unsafe_allow_html=True)

# Header Section
col_title, col_status = st.columns([3, 1])
with col_title:
    st.markdown("<h1 style='margin-bottom: 2px; color: #58a6ff;'>🛰️ LumenOS — Orbital Data Center Hypervisor</h1>", unsafe_allow_html=True)
    st.markdown("<p style='color: #8b949e; margin-top: 0;'>Thermodynamics-Aware Workload Orchestration in Low Earth Orbit (LEO) | NASA Space Apps 2026</p>", unsafe_allow_html=True)
with col_status:
    st.markdown("""
    <div style='text-align: right; margin-top: 10px;'>
        <span class='badge-green'>● SYSTEM ONLINE</span> &nbsp;
        <span class='badge-blue'>LEO 550 km</span>
    </div>
    """, unsafe_allow_html=True)

# ---------------------------------------------------------
# Sidebar Controls & Simulation Runner
# ---------------------------------------------------------
st.sidebar.markdown("### ⚙️ Simulation Configuration")

# Quick Scenario Presets
preset = st.sidebar.selectbox(
    "Scenario Presets",
    ["Custom Parameters", "Standard LEO Orbit (90 min | 1.5 m²)", "Stress Test (180 min | 1.2 m²)", "High Cooling Capacity (90 min | 2.5 m²)"]
)

# Set defaults based on preset
default_duration = 90.0
default_area = 1.5
default_mass = 15.0

if preset == "Standard LEO Orbit (90 min | 1.5 m²)":
    default_duration = 90.0
    default_area = 1.5
    default_mass = 15.0
elif preset == "Stress Test (180 min | 1.2 m²)":
    default_duration = 180.0
    default_area = 1.2
    default_mass = 15.0
elif preset == "High Cooling Capacity (90 min | 2.5 m²)":
    default_duration = 90.0
    default_area = 2.5
    default_mass = 15.0

sim_duration = st.sidebar.slider(
    "Simulation Duration (minutes)",
    min_value=30.0, max_value=240.0,
    value=float(default_duration), step=10.0,
    help="Time span to simulate orbital passes (~95.6 mins per complete Earth orbit revolution)."
)

radiator_area = st.sidebar.slider(
    "Radiator Area (m²)",
    min_value=0.5, max_value=5.0,
    value=float(default_area), step=0.1,
    help="Effective radiating surface area rejecting heat via Stefan-Boltzmann infrared radiation."
)

server_mass = st.sidebar.slider(
    "AI Server Mass (kg)",
    min_value=5.0, max_value=50.0,
    value=float(default_mass), step=1.0,
    help="Thermal mass of server chassis (Aluminum Cp = 900 J/kg·K)."
)

base_heat = st.sidebar.slider(
    "Base Electronics Idle Heat (Watts)",
    min_value=50, max_value=200,
    value=100, step=10,
    help="Continuous standby power and avionics thermal dissipation."
)

st.sidebar.markdown("---")

# Run Simulation Button
run_btn = st.sidebar.button("🚀 Run Orbital Simulation", type="primary", use_container_width=True)

# ---------------------------------------------------------
# Simulation Execution & Session State Caching
# ---------------------------------------------------------
@st.cache_data(show_spinner=False)
def execute_simulation(duration, area, mass, base_idle):
    oe.RADIATOR_AREA_M2 = area
    o_engine = OrbitalEngine()
    t_engine = ThermalEngine(mass_kg=mass, base_heat_watts=base_idle)
    w_profiler = WorkloadProfiler()
    
    scheduler = LumenScheduler(o_engine, t_engine, w_profiler)
    lumen_res = scheduler.run_simulation(duration)
    naive_res = scheduler.compare_with_naive_scheduler(duration)
    return lumen_res, naive_res

# Trigger simulation if button clicked or not yet in session
if run_btn or "sim_results" not in st.session_state:
    with st.spinner("Calculating orbital mechanics, Stefan-Boltzmann radiation, and scheduler timelines..."):
        lumen_data, naive_data = execute_simulation(sim_duration, radiator_area, server_mass, base_heat)
        st.session_state["sim_results"] = (lumen_data, naive_data)
        st.session_state["params"] = (sim_duration, radiator_area, server_mass, base_heat)

lumen, naive = st.session_state["sim_results"]

# Calculate core comparison metrics
lumen_useful_mins = lumen["total_compute_seconds"] / 60.0
naive_useful_mins = naive["total_compute_seconds"] / 60.0
lost_compute_mins = naive["lost_compute_seconds"] / 60.0

if naive_useful_mins > 0:
    productivity_gain = ((lumen_useful_mins - naive_useful_mins) / naive_useful_mins) * 100.0
else:
    productivity_gain = 0.0

# ---------------------------------------------------------
# Top KPI Metric Cards
# ---------------------------------------------------------
st.markdown("### 📊 Mission Performance Summary")
c1, c2, c3, c4 = st.columns(4)

c1.metric(
    label="LumenOS Useful Work",
    value=f"{lumen_useful_mins:.1f} min",
    delta=f"Max: {lumen['max_temperature_reached']:.1f}°C | 0 Crashes",
    delta_color="normal"
)

c2.metric(
    label="Naive Scheduler Work",
    value=f"{naive_useful_mins:.1f} min",
    delta=f"Max: {naive['max_temperature_reached']:.1f}°C | {naive['thermal_shutdowns']} Crash",
    delta_color="inverse"
)

c3.metric(
    label="Productivity Gain",
    value=f"+{productivity_gain:.0f}%",
    delta=f"{lumen_useful_mins - naive_useful_mins:+.1f} min work gained",
    delta_color="normal"
)

c4.metric(
    label="Compute Lost to Crashes",
    value=f"{lost_compute_mins:.1f} min",
    delta=f"Naive Shutdown: {naive['shutdown_minutes']:.1f} min dark",
    delta_color="inverse"
)

st.markdown("---")

# ---------------------------------------------------------
# Interactive Orbit Time Scrubber & Rounding Playback
# ---------------------------------------------------------
timeline = lumen["timeline"]
timeline_len = len(timeline)

st.markdown("### 🛰️ Live Orbital Rounding & Telemetry Inspector")
scrub_col1, scrub_col2 = st.columns([3, 1])

with scrub_col1:
    step_idx = st.slider(
        "Scrub Time Along Orbit (30-second steps)",
        min_value=0,
        max_value=timeline_len - 1,
        value=0,
        format="Step %d",
        help="Drag slider to inspect the satellite and radiator orientation rounding Earth at each point in time."
    )

with scrub_col2:
    # Quick jumps
    jump = st.selectbox(
        "Jump to Key Orbital Events:",
        ["Select event...", "Orbital Sunrise (12:00)", "Radiator Facing Earth (Thermal Stress)", "Naive Hard Shutdown", "Eclipse Entry (Shadow)"]
    )
    if jump == "Orbital Sunrise (12:00)":
        step_idx = 0
    elif jump == "Radiator Facing Earth (Thermal Stress)":
        # Find step where radiator faces EARTH_DAY
        for idx_ev, stp in enumerate(timeline):
            if stp["orbital_state"]["radiator_facing"] == "EARTH_DAY":
                step_idx = idx_ev
                break
    elif jump == "Naive Hard Shutdown":
        # Find step where naive hit shutdown
        for idx_ev, stp in enumerate(naive["timeline"]):
            if stp["thermal_status"] == "SHUTDOWN":
                step_idx = idx_ev
                break
    elif jump == "Eclipse Entry (Shadow)":
        for idx_ev, stp in enumerate(timeline):
            if not stp["orbital_state"]["is_sunlit"]:
                step_idx = idx_ev
                break

cur_step = timeline[step_idx]
cur_naive_step = naive["timeline"][step_idx]
cur_state = cur_step["orbital_state"]
sim_time_str = str(cur_step["time"])[:19]
elapsed_min = step_idx * 0.5

# Instantaneous Telemetry HUD Strip
facing = cur_state["radiator_facing"]
facing_badge = (
    "<span class='badge-green'>🟢 DEEP_SPACE (3 K Cold Sky)</span>" if facing == "DEEP_SPACE"
    else "<span class='badge-red'>🔴 EARTH_DAY (280 K Earth IR)</span>"
)
sun_badge = (
    "<span class='badge-amber'>☀️ SUNLIT (100% Solar)</span>" if cur_state["is_sunlit"]
    else "<span class='badge-blue'>🌑 ECLIPSE (Earth Shadow)</span>"
)
lumen_status_badge = (
    "<span class='badge-green'>NOMINAL</span>" if cur_step["thermal_status"] == "NOMINAL"
    else ("<span class='badge-amber'>WARNING</span>" if cur_step["thermal_status"] == "WARNING" else "<span class='badge-red'>CRITICAL</span>")
)
naive_status_badge = (
    "<span class='badge-red'>🔥 SHUTDOWN (OFF)</span>" if cur_naive_step["thermal_status"] == "SHUTDOWN"
    else "<span class='badge-green'>RUNNING</span>"
)

st.markdown(f"""
<div class='telemetry-card'>
    <div style='display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;'>
        <div><b>Telemetry Instant:</b> <code style='color: #58a6ff;'>{sim_time_str} UTC</code> (t = {elapsed_min:.1f} min)</div>
        <div><b>Illumination:</b> {sun_badge}</div>
        <div><b>Radiator Orientation:</b> {facing_badge}</div>
        <div><b>Cooling Capacity:</b> <b style='color: #3fb950;'>{cur_state['max_cooling_capacity_watts']:.1f} W</b></div>
        <div><b>Solar Power:</b> <b>{cur_state['solar_power_watts']:.1f} W</b></div>
        <div><b>Battery SoC:</b> <b>{cur_step.get('battery_percent', 100):.1f}%</b></div>
    </div>
    <hr style='border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 8px 0;'>
    <div style='display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 0.9rem;'>
        <div><b>LumenOS:</b> {lumen_status_badge} | Temp: <b style='color: #00e5ff;'>{cur_step['temperature_c']:.1f}°C</b> | Task: <code>{cur_step.get('task_running') or 'Idle (Predictive Pause)'}</code></div>
        <div><b>Naive:</b> {naive_status_badge} | Temp: <b style='color: #ff5252;'>{cur_naive_step['temperature_c']:.1f}°C</b> | Task: <code>{cur_naive_step.get('task_running') or 'None'}</code></div>
    </div>
</div>
""", unsafe_allow_html=True)

# ---------------------------------------------------------
# 3D Orbit Globe & Thermal Timeline Layout
# ---------------------------------------------------------
col_globe, col_graphs = st.columns([1, 1], gap="medium")

with col_globe:
    st.subheader("🌐 3D Orbital Mechanics & Radiator Orientation")
    st.caption("AI Data Center rounding Earth with active Radiator Vector (Green = Deep Space, Red = Earth Facing) and Solar Vector.")
    fig_orbit = create_orbit_figure(timeline, current_step_idx=step_idx)
    st.plotly_chart(fig_orbit, width="stretch")

with col_graphs:
    st.subheader("📈 Thermal Dynamics & Cooling Envelope")
    st.caption("Comparing LumenOS predictive thermal throttling vs Naive baseline overheating into hard shutdown.")
    fig_thermal = create_thermal_figure(timeline, naive["timeline"], current_step_idx=step_idx)
    st.plotly_chart(fig_thermal, width="stretch")

# ---------------------------------------------------------
# Detailed Workload Analytics & Decision Log
# ---------------------------------------------------------
st.markdown("---")
tab_tasks, tab_decisions, tab_architecture = st.tabs(["📋 Workload Execution Breakdown", "📜 Hypervisor Event Audit Log", "🏗️ LumenOS Orbital Architecture"])

with tab_tasks:
    col_t1, col_t2 = st.columns([1, 1])
    with col_t1:
        st.markdown("#### Completed Tasks by Category")
        df_lumen_tasks = pd.DataFrame(list(lumen["completed_by_task"].items()), columns=["Task Name", "LumenOS Completed"])
        df_naive_tasks = pd.DataFrame(list(naive["completed_by_task"].items()), columns=["Task Name", "Naive Completed"])
        df_merged = pd.merge(df_lumen_tasks, df_naive_tasks, on="Task Name", how="outer").fillna(0)
        st.dataframe(df_merged, width="stretch", hide_index=True)
    
    with col_t2:
        st.markdown("#### Key Takeaway")
        st.info(
            f"**Zero Crashes:** LumenOS avoided {lumen['thermal_shutdowns_avoided']} catastrophic shutdown events by pre-emptively holding back heavy AI jobs before the thermal limit was breached.\n\n"
            f"**No Lost Compute:** Naive scheduler wasted {lost_compute_mins:.1f} minutes of computation due to hard thermal shutdowns wiping out active checkpoint progress."
        )

with tab_decisions:
    st.markdown("#### Real-Time Hypervisor Decision Trail")
    # Build decision history DataFrame
    decision_rows = []
    for i, s in enumerate(timeline):
        decision_rows.append({
            "Time": str(s["time"])[:19],
            "Temp (°C)": f"{s['temperature_c']:.1f}",
            "Status": s["thermal_status"],
            "Radiator": s["orbital_state"]["radiator_facing"],
            "Active Job": s.get("task_running") or "None",
            "LumenOS Reason": s["decision"]
        })
    df_decisions = pd.DataFrame(decision_rows)
    st.dataframe(df_decisions.tail(20), width="stretch", hide_index=True)

with tab_architecture:
    st.markdown("""
    #### 🏗️ The 4-Module Thermodynamic Architecture
    
    1. **Orbital Engine (`engine/orbital_engine.py`):**
       - SGP4 orbit propagation in circular LEO (550 km, 51.6° inclination).
       - Calculates Earth shadow (cylindrical umbra) and single-axis sun tracking.
       - Evaluates Radiator View Factor: DEEP_SPACE (3 K), EARTH_DAY (280 K), EARTH_NIGHT (220 K).
    
    2. **Thermal Engine (`engine/thermal_engine.py`):**
       - First-principles Stefan-Boltzmann radiative rejection: $Q_{out} = \\epsilon \\sigma A (T_{server}^4 - T_{sink}^4)$.
       - Lumped thermal mass model ($m \\cdot C_p = 15\\text{ kg} \\times 900\\text{ J/kg K}$).
       - Battery subsystem (500 Wh, charges from excess daytime solar, supplies night eclipse).
    
    3. **Workload Profiler (`engine/workload_profiler.py`):**
       - Profiles AI tasks (LLM Fine-Tuning: 900W heat; Data Sorting: 30W heat; Log Compression: 25W heat).
       - Categorizes thermal headroom thresholds (HEAVY < 60°C, MEDIUM < 80°C, COLD < 95°C).
    
    4. **Lumen Scheduler (`engine/lumen_scheduler.py`):**
       - Status-gated, 5-minute predictive lookahead.
       - Checkpoint-based preemption (resumes jobs without losing work).
    """)

# Footer
st.markdown("---")
st.markdown("<p style='text-align: center; color: #8b949e; font-size: 0.85rem;'>Developed for NASA Space Apps Challenge 2026 | Orbital Computing & Microgravity Data Centers</p>", unsafe_allow_html=True)
