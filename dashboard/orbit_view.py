"""3D Space & Orbital Mechanics Visualizer for LumenOS.

Visual elements:
1. The SUN: Radiant golden star beaming solar radiation toward Earth.
2. DEEP SPACE: Cosmic dark background with distant stars.
3. EARTH HALF-LIGHTING:
   - Day side: Warm, bright, heat-emitting (radiates 280K Earth IR).
   - Night side: Grey, dark, in shadow (eclipse umbra).
4. AI DATA CENTER SATELLITE:
   - Orbits and rotates around Earth.
   - Dynamic Radiator Normal Vector:
     * Green: Points to Deep Space (3K cold sky, max cooling ~909W).
     * Red: Points to Earth Day-Side (280K, poor cooling ~491W).
     * Blue: In Earth's shadow (Eclipse, 0W solar).
"""

import math
from typing import Any, Optional
import numpy as np
import plotly.graph_objects as go

EARTH_RADIUS_KM = 6378.137

# Generate distant background stars once
np.random.seed(42)
_n_stars = 70
_star_theta = np.random.uniform(0, 2 * np.pi, _n_stars)
_star_phi = np.random.uniform(0, np.pi, _n_stars)
_star_r = np.random.uniform(20000, 26000, _n_stars)
STAR_X = (_star_r * np.sin(_star_phi) * np.cos(_star_theta)).tolist()
STAR_Y = (_star_r * np.sin(_star_phi) * np.sin(_star_theta)).tolist()
STAR_Z = (_star_r * np.cos(_star_phi)).tolist()


