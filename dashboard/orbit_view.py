"""3D Space & Orbital Mechanics Visualizer for LumenOS.

NASA Space Apps 2026 — "Space Mission Design Game"
===================================================
Visualizes competing orbital mechanics, Earth geography, atmosphere, and the
Primary Payload Orbital Data Center in real-time 3D:

1. THE SUN — radiant star providing the solar power budget across the orbit.
2. DEEP SPACE — cold cosmic background (3 K radiative sink) with a starfield.
3. EARTH — a physically lit sphere: Plotly surface lighting shades the day side
   warmly and leaves the night side as a dim blue silhouette, so the planet
   reads as a real 3D globe. Continents, oceans, deserts and polar ice use a
   terrain colour ramp.
4. PRIMARY PAYLOAD DATA CENTER — dual solar wings, a compute chassis, and a
   radiator panel whose normal tracks the current view factor (deep space /
   Earth-day / Earth-night). The radiator glows green, blue or red to match.

Two entry points are exported:

* :func:`create_orbit_figure` — a static figure for ``st.plotly_chart``.
* :func:`create_orbit_animation_html` — a self-contained HTML document whose
  spacecraft traces animate client-side inside ``st.components.v1.html``. This
  is what keeps the 3D view smooth: the WebGL canvas is mounted once per turn
  and then interpolated in the browser instead of being torn down and rebuilt
  on every simulation step (which caused the old flashing / disappearing bug).
"""

import math
from typing import Any, Optional

import numpy as np
import plotly.graph_objects as go

EARTH_RADIUS_KM = 6378.137

# ─────────────────────────────────────────────────────────────────────────────
# STARFIELD
# ─────────────────────────────────────────────────────────────────────────────
np.random.seed(42)
_n_stars = 160
_star_theta = np.random.uniform(0, 2 * np.pi, _n_stars)
_star_phi = np.random.uniform(0, np.pi, _n_stars)
_star_r = np.random.uniform(9500, 14500, _n_stars)
STAR_X = (_star_r * np.sin(_star_phi) * np.cos(_star_theta)).tolist()
STAR_Y = (_star_r * np.sin(_star_phi) * np.sin(_star_theta)).tolist()
STAR_Z = (_star_r * np.cos(_star_phi)).tolist()
STAR_SIZES = np.random.uniform(1.0, 2.4, _n_stars).tolist()

# ─────────────────────────────────────────────────────────────────────────────
# EARTH SURFACE GEOMETRY (built once — reused for every animation frame)
# ─────────────────────────────────────────────────────────────────────────────
_N_LON = 64
_N_LAT = 32
_U = np.linspace(-np.pi, np.pi, _N_LON)
_V = np.linspace(0.0, np.pi, _N_LAT)
_U_GRID, _V_GRID = np.meshgrid(_U, _V)

_XE = EARTH_RADIUS_KM * np.sin(_V_GRID) * np.cos(_U_GRID)
_YE = EARTH_RADIUS_KM * np.sin(_V_GRID) * np.sin(_U_GRID)
_ZE = EARTH_RADIUS_KM * np.cos(_V_GRID)

_ATM_RADIUS = EARTH_RADIUS_KM * 1.035
_AX = _ATM_RADIUS * np.sin(_V_GRID) * np.cos(_U_GRID)
_AY = _ATM_RADIUS * np.sin(_V_GRID) * np.sin(_U_GRID)
_AZ = _ATM_RADIUS * np.cos(_V_GRID)

_LAT_RAD = (np.pi / 2.0) - _V_GRID
_LON_RAD = _U_GRID


