import math
import numpy as np
import plotly.graph_objects as go

def create_orbit_figure(timeline):
    """
    Creates a 3D globe with color-coded orbit path and current satellite marker.
    GREEN = DEEP_SPACE (good cooling)
    RED = EARTH_DAY (poor cooling)
    BLUE = ECLIPSE (no solar)
    """
    # Create Earth sphere
    u = np.linspace(0, 2 * np.pi, 50)
    v = np.linspace(0, np.pi, 50)
    x_earth = 6378.137 * np.outer(np.cos(u), np.sin(v))
    y_earth = 6378.137 * np.outer(np.sin(u), np.sin(v))
    z_earth = 6378.137 * np.outer(np.ones(np.size(u)), np.cos(v))

    fig = go.Figure()

    # Add Earth
    fig.add_surface(
        x=x_earth, y=y_earth, z=z_earth,
        colorscale=[[0, '#102040'], [1, '#102040']],
        showscale=False,
        opacity=0.8,
        hoverinfo='skip'
    )

    # Calculate 3D coordinates for the orbit path
    x_orbit = []
    y_orbit = []
    z_orbit = []
    colors = []
    
    for step in timeline:
        state = step["orbital_state"]
        lat = math.radians(state["latitude_deg"])
        lon = math.radians(state["longitude_deg"])
        r = 6378.137 + state["altitude_km"]

        x_orbit.append(r * math.cos(lat) * math.cos(lon))
        y_orbit.append(r * math.cos(lat) * math.sin(lon))
        z_orbit.append(r * math.sin(lat))

        if not state["is_sunlit"]:
            colors.append("blue")
        elif state["radiator_facing"] == "DEEP_SPACE":
            colors.append("green")
        elif state["radiator_facing"] == "EARTH_DAY":
            colors.append("red")
        else:
            colors.append("orange") # Fallback

    # Add orbit path using Scatter3d. Note: line coloring needs to map array of colors.
    # To do this reliably in Plotly, we can use a list of colors in `line.color`.
    fig.add_trace(go.Scatter3d(
        x=x_orbit, y=y_orbit, z=z_orbit,
        mode='lines',
        line=dict(
            color=colors,
            width=5
        ),
        name='Orbit Path',
        hoverinfo='skip'
    ))

    # Add current position marker (last point)
    if x_orbit:
        fig.add_trace(go.Scatter3d(
            x=[x_orbit[-1]], y=[y_orbit[-1]], z=[z_orbit[-1]],
            mode='markers',
            marker=dict(
                color='white',
                size=8,
                symbol='diamond',
                line=dict(color='yellow', width=2)
            ),
            name='Current Position'
        ))

    fig.update_layout(
        scene=dict(
            xaxis=dict(showbackground=False, showgrid=False, zeroline=False, showticklabels=False, title=''),
            yaxis=dict(showbackground=False, showgrid=False, zeroline=False, showticklabels=False, title=''),
            zaxis=dict(showbackground=False, showgrid=False, zeroline=False, showticklabels=False, title=''),
        ),
        margin=dict(l=0, r=0, b=0, t=0),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        showlegend=False
    )
    return fig
