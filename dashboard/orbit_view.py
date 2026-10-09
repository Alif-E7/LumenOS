"""3D Orbital Visualizer for LumenOS.

Renders an interactive 3D Earth globe with:
1. Real Earth sphere with latitude/longitude grid and continental reference.
2. Complete orbit path rounding the Earth, color-coded by thermal/cooling phase:
   - GREEN: DEEP_SPACE (cold sky 3K, high cooling capacity ~909W)
   - RED: EARTH_DAY (Earth IR 280K, poor cooling capacity ~491W)
   - BLUE: ECLIPSE (Earth shadow, solar power 0W, battery discharge)
3. AI Data Center Satellite rounding the Earth with:
   - AI Data Center payload marker
   - Radiator normal vector pointing towards deep space vs Earth
   - Velocity/Orbit direction vector
   - Sun illumination vector
"""

import math
from typing import Any, Optional
import numpy as np
import plotly.graph_objects as go

EARTH_RADIUS_KM = 6378.137


def _get_continent_outlines():
    """Returns approximate polyline coordinates (lat, lon) for recognizable continents."""
    continents = [
        # North America
        ([70, 60, 50, 30, 20, 15, 25, 30, 45, 55, 70], [-160, -140, -125, -115, -100, -85, -80, -75, -60, -60, -160]),
        # South America
        ([10, 0, -20, -50, -55, -40, -10, 0, 10], [-75, -80, -70, -70, -65, -40, -35, -50, -75]),
        # Eurasia
        ([70, 70, 40, 35, 10, 20, 40, 55, 65, 70], [30, 170, 120, 75, 75, 45, 25, 10, 20, 30]),
        # Africa
        ([35, 15, -35, -30, 5, 30, 35], [-5, 45, 25, 15, 10, 30, -5]),
        # Australia
        ([-15, -20, -35, -35, -20, -15], [130, 150, 145, 115, 115, 130]),
    ]
    lines_x, lines_y, lines_z = [], [], []
    for lats, lons in continents:
        for lat_deg, lon_deg in zip(lats, lons):
            phi = math.radians(lat_deg)
            lam = math.radians(lon_deg)
            r = EARTH_RADIUS_KM * 1.002
            lines_x.append(r * math.cos(phi) * math.cos(lam))
            lines_y.append(r * math.cos(phi) * math.sin(lam))
            lines_z.append(r * math.sin(phi))
        lines_x.append(None)
        lines_y.append(None)
        lines_z.append(None)
    return lines_x, lines_y, lines_z


