"""
Tests for co-op room REST endpoints — /api/rooms/*, plus the room
WebSocket lobby flow (join, ready, host start).
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.testclient import TestClient

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


# ── WebSocket lobby flow ─────────────────────────────────────────────────────


class TestRoomWebSocketLobby:
    """WS /api/rooms/ws/{room_code}/{player_id} — lobby lifecycle."""

    def test_host_connects_with_stored_host_name(self):
        tc = TestClient(app)
        create = tc.post("/api/rooms", json={"host_name": "Alice"}).json()
        code, host_id = create["room_code"], create["player_id"]

        with tc.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as host_ws:
            joined = host_ws.receive_json()
            assert joined["type"] == "player_joined"
            assert joined["display_name"] == "Alice"

    def test_full_lobby_flow_join_ready_start(self):
        tc = TestClient(app)
        create = tc.post("/api/rooms", json={"host_name": "Alice"}).json()
        code, host_id = create["room_code"], create["player_id"]

        join = tc.post(f"/api/rooms/{code}/join", json={"display_name": "Bob"}).json()
        guest_id = join["player_id"]

        with tc.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as host_ws:
            # Host's own join is broadcast to everyone including themselves
            joined = host_ws.receive_json()
            assert joined["type"] == "player_joined"
            assert joined["participants"][0]["display_name"] == "Alice"
            assert joined["participants"][0]["is_host"] is True

            with tc.websocket_connect(
                f"/api/rooms/ws/{code}/{guest_id}?display_name=Bob"
            ) as guest_ws:
                joined2 = host_ws.receive_json()
                assert joined2["type"] == "player_joined"
                assert joined2["display_name"] == "Bob"
                assert joined2["participant_count"] == 2

                # Guest toggles ready
                guest_ws.send_json({"command": "ready"})
                ready = host_ws.receive_json()
                assert ready["type"] == "ready_status"
                assert ready["all_ready"] is False  # host not ready yet
                guest_ready = guest_ws.receive_json()
                assert guest_ready["player_id"] == guest_id
                # Broadcast copies reach every socket, including the guest's
                guest_copy = guest_ws.receive_json()
                assert guest_copy["type"] == "ready_status"

                # Non-host start attempt is rejected
                guest_ws.send_json({"command": "start", "mission_id": "wildfire"})
                err = guest_ws.receive_json()
                assert err["type"] == "error"
                assert "host" in err["error"].lower()

                # Host starts the mission
                host_ws.send_json({"command": "start", "mission_id": "wildfire"})
                started = host_ws.receive_json()
                assert started["type"] == "game_started"
                assert started["mission_id"] == "wildfire"
                # 2 players => 2 bundled roles each
                host_roles = started["roles"][host_id]
                assert len(host_roles) == 2
                assert len(started["roles"][guest_id]) == 2

    def test_start_with_unknown_mission_errors(self):
        tc = TestClient(app)
        create = tc.post("/api/rooms", json={"host_name": "Alice"}).json()
        code, host_id = create["room_code"], create["player_id"]

        with tc.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as host_ws:
            host_ws.receive_json()  # own player_joined
            host_ws.send_json({"command": "start", "mission_id": "does_not_exist"})
            err = host_ws.receive_json()
            assert err["type"] == "error"
            assert "not found" in err["error"]

