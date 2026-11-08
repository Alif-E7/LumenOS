"""
Integration tests for Replay, What-If, Scoring, and Cost Analysis REST APIs (Prompt 15).
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app
from api.services.game_session import session_manager


@pytest.fixture(autouse=True)
def _clear_sessions():
    session_manager._sessions.clear()
    yield
    session_manager._sessions.clear()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestPrompt15ReplayAndResultsAPI:
    """Tests for Prompt 15 Results, Replay, What-If, and Cost endpoints."""

    async def test_full_mission_flow_and_replay_endpoints(self, client: AsyncClient):
        # 1. Start a game session
        start_resp = await client.post(
            "/api/game/start",
            json={"mission_id": "wildfire", "seed": 42, "player_ids": ["cadet_1"]},
        )
        assert start_resp.status_code == 201
        sid = start_resp.json()["session_id"]

        # 2. Advance 10 steps
        step_resp = await client.post(f"/api/game/{sid}/step", json={"steps": 10})
        assert step_resp.status_code == 200

        # 3. Perform an action
        act_resp = await client.post(
            f"/api/game/{sid}/action",
            json={
                "player_id": "cadet_1",
                "action_type": "set_power_mode",
                "params": {"mode": "nominal"},
            },
        )
        assert act_resp.status_code == 200

        # 4. Check /api/game/{sid}/score has Prompt 15 fields
        score_resp = await client.get(f"/api/game/{sid}/score")
        assert score_resp.status_code == 200
        score_data = score_resp.json()
        assert "total_score" in score_data
        assert "grade" in score_data
        assert "safety_cap_triggered" in score_data
        assert "primary_cause" in score_data
        assert "resource_metrics" in score_data
        assert len(score_data["categories"]) == 6

        # 5. Check /api/replay/{sid}
        replay_resp = await client.get(f"/api/replay/{sid}")
        assert replay_resp.status_code == 200
        traj = replay_resp.json()
        assert traj["session_id"] == sid
        assert traj["total_steps"] >= 10
        assert len(traj["steps"]) >= 10

        # 6. Check /api/replay/{sid}/cost_analysis
        cost_resp = await client.get(f"/api/replay/{sid}/cost_analysis")
        assert cost_resp.status_code == 200
        cost_data = cost_resp.json()
        assert "total_capex_usd" in cost_data
        assert "amortized_capex_per_orbit_usd" in cost_data
        assert "cost_per_mb_usd" in cost_data
        assert len(cost_data["educational_assumptions"]) >= 3

        # 7. Check /api/replay/{sid}/contributions
        contrib_resp = await client.get(f"/api/replay/{sid}/contributions")
        assert contrib_resp.status_code == 200
        contrib_data = contrib_resp.json()
        assert "participants" in contrib_data
        assert "coordination_index" in contrib_data

        # 8. Test What-If Branching: POST /api/replay/{sid}/what_if
        what_if_resp = await client.post(
            f"/api/replay/{sid}/what_if",
            json={
                "branch_step": 5,
                "modified_actions": [
                    {
                        "actor": "cadet_analyst",
                        "action_type": "set_operational_profile",
                        "params": {"profile": "ECO"},
                    }
                ],
                "label": "Low Power Mode Branch",
            },
        )
        assert what_if_resp.status_code == 200
        wi_data = what_if_resp.json()
        assert wi_data["semantic_tag"] == "NEW SIMULATION (WHAT-IF)"
        assert wi_data["is_what_if"] is True
        assert "score_delta" in wi_data
        assert "delta_explanation" in wi_data
        assert len(wi_data["original_trajectory"]) >= 10
        assert len(wi_data["modified_trajectory"]) >= 10