def _landmass(lat_rad: np.ndarray, lon_rad: np.ndarray) -> np.ndarray:
    """Smooth approximation of Earth's major landmasses (0 = ocean, 1 = land)."""
    lat_deg = np.degrees(lat_rad)
    lon_deg = np.degrees(lon_rad)

    blobs = [
        # North America
        (47.0, -100.0, 20.0, 34.0),
        (60.0, -105.0, 12.0, 30.0),
        (32.0, -98.0, 10.0, 16.0),
        # Greenland
        (72.0, -42.0, 11.0, 16.0),
        # South America
        (-8.0, -58.0, 18.0, 16.0),
        (-25.0, -62.0, 16.0, 11.0),
        # Europe
        (50.0, 18.0, 13.0, 22.0),
        (62.0, 18.0, 10.0, 18.0),
        # Africa
        (8.0, 20.0, 26.0, 20.0),
        (-20.0, 25.0, 20.0, 14.0),
        # Middle East / Arabia
        (24.0, 45.0, 10.0, 12.0),
        # Asia
        (48.0, 88.0, 24.0, 46.0),
        (64.0, 100.0, 16.0, 45.0),
        # India / South Asia
        (20.0, 78.0, 11.0, 13.0),
        # SE Asia / Indonesia
        (5.0, 118.0, 10.0, 16.0),
        # Australia
        (-25.0, 134.0, 13.0, 18.0),
        # Antarctica
        (-84.0, 0.0, 12.0, 200.0),
    ]

    land = np.zeros_like(lat_deg, dtype=float)
    for c_lat, c_lon, r_lat, r_lon in blobs:
        d_lat = (lat_deg - c_lat) / r_lat
        d_lon = (lon_deg - c_lon) / r_lon
        d_lon = np.minimum(np.abs(d_lon), np.abs((lon_deg - c_lon + 360.0) / r_lon))
        d_lon = np.minimum(d_lon, np.abs((lon_deg - c_lon - 360.0) / r_lon))
        land += np.exp(-(d_lat**2 + d_lon**2) * 1.7)

    # Break up the smooth blobs so the coastlines look less artificial.
    coast = (
        0.16 * np.sin(np.radians(lon_deg) * 7.0) * np.cos(np.radians(lat_deg) * 5.0)
        + 0.09 * np.sin(np.radians(lon_deg) * 13.0 + 1.7) * np.sin(np.radians(lat_deg) * 9.0)
    )
    land = land * (1.0 + coast)
    return np.clip(land, 0.0, 1.0)


def _build_earth_terrain() -> np.ndarray:
    """Terrain colour scalar for every vertex: ocean (low) → land → ice (high)."""
    land = _landmass(_LAT_RAD, _LON_RAD)
    lat_deg = np.degrees(_LAT_RAD)

    # Ocean depth variation (shelf near coasts, deep mid-ocean).
    ocean = 0.05 + 0.12 * (1.0 - land)
    terrain = np.where(land > 0.42, 0.34 + 0.46 * land, ocean)

    # Polar ice caps.
    ice_lat = (np.abs(lat_deg) - 62.0) / 20.0
    ice = np.clip(ice_lat, 0.0, 1.0)
    terrain = terrain + (0.9 - terrain) * ice
    return np.clip(terrain, 0.0, 1.0)


_TERRAIN = _build_earth_terrain()

#: Ocean blue → coastline → vegetation → desert → snow/ice.
_EARTH_SCALE = [
    [0.00, "#061a2e"],
    [0.12, "#0a2f52"],
    [0.24, "#12588c"],
    [0.30, "#2e86c1"],
    [0.36, "#1d7a4a"],
    [0.55, "#2f8f43"],
    [0.70, "#9c7a34"],
    [0.82, "#d8d2c2"],
    [0.92, "#eef3f7"],
    [1.00, "#ffffff"],
]


def _lightposition(vec: np.ndarray, distance: float) -> dict[str, float]:
    """Light position dict in scene coordinates, offset toward the Sun."""
    p = vec / max(float(np.linalg.norm(vec)), 1e-9) * distance
    return {"x": float(p[0]), "y": float(p[1]), "z": float(p[2])}


def _sun_direction(timeline: list[dict[str, Any]]) -> np.ndarray:
    """Unit vector pointing from Earth toward the Sun for this orbit."""
    sun_hat = np.array([1.0, 0.0, 0.0])
    if timeline and "orbital_state" in timeline[0]:
        sv = timeline[0]["orbital_state"].get("sun_vector")
        if sv:
            sun_hat = np.array(sv, dtype=float)
            norm = float(np.linalg.norm(sun_hat))
            if norm > 1e-9:
                sun_hat = sun_hat / norm
    return sun_hat


