"""Thermal and Power Telemetry Visualizer for LumenOS.

NASA Space Apps 2026 — "Space Mission Design Game"
===================================================
Visualizes the telemetry outputs that evaluate participant engineering decisions:
1. Core Spacecraft Temperature: LumenOS (predictive thermal control) vs Naive (thermally blind baseline)
   - Shaded safety regimes: NOMINAL (<60°C), WARNING (60-80°C), CRITICAL (80-95°C), SHUTDOWN (>=95°C)
   - Synchronized indicator for the active simulation step.
2. Resource Budget Dynamics:
   - Dynamic Radiator Heat Rejection Capacity (W)
   - Payload Workload Heat Dissipation (W)
   - Battery State of Charge (%)
"""

from typing import Any, Optional
import plotly.graph_objects as go
from plotly.subplots import make_subplots


def create_thermal_figure(
    timeline_lumen: list[dict[str, Any]],
    timeline_naive: list[dict[str, Any]],
    current_step_idx: Optional[int] = None,
) -> go.Figure:
    """Creates an aerospace telemetry dashboard chart comparing LumenOS and Naive schedulers."""
    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.12,
        subplot_titles=(
            "<b>Hardware Temperature (°C) — LumenOS vs Naive</b>",
            "<b>Thermal Dissipation (Watts) & Battery Level (%)</b>"
        )
    )

    times = [step["time"] for step in timeline_lumen]
    times_naive = [step["time"] for step in timeline_naive]

    temp_lumen = [step["temperature_c"] for step in timeline_lumen]
    temp_naive = [step["temperature_c"] for step in timeline_naive]

    # --- Subplot 1: Temperature curves ---
    fig.add_trace(
        go.Scatter(
            x=times, y=temp_lumen,
            mode="lines",
            name="LumenOS (Active Hypervisor)",
            line=dict(color="#00e5ff", width=2.5),
            hovertemplate="LumenOS Temp: %{y:.1f}°C<extra></extra>"
        ),
        row=1, col=1
    )

    fig.add_trace(
        go.Scatter(
            x=times_naive, y=temp_naive,
            mode="lines",
            name="Naive Baseline (Blind)",
            line=dict(color="#ff3344", width=2.5, dash="dot"),
            hovertemplate="Naive Temp: %{y:.1f}°C<extra></extra>"
        ),
        row=1, col=1
    )

    # Threshold horizontal reference lines
    fig.add_hline(
        y=95.0, line_dash="dash", line_color="#ff1744", line_width=1.5,
        annotation_text="HARD SHUTDOWN (95°C)", annotation_position="top right",
        annotation_font=dict(color="#ff1744", size=10),
        row=1, col=1
    )
    fig.add_hline(
        y=80.0, line_dash="dot", line_color="#ff9100", line_width=1.2,
        annotation_text="CRITICAL (80°C)", annotation_position="top right",
        annotation_font=dict(color="#ff9100", size=10),
        row=1, col=1
    )
    fig.add_hline(
        y=60.0, line_dash="dot", line_color="#ffd600", line_width=1.2,
        annotation_text="WARNING (60°C)", annotation_position="top right",
        annotation_font=dict(color="#ffd600", size=10),
        row=1, col=1
    )

    # Hard Shutdown Danger Zone shading
    max_t = max(max(temp_naive, default=100.0), 100.0)
    fig.add_hrect(
        y0=95.0, y1=max_t + 5,
        fillcolor="rgba(255, 23, 68, 0.18)",
        layer="below", line_width=0,
        row=1, col=1
    )

    # --- Subplot 2: Heat Dissipation, Cooling & Battery ---
    cooling = [step["cooling_watts"] for step in timeline_lumen]
    task_heat = [step["task_heat_watts"] for step in timeline_lumen]
    battery_pct = [step.get("battery_percent", 100.0) for step in timeline_lumen]

    fig.add_trace(
        go.Scatter(
            x=times, y=cooling,
            mode="lines",
            name="Radiator Cooling Capacity",
            line=dict(color="#00e676", width=2, dash="dash"),
            hovertemplate="Cooling Cap: %{y:.1f} W<extra></extra>"
        ),
        row=2, col=1
    )

    fig.add_trace(
        go.Scatter(
            x=times, y=task_heat,
            mode="lines",
            name="Payload Heat Generation",
            fill="tozeroy",
            line=dict(color="#ff9100", width=2),
            fillcolor="rgba(255, 145, 0, 0.25)",
            hovertemplate="Payload Heat: %{y:.1f} W<extra></extra>"
        ),
        row=2, col=1
    )

    fig.add_trace(
        go.Scatter(
            x=times, y=battery_pct,
            mode="lines",
            name="Battery SoC (%)",
            line=dict(color="#d500f9", width=1.8, dash="dot"),
            hovertemplate="Battery SoC: %{y:.1f}%<extra></extra>"
        ),
        row=2, col=1
    )

    # Highlight current inspected step with vertical cursor line
    if current_step_idx is not None and 0 <= current_step_idx < len(times):
        cur_time = times[current_step_idx]
        fig.add_vline(
            x=cur_time,
            line_width=2,
            line_dash="solid",
            line_color="#ffd700",
            row="all"
        )

    fig.update_layout(
        height=580,
        margin=dict(l=50, r=30, t=40, b=30),
        hovermode="x unified",
        paper_bgcolor="#090d16",
        plot_bgcolor="#0d1424",
        font=dict(color="#d0d7de", family="Inter, system-ui, sans-serif"),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            bgcolor="rgba(13, 17, 23, 0.8)",
            bordercolor="rgba(255, 255, 255, 0.15)",
            borderwidth=1,
        )
    )

    fig.update_xaxes(
        gridcolor="rgba(255, 255, 255, 0.08)",
        zerolinecolor="rgba(255, 255, 255, 0.12)",
        row=1, col=1
    )
    fig.update_xaxes(
        gridcolor="rgba(255, 255, 255, 0.08)",
        zerolinecolor="rgba(255, 255, 255, 0.12)",
        title_text="Simulation UTC Time",
        row=2, col=1
    )
    fig.update_yaxes(
        gridcolor="rgba(255, 255, 255, 0.08)",
        zerolinecolor="rgba(255, 255, 255, 0.12)",
        title_text="Temp (°C)",
        row=1, col=1
    )
    fig.update_yaxes(
        gridcolor="rgba(255, 255, 255, 0.08)",
        zerolinecolor="rgba(255, 255, 255, 0.12)",
        title_text="Watts / %",
        row=2, col=1
    )

    return fig
