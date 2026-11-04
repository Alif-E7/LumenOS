"""
Tests for the spacecraft CRUD endpoints.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from api.database import Base, engine
from api.main import app


@pytest.fixture(autouse=True)
async def setup_db():
    """Create a fresh DB for each test."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


SAMPLE_SPACECRAFT = {
    "name": "Test Orbiter",
    "description": "A test spacecraft",
    "structure": {"dry_mass_kg": 400, "fuel_mass_kg": 30},
    "power": {"solar_panel_area_m2": 8.0, "battery_capacity_wh": 3000},
    "thermal": {"radiator_area_m2": 3.0},
    "comms": {"antenna_gain_dbi": 30.0, "transmit_power_w": 15.0},
    "propulsion": {"isp_s": 250, "thrust_n": 0.5},
    "payload": {"payload_type": "thermal_imager", "mass_kg": 25, "power_w": 60},
}


@pytest.mark.asyncio
async def test_create_spacecraft(client: AsyncClient):
    """POST /api/spacecraft creates a new config and returns it."""
    resp = await client.post("/api/spacecraft", json=SAMPLE_SPACECRAFT)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Orbiter"
    assert data["id"]  # UUID should be present
    assert data["total_mass_kg"] == 400 + 30 + 25


@pytest.mark.asyncio
async def test_list_spacecraft(client: AsyncClient):
    """GET /api/spacecraft returns a list."""
    # Create one first
    await client.post("/api/spacecraft", json=SAMPLE_SPACECRAFT)
    resp = await client.get("/api/spacecraft")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_get_spacecraft_not_found(client: AsyncClient):
    """GET /api/spacecraft/<bad-id> returns 404."""
    resp = await client.get("/api/spacecraft/nonexistent-id")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_spacecraft(client: AsyncClient):
    """PUT /api/spacecraft/<id> updates fields."""
    create_resp = await client.post("/api/spacecraft", json=SAMPLE_SPACECRAFT)
    sc_id = create_resp.json()["id"]

    update_resp = await client.put(
        f"/api/spacecraft/{sc_id}",
        json={"name": "Renamed Orbiter"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Renamed Orbiter"


@pytest.mark.asyncio
async def test_delete_spacecraft(client: AsyncClient):
    """DELETE /api/spacecraft/<id> removes the config."""
    create_resp = await client.post("/api/spacecraft", json=SAMPLE_SPACECRAFT)
    sc_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/api/spacecraft/{sc_id}")
    assert del_resp.status_code == 204

    get_resp = await client.get(f"/api/spacecraft/{sc_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_validate_spacecraft(client: AsyncClient):
    """POST /api/spacecraft/<id>/validate returns validation result."""
    create_resp = await client.post("/api/spacecraft", json=SAMPLE_SPACECRAFT)
    sc_id = create_resp.json()["id"]

    val_resp = await client.post(f"/api/spacecraft/{sc_id}/validate")
    assert val_resp.status_code == 200
    data = val_resp.json()
    assert "valid" in data
    assert "mass_budget_kg" in data
    assert "power_budget_w" in data
    assert "thermal_margin_pct" in data


@pytest.mark.asyncio
async def test_create_spacecraft_validation_error(client: AsyncClient):
    """POST /api/spacecraft with invalid data returns 422."""
    resp = await client.post("/api/spacecraft", json={"name": ""})
    assert resp.status_code == 422