def _position_km(state: dict[str, Any]) -> tuple[float, float, float]:
    """Resolve a step's shell position (km), falling back to lat/lon/altitude."""
    if state.get("position_km"):
        px, py, pz = state["position_km"]
        return float(px), float(py), float(pz)
    phi = math.radians(state["latitude_deg"])
    lam = math.radians(state["longitude_deg"])
    r = EARTH_RADIUS_KM + state["altitude_km"]
    return (
        r * math.cos(phi) * math.cos(lam),
        r * math.cos(phi) * math.sin(lam),
        r * math.sin(phi),
    )


def _scene_traces(
    timeline: list[dict[str, Any]],
    sun_hat: np.ndarray,
) -> list[go.Scatter3d | go.Surface]:
    """Static scene traces shared by every step: stars, Sun, rays, Earth, orbit."""
    traces: list[Any] = []

    # ── Deep space starfield ──────────────────────────────────────────────
    traces.append(go.Scatter3d(
        x=STAR_X, y=STAR_Y, z=STAR_Z,
        mode="markers",
        marker=dict(size=STAR_SIZES, color="#dbe6f2", opacity=0.85),
        hoverinfo="skip", showlegend=False, name="Stars",
    ))

    sun_dist = 11500.0
    sun_pos = sun_hat * sun_dist

    # ── Sun (small bright core + soft corona glow) ────────────────────────
    traces.append(go.Scatter3d(
        x=[sun_pos[0]], y=[sun_pos[1]], z=[sun_pos[2]],
        mode="markers",
        marker=dict(size=52, color="#ffb703", opacity=0.10),
        hoverinfo="skip", showlegend=False, name="Corona-outer",
    ))
    traces.append(go.Scatter3d(
        x=[sun_pos[0]], y=[sun_pos[1]], z=[sun_pos[2]],
        mode="markers",
        marker=dict(size=30, color="#ffca3a", opacity=0.28),
        hoverinfo="skip", showlegend=False, name="Corona-inner",
    ))
    traces.append(go.Scatter3d(
        x=[sun_pos[0]], y=[sun_pos[1]], z=[sun_pos[2]],
        mode="markers+text",
        marker=dict(size=16, color="#ffca3a", symbol="circle",
                    line=dict(color="#fff8e1", width=2)),
        text=["SUN"], textposition="top center",
        textfont=dict(color="#ffd166", size=12, family="JetBrains Mono, monospace"),
        name="Sun",
        hovertext=["Sun · 1361 W/m² solar flux"], hoverinfo="text",
    ))

    # ── Sunlight rays ─────────────────────────────────────────────────────
    ray_starts, ray_ends = [], []
    for angle in np.linspace(0.0, 2 * np.pi, 8, endpoint=False):
        perp = np.array([-sun_hat[1], sun_hat[0], 0.0])
        if np.linalg.norm(perp) < 1e-4:
            perp = np.array([0.0, -sun_hat[2], sun_hat[1]])
        perp = perp / np.linalg.norm(perp)
        norm2 = np.cross(sun_hat, perp)
        offset = (math.cos(angle) * perp + math.sin(angle) * norm2) * 1400.0
        ray_starts.append(sun_pos * 0.85 + offset)
        ray_ends.append(sun_hat * (EARTH_RADIUS_KM * 1.4) + offset * 0.55)

    rx, ry, rz = [], [], []
    for s, e in zip(ray_starts, ray_ends):
        rx.extend([s[0], e[0], None])
        ry.extend([s[1], e[1], None])
        rz.extend([s[2], e[2], None])
    traces.append(go.Scatter3d(
        x=rx, y=ry, z=rz, mode="lines",
        line=dict(color="rgba(255, 209, 102, 0.32)", width=2, dash="dash"),
        hoverinfo="skip", showlegend=False, name="Rays",
    ))

    # ── Earth: physically lit sphere ──────────────────────────────────────
    # Low ambient + full diffuse so the sunlit hemisphere blazes while the
    # deep-space night side falls to a dark silhouette — the day/night split
    # must be obvious to a judge at a glance.
    light_pos = _lightposition(sun_hat, 45000.0)
    traces.append(go.Surface(
        x=_XE, y=_YE, z=_ZE,
        surfacecolor=_TERRAIN, cmin=0.0, cmax=1.0,
        colorscale=_EARTH_SCALE,
        showscale=False, opacity=1.0,
        lighting=dict(ambient=0.06, diffuse=1.0, specular=0.30,
                      roughness=0.80, fresnel=0.10),
        lightposition=light_pos,
        hoverinfo="text",
        hovertext="Earth · 280 K day-side IR / 220 K night-side IR",
        name="Earth",
    ))

    # ── Atmosphere glow shell ─────────────────────────────────────────────
    traces.append(go.Surface(
        x=_AX, y=_AY, z=_AZ,
        surfacecolor=np.zeros_like(_XE),
        cmin=0.0, cmax=1.0,
        colorscale=[[0.0, "#5aa9f0"], [1.0, "#5aa9f0"]],
        showscale=False, opacity=0.16,
        lighting=dict(ambient=1.0, diffuse=0.0, specular=0.0),
        hoverinfo="skip", showlegend=False, name="Atmosphere",
    ))

    # ── Day/night terminator ring ─────────────────────────────────────────
    t_angles = np.linspace(0.0, 2 * np.pi, 90)
    t_v1 = np.array([-sun_hat[1], sun_hat[0], 0.0])
    if np.linalg.norm(t_v1) < 1e-4:
        t_v1 = np.array([0.0, -sun_hat[2], sun_hat[1]])
    t_v1 = t_v1 / np.linalg.norm(t_v1)
    t_v2 = np.cross(sun_hat, t_v1)
    r_term = EARTH_RADIUS_KM * 1.006
    term = (
        np.outer(np.cos(t_angles), t_v1) + np.outer(np.sin(t_angles), t_v2)
    ) * r_term
    traces.append(go.Scatter3d(
        x=term[:, 0], y=term[:, 1], z=term[:, 2],
        mode="lines", line=dict(color="rgba(255, 226, 150, 0.95)", width=5),
        hoverinfo="skip", showlegend=False, name="Terminator",
    ))

    if not timeline:
        return traces

    # ── Orbit path, colour-coded by radiator view factor ──────────────────
    deep = {"x": [], "y": [], "z": []}
    earth = {"x": [], "y": [], "z": []}
    ecl = {"x": [], "y": [], "z": []}

    for step in timeline:
        state = step["orbital_state"]
        px, py, pz = _position_km(state)

        if not state.get("is_sunlit", True):
            target = ecl
        elif state.get("radiator_facing", "DEEP_SPACE") == "DEEP_SPACE":
            target = deep
        else:
            target = earth
        for bucket in (deep, earth, ecl):
            flag = bucket is target
            bucket["x"].append(px if flag else None)
            bucket["y"].append(py if flag else None)
            bucket["z"].append(pz if flag else None)

    traces.append(go.Scatter3d(
        x=deep["x"], y=deep["y"], z=deep["z"], mode="lines",
        line=dict(color="#10b981", width=5), name="Deep space (3 K)",
        hoverinfo="skip",
    ))
    traces.append(go.Scatter3d(
        x=earth["x"], y=earth["y"], z=earth["z"], mode="lines",
        line=dict(color="#f43f5e", width=5), name="Earth-facing IR",
        hoverinfo="skip",
    ))
    traces.append(go.Scatter3d(
        x=ecl["x"], y=ecl["y"], z=ecl["z"], mode="lines",
        line=dict(color="#3b82f6", width=5), name="Eclipse",
        hoverinfo="skip",
    ))
    return traces