def create_orbit_figure(timeline: list[dict[str, Any]], current_step_idx: Optional[int] = None) -> go.Figure:
    """Creates a 3D Earth globe with the AI Data Center satellite orbiting/rounding Earth.
    
    Args:
        timeline: List of simulation step dicts containing 'orbital_state'.
        current_step_idx: Index of current step to position the AI Data Center & radiator.
    """
    fig = go.Figure()

    # 1. Earth Sphere
    u = np.linspace(0, 2 * np.pi, 60)
    v = np.linspace(0, np.pi, 30)
    x_earth = EARTH_RADIUS_KM * np.outer(np.cos(u), np.sin(v))
    y_earth = EARTH_RADIUS_KM * np.outer(np.sin(u), np.sin(v))
    z_earth = EARTH_RADIUS_KM * np.outer(np.ones(np.size(u)), np.cos(v))

    # Dark blue marble sphere
    fig.add_surface(
        x=x_earth, y=y_earth, z=z_earth,
        colorscale=[
            [0.0, "#08162b"],
            [0.5, "#0d274c"],
            [1.0, "#163e75"],
        ],
        showscale=False,
        opacity=0.92,
        hoverinfo="skip",
        name="Earth (Radius 6,378 km)"
    )

    # Continent outlines for realistic Earth rounding
    cx, cy, cz = _get_continent_outlines()
    fig.add_trace(go.Scatter3d(
        x=cx, y=cy, z=cz,
        mode="lines",
        line=dict(color="#3dd68c", width=2),
        hoverinfo="skip",
        name="Continents",
        showlegend=False
    ))

    # Equator ring
    theta = np.linspace(0, 2 * np.pi, 100)
    r_eq = EARTH_RADIUS_KM * 1.003
    fig.add_trace(go.Scatter3d(
        x=r_eq * np.cos(theta),
        y=r_eq * np.sin(theta),
        z=np.zeros_like(theta),
        mode="lines",
        line=dict(color="rgba(0, 229, 255, 0.4)", width=2, dash="dash"),
        hoverinfo="skip",
        name="Equator",
        showlegend=False
    ))

    if not timeline:
        return fig

    # 2. Compute 3D Orbit coordinates & segments
    # Separate segments into DEEP_SPACE (green), EARTH_DAY (red), ECLIPSE (blue)
    deep_space_x, deep_space_y, deep_space_z = [], [], []
    earth_day_x, earth_day_y, earth_day_z = [], [], []
    eclipse_x, eclipse_y, eclipse_z = [], [], []

    all_x, all_y, all_z = [], [], []
    hover_texts = []

    for i, step in enumerate(timeline):
        state = step["orbital_state"]
        
        # Use position_km if available, else derive from lat/lon/alt
        if "position_km" in state and state["position_km"]:
            px, py, pz = state["position_km"]
        else:
            phi = math.radians(state["latitude_deg"])
            lam = math.radians(state["longitude_deg"])
            r = EARTH_RADIUS_KM + state["altitude_km"]
            px = r * math.cos(phi) * math.cos(lam)
            py = r * math.cos(phi) * math.sin(lam)
            pz = r * math.sin(phi)

        all_x.append(px)
        all_y.append(py)
        all_z.append(pz)

        facing = state["radiator_facing"]
        is_sun = state["is_sunlit"]
        cool_w = state["max_cooling_capacity_watts"]
        sink_k = state["sink_temperature_kelvin"]
        solar_w = state["solar_power_watts"]

        hover_text = (
            f"<b>Time:</b> {str(step.get('time', ''))[:19]}<br>"
            f"<b>Orbit Phase:</b> {'SUNLIT' if is_sun else 'ECLIPSE'}<br>"
            f"<b>Radiator Facing:</b> {facing}<br>"
            f"<b>Sink Temp:</b> {sink_k} K<br>"
            f"<b>Cooling Cap:</b> {cool_w:.1f} W<br>"
            f"<b>Solar Power:</b> {solar_w:.1f} W"
        )
        hover_texts.append(hover_text)

        # Connect segments: To draw continuous colored lines in Plotly, we add points to matching buckets.
        # Check current phase
        if not is_sun:
            cat = "ECLIPSE"
        elif facing == "DEEP_SPACE":
            cat = "DEEP_SPACE"
        else:
            cat = "EARTH_DAY"

        # Also connect to previous point if same or boundary
        if cat == "DEEP_SPACE":
            deep_space_x.append(px); deep_space_y.append(py); deep_space_z.append(pz)
            earth_day_x.append(None); earth_day_y.append(None); earth_day_z.append(None)
            eclipse_x.append(None); eclipse_y.append(None); eclipse_z.append(None)
        elif cat == "EARTH_DAY":
            earth_day_x.append(px); earth_day_y.append(py); earth_day_z.append(pz)
            deep_space_x.append(None); deep_space_y.append(None); deep_space_z.append(None)
            eclipse_x.append(None); eclipse_y.append(None); eclipse_z.append(None)
        else:
            eclipse_x.append(px); eclipse_y.append(py); eclipse_z.append(pz)
            deep_space_x.append(None); deep_space_y.append(None); deep_space_z.append(None)
            earth_day_x.append(None); earth_day_y.append(None); earth_day_z.append(None)

    # Add the three colored orbit traces
    fig.add_trace(go.Scatter3d(
        x=deep_space_x, y=deep_space_y, z=deep_space_z,
        mode="lines",
        line=dict(color="#00ff66", width=6),
        name="🟢 DEEP_SPACE (3K Cold Sky | ~909W Cooling)",
        hoverinfo="skip"
    ))

    fig.add_trace(go.Scatter3d(
        x=earth_day_x, y=earth_day_y, z=earth_day_z,
        mode="lines",
        line=dict(color="#ff3344", width=6),
        name="🔴 EARTH_DAY (280K Earth IR | ~491W Cooling)",
        hoverinfo="skip"
    ))

    fig.add_trace(go.Scatter3d(
        x=eclipse_x, y=eclipse_y, z=eclipse_z,
        mode="lines",
        line=dict(color="#0088ff", width=6),
        name="🔵 ECLIPSE (Shadow | 0W Solar | Battery Mode)",
        hoverinfo="skip"
    ))

    # Add invisible hover points for complete telemetry inspectability
    fig.add_trace(go.Scatter3d(
        x=all_x, y=all_y, z=all_z,
        mode="markers",
        marker=dict(size=2, color="rgba(255,255,255,0.01)"),
        hovertext=hover_texts,
        hoverinfo="text",
        name="Telemetry Points",
        showlegend=False
    ))

    # 3. AI Data Center Satellite and Radiator orientation at current_step_idx
    total_points = len(all_x)
    if total_points > 0:
        idx = current_step_idx if current_step_idx is not None else 0
        idx = min(max(idx, 0), total_points - 1)
        sat_x = all_x[idx]
        sat_y = all_y[idx]
        sat_z = all_z[idx]
        cur_step = timeline[idx]
        cur_state = cur_step["orbital_state"]
        cur_facing = cur_state.get("radiator_facing", "DEEP_SPACE")
        cur_sun = cur_state.get("is_sunlit", True)
        cur_task = cur_step.get("task_running", "Idle") or "Idle"
        cur_temp = cur_step.get("temperature_c", 45.0)

        # AI Data Center Core payload marker
        fig.add_trace(go.Scatter3d(
            x=[sat_x], y=[sat_y], z=[sat_z],
            mode="markers+text",
            marker=dict(
                color="#ffcc00",
                size=12,
                symbol="diamond",
                line=dict(color="#ffffff", width=2)
            ),
            text=[f"🛰️ AI Data Center ({cur_task})"],
            textposition="top center",
            textfont=dict(color="#ffffff", size=12),
            name="🛰️ LumenOS Satellite (AI Data Center)",
            hovertext=[f"<b>AI Data Center Satellite</b><br>T={cur_temp:.1f}°C<br>Task: {cur_task}<br>Status: {cur_step.get('thermal_status', 'NOMINAL')}"],
            hoverinfo="text"
        ))

        # Radiator Normal Vector (pointing towards space or earth)
        # Vector arrow length: 1800 km in 3D scene
        arrow_len = 1800.0
        if "radiator_normal" in cur_state and cur_state["radiator_normal"]:
            nx, ny, nz = cur_state["radiator_normal"]
        else:
            # Fallback normal: outward from Earth if deep space, inward if earth day
            dist = math.sqrt(sat_x**2 + sat_y**2 + sat_z**2)
            sign = 1.0 if cur_facing == "DEEP_SPACE" else -1.0
            nx, ny, nz = sign * sat_x / dist, sign * sat_y / dist, sign * sat_z / dist

        rad_end_x = sat_x + nx * arrow_len
        rad_end_y = sat_y + ny * arrow_len
        rad_end_z = sat_z + nz * arrow_len

        rad_color = "#00ff66" if cur_facing == "DEEP_SPACE" else ("#ff3344" if cur_facing == "EARTH_DAY" else "#00e5ff")
        fig.add_trace(go.Scatter3d(
            x=[sat_x, rad_end_x],
            y=[sat_y, rad_end_y],
            z=[sat_z, rad_end_z],
            mode="lines+markers",
            line=dict(color=rad_color, width=7),
            marker=dict(size=[0, 8], color=rad_color, symbol="diamond"),
            name=f"📐 Radiator Normal ({cur_facing})",
            hovertext=[None, f"Radiator Vector: {cur_facing}<br>Sink: {cur_state.get('sink_temperature_kelvin')} K"],
            hoverinfo="text"
        ))

        # Solar panels / Sun direction vector
        if cur_sun and "sun_vector" in cur_state and cur_state["sun_vector"]:
            sx, sy, sz = cur_state["sun_vector"]
            sun_end_x = sat_x + sx * arrow_len
            sun_end_y = sat_y + sy * arrow_len
            sun_end_z = sat_z + sz * arrow_len

            fig.add_trace(go.Scatter3d(
                x=[sat_x, sun_end_x],
                y=[sat_y, sun_end_y],
                z=[sat_z, sun_end_z],
                mode="lines",
                line=dict(color="#ffd700", width=4, dash="dot"),
                name="☀️ Solar Radiation Vector",
                hoverinfo="skip"
            ))

    # Layout styling: deep space cosmos theme
    fig.update_layout(
        scene=dict(
            xaxis=dict(showbackground=False, showgrid=False, zeroline=False, showticklabels=False, title=""),
            yaxis=dict(showbackground=False, showgrid=False, zeroline=False, showticklabels=False, title=""),
            zaxis=dict(showbackground=False, showgrid=False, zeroline=False, showticklabels=False, title=""),
            aspectmode="data",
            camera=dict(
                eye=dict(x=1.6, y=1.6, z=1.2),
                up=dict(x=0, y=0, z=1)
            )
        ),
        margin=dict(l=0, r=0, b=0, t=10),
        paper_bgcolor="#090d16",
        plot_bgcolor="#090d16",
        legend=dict(
            x=0.02, y=0.98,
            font=dict(color="#d0d7de", size=11),
            bgcolor="rgba(13, 17, 23, 0.8)",
            bordercolor="rgba(255, 255, 255, 0.15)",
            borderwidth=1,
        )
    )

    return fig
