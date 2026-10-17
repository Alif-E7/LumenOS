"""3D Space & Orbital Mechanics Visualizer for LumenOS.

NASA Space Apps 2026 — "Space Mission Design Game"
===================================================
Visualizes competing orbital mechanics, Earth geography, atmosphere, and the
Primary Payload Orbital Data Center in real-time 3D:
1. The SUN: Radiant star providing solar power budget across orbit.
2. DEEP SPACE: Cold cosmic background (3 K radiative sink) with dense starfield.
3. REALISTIC EARTH RENDERING:
   - High-fidelity continents & oceans with elevation / albedo contrast.
   - Day side: Radiant solar reflection & warm Earth IR (280 K thermal stress zone).
   - Night side: Deep navy oceans & glowing golden city night-lights.
   - Atmospheric LEO Glow & Day/Night Terminator ring.
4. PRIMARY PAYLOAD DATA CENTER (Spacecraft):
   - Detailed multi-component satellite model:
     * Central AI Data Center pressurized compute chassis (gold core)
     * Dual high-efficiency Solar Array Wings (blue PV cells with solar orientation)
     * High-emissivity Radiator Panel (glows green in 3K deep space, red in 280K day IR)
     * Dynamic Radiator Normal vector
     * Active Payload AI compute telemetry beacon
"""

import math
from typing import Any, Optional
import numpy as np
import plotly.graph_objects as go

EARTH_RADIUS_KM = 6378.137

# ─────────────────────────────────────────────────────────────────────────────
# 1. STARFIELD & CONTINENT TEXTURE GENERATION
# ─────────────────────────────────────────────────────────────────────────────
np.random.seed(42)
_n_stars = 140
_star_theta = np.random.uniform(0, 2 * np.pi, _n_stars)
_star_phi = np.random.uniform(0, np.pi, _n_stars)
_star_r = np.random.uniform(22000, 32000, _n_stars)
STAR_X = (_star_r * np.sin(_star_phi) * np.cos(_star_theta)).tolist()
STAR_Y = (_star_r * np.sin(_star_phi) * np.sin(_star_theta)).tolist()
STAR_Z = (_star_r * np.cos(_star_phi)).tolist()
STAR_SIZES = np.random.uniform(1.2, 2.8, _n_stars).tolist()


def _is_landmass(lat_rad: np.ndarray, lon_rad: np.ndarray) -> np.ndarray:
    """Mathematical approximation of major Earth landmasses (continents)."""
    lat_deg = np.degrees(lat_rad)
    lon_deg = np.degrees(lon_rad)

    # Continent centers and Gaussian spread (lat, lon, lat_radius, lon_radius)
    continents = [
        # North America
        (45.0, -100.0, 22.0, 35.0),
        # South America
        (-15.0, -60.0, 25.0, 18.0),
        # Europe
        (52.0, 20.0, 15.0, 25.0),
        # Africa
        (5.0, 22.0, 28.0, 20.0),
        # Asia
        (50.0, 95.0, 26.0, 48.0),
        # South Asia / India
        (20.0, 78.0, 12.0, 14.0),
        # Australia
        (-25.0, 135.0, 14.0, 18.0),
        # Antarctica
        (-82.0, 0.0, 12.0, 180.0),
    ]

    land = np.zeros_like(lat_deg, dtype=float)
    for c_lat, c_lon, r_lat, r_lon in continents:
        d_lat = (lat_deg - c_lat) / r_lat
        d_lon = (lon_deg - c_lon) / r_lon
        # Handle wrap around
        d_lon = np.minimum(np.abs(d_lon), np.abs((lon_deg - c_lon + 360) / r_lon))
        d_lon = np.minimum(d_lon, np.abs((lon_deg - c_lon - 360) / r_lon))
        dist_sq = d_lat**2 + d_lon**2
        land += np.exp(-dist_sq * 1.6)

    return np.clip(land, 0.0, 1.0)


