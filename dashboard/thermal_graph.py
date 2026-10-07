import plotly.graph_objects as go
from plotly.subplots import make_subplots

def create_thermal_figure(timeline_lumen, timeline_naive):
    """
    Creates a 2-subplot timeline:
    1. Temperature (°C) for LumenOS (blue) and Naive (red), with SHUTDOWN zone shaded (> 85°C).
    2. Workload heat vs Cooling capacity for LumenOS.
    """
    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.1,
        subplot_titles=("Temperature (°C)", "Workload Heat vs Cooling Capacity (Watts)")
    )

    times = [step["time"] for step in timeline_lumen]
    times_naive = [step["time"] for step in timeline_naive]

    temp_lumen = [step["temperature_c"] for step in timeline_lumen]
    temp_naive = [step["temperature_c"] for step in timeline_naive]

    # Subplot 1: Temperature
    fig.add_trace(
        go.Scatter(x=times, y=temp_lumen, mode='lines', name='LumenOS', line=dict(color='blue', width=2)),
        row=1, col=1
    )
    fig.add_trace(
        go.Scatter(x=times_naive, y=temp_naive, mode='lines', name='Naive', line=dict(color='red', width=2)),
        row=1, col=1
    )

    # Shade SHUTDOWN zone (> 85°C)
    fig.add_hrect(
        y0=85, y1=max(max(temp_naive), 100),
        fillcolor="red", opacity=0.2,
        layer="below", line_width=0,
        row=1, col=1,
        annotation_text="SHUTDOWN ZONE", annotation_position="top left"
    )

    # Subplot 2: Workload / Cooling
    cooling = [step["cooling_watts"] for step in timeline_lumen]
    task_heat = [step["task_heat_watts"] for step in timeline_lumen]
    
    fig.add_trace(
        go.Scatter(x=times, y=cooling, mode='lines', name='Max Cooling', line=dict(color='cyan', dash='dash')),
        row=2, col=1
    )
    fig.add_trace(
        go.Scatter(x=times, y=task_heat, mode='lines', name='LumenOS Heat', fill='tozeroy', line=dict(color='orange')),
        row=2, col=1
    )

    fig.update_layout(
        height=600,
        margin=dict(l=40, r=40, t=40, b=40),
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )

    fig.update_yaxes(title_text="Temperature (°C)", row=1, col=1)
    fig.update_yaxes(title_text="Watts", row=2, col=1)

    return fig