def create_orbit_figure(
    timeline: list[dict[str, Any]],
    current_step_idx: Optional[int] = None,
) -> go.Figure:
    """Creates a 3D Deep Space scene with Sun, half-lit Earth, orbit path, and satellite."""
    fig = go.Figure()

    # 1. DEEP SPACE: Distant background starfield
    fig.add_trace(go.Scatter3d(
        x=STAR_X, y=STAR_Y, z=STAR_Z,
        mode="markers",
        marker=dict(size=1.8, color="#a5c4e8", opacity=0.7),
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
            size=22,
            color="#ffcc00",
            symbol="circle",
            line=dict(color="#ffffff", width=2)
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
    for angle in np.linspace(0, 2 * np.pi, 6, endpoint=False):
        perp = np.array([-sun_hat[1], sun_hat[0], 0.0])
        if np.linalg.norm(perp) < 1e-4:
            perp = np.array([0.0, -sun_hat[2], sun_hat[1]])
        perp = perp / np.linalg.norm(perp)
        norm2 = np.cross(sun_hat, perp)
        offset = (math.cos(angle) * perp + math.sin(angle) * norm2) * 1200.0
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

    # 3. EARTH: Half warm bright (Day), Half grey dark (Night)
    u = np.linspace(0, 2 * np.pi, 45)
    v = np.linspace(0, np.pi, 25)
    x_e = EARTH_RADIUS_KM * np.outer(np.cos(u), np.sin(v))
    y_e = EARTH_RADIUS_KM * np.outer(np.sin(u), np.sin(v))
    z_e = EARTH_RADIUS_KM * np.outer(np.ones(np.size(u)), np.cos(v))

    # Illumination dot product: -1 (midnight shadow) to +1 (noon bright)
    illumination = (x_e * sun_hat[0] + y_e * sun_hat[1] + z_e * sun_hat[2]) / EARTH_RADIUS_KM

    # Surface Colorscale:
    # Negative: Grey dark night side (#0c1322 to #1a2336)
    # Positive: Warm bright azure & radiant day side (#2563eb to #60a5fa to #93c5fd)
    earth_colorscale = [
        [0.0, "#080e1a"],   # Deep dark night
        [0.45, "#141c2e"],  # Dark slate grey night
        [0.50, "#1f2b45"],  # Terminator twilight
        [0.55, "#2563eb"],  # Warm bright ocean
        [0.75, "#3b82f6"],  # Bright sunlit azure
        [1.0, "#93c5fd"],   # Radiant noon highlight
    ]

    fig.add_surface(
        x=x_e, y=y_e, z=z_e,
        surfacecolor=illumination,
        cmin=-1.0,
        cmax=1.0,
        colorscale=earth_colorscale,
        showscale=False,
        opacity=0.96,
        hoverinfo="text",
        hovertext="Earth: Day Side (Warm Bright, 280K IR) | Night Side (Grey Dark Shadow)",
        name="Earth (Day/Night)"
    )

    # Day/Night Terminator ring
    t_angles = np.linspace(0, 2 * np.pi, 80)
    t_v1 = np.array([-sun_hat[1], sun_hat[0], 0.0])
    if np.linalg.norm(t_v1) < 1e-4:
        t_v1 = np.array([0.0, -sun_hat[2], sun_hat[1]])
    t_v1 = t_v1 / np.linalg.norm(t_v1)
    t_v2 = np.cross(sun_hat, t_v1)
    r_term = EARTH_RADIUS_KM * 1.004
    term_x = r_term * (np.outer(np.cos(t_angles), t_v1)[:, 0] + np.outer(np.sin(t_angles), t_v2)[:, 0])
    term_y = r_term * (np.outer(np.cos(t_angles), t_v1)[:, 1] + np.outer(np.sin(t_angles), t_v2)[:, 1])
    term_z = r_term * (np.outer(np.cos(t_angles), t_v1)[:, 2] + np.outer(np.sin(t_angles), t_v2)[:, 2])

    fig.add_trace(go.Scatter3d(
        x=term_x, y=term_y, z=term_z,
        mode="lines",
        line=dict(color="rgba(255, 180, 0, 0.6)", width=3),
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
        line=dict(color="#00ff66", width=5),
        name="🟢 DEEP SPACE (3K Cool Sky)",
        hoverinfo="skip"
    ))

    fig.add_trace(go.Scatter3d(
        x=earth_x, y=earth_y, z=earth_z,
        mode="lines",
        line=dict(color="#ff3344", width=5),
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

    # 5. DATA CENTER SATELLITE & RADIATOR ORIENTATION
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
        cur_temp = cur_step.get("temperature_c", 45.0)

        # Satellite Data Center Payload Marker
        fig.add_trace(go.Scatter3d(
            x=[sat_x], y=[sat_y], z=[sat_z],
            mode="markers+text",
            marker=dict(
                size=12,
                color="#ffd700",
                symbol="diamond",
                line=dict(color="#ffffff", width=2)
            ),
            text=[f"🛰️ AI Data Center ({cur_task})"],
            textposition="top center",
            textfont=dict(color="#ffffff", size=12),
            name="🛰️ AI Data Center Satellite",
            hovertext=[f"AI Data Center<br>Temp: {cur_temp:.1f}°C<br>Task: {cur_task}<br>Radiator: {cur_facing}"],
            hoverinfo="text"
        ))

        # Radiator Normal Vector (Length 1600 km)
        arrow_len = 1600.0
        if "radiator_normal" in cur_state and cur_state["radiator_normal"]:
            nx, ny, nz = cur_state["radiator_normal"]
        else:
            dist = math.sqrt(sat_x**2 + sat_y**2 + sat_z**2)
            sign = 1.0 if cur_facing == "DEEP_SPACE" else -1.0
            nx, ny, nz = sign * sat_x / dist, sign * sat_y / dist, sign * sat_z / dist

        rad_x = sat_x + nx * arrow_len
        rad_y = sat_y + ny * arrow_len
        rad_z = sat_z + nz * arrow_len
        rad_color = "#00ff66" if cur_facing == "DEEP_SPACE" else ("#ff3344" if cur_facing == "EARTH_DAY" else "#00e5ff")

        fig.add_trace(go.Scatter3d(
            x=[sat_x, rad_x],
            y=[sat_y, rad_y],
            z=[sat_z, rad_z],
            mode="lines+markers",
            line=dict(color=rad_color, width=6),
            marker=dict(size=[0, 8], color=rad_color, symbol="diamond"),
            name=f"📐 Radiator Normal ({cur_facing})",
            hovertext=[None, f"Radiator Facing: {cur_facing}"],
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
            bgcolor="rgba(10, 15, 30, 0.85)",
            bordercolor="rgba(255, 255, 255, 0.15)",
            borderwidth=1
        )
    )

    return fig
