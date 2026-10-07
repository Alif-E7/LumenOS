import streamlit as st
import engine.orbital_engine as oe
from engine.orbital_engine import OrbitalEngine
from engine.thermal_engine import ThermalEngine
from engine.workload_profiler import WorkloadProfiler
from engine.lumen_scheduler import LumenScheduler
from dashboard.orbit_view import create_orbit_figure
from dashboard.thermal_graph import create_thermal_figure

st.set_page_config(page_title="LumenOS Dashboard", layout="wide", initial_sidebar_state="expanded")

st.title("LumenOS: Space Data Center Scheduler")

st.sidebar.header("Simulation Parameters")
sim_duration = st.sidebar.slider("Simulation Duration (mins)", min_value=30.0, max_value=180.0, value=90.0, step=10.0)
radiator_area = st.sidebar.slider("Radiator Area (m²)", min_value=0.5, max_value=5.0, value=1.5, step=0.1)
server_mass = st.sidebar.slider("Server Mass (kg)", min_value=5.0, max_value=50.0, value=15.0, step=1.0)

@st.cache_data
def run_simulations(duration, area, mass):
    # Apply parameter overrides
    oe.RADIATOR_AREA_M2 = area
    o_engine = OrbitalEngine()
    t_engine = ThermalEngine(mass_kg=mass)
    w_profiler = WorkloadProfiler()
    
    # We create the scheduler, running for LumenOS and Naive
    scheduler = LumenScheduler(o_engine, t_engine, w_profiler)
    lumen_results = scheduler.run_simulation(duration)
    naive_results = scheduler.compare_with_naive_scheduler(duration)
    
    return lumen_results, naive_results

lumen, naive = run_simulations(sim_duration, radiator_area, server_mass)

lumen_useful_mins = lumen["total_compute_seconds"] / 60.0
naive_useful_mins = naive["total_compute_seconds"] / 60.0

if naive_useful_mins > 0:
    gain = (lumen_useful_mins - naive_useful_mins) / naive_useful_mins * 100.0
else:
    gain = 0.0

st.header("Top Metrics")
col1, col2, col3 = st.columns(3)

# LumenOS card
lumen_delta = f"{lumen['max_temperature_reached']:.1f}°C max | {lumen['thermal_shutdowns']} shutdowns"
col1.metric("LumenOS", f"{lumen_useful_mins:.1f} min useful work", lumen_delta, delta_color="off")

# Naive card
naive_delta = f"{naive['max_temperature_reached']:.1f}°C max | {naive['thermal_shutdowns']} shutdowns"
col2.metric("Naive", f"{naive_useful_mins:.1f} min useful work", naive_delta, delta_color="off")

# Gain card
col3.metric("Productivity Gain", f"+{gain:.0f}%", "over Naive scheduler")

col_orbit, col_thermal = st.columns([1, 2])

with col_orbit:
    st.subheader("Orbit View")
    fig_orbit = create_orbit_figure(lumen["timeline"])
    st.plotly_chart(fig_orbit, use_container_width=True)

with col_thermal:
    st.subheader("Thermal Timeline")
    fig_thermal = create_thermal_figure(lumen["timeline"], naive["timeline"])
    st.plotly_chart(fig_thermal, use_container_width=True)

st.markdown("---")
st.markdown("<p style='text-align: center; color: gray;'>Built for NASA Space Apps 2026 | The Next Frontier</p>", unsafe_allow_html=True)
