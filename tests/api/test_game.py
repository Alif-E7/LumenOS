"""
Tests for the game session REST API — /api/game/* endpoints.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app
from api.services.game_session import session_manager


@pytest.fixture(autouse=True)
def _clear_sessions():
    """Clear all sessions before each test."""
    session_manager._sessions.clear()
    yield
    session_manager._sessions.clear()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestGameStart:
    """POST /api/game/start"""

    async def test_start_wildfire_mission(self, client: AsyncClient):
        resp = await client.post("/api/game/start", json={"mission_id": "wildfire"})
        assert resp.status_code == 201
        data = resp.json()
        assert "session_id" in data
        assert data["mission_id"] == "wildfire"
        assert data["mission_name"] == "Wildfire Scout"
        assert data["status"] == "running"
        assert "game_state" in data

    async def test_start_with_seed(self, client: AsyncClient):
        resp = await client.post(
            "/api/game/start",
            json={"mission_id": "wildfire", "seed": 123},
        )
        assert resp.status_code == 201
        assert resp.json()["seed"] == 123

    async def test_start_with_player_ids(self, client: AsyncClient):
        resp = await client.post(
            "/api/game/start",
            json={"mission_id": "wildfire", "player_ids": ["alice", "bob"]},
        )
        assert resp.status_code == 201

    async def test_start_unknown_mission_404(self, client: AsyncClient):
        resp = await client.post("/api/game/start", json={"mission_id": "nonexistent"})
        assert resp.status_code == 404

    async def test_start_all_four_missions(self, client: AsyncClient):
        """Verify all four mission configs can be loaded and started."""
        for mission_id in ("wildfire", "flood", "solar_storm", "volcano"):
            resp = await client.post("/api/game/start", json={"mission_id": mission_id})
            assert resp.status_code == 201, f"Failed to start {mission_id}: {resp.text}"


class TestGameStep:
    """POST /api/game/{session_id}/step"""

    async def test_step_advances(self, client: AsyncClient):
        start = await client.post("/api/game/start", json={"mission_id": "wildfire"})
        sid = start.json()["session_id"]

        resp = await client.post(f"/api/game/{sid}/step", json={"steps": 5})
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == sid
        assert len(data["results"]) == 5

    async def test_step_single(self, client: AsyncClient):
        start = await client.post("/api/game/start", json={"mission_id": "wildfire"})
        sid = start.json()["session_id"]

        resp = await client.post(f"/api/game/{sid}/step", json={})
        assert resp.status_code == 200
        assert len(resp.json()["results"]) == 1

    async def test_step_nonexistent_session_404(self, client: AsyncClient):
        resp = await client.post("/api/game/ses_fake/step", json={"steps": 1})
        assert resp.status_code == 404

    async def test_step_max_capped_at_100(self, client: AsyncClient):
        start = await client.post("/api/game/start", json={"mission_id": "wildfire"})
        sid = start.json()["session_id"]

        # Requesting more than 100 should be rejected by Pydantic validation
        resp = await client.post(f"/api/game/{sid}/step", json={"steps": 101})
        assert resp.status_code == 422  # Validation error


class TestGameAction:
    """POST /api/game/{session_id}/action"""

    async def test_valid_action(self, client: AsyncClient):
        start = await client.post("/api/game/start", json={"mission_id": "wildfire"})
        sid = start.json()["session_id"]
        # Solo player gets all roles — get their player_id
        state = await client.get(f"/api/game/{sid}/state")
        game_state = state.json()["game_state"]

        # We need the player_id — it's auto-generated for solo
        # Let's start with explicit player_id
        start2 = await client.post(
            "/api/game/start",
            json={"mission_id": "wildfire", "player_ids": ["test_player"]},
        )
        sid2 = start2.json()["session_id"]

        resp = await client.post(f"/api/game/{sid2}/action", json={
            "player_id": "test_player",
            "action_type": "set_power_mode",
            "params": {"mode": "low_power"},
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    async def test_action_wrong_player_rejected(self, client: AsyncClient):
        start = await client.post(
            "/api/game/start",
            json={"mission_id": "wildfire", "player_ids": ["player1"]},
        )
        sid = start.json()["session_id"]

        resp = await client.post(f"/api/game/{sid}/action", json={
            "player_id": "intruder",
            "action_type": "set_power_mode",
            "params": {"mode": "low_power"},
        })
        data = resp.json()
        assert data["success"] is False
        assert "not in this session" in data["error"].lower()

    async def test_action_unknown_type_rejected(self, client: AsyncClient):
        start = await client.post(
            "/api/game/start",
            json={"mission_id": "wildfire", "player_ids": ["player1"]},
        )
        sid = start.json()["session_id"]

        resp = await client.post(f"/api/game/{sid}/action", json={
            "player_id": "player1",
            "action_type": "hack_everything",
            "params": {},
        })
        data = resp.json()
        assert data["success"] is False

    async def test_action_role_permission_enforced(self, client: AsyncClient):
        """With 2 players, verify role restrictions are enforced server-side."""
        start = await client.post(
            "/api/game/start",
            json={"mission_id": "wildfire", "player_ids": ["director", "engineer"]},
        )
        sid = start.json()["session_id"]

        # Director (player 0) should NOT be able to do systems engineer actions
        # With 2 players: player[0] = Director + Science, player[1] = Flight + Systems
        resp = await client.post(f"/api/game/{sid}/action", json={
            "player_id": "director",
            "action_type": "toggle_subsystem",
            "params": {"subsystem_name": "payload", "active": False},
        })
        data = resp.json()
        assert data["success"] is False
        assert "role does not permit" in data["error"].lower()


class TestGameState:
    """GET /api/game/{session_id}/state"""

    async def test_get_state(self, client: AsyncClient):
        start = await client.post("/api/game/start", json={"mission_id": "wildfire"})
        sid = start.json()["session_id"]

        resp = await client.get(f"/api/game/{sid}/state")
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == sid
        assert "game_state" in data
        gs = data["game_state"]
        assert gs["mission_id"] == "wildfire"
        assert gs["status"] == "running"

    async def test_get_state_404(self, client: AsyncClient):
        resp = await client.get("/api/game/ses_fake/state")
        assert resp.status_code == 404


class TestGameScore:
    """GET /api/game/{session_id}/score"""

    async def test_get_score(self, client: AsyncClient):
        start = await client.post("/api/game/start", json={"mission_id": "wildfire"})
        sid = start.json()["session_id"]

        resp = await client.get(f"/api/game/{sid}/score")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_score" in data
        assert "grade" in data
        assert "categories" in data
        assert len(data["categories"]) > 0

    async def test_score_after_steps(self, client: AsyncClient):
        start = await client.post("/api/game/start", json={"mission_id": "wildfire"})
        sid = start.json()["session_id"]

        # Run some steps
        await client.post(f"/api/game/{sid}/step", json={"steps": 10})

        resp = await client.get(f"/api/game/{sid}/score")
        assert resp.status_code == 200


class TestGameDelete:
    """DELETE /api/game/{session_id}"""

    async def test_delete_session(self, client: AsyncClient):
        start = await client.post("/api/game/start", json={"mission_id": "wildfire"})
        sid = start.json()["session_id"]

        resp = await client.delete(f"/api/game/{sid}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

        # Should be gone now
        resp2 = await client.get(f"/api/game/{sid}/state")
        assert resp2.status_code == 404

    async def test_delete_nonexistent_404(self, client: AsyncClient):
        resp = await client.delete("/api/game/ses_fake")
        assert resp.status_code == 404