def _spacecraft_traces(
    timeline: list[dict[str, Any]],
    current_step_idx: int,
    sun_hat: np.ndarray,
) -> list[go.Scatter3d]:
    """Satellite + radiator traces for a single timeline step (4 traces)."""
    if not timeline:
        return []

    n_points = len(timeline)
    idx = min(max(int(current_step_idx), 0), n_points - 1)
    sat_pos = np.array(_position_km(timeline[idx]["orbital_state"]))
    cur_state = timeline[idx]["orbital_state"]
    cur_facing = cur_state.get("radiator_facing", "DEEP_SPACE")
    cur_sun = cur_state.get("is_sunlit", True)
    cur_task = timeline[idx].get("task_running") or "Idle"
    display_task = "Payload · LLM" if cur_task == "LLM_Fine_Tuning" else str(cur_task).replace("_", " ")
    cur_temp = timeline[idx].get("temperature_c", 45.0)

    r_hat = sat_pos / max(float(np.linalg.norm(sat_pos)), 1e-9)

    npm = cur_state.get("radiator_normal")
    if npm:
        rad_norm = np.array(npm, dtype=float)
    else:
        rad_norm = (1.0 if cur_facing == "DEEP_SPACE" else -1.0) * r_hat
    rad_norm = rad_norm / max(float(np.linalg.norm(rad_norm)), 1e-9)

    wing_axis = np.cross(r_hat, sun_hat)
    if np.linalg.norm(wing_axis) < 1e-4:
        wing_axis = np.cross(r_hat, np.array([0.0, 0.0, 1.0]))
    wing_axis = wing_axis / np.linalg.norm(wing_axis)

    rad_color = {
        "DEEP_SPACE": "#10b981",
        "EARTH_DAY": "#f43f5e",
        "EARTH_NIGHT": "#38bdf8",
    }.get(cur_facing, "#10b981")

    traces: list[go.Scatter3d] = []

    # Solar array wings
    span = 850.0
    left = sat_pos - wing_axis * span
    right = sat_pos + wing_axis * span
    traces.append(go.Scatter3d(
        x=[left[0], sat_pos[0], right[0]],
        y=[left[1], sat_pos[1], right[1]],
        z=[left[2], sat_pos[2], right[2]],
        mode="lines+markers",
        line=dict(color="#2563eb", width=9),
        marker=dict(size=[8, 0, 8], color="#60a5fa", symbol="square"),
        name="Solar arrays", hoverinfo="skip",
    ))

    # Compute chassis
    core_color = "#38bdf8" if cur_temp < 60.0 else ("#f59e0b" if cur_temp < 80.0 else "#ef4444")
    traces.append(go.Scatter3d(
        x=[sat_pos[0]], y=[sat_pos[1]], z=[sat_pos[2]],
        mode="markers+text",
        marker=dict(size=15, color="#fbbf24", symbol="diamond",
                    line=dict(color=core_color, width=3)),
        text=[f"ODC · {cur_temp:.0f}°C"],
        textposition="top center",
        textfont=dict(color="#f8fafc", size=11, family="JetBrains Mono, monospace"),
        name="Orbital Data Center",
        hovertext=[
            f"<b>Orbital Data Center</b><br>Workload: {display_task}<br>"
            f"Core temp: {cur_temp:.1f}°C<br>Radiator facing: {cur_facing}<br>"
            f"{'Sunlit' if cur_sun else 'Eclipse · battery mode'}"
        ],
        hoverinfo="text",
    ))

    # Radiator panel
    rad_offset = sat_pos + rad_norm * 520.0
    rad_wing = np.cross(rad_norm, wing_axis)
    rad_wing = rad_wing / max(float(np.linalg.norm(rad_wing)), 1e-9) * 380.0
    p1 = rad_offset - rad_wing
    p2 = rad_offset + rad_wing
    traces.append(go.Scatter3d(
        x=[p1[0], rad_offset[0], p2[0]],
        y=[p1[1], rad_offset[1], p2[1]],
        z=[p1[2], rad_offset[2], p2[2]],
        mode="lines+markers",
        line=dict(color=rad_color, width=8),
        marker=dict(size=[7, 0, 7], color=rad_color, symbol="square"),
        name=f"Radiator · {cur_facing}", hoverinfo="skip",
    ))

    # Radiator normal vector
    arrow = sat_pos + rad_norm * 1800.0
    traces.append(go.Scatter3d(
        x=[sat_pos[0], arrow[0]],
        y=[sat_pos[1], arrow[1]],
        z=[sat_pos[2], arrow[2]],
        mode="lines+markers",
        line=dict(color=rad_color, width=5, dash="dot"),
        marker=dict(size=[0, 9], color=rad_color, symbol="diamond"),
        name=f"Radiator vector → {cur_facing}",
        hovertext=[None, f"Radiator faces: {cur_facing}"], hoverinfo="text",
    ))
    return traces


