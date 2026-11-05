"""
Campaign Progression System — Multi-mission storyline, unlock prerequisites, and replay mechanics.

Scenarios in progression:
1. Wildfire Scout (Flagship guided mission) — Available immediately
2. Flood Scout — Unlocks upon completing Wildfire Scout (>= 1 star)
3. Solar Storm Sentinel — Unlocks upon completing Flood Scout (>= 1 star) or reaching Level 3
4. Volcano Watch — Unlocks upon completing Solar Storm Sentinel (>= 1 star) or reaching Level 4

Tutorial:
- Sunrise Orbit Tutorial is accessible at any time as an educational onboarding module.

Replay & Mastery Rules:
- First-time completion awards full base XP and full Engineering Credits.
- Replay awards 25% mastery XP and 25% mastery credits.
- Earning a higher star rating on replay awards the newly unlocked star reward difference.
- Personal best score and highest star rating are permanently retained.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field

from game.scoring import Grade


class CampaignMissionId(str, Enum):
    WILDFIRE = "wildfire"
    FLOOD = "flood"
    SOLAR_STORM = "solar_storm"
    VOLCANO = "volcano"


class MissionNode(BaseModel):
    """Metadata for a mission node in the campaign map."""
    mission_id: str
    name: str
    codename: str
    order: int
    difficulty_level: int
    icon: str
    summary: str
    prerequisite_mission_id: Optional[str] = None
    prerequisite_min_stars: int = 1
    prerequisite_player_level: int = 1
    xp_first_completion: int = 500
    credits_first_completion: int = 800
    xp_replay_mastery: int = 125
    credits_replay_mastery: int = 200


CAMPAIGN_ORDER: list[MissionNode] = [
    MissionNode(
        mission_id="wildfire",
        name="Wildfire Scout",
        codename="Eyes on Fire",
        order=1,
        difficulty_level=2,
        icon="🔥",
        summary="Deploy a thermal imaging satellite into SSO to monitor active wildfires and downlink telemetry.",
        prerequisite_mission_id=None,
        prerequisite_min_stars=0,
        prerequisite_player_level=1,
        xp_first_completion=500,
        credits_first_completion=800,
        xp_replay_mastery=125,
        credits_replay_mastery=200,
    ),
    MissionNode(
        mission_id="flood",
        name="Flood Scout",
        codename="Rising Waters",
        order=2,
        difficulty_level=3,
        icon="🌊",
        summary="Operate a high-power SAR satellite to map floodwaters through heavy cloud cover.",
        prerequisite_mission_id="wildfire",
        prerequisite_min_stars=1,
        prerequisite_player_level=2,
        xp_first_completion=700,
        credits_first_completion=1100,
        xp_replay_mastery=175,
        credits_replay_mastery=275,
    ),
    MissionNode(
        mission_id="solar_storm",
        name="Solar Storm Sentinel",
        codename="Watch the Sun",
        order=3,
        difficulty_level=4,
        icon="☀️",
        summary="Position a polar UV spectrometer to detect solar coronal mass ejections while weathering radiation belts.",
        prerequisite_mission_id="flood",
        prerequisite_min_stars=1,
        prerequisite_player_level=3,
        xp_first_completion=900,
        credits_first_completion=1400,
        xp_replay_mastery=225,
        credits_replay_mastery=350,
    ),
    MissionNode(
        mission_id="volcano",
        name="Volcano Watch",
        codename="Fire Beneath the Earth",
        order=4,
        difficulty_level=3,
        icon="🌋",
        summary="Coordinate multispectral imagery to map SO₂ plumes and protect optics from stratospheric volcanic ash.",
        prerequisite_mission_id="solar_storm",
        prerequisite_min_stars=1,
        prerequisite_player_level=4,
        xp_first_completion=1000,
        credits_first_completion=1600,
        xp_replay_mastery=250,
        credits_replay_mastery=400,
    ),
]

CAMPAIGN_NODE_MAP: dict[str, MissionNode] = {node.mission_id: node for node in CAMPAIGN_ORDER}


class MissionRecord(BaseModel):
    """Player record for a single mission."""
    mission_id: str
    unlocked: bool = False
    completed: bool = False
    best_score: float = 0.0
    best_grade: Grade = Grade.F
    best_stars: int = Field(default=0, ge=0, le=3)
    completions: int = 0
    replay_count: int = 0
    total_xp_earned: int = 0
    total_credits_earned: int = 0


class CampaignProgress(BaseModel):
    """Full campaign progression state for a player profile."""
    records: dict[str, MissionRecord] = Field(default_factory=dict)
    tutorial_completed: bool = False

    def get_or_create_record(self, mission_id: str) -> MissionRecord:
        if mission_id not in self.records:
            is_initially_unlocked = (mission_id == "wildfire")
            self.records[mission_id] = MissionRecord(
                mission_id=mission_id,
                unlocked=is_initially_unlocked,
            )
        return self.records[mission_id]

    def update_unlocks(self, player_level: int) -> list[str]:
        """
        Check all campaign nodes and unlock newly eligible missions.
        Returns list of newly unlocked mission IDs.
        """
        newly_unlocked: list[str] = []

        for node in CAMPAIGN_ORDER:
            record = self.get_or_create_record(node.mission_id)
            if record.unlocked:
                continue

            # Check prerequisites
            prereq_met = False
            if node.prerequisite_mission_id is None:
                prereq_met = True
            else:
                prereq_record = self.records.get(node.prerequisite_mission_id)
                if prereq_record and prereq_record.completed and prereq_record.best_stars >= node.prerequisite_min_stars:
                    prereq_met = True
                elif player_level >= node.prerequisite_player_level:
                    # Alternative level-based unlock path
                    prereq_met = True

            if prereq_met:
                record.unlocked = True
                newly_unlocked.append(node.mission_id)

        return newly_unlocked

    def is_mission_unlocked(self, mission_id: str, player_level: int = 1) -> bool:
        """Query if a mission is accessible."""
        self.update_unlocks(player_level)
        record = self.records.get(mission_id)
        return record.unlocked if record else False

    def record_mission_result(
        self,
        mission_id: str,
        score: float,
        grade: Grade,
        stars: int,
        is_win: bool,
        difficulty_multiplier: float = 1.0,
    ) -> dict[str, Any]:
        """
        Record mission completion and compute rewards (first-time vs replay).

        Returns:
            dict containing:
                - xp_awarded
                - credits_awarded
                - is_first_completion
                - is_new_best_score
                - new_stars_earned
                - explanation
        """
        record = self.get_or_create_record(mission_id)
        node = CAMPAIGN_NODE_MAP.get(mission_id)

        is_first_completion = not record.completed and is_win
        old_stars = record.best_stars
        new_stars = max(old_stars, stars)
        stars_delta = new_stars - old_stars

        # Base calculations from grade
        grade_xp = {
            Grade.A_PLUS: 500, Grade.A: 400, Grade.A_MINUS: 350,
            Grade.B_PLUS: 300, Grade.B: 250, Grade.B_MINUS: 200,
            Grade.C_PLUS: 150, Grade.C: 100, Grade.C_MINUS: 75,
            Grade.D: 50, Grade.F: 10,
        }.get(grade, 10)

        grade_credits = {
            Grade.A_PLUS: 1000, Grade.A: 800, Grade.A_MINUS: 700,
            Grade.B_PLUS: 600, Grade.B: 500, Grade.B_MINUS: 400,
            Grade.C_PLUS: 300, Grade.C: 200, Grade.C_MINUS: 150,
            Grade.D: 100, Grade.F: 0,
        }.get(grade, 0)

        base_xp = grade_xp
        base_credits = grade_credits
        replay_xp = max(int(base_xp * 0.25), 25)
        replay_credits = max(int(base_credits * 0.25), 50)
        star_bonus_credits_per_star = max(int(base_credits * 0.20), 50)

        # Star bonus for high-star performance (stars > 1)
        star_xp_bonus = (stars - 1) * 75 if stars > 1 else 0
        star_credits_bonus = (stars - 1) * star_bonus_credits_per_star if stars > 1 else 0

        if not is_win:
            # Failure rewards small consolation XP, no credits
            xp_awarded = int(50 * difficulty_multiplier)
            credits_awarded = 0
            explanation = "Mission did not achieve primary objectives. Consolation XP awarded."
        elif is_first_completion:
            record.completed = True
            record.completions = 1
            xp_awarded = int((base_xp + star_xp_bonus) * difficulty_multiplier)
            credits_awarded = int((base_credits + star_credits_bonus) * difficulty_multiplier)
            star_note = f" (includes +{star_xp_bonus} XP, +{star_credits_bonus} credits for {stars}★ rating)" if stars > 1 else ""
            explanation = (
                f"First completion of {mission_id.replace('_', ' ').title()}! "
                f"Earned {xp_awarded} XP and {credits_awarded} Engineering Credits{star_note}."
            )
        else:
            # Replay run
            record.completions += 1
            record.replay_count += 1
            xp_awarded = int(replay_xp * difficulty_multiplier)
            credits_awarded = int(replay_credits * difficulty_multiplier)

            # Did player earn higher stars than previously?
            if stars_delta > 0:
                bonus_xp = stars_delta * 100
                bonus_credits = stars_delta * star_bonus_credits_per_star
                xp_awarded += bonus_xp
                credits_awarded += bonus_credits
                explanation = (
                    f"Replay mastery completion! {replay_xp} XP, {replay_credits} credits. "
                    f"New star record ({old_stars} ★ → {new_stars} ★): +{bonus_xp} XP, +{bonus_credits} credits."
                )
            else:
                explanation = (
                    f"Replay mastery completion! Earned {xp_awarded} XP and {credits_awarded} Engineering Credits."
                )

        # Update bests
        is_new_best = False
        if score > record.best_score:
            record.best_score = score
            record.best_grade = grade
            is_new_best = True

        record.best_stars = new_stars
        record.total_xp_earned += xp_awarded
        record.total_credits_earned += credits_awarded

        return {
            "mission_id": mission_id,
            "xp_awarded": xp_awarded,
            "credits_awarded": credits_awarded,
            "is_first_completion": is_first_completion,
            "is_new_best_score": is_new_best,
            "stars_earned": stars,
            "best_stars": record.best_stars,
            "new_stars_earned": stars_delta,
            "explanation": explanation,
        }

    def is_campaign_complete(self) -> bool:
        """Check if all 4 campaign missions have been won."""
        for node in CAMPAIGN_ORDER:
            rec = self.records.get(node.mission_id)
            if not rec or not rec.completed:
                return False
        return True

    def total_stars(self) -> int:
        """Count total stars earned across the campaign."""
        return sum(rec.best_stars for rec in self.records.values())
