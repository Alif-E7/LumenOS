"""
API Integration Tests for Simulation Clock, Checkpointing, and Observation Geometry Endpoints.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.anyio
async def test_clock_pause_resume_speed(client: AsyncClient):
    # Start game session
    start_res = await client.post("/api/game/start", json={"mission_id": "wildfire"})
    assert start_res.status_code == 201
    session_id = start_res.json()["session_id"]

    # Pause
    pause_res = await client.post(f"/api/game/{session_id}/clock/pause")
    assert pause_res.status_code == 200
    assert pause_res.json()["status"] == "PAUSED"
    assert pause_res.json()["clock"]["status"] == "PAUSED"

    # Resume
    resume_res = await client.post(f"/api/game/{session_id}/clock/resume")
    assert resume_res.status_code == 200
    assert resume_res.json()["status"] == "RUNNING"
    assert resume_res.json()["clock"]["status"] == "RUNNING"

    # Set speed multiplier
    speed_res = await client.post(f"/api/game/{session_id}/clock/speed", json={"speed": 10.0})
    assert speed_res.status_code == 200
    assert speed_res.json()["clock"]["speed_multiplier"] == 10.0


@pytest.mark.anyio
async def test_fast_forward_to_time(client: AsyncClient):
    start_res = await client.post("/api/game/start", json={"mission_id": "wildfire"})
    assert start_res.status_code == 201
    session_id = start_res.json()["session_id"]

    ff_res = await client.post(
        f"/api/game/{session_id}/clock/fast_forward",
        json={"target_seconds": 1200.0},
    )
    assert ff_res.status_code == 200
    data = ff_res.json()["result"]
    assert data["elapsed_seconds"] >= 1200.0
    assert data["step"] >= 20


@pytest.mark.anyio
async def test_forecast_timeline_epistemic_barrier(client: AsyncClient):
    start_res = await client.post("/api/game/start", json={"mission_id": "wildfire"})
    assert start_res.status_code == 201
    session_id = start_res.json()["session_id"]

    timeline_res = await client.get(f"/api/game/{session_id}/timeline?horizon_seconds=28800")
    assert timeline_res.status_code == 200
    events = timeline_res.json()["timeline_events"]
    assert len(events) > 0

    # Every forecasted event must be flagged is_forecast=True
    for ev in events:
        assert ev["is_forecast"] is True
        assert ev["event_type"] != "STOCHASTIC_ANOMALY"


@pytest.mark.anyio
async def test_orbit_ground_track(client: AsyncClient):
    start_res = await client.post("/api/game/start", json={"mission_id": "wildfire"})
    assert start_res.status_code == 201
    session_id = start_res.json()["session_id"]

    track_res = await client.get(f"/api/game/{session_id}/orbit/groundtrack?num_points=50")
    assert track_res.status_code == 200
    points = track_res.json()["points"]
    assert len(points) == 51
    first = points[0]
    assert "latitude_deg" in first
    assert "longitude_deg" in first
    assert "altitude_km" in first
    assert "in_eclipse" in first


@pytest.mark.anyio
async def test_checkpoint_save_and_restore_endpoints(client: AsyncClient):
    start_res = await client.post("/api/game/start", json={"mission_id": "wildfire"})
    assert start_res.status_code == 201
    session_id = start_res.json()["session_id"]

    # Step 10 times
    await client.post(f"/api/game/{session_id}/step", json={"steps": 10})

    # Save checkpoint
    save_res = await client.post(f"/api/game/{session_id}/checkpoint/save")
    assert save_res.status_code == 200
    checkpoint = save_res.json()["checkpoint"]
    assert checkpoint["sim_checkpoint"]["step"] == 10

    # Step 15 more times
    await client.post(f"/api/game/{session_id}/step", json={"steps": 15})
    state_step_25 = await client.get(f"/api/game/{session_id}/state")
    assert state_step_25.json()["game_state"]["step"] == 25

    # Restore checkpoint
    restore_res = await client.post(
        f"/api/game/{session_id}/checkpoint/restore",
        json={"checkpoint": checkpoint},
    )
    assert restore_res.status_code == 200
    assert restore_res.json()["restored"] is True
    assert restore_res.json()["clock"]["step_count"] == 10

    # Verify state shows step 10
    state_after_restore = await client.get(f"/api/game/{session_id}/state")
    assert state_after_restore.json()["game_state"]["step"] == 10