def create_orbit_figure(
    timeline: list[dict[str, Any]],
    current_step_idx: Optional[int] = None,
) -> go.Figure:
    """Build a static 3D deep-space scene for the current simulation step.

    Args:
        timeline: Full-orbit timeline rows (each with an ``orbital_state``).
        current_step_idx: Index of the live satellite marker.

    Returns:
        A styled Plotly 3D figure ready for ``st.plotly_chart``.
    """
    sun_hat = _sun_direction(timeline)
    fig = go.Figure()
    for trace in _scene_traces(timeline, sun_hat):
        fig.add_trace(trace)
    for trace in _spacecraft_traces(
        timeline,
        current_step_idx if current_step_idx is not None else 0,
        sun_hat,
    ):
        fig.add_trace(trace)
    _style_scene(fig)
    return fig


def create_orbit_animation_html(
    timeline: list[dict[str, Any]],
    from_idx: int = 0,
    to_idx: int = 0,
    height: int = 520,
) -> str:
    """Render a self-contained HTML page whose spacecraft sweeps the orbit.

    The scene (stars, Sun, Earth, orbit path) is drawn once; only the four
    spacecraft traces are keyed as Plotly animation frames between ``from_idx``
    and ``to_idx``. Plotly's ``auto_play`` then interpolates them in the browser
    on load, so the WebGL canvas is never rebuilt mid-turn — no flicker.

    Args:
        timeline: Full-orbit timeline rows (each with an ``orbital_state``).
        from_idx: First frame (inclusive) — where the sweep starts.
        to_idx: Last frame (inclusive) — where the sweep ends.
        height: Pixel height of the embedded scene.

    Returns:
        A complete HTML document string for ``st.components.v1.html``.
    """
    sun_hat = _sun_direction(timeline)
    fig = go.Figure()

    scene = _scene_traces(timeline, sun_hat)
    for trace in scene:
        fig.add_trace(trace)
    base = len(scene)

    n = len(timeline)
    if n:
        lo = max(0, min(int(from_idx), n - 1))
        hi = max(lo, min(int(to_idx), n - 1))

        # Seed the plot at the first frame so playback starts seamlessly.
        for trace in _spacecraft_traces(timeline, lo, sun_hat):
            fig.add_trace(trace)

        frames = []
        for i in range(lo, hi + 1):
            data = _spacecraft_traces(timeline, i, sun_hat)
            if not data:
                continue
            frames.append(go.Frame(
                data=data,
                traces=list(range(base, base + len(data))),
                name=str(i),
            ))
        fig.frames = frames

    _style_scene(fig, height=height)

    config = {"displayModeBar": False, "responsive": True}
    n_frames = len(fig.frames)
    if n_frames > 1:
        # ~1.2 s for a 5-minute turn (10 frames), capped at ~7 s for a
        # full-orbit autoplay (180 frames).
        target_ms = 1200 if n_frames <= 14 else 7000
        duration = max(40, min(400, int(target_ms / n_frames)))
        return fig.to_html(
            include_plotlyjs="cdn",
            full_html=True,
            div_id="orbit3d",
            config=config,
            auto_play=True,
            animation_opts={
                "frame": {"duration": duration, "redraw": True},
                "transition": {"duration": 0},
                "mode": "immediate",
                "fromcurrent": False,
            },
        )
    return fig.to_html(
        include_plotlyjs="cdn",
        full_html=True,
        div_id="orbit3d",
        config=config,
        auto_play=False,
    )


def _style_scene(fig: go.Figure, height: int = 520) -> None:
    """Apply the shared dark aerospace scene styling."""
    fig.update_layout(
        height=height,
        scene=dict(
            xaxis=dict(visible=False),
            yaxis=dict(visible=False),
            zaxis=dict(visible=False),
            aspectmode="data",
            bgcolor="#040711",
            camera=dict(eye=dict(x=0.35, y=-1.55, z=1.0), up=dict(x=0, y=0, z=1)),
        ),
        margin=dict(l=0, r=0, b=0, t=0),
        paper_bgcolor="#040711",
        legend=dict(
            x=0.01, y=0.99,
            font=dict(color="#cbd5e1", size=10, family="JetBrains Mono, monospace"),
            bgcolor="rgba(8, 13, 24, 0.82)",
            bordercolor="rgba(255, 255, 255, 0.12)", borderwidth=1,
        ),
    )