def create_orbit_figure(
    timeline: list[dict[str, Any]],
    current_step_idx: Optional[int] = None,
) -> go.Figure:
    """Creates a 3D Deep Space scene with Sun, photorealistic half-lit Earth, orbit path,
    and detailed Primary Payload Data Center model."""
    fig = go.Figure()

    # 1. DEEP SPACE: Distant background starfield
    fig.add_trace(go.Scatter3d(
        x=STAR_X, y=STAR_Y, z=STAR_Z,
        mode="markers",
        marker=dict(
            size=STAR_SIZES,
            color="#cbd5e1",
            opacity=0.75,
        ),
        hoverinfo="skip",
        name="Deep Space Stars",
        showlegend=False
    ))

    # Determine Sun vector from timeline or default
    sun_hat = np.array([1.0, 0.0, 0.0])
    if timeline and "orbital_state" in timeline[0]:
        sv = timeline[0]["orbital_state"].get("sun_vector")
        if sv:
            sun_hat = np.array(sv) / np.linalg.norm(sv)

    # 2. THE SUN: Placed along sun_hat at ~15,000 km
    sun_dist = 14500.0
    sun_pos = sun_hat * sun_dist

    # Sun core marker
    fig.add_trace(go.Scatter3d(
        x=[sun_pos[0]], y=[sun_pos[1]], z=[sun_pos[2]],
        mode="markers+text",
        marker=dict(
            size=24,
            color="#ffb703",
            symbol="circle",
            line=dict(color="#ffffff", width=2.5)
        ),
        text=["☀️ SUN (1361 W/m²)"],
        textposition="top center",
        textfont=dict(color="#ffd700", size=13),
        name="☀️ SUN (Solar Radiation)",
        hovertext=["Sun: Primary solar power source & thermal radiator"],
        hoverinfo="text"
    ))

    # Sunlight rays beaming toward Earth
    ray_starts = []
    ray_ends = []
    for angle in np.linspace(0, 2 * np.pi, 8, endpoint=False):
        perp = np.array([-sun_hat[1], sun_hat[0], 0.0])
        if np.linalg.norm(perp) < 1e-4:
            perp = np.array([0.0, -sun_hat[2], sun_hat[1]])
        perp = perp / np.linalg.norm(perp)
        norm2 = np.cross(sun_hat, perp)
        offset = (math.cos(angle) * perp + math.sin(angle) * norm2) * 1350.0
        r_start = sun_pos * 0.85 + offset
        r_end = sun_hat * (EARTH_RADIUS_KM * 1.5) + offset * 0.5
        ray_starts.append(r_start)
        ray_ends.append(r_end)

    rx, ry, rz = [], [], []
    for s, e in zip(ray_starts, ray_ends):
        rx.extend([s[0], e[0], None])
        ry.extend([s[1], e[1], None])
        rz.extend([s[2], e[2], None])

    fig.add_trace(go.Scatter3d(
        x=rx, y=ry, z=rz,
        mode="lines",
        line=dict(color="rgba(255, 215, 0, 0.35)", width=2, dash="dash"),
        hoverinfo="skip",
        name="Sunlight Beams",
        showlegend=False
    ))

    # 3. HIGH-RESOLUTION EARTH WITH GEOGRAPHY & CITY LIGHTS
    n_lon = 72
    n_lat = 36
    u = np.linspace(-np.pi, np.pi, n_lon)
    v = np.linspace(0, np.pi, n_lat)
    u_grid, v_grid = np.meshgrid(u, v)

    # 3D Cartesian coordinates
    x_e = EARTH_RADIUS_KM * np.sin(v_grid) * np.cos(u_grid)
    y_e = EARTH_RADIUS_KM * np.sin(v_grid) * np.sin(u_grid)
    z_e = EARTH_RADIUS_KM * np.cos(v_grid)

    # Latitude and Longitude for landmass determination
    lat_rad = (np.pi / 2.0) - v_grid
    lon_rad = u_grid
    land = _is_landmass(lat_rad, lon_rad)

    # Solar illumination factor (-1.0 to +1.0)
    illumination = (x_e * sun_hat[0] + y_e * sun_hat[1] + z_e * sun_hat[2]) / EARTH_RADIUS_KM

    # Compound surface scalar:
    # Day ocean (0.55 to 0.70)
    # Day continent/land (0.75 to 1.0)
    # Night ocean (0.05 to 0.25)
    # Night city lights on land (0.35 to 0.50)
    is_day = illumination > 0.02
    day_strength = np.clip((illumination + 0.1) / 1.1, 0.0, 1.0)

    surface_scalar = np.zeros_like(illumination)
    # Day side:
    day_val = np.where(land > 0.45, 0.75 + 0.25 * land, 0.55 + 0.15 * day_strength)
    # Night side:
    night_val = np.where(land > 0.45, 0.35 + 0.15 * land, 0.08)

    surface_scalar = np.where(is_day, day_val, night_val)

    # Precision Earth Color Palette
    earth_palette = [
        [0.0, "#030712"],    # Deep dark night ocean
        [0.10, "#071228"],   # Dim night ocean
        [0.25, "#0f172a"],   # Dark slate continent in night
        [0.35, "#78350f"],   # Low night-time city glow / terrain
        [0.45, "#f59e0b"],   # Vibrant golden city lights (urban clusters on night side)
        [0.52, "#1e3a8a"],   # Day ocean deep blue
        [0.60, "#2563eb"],   # Day ocean azure
        [0.72, "#38bdf8"],   # Sunlit shallow coastal waters
        [0.80, "#15803d"],   # Lush landmass vegetation
        [0.90, "#b45309"],   # Arid terrain / desert plateau
        [1.0, "#f8fafc"],    # Bright cloud / snow peaks highlight
    ]

    fig.add_surface(
        x=x_e, y=y_e, z=z_e,
        surfacecolor=surface_scalar,
        cmin=0.0,
        cmax=1.0,
        colorscale=earth_palette,
        showscale=False,
        opacity=0.97,
        hoverinfo="text",
        hovertext="Earth: Continents, Oceans & Golden Night Lights (280K Day IR / 220K Night Shadow)",
        name="Earth (Photorealistic)"
    )

    # Atmospheric LEO Glow Shell
    atm_radius = EARTH_RADIUS_KM * 1.03
    atm_x = atm_radius * np.sin(v_grid) * np.cos(u_grid)
    atm_y = atm_radius * np.sin(v_grid) * np.sin(u_grid)
    atm_z = atm_radius * np.cos(v_grid)
    atm_day = np.clip((illumination + 0.2) / 1.2, 0.0, 1.0)
    fig.add_surface(
        x=atm_x, y=atm_y, z=atm_z,
        surfacecolor=atm_day,
        cmin=0.0,
        cmax=1.0,
        colorscale=[
            [0.0, "rgba(0, 0, 0, 0)"],
            [0.5, "rgba(56, 189, 248, 0.04)"],
            [1.0, "rgba(96, 165, 250, 0.22)"]
        ],
        showscale=False,
        hoverinfo="skip",
        name="Atmospheric Glow"
    )

    # Day/Night Terminator ring
    t_angles = np.linspace(0, 2 * np.pi, 90)
    t_v1 = np.array([-sun_hat[1], sun_hat[0], 0.0])
    if np.linalg.norm(t_v1) < 1e-4:
        t_v1 = np.array([0.0, -sun_hat[2], sun_hat[1]])
    t_v1 = t_v1 / np.linalg.norm(t_v1)
    t_v2 = np.cross(sun_hat, t_v1)
    r_term = EARTH_RADIUS_KM * 1.008
    term_x = r_term * (np.outer(np.cos(t_angles), t_v1)[:, 0] + np.outer(np.sin(t_angles), t_v2)[:, 0])
    term_y = r_term * (np.outer(np.cos(t_angles), t_v1)[:, 1] + np.outer(np.sin(t_angles), t_v2)[:, 1])
    term_z = r_term * (np.outer(np.cos(t_angles), t_v1)[:, 2] + np.outer(np.sin(t_angles), t_v2)[:, 2])

    fig.add_trace(go.Scatter3d(
        x=term_x, y=term_y, z=term_z,
        mode="lines",
        line=dict(color="rgba(245, 158, 11, 0.75)", width=3),
        hoverinfo="skip",
        name="Day/Night Terminator",
        showlegend=False
    ))

    if not timeline:
        return fig

    # 4. ORBIT PATH: Color-coded by cooling condition
    deep_x, deep_y, deep_z = [], [], []
    earth_x, earth_y, earth_z = [], [], []
    ecl_x, ecl_y, ecl_z = [], [], []
    all_x, all_y, all_z = [], [], []

    for step in timeline:
        state = step["orbital_state"]
        if "position_km" in state and state["position_km"]:
            px, py, pz = state["position_km"]
        else:
            phi = math.radians(state["latitude_deg"])
            lam = math.radians(state["longitude_deg"])
            r = EARTH_RADIUS_KM + state["altitude_km"]
            px = r * math.cos(phi) * math.cos(lam)
            py = r * math.cos(phi) * math.sin(lam)
            pz = r * math.sin(phi)

        all_x.append(px); all_y.append(py); all_z.append(pz)

        is_sun = state.get("is_sunlit", True)
        facing = state.get("radiator_facing", "DEEP_SPACE")

        if not is_sun:
            ecl_x.append(px); ecl_y.append(py); ecl_z.append(pz)
            deep_x.append(None); deep_y.append(None); deep_z.append(None)
            earth_x.append(None); earth_y.append(None); earth_z.append(None)
        elif facing == "DEEP_SPACE":
            deep_x.append(px); deep_y.append(py); deep_z.append(pz)
            earth_x.append(None); earth_y.append(None); earth_z.append(None)
            ecl_x.append(None); ecl_y.append(None); ecl_z.append(None)
        else:
            earth_x.append(px); earth_y.append(py); earth_z.append(pz)
            deep_x.append(None); deep_x.append(None); deep_x.append(None)
            ecl_x.append(None); ecl_y.append(None); ecl_z.append(None)

    fig.add_trace(go.Scatter3d(
        x=deep_x, y=deep_y, z=deep_z,
        mode="lines",
        line=dict(color="#10b981", width=5),
        name="🟢 DEEP SPACE (3K Cool Sky)",
        hoverinfo="skip"
    ))

    fig.add_trace(go.Scatter3d(
        x=earth_x, y=earth_y, z=earth_z,
        mode="lines",
        line=dict(color="#f43f5e", width=5),
        name="🔴 EARTH DAY (280K Heat IR)",
        hoverinfo="skip"
    ))

    fig.add_trace(go.Scatter3d(
        x=ecl_x, y=ecl_y, z=ecl_z,
        mode="lines",
        line=dict(color="#3b82f6", width=5),
        name="🔵 ECLIPSE (Earth Shadow)",
        hoverinfo="skip"
    ))

    # 5. PRIMARY PAYLOAD DATA CENTER ARCHITECTURE (Spacecraft Body + Solar Arrays + Radiator)
    n_points = len(all_x)
    if n_points > 0:
        idx = current_step_idx if current_step_idx is not None else 0
        idx = min(max(idx, 0), n_points - 1)
        sat_x, sat_y, sat_z = all_x[idx], all_y[idx], all_z[idx]
        cur_step = timeline[idx]
        cur_state = cur_step["orbital_state"]
        cur_facing = cur_state.get("radiator_facing", "DEEP_SPACE")
        cur_sun = cur_state.get("is_sunlit", True)
        cur_task = cur_step.get("task_running") or "Idle"
        display_task = "Primary Payload (LLM)" if cur_task == "LLM_Fine_Tuning" else cur_task.replace("_", " ")
        cur_temp = cur_step.get("temperature_c", 45.0)

        # Orientation frame vectors
        sat_pos = np.array([sat_x, sat_y, sat_z])
        sat_dist = np.linalg.norm(sat_pos)
        r_hat = sat_pos / sat_dist  # Radial (zenith)

        # Velocity approximation or orbit normal
        if "radiator_normal" in cur_state and cur_state["radiator_normal"]:
            rad_norm = np.array(cur_state["radiator_normal"])
        else:
            sign = 1.0 if cur_facing == "DEEP_SPACE" else -1.0
            rad_norm = sign * r_hat

        rad_norm = rad_norm / np.linalg.norm(rad_norm)

        # Solar panel wing vector (perpendicular to radial and sun if possible)
        wing_axis = np.cross(r_hat, sun_hat)
        if np.linalg.norm(wing_axis) < 1e-4:
            wing_axis = np.cross(r_hat, np.array([0.0, 0.0, 1.0]))
        wing_axis = wing_axis / np.linalg.norm(wing_axis)

        # A. Dual Solar Array Wings (Photovoltaic power generation)
        wing_span = 750.0
        p_left = sat_pos - wing_axis * wing_span
        p_right = sat_pos + wing_axis * wing_span

        fig.add_trace(go.Scatter3d(
            x=[p_left[0], sat_x, p_right[0]],
            y=[p_left[1], sat_y, p_right[1]],
            z=[p_left[2], sat_z, p_right[2]],
            mode="lines+markers",
            line=dict(color="#2563eb", width=8),
            marker=dict(
                size=[7, 0, 7],
                color="#60a5fa",
                symbol="square"
            ),
            name="⚡ Solar Arrays (PV Power)",
            hovertext=["Left PV Wing", None, "Right PV Wing"],
            hoverinfo="text"
        ))

        # B. Primary Payload Data Center Compute Core (Central Chassis)
        core_color = "#38bdf8" if cur_temp < 60.0 else ("#f59e0b" if cur_temp < 80.0 else "#ef4444")
        fig.add_trace(go.Scatter3d(
            x=[sat_x], y=[sat_y], z=[sat_z],
            mode="markers+text",
            marker=dict(
                size=14,
                color="#fbbf24",
                symbol="diamond",
                line=dict(color=core_color, width=3)
            ),
            text=[f"🛰️ PRIMARY PAYLOAD DATA CENTER\n[{display_task} | {cur_temp:.1f}°C]"],
            textposition="top center",
            textfont=dict(color="#f8fafc", size=12),
            name="🛰️ Primary Payload Data Center",
            hovertext=[
                f"<b>PRIMARY PAYLOAD: Space Data Center</b><br>"
                f"AI Workload: {display_task}<br>"
                f"Core Temp: {cur_temp:.1f}°C<br>"
                f"Radiator Facing: {cur_facing}<br>"
                f"Sunlit: {'Yes (Solar Power)' if cur_sun else 'No (Eclipse Battery Mode)'}"
            ],
            hoverinfo="text"
        ))

        # C. Thermal Radiator Panel (Fixed -Z Body Surface)
        rad_offset = sat_pos + rad_norm * 450.0
        rad_color = "#10b981" if cur_facing == "DEEP_SPACE" else ("#f43f5e" if cur_facing == "EARTH_DAY" else "#38bdf8")
        rad_wing = np.cross(rad_norm, wing_axis)
        rad_wing = rad_wing / np.linalg.norm(rad_wing) * 350.0

        rad_p1 = rad_offset - rad_wing
        rad_p2 = rad_offset + rad_wing

        fig.add_trace(go.Scatter3d(
            x=[rad_p1[0], rad_offset[0], rad_p2[0]],
            y=[rad_p1[1], rad_offset[1], rad_p2[1]],
            z=[rad_p1[2], rad_offset[2], rad_p2[2]],
            mode="lines+markers",
            line=dict(color=rad_color, width=6),
            marker=dict(size=[6, 0, 6], color=rad_color),
            name=f"❄️ Heat Radiator Panel ({cur_facing})",
            hovertext=["Radiator Edge", f"Radiator Facing: {cur_facing}", "Radiator Edge"],
            hoverinfo="text"
        ))

        # D. Radiator Normal Vector (Length 1600 km pointer)
        arrow_len = 1600.0
        rad_x = sat_x + rad_norm[0] * arrow_len
        rad_y = sat_y + rad_norm[1] * arrow_len
        rad_z = sat_z + rad_norm[2] * arrow_len

        fig.add_trace(go.Scatter3d(
            x=[sat_x, rad_x],
            y=[sat_y, rad_y],
            z=[sat_z, rad_z],
            mode="lines+markers",
            line=dict(color=rad_color, width=5, dash="dot"),
            marker=dict(size=[0, 8], color=rad_color, symbol="diamond"),
            name=f"📐 Radiator Vector ({cur_facing})",
            hovertext=[None, f"Pointing to: {cur_facing}"],
            hoverinfo="text"
        ))

    # Layout styling: clean cosmos dark
    fig.update_layout(
        scene=dict(
            xaxis=dict(showbackground=False, showgrid=False, zeroline=False, showticklabels=False, title=""),
            yaxis=dict(showbackground=False, showgrid=False, zeroline=False, showticklabels=False, title=""),
            zaxis=dict(showbackground=False, showgrid=False, zeroline=False, showticklabels=False, title=""),
            aspectmode="data",
            camera=dict(
                eye=dict(x=1.7, y=1.7, z=1.1),
                up=dict(x=0, y=0, z=1)
            )
        ),
        margin=dict(l=0, r=0, b=0, t=10),
        paper_bgcolor="#040711",
        plot_bgcolor="#040711",
        legend=dict(
            x=0.01, y=0.99,
            font=dict(color="#cbd5e1", size=10),
            bgcolor="rgba(10, 15, 30, 0.88)",
            bordercolor="rgba(255, 255, 255, 0.15)",
            borderwidth=1
        )
    )

    return fig
