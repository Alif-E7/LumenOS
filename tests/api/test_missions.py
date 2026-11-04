"""
Tests for mission loading from YAML configs.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_list_missions(client: AsyncClient):
    """GET /api/missions returns all four missions."""
    resp = await client.get("/api/missions")
    assert resp.status_code == 200
    missions = resp.json()
    assert len(missions) == 4
    ids = {m["id"] for m in missions}
    assert ids == {"wildfire", "flood", "solar_storm", "volcano"}


@pytest.mark.asyncio
async def test_get_mission_detail(client: AsyncClient):
    """GET /api/missions/wildfire returns full mission details."""
    resp = await client.get("/api/missions/wildfire")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "wildfire"
    assert data["name"] == "Wildfire Scout"
    assert data["codename"] == "Eyes on Fire"
    assert data["orbit_altitude_km"] == 700.0
    assert len(data["objectives"]) >= 3
    assert len(data["event_pool"]) >= 2
    assert data["environment"]["solar_flux_w_m2"] == 1361.0


@pytest.mark.asyncio
async def test_get_mission_not_found(client: AsyncClient):
    """GET /api/missions/nonexistent returns 404."""
    resp = await client.get("/api/missions/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_all_missions_have_required_fields(client: AsyncClient):
    """Every mission has objectives, event_pool, environment, and scoring."""
    resp = await client.get("/api/missions")
    for brief in resp.json():
        detail_resp = await client.get(f"/api/missions/{brief['id']}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert len(detail["objectives"]) > 0, f"{brief['id']} has no objectives"
        assert len(detail["event_pool"]) > 0, f"{brief['id']} has no events"
        assert detail["environment"]["solar_flux_w_m2"] > 0
        assert detail["scoring"]["max_score"] == 100.0

