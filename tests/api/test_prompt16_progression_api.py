"""
Integration tests for Player Profile and Career Progression API (Prompt 16).
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from pathlib import Path
from api.main import app
from api.routers.progression import _PROFILES_CACHE


def _cleanup_test_profiles():
    test_profiles = Path("data/profiles")
    if test_profiles.exists():
        for f in test_profiles.glob("test_*.json"):
            f.unlink(missing_ok=True)
        for f in test_profiles.glob("cadet_*.json"):
            f.unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def _clear_progression_cache():
    _PROFILES_CACHE.clear()
    _cleanup_test_profiles()
    yield
    _PROFILES_CACHE.clear()
    _cleanup_test_profiles()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestPrompt16ProgressionAPI:
    """Test suite for player profile, achievements, and unlock store."""

    async def test_get_profile_initializes_default(self, client: AsyncClient):
        resp = await client.get("/api/progression/profile?player_id=test_cadet")
        assert resp.status_code == 200
        data = resp.json()
        assert data["player_id"] == "test_cadet"
        assert data["level"] == 1
        assert data["total_xp"] == 0
        assert data["engineering_credits"] == 500
        assert len(data["achievements"]) > 0
        assert len(data["unlocks"]) > 0

    async def test_catalogs_endpoints(self, client: AsyncClient):
        ach_resp = await client.get("/api/progression/achievements")
        assert ach_resp.status_code == 200
        ach_list = ach_resp.json()
        assert any(a["id"] == "first_launch" for a in ach_list)
        assert any(a["id"] == "perfect_score" for a in ach_list)

        unlock_resp = await client.get("/api/progression/unlocks")
        assert unlock_resp.status_code == 200
        unlock_list = unlock_resp.json()
        assert any(u["id"] == "high_density_battery" for u in unlock_list)
        assert any(u["id"] == "optical_sar_sensor" for u in unlock_list)

    async def test_record_mission_awards_xp_credits_and_achievements(self, client: AsyncClient):
        record_resp = await client.post(
            "/api/progression/record_mission",
            json={
                "player_id": "test_pilot",
                "mission_id": "wildfire",
                "grade": "A+",
                "stars": 3,
                "is_win": True,
                "spacecraft_health_pct": 98.0,
                "budget_spent_pct": 45.0,
                "score": 96.0,
            },
        )
        assert record_resp.status_code == 200
        data = record_resp.json()
        rewards = data["rewards"]
        assert rewards["xp_earned"] > 0
        assert rewards["credits_earned"] > 0
        assert rewards["stars_earned"] == 3
        # Should have unlocked first_launch, perfect_score, clean_telemetry, budget_master
        assert "first_launch" in rewards["new_achievements"]

        # Fetch profile and verify updated level & unlocked achievements
        prof_resp = await client.get("/api/progression/profile?player_id=test_pilot")
        assert prof_resp.status_code == 200
        prof_data = prof_resp.json()
        assert prof_data["total_xp"] == data["total_xp"]
        first_launch = next(a for a in prof_data["achievements"] if a["id"] == "first_launch")
        assert first_launch["unlocked"] is True

    async def test_unlock_purchase_flow_and_rejections(self, client: AsyncClient):
        # 1. New cadet has credits=500, level=1. Try purchasing Li-Sulfur battery (requires level 2)
        rej_resp = await client.post(
            "/api/progression/unlock",
            json={"player_id": "cadet_low_lvl", "unlock_id": "high_density_battery"},
        )
        assert rej_resp.status_code == 400
        assert "Requires Level 2" in rej_resp.json()["detail"]

        # 2. Record enough missions to level up to Level 2
        await client.post(
            "/api/progression/record_mission",
            json={
                "player_id": "cadet_low_lvl",
                "mission_id": "wildfire",
                "grade": "A",
                "stars": 2,
                "is_win": True,
                "score": 88.0,
            },
        )

        # 3. Now cadet is level >= 2 and has sufficient credits -> purchase succeeds
        ok_resp = await client.post(
            "/api/progression/unlock",
            json={"player_id": "cadet_low_lvl", "unlock_id": "high_density_battery"},
        )
        assert ok_resp.status_code == 200
        ok_data = ok_resp.json()
        assert ok_data["success"] is True
        assert "high_density_battery" in ok_data["unlocked"]

        # 4. Duplicate purchase fails
        dup_resp = await client.post(
            "/api/progression/unlock",
            json={"player_id": "cadet_low_lvl", "unlock_id": "high_density_battery"},
        )
        assert dup_resp.status_code == 400
        assert "already unlocked" in dup_resp.json()["detail"]
