"""
Tests for co-op room REST endpoints — /api/rooms/*.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app
from api.services.rooms import room_manager


@pytest.fixture(autouse=True)
def _clear_rooms():
    """Clear all rooms before each test."""
    room_manager._rooms.clear()
    yield
    room_manager._rooms.clear()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestCreateRoom:
    """POST /api/rooms"""

    async def test_create_room(self, client: AsyncClient):
        resp = await client.post("/api/rooms", json={"host_name": "Alice"})
        assert resp.status_code == 201
        data = resp.json()
        assert "room_code" in data
        assert len(data["room_code"]) == 6
        assert "player_id" in data

    async def test_create_room_empty_name_rejected(self, client: AsyncClient):
        resp = await client.post("/api/rooms", json={"host_name": ""})
        assert resp.status_code == 422  # Validation error

    async def test_create_room_long_name_rejected(self, client: AsyncClient):
        resp = await client.post("/api/rooms", json={"host_name": "A" * 31})
        assert resp.status_code == 422


class TestJoinRoom:
    """POST /api/rooms/{room_code}/join"""

    async def test_join_room(self, client: AsyncClient):
        create = await client.post("/api/rooms", json={"host_name": "Alice"})
        code = create.json()["room_code"]

        resp = await client.post(f"/api/rooms/{code}/join", json={"display_name": "Bob"})
        assert resp.status_code == 200
        data = resp.json()
        assert "player_id" in data
        assert isinstance(data["participants"], list)

    async def test_join_nonexistent_room_404(self, client: AsyncClient):
        resp = await client.post("/api/rooms/ABCDEF/join", json={"display_name": "Bob"})
        assert resp.status_code == 404


class TestGetRoomInfo:
    """GET /api/rooms/{room_code}"""

    async def test_get_room_info(self, client: AsyncClient):
        create = await client.post("/api/rooms", json={"host_name": "Alice"})
        code = create.json()["room_code"]

        resp = await client.get(f"/api/rooms/{code}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["room_code"] == code
        assert data["phase"] == "lobby"

    async def test_get_nonexistent_room_404(self, client: AsyncClient):
        resp = await client.get("/api/rooms/ZZZZZ1")
        assert resp.status_code == 404

