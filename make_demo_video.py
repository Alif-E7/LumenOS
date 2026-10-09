import os
import math
import sys
import numpy as np
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import imageio_ffmpeg
from datetime import datetime

# Configure matplotlib to use the installed imageio-ffmpeg
matplotlib.rcParams["animation.ffmpeg_path"] = imageio_ffmpeg.get_ffmpeg_exe()
plt.style.use('dark_background')

from engine.orbital_engine import OrbitalEngine
import engine.orbital_engine as oe
from engine.thermal_engine import ThermalEngine
from engine.workload_profiler import WorkloadProfiler
from engine.lumen_scheduler import LumenScheduler

def main():
    print("Running simulations...")
    # Setup Data
    oe.RADIATOR_AREA_M2 = 1.5
    o_engine = OrbitalEngine()
    t_engine = ThermalEngine(mass_kg=15.0)
    w_profiler = WorkloadProfiler()
    scheduler = LumenScheduler(o_engine, t_engine, w_profiler)

    sim_minutes = 180.0
    lumen = scheduler.run_simulation(sim_minutes)
    naive = scheduler.compare_with_naive_scheduler(sim_minutes)

    tl_lumen = lumen["timeline"]
    tl_naive = naive["timeline"]

    times = [((step["time"] - tl_lumen[0]["time"]).total_seconds() / 60.0) for step in tl_lumen]
    temp_lumen = [step["temperature_c"] for step in tl_lumen]
    temp_naive = [step["temperature_c"] for step in tl_naive]
    cooling = [step["cooling_watts"] for step in tl_lumen]
    heat = [step["task_heat_watts"] for step in tl_lumen]

    x_orbit = []
    y_orbit = []
    z_orbit = []
    colors_orbit = []
    for step in tl_lumen:
        state = step["orbital_state"]
        lat = math.radians(state["latitude_deg"])
        lon = math.radians(state["longitude_deg"])
        r = 6378.137 + state["altitude_km"]
        x_orbit.append(r * math.cos(lat) * math.cos(lon))
        y_orbit.append(r * math.cos(lat) * math.sin(lon))
        z_orbit.append(r * math.sin(lat))
        if not state["is_sunlit"]: colors_orbit.append("blue")
        elif state["radiator_facing"] == "DEEP_SPACE": colors_orbit.append("green")
        elif state["radiator_facing"] == "EARTH_DAY": colors_orbit.append("red")
        else: colors_orbit.append("orange")

    print("Setting up plot...")
    fig = plt.figure(figsize=(1280/100, 720/100), dpi=100)
    gs = fig.add_gridspec(2, 2, wspace=0.2, hspace=0.3, left=0.05, right=0.95, top=0.9, bottom=0.1)
    
    # 1. Orbit Plot
    ax_orbit = fig.add_subplot(gs[0, 0], projection='3d')
    ax_orbit.set_title("Orbital Position", color='white')
    ax_orbit.axis('off')
    
    # Draw Earth
    u, v = np.mgrid[0:2*np.pi:30j, 0:np.pi:15j]
    x_e = 6378.137 * np.cos(u) * np.sin(v)
    y_e = 6378.137 * np.sin(u) * np.sin(v)
    z_e = 6378.137 * np.cos(v)
    ax_orbit.plot_surface(x_e, y_e, z_e, color='#102040', alpha=0.5, edgecolor='none')
    
    # Draw orbit path background
    for i in range(len(x_orbit)-1):
        ax_orbit.plot(x_orbit[i:i+2], y_orbit[i:i+2], z_orbit[i:i+2], color=colors_orbit[i], lw=2)
        
    marker, = ax_orbit.plot([x_orbit[0]], [y_orbit[0]], [z_orbit[0]], 'wo', markersize=8, markeredgecolor='yellow', markeredgewidth=2)
    
    # 2. Temp Plot
    ax_temp = fig.add_subplot(gs[0, 1])
    ax_temp.set_title("Temperature (°C)", color='white')
    ax_temp.set_xlim(0, 180)
    ax_temp.set_ylim(-20, 120)
    ax_temp.axhline(95, color='red', alpha=0.3, ls='--', label='Shutdown Threshold')
    line_lumen, = ax_temp.plot([], [], color='blue', label='LumenOS', lw=2)
    line_naive, = ax_temp.plot([], [], color='red', label='Naive', lw=2)
    ax_temp.legend(loc='upper right', facecolor='black', edgecolor='white')
    ann_naive = ax_temp.text(0, 100, "", color='red', fontsize=12, weight='bold', bbox=dict(facecolor='black', alpha=0.7, edgecolor='none'))
    ann_lumen = ax_temp.text(0, 40, "", color='blue', fontsize=12, weight='bold', bbox=dict(facecolor='black', alpha=0.7, edgecolor='none'))

    # 3. Heat Plot
    ax_heat = fig.add_subplot(gs[1, 0])
    ax_heat.set_title("Heat vs Cooling (Watts)", color='white')
    ax_heat.set_xlim(0, 180)
    ax_heat.set_ylim(0, 2000)
    line_cooling, = ax_heat.plot([], [], color='cyan', label='Max Cooling', ls='--')
    line_heat, = ax_heat.plot([], [], color='orange', label='LumenOS Heat')
    ax_heat.legend(loc='upper right', facecolor='black', edgecolor='white')
    
    # 4. Status Plot
    ax_status = fig.add_subplot(gs[1, 1])
    ax_status.axis('off')
    txt_time = ax_status.text(0.1, 0.85, "", fontsize=14, color='white')
    txt_lumen = ax_status.text(0.1, 0.55, "", fontsize=13, color='lightblue')
    txt_naive = ax_status.text(0.1, 0.25, "", fontsize=13, color='lightpink')
    
    # Overlay
    overlay_ax = fig.add_axes([0, 0, 1, 1])
    overlay_ax.axis('off')
    overlay_patch = overlay_ax.add_patch(plt.Rectangle((0,0), 1, 1, color='black', alpha=0.0))
    overlay_title = overlay_ax.text(0.5, 0.6, "", ha='center', va='center', fontsize=34, color='white', weight='bold')
    overlay_sub = overlay_ax.text(0.5, 0.5, "", ha='center', va='center', fontsize=22, color='lightgray')
    overlay_score = overlay_ax.text(0.5, 0.4, "", ha='center', va='center', fontsize=40, color='#00FF00', weight='bold')
    
    fps = 24
    total_duration_sec = 120
    total_frames = fps * total_duration_sec
    
    def update(frame):
        if frame % 500 == 0:
            print(f"Rendered {frame}/{total_frames} frames")
            
        sec = frame / float(fps)
        sim_min = sec * (sim_minutes / total_duration_sec)
        idx = min(int((sim_min / sim_minutes) * len(times)), len(times) - 1)
        
        t_data = times[:idx+1]
        line_lumen.set_data(t_data, temp_lumen[:idx+1])
        line_naive.set_data(t_data, temp_naive[:idx+1])
        line_cooling.set_data(t_data, cooling[:idx+1])
        line_heat.set_data(t_data, heat[:idx+1])
        
        marker.set_data([x_orbit[idx]], [y_orbit[idx]])
        marker.set_3d_properties([z_orbit[idx]])
        
        state = tl_lumen[idx]
        n_state = tl_naive[idx]
        
        txt_time.set_text(f"Simulation Time: {sim_min:.1f} mins\nRadiator: {state['orbital_state']['radiator_facing']}")
        txt_lumen.set_text(f"[ LumenOS ]\nStatus: {state['thermal_status']}\nTask: {state['task_running']}\nBattery: {state['battery_percent']:.1f}%")
        txt_naive.set_text(f"[ Naive ]\nStatus: {n_state['thermal_status']}\nTask: {n_state['task_running']}")
        
        # Reset Overlays
        overlay_title.set_text("")
        overlay_sub.set_text("")
        overlay_score.set_text("")
        ann_naive.set_text("")
        ann_lumen.set_text("")
        overlay_patch.set_alpha(0.0)
        
        # Story timeline
        if sec < 12:
            overlay_patch.set_alpha(0.85)
            overlay_title.set_text("LumenOS — Thermodynamics-Aware Orbital Hypervisor")
            overlay_sub.set_text("No fans. No air. No second chances.")
        elif 12 <= sec < 35:
            # flash red if naive has shutdown
            if max(temp_naive[:idx+1]) >= 95.0:
                if (frame // 12) % 2 == 0:
                    ann_naive.set_text("THERMAL SHUTDOWN — 14.5 min of work lost")
                    ann_naive.set_position((max(0, times[idx]-50), 105))
        elif 35 <= sec < 65:
            # annotate predictive pause
            if state['thermal_status'] == 'WARNING' or state['task_running'] is None:
                 ann_lumen.set_text("Predictive pause at ~56C\nResumed from checkpoint")
                 ann_lumen.set_position((max(0, times[idx]-60), 45))
        elif 65 <= sec < 95:
            overlay_patch.set_alpha(0.85)
            overlay_title.set_text("Naive: 1 shutdown | 64.5 min work\nLumenOS: 0 shutdowns | 90 min work")
            overlay_score.set_text("+39% USEFUL COMPUTE")
        elif 95 <= sec <= 120:
            overlay_patch.set_alpha(0.9)
            overlay_title.set_text("Orbital compute can be the clean alternative —\nif it survives its own heat.")
            overlay_sub.set_text("LumenOS | NASA Space Apps 2026 | The Next Frontier")
            
        return [line_lumen, line_naive, line_cooling, line_heat, marker, txt_time, txt_lumen, txt_naive,
                overlay_patch, overlay_title, overlay_sub, overlay_score, ann_naive, ann_lumen]

    print("Starting animation render...")
    ani = animation.FuncAnimation(fig, update, frames=total_frames, blit=False)
    
    writer = animation.FFMpegWriter(fps=fps, bitrate=5000)
    ani.save("demo_video.mp4", writer=writer)
    print("Saved demo_video.mp4 successfully.")

if __name__ == "__main__":
    main()
