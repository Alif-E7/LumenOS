"""
Progression — XP, Engineering Credits, achievements, and unlocks.

Engineering Credits (earned through gameplay) are completely separate
from Mission Budget (the constraint within a contract). Players earn XP
and credits for completing missions; credits unlock new capabilities.
"""

from __future__ import annotations

import json
from enum import Enum
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field

from game.scoring import Grade
from game.campaign import CampaignProgress


# ── Achievement categories ───────────────────────────────────────────────────


class AchievementCategory(str, Enum):
    """Categories for achievements."""
    MISSION = "mission"           # Complete specific missions
    MASTERY = "mastery"           # Demonstrate skill
    EXPLORATION = "exploration"   # Try different approaches
    EFFICIENCY = "efficiency"     # Resource management
    TEAMWORK = "teamwork"         # Multiplayer cooperation
    SCIENCE = "science"           # Data collection goals


class UnlockType(str, Enum):
    """Types of unlockable content."""
    MISSION = "mission"
    SPACECRAFT_MODULE = "spacecraft_module"
    AI_CAPABILITY = "ai_capability"
    COSMETIC = "cosmetic"


# ── Achievement definitions ──────────────────────────────────────────────────


class AchievementDefinition(BaseModel):
    """Static definition of an achievement."""
    id: str
    name: str
    description: str
    category: AchievementCategory
    icon: str = "🏆"
    xp_reward: int = Field(default=100, ge=0)
    credit_reward: int = Field(default=0, ge=0)
    hidden: bool = False  # Secret achievements


class AchievementProgress(BaseModel):
    """Player's progress toward an achievement."""
    achievement_id: str
    unlocked: bool = False
    unlock_date: Optional[str] = None
    progress_value: float = 0.0
    target_value: float = 1.0

    @property
    def progress_fraction(self) -> float:
        if self.target_value <= 0:
            return 1.0
        return min(self.progress_value / self.target_value, 1.0)


class UnlockDefinition(BaseModel):
    """Something that can be unlocked with Engineering Credits."""
    id: str
    name: str
    description: str
    unlock_type: UnlockType
    credit_cost: int = Field(ge=0)
    required_level: int = Field(default=1, ge=1)
    icon: str = "🔓"


# ── Achievement catalog ──────────────────────────────────────────────────────

ACHIEVEMENT_CATALOG: dict[str, AchievementDefinition] = {
    "first_launch": AchievementDefinition(
        id="first_launch",
        name="First Launch",
        description="Complete your first mission.",
        category=AchievementCategory.MISSION,
        icon="🚀",
        xp_reward=50,
        credit_reward=100,
    ),
    "perfect_score": AchievementDefinition(
        id="perfect_score",
        name="Perfect Score",
        description="Earn an A+ grade on any mission.",
        category=AchievementCategory.MASTERY,
        icon="⭐",
        xp_reward=500,
        credit_reward=500,
    ),
    "budget_master": AchievementDefinition(
        id="budget_master",
        name="Budget Master",
        description="Complete a mission using less than 50% of the budget.",
        category=AchievementCategory.EFFICIENCY,
        icon="💰",
        xp_reward=200,
        credit_reward=300,
    ),
    "event_handler": AchievementDefinition(
        id="event_handler",
        name="Cool Under Pressure",
        description="Successfully handle 10 critical events across all missions.",
        category=AchievementCategory.MASTERY,
        icon="🧊",
        xp_reward=300,
        credit_reward=200,
    ),
    "data_collector": AchievementDefinition(
        id="data_collector",
        name="Data Collector",
        description="Collect over 1000 MB of science data in a single mission.",
        category=AchievementCategory.SCIENCE,
        icon="📡",
        xp_reward=150,
        credit_reward=150,
    ),
    "all_roles": AchievementDefinition(
        id="all_roles",
        name="Renaissance Astronaut",
        description="Complete a mission in each of the four roles.",
        category=AchievementCategory.EXPLORATION,
        icon="🎭",
        xp_reward=400,
        credit_reward=400,
    ),
    "team_player": AchievementDefinition(
        id="team_player",
        name="Team Player",
        description="Complete a 4-player mission with an A grade or higher.",
        category=AchievementCategory.TEAMWORK,
        icon="🤝",
        xp_reward=250,
        credit_reward=250,
    ),
    "three_stars": AchievementDefinition(
        id="three_stars",
        name="Master Operator",
        description="Earn a perfect 3-star rating on any mission.",
        category=AchievementCategory.MASTERY,
        icon="⭐⭐⭐",
        xp_reward=350,
        credit_reward=400,
    ),
    "clean_telemetry": AchievementDefinition(
        id="clean_telemetry",
        name="Pristine Hull",
        description="Complete a mission maintaining at least 95% spacecraft health.",
        category=AchievementCategory.EFFICIENCY,
        icon="🛡️",
        xp_reward=250,
        credit_reward=300,
    ),
    "explorer_graduate": AchievementDefinition(
        id="explorer_graduate",
        name="Flight Academy Graduate",
        description="Complete the Sunrise Orbit onboarding tutorial.",
        category=AchievementCategory.MISSION,
        icon="🎓",
        xp_reward=150,
        credit_reward=200,
    ),
    "flood_responder": AchievementDefinition(
        id="flood_responder",
        name="Radar Pathfinder",
        description="Successfully complete the Flood Scout mission.",
        category=AchievementCategory.MISSION,
        icon="🌊",
        xp_reward=300,
        credit_reward=350,
    ),
    "solar_survivor": AchievementDefinition(
        id="solar_survivor",
        name="Sun Watcher",
        description="Survive radiation and solar storms in Solar Storm Sentinel.",
        category=AchievementCategory.MISSION,
        icon="☀️",
        xp_reward=400,
        credit_reward=500,
    ),
    "volcano_veteran": AchievementDefinition(
        id="volcano_veteran",
        name="Volcanic Sentinel",
        description="Successfully track eruption plumes in Volcano Watch.",
        category=AchievementCategory.MISSION,
        icon="🌋",
        xp_reward=450,
        credit_reward=550,
    ),
    "campaign_champion": AchievementDefinition(
        id="campaign_champion",
        name="Grand Architect of Orbit",
        description="Complete all four campaign missions.",
        category=AchievementCategory.MISSION,
        icon="👑",
        xp_reward=1000,
        credit_reward=1500,
    ),
    "what_if_analyst": AchievementDefinition(
        id="what_if_analyst",
        name="What-If Analyst",
        description="Replay a completed mission and beat your previous best score.",
        category=AchievementCategory.EXPLORATION,
        icon="🔄",
        xp_reward=200,
        credit_reward=250,
    ),
}

# ── Unlock catalog ───────────────────────────────────────────────────────────

UNLOCK_CATALOG: dict[str, UnlockDefinition] = {
    "high_density_battery": UnlockDefinition(
        id="high_density_battery",
        name="High-Density Li-Sulfur Battery",
        description="Advanced energy storage yielding +40% capacity for eclipse operations.",
        unlock_type=UnlockType.SPACECRAFT_MODULE,
        credit_cost=350,
        required_level=2,
        icon="🔋",
    ),
    "advanced_thermal": UnlockDefinition(
        id="advanced_thermal",
        name="Deployable Louvered Radiator",
        description="Trimmable heat rejection louvers that protect against overcooling in shadow.",
        unlock_type=UnlockType.SPACECRAFT_MODULE,
        credit_cost=500,
        required_level=3,
        icon="🌡️",
    ),
    "optical_sar_sensor": UnlockDefinition(
        id="optical_sar_sensor",
        name="Dual-Polarized SAR Array",
        description="High-resolution imaging radar with cloud penetration capabilities.",
        unlock_type=UnlockType.SPACECRAFT_MODULE,
        credit_cost=650,
        required_level=3,
        icon="📡",
    ),
    "cryo_radiator": UnlockDefinition(
        id="cryo_radiator",
        name="Cryogenic Thermal Cooler",
        description="Cools infrared and UV focal planes to 77K for sharp noise-free imagery.",
        unlock_type=UnlockType.SPACECRAFT_MODULE,
        credit_cost=800,
        required_level=4,
        icon="❄️",
    ),
    "ai_anomaly_detector": UnlockDefinition(
        id="ai_anomaly_detector",
        name="AI Anomaly Predictor",
        description="Enable LumenOS AI to predict subsystem anomalies 3 steps in advance.",
        unlock_type=UnlockType.AI_CAPABILITY,
        credit_cost=750,
        required_level=5,
        icon="🤖",
    ),
    "flood_scout_contract": UnlockDefinition(
        id="flood_scout_contract",
        name="Flood Scout Mission Contract",
        description="Unlock priority contract access to the Flood Scout scenario.",
        unlock_type=UnlockType.MISSION,
        credit_cost=200,
        required_level=2,
        icon="🌊",
    ),
    "solar_storm_mission": UnlockDefinition(
        id="solar_storm_mission",
        name="Solar Storm Sentinel Contract",
        description="Unlock the Solar Storm advanced polar observation mission.",
        unlock_type=UnlockType.MISSION,
        credit_cost=300,
        required_level=2,
        icon="☀️",
    ),
    "volcano_watch_mission": UnlockDefinition(
        id="volcano_watch_mission",
        name="Volcano Watch Mission Contract",
        description="Unlock hazardous multispectral monitoring over active volcanic belts.",
        unlock_type=UnlockType.MISSION,
        credit_cost=450,
        required_level=4,
        icon="🌋",
    ),
}


# ── XP / Level calculation ───────────────────────────────────────────────────


def xp_for_level(level: int) -> int:
    """XP required to reach a given level. Quadratic scaling."""
    return 100 * level * level


def level_from_xp(total_xp: int) -> int:
    """Determine level from total accumulated XP."""
    level = 1
    while xp_for_level(level + 1) <= total_xp:
        level += 1
    return level


def xp_from_grade(grade: Grade) -> int:
    """Base XP awarded based on mission grade."""
    xp_table: dict[Grade, int] = {
        Grade.A_PLUS: 500,
        Grade.A: 400,
        Grade.A_MINUS: 350,
        Grade.B_PLUS: 300,
        Grade.B: 250,
        Grade.B_MINUS: 200,
        Grade.C_PLUS: 150,
        Grade.C: 100,
        Grade.C_MINUS: 75,
        Grade.D: 50,
        Grade.F: 10,
    }
    return xp_table.get(grade, 10)


def credits_from_grade(grade: Grade, difficulty_multiplier: float = 1.0) -> int:
    """Engineering Credits awarded based on grade and difficulty."""
    base_table: dict[Grade, int] = {
        Grade.A_PLUS: 1000,
        Grade.A: 800,
        Grade.A_MINUS: 700,
        Grade.B_PLUS: 600,
        Grade.B: 500,
        Grade.B_MINUS: 400,
        Grade.C_PLUS: 300,
        Grade.C: 200,
        Grade.C_MINUS: 150,
        Grade.D: 100,
        Grade.F: 0,
    }
    base = base_table.get(grade, 0)
    return int(base * difficulty_multiplier)


# ── Player profile ───────────────────────────────────────────────────────────


class PlayerProfile(BaseModel):
    """Persistent player progression data."""
    player_id: str
    display_name: str = ""
    total_xp: int = Field(default=0, ge=0)
    engineering_credits: int = Field(default=0, ge=0)
    missions_completed: int = Field(default=0, ge=0)
    achievements: dict[str, AchievementProgress] = Field(default_factory=dict)
    unlocks: list[str] = Field(default_factory=list)
    campaign: CampaignProgress = Field(default_factory=CampaignProgress)

    @property
    def level(self) -> int:
        return level_from_xp(self.total_xp)

    @property
    def xp_to_next_level(self) -> int:
        return xp_for_level(self.level + 1) - self.total_xp

    def award_xp(self, amount: int) -> int:
        """Award XP and return the new level."""
        old_level = self.level
        self.total_xp += amount
        new_level = self.level
        # Check if new level unlocks campaign missions
        if new_level > old_level:
            self.campaign.update_unlocks(new_level)
        return new_level

    def award_credits(self, amount: int) -> None:
        """Award Engineering Credits (separate from mission budget!)."""
        self.engineering_credits += amount

    def spend_credits(self, amount: int) -> bool:
        """Attempt to spend credits. Returns True if successful."""
        if self.engineering_credits >= amount:
            self.engineering_credits -= amount
            return True
        return False

    def try_unlock(self, unlock_id: str) -> bool:
        """
        Attempt to purchase an unlock. Returns True if successful.

        Checks credit balance and level requirement.
        """
        if unlock_id in self.unlocks:
            return False  # Already unlocked

        defn = UNLOCK_CATALOG.get(unlock_id)
        if defn is None:
            return False

        if self.level < defn.required_level:
            return False

        if self.spend_credits(defn.credit_cost):
            self.unlocks.append(unlock_id)
            return True

        return False

    def grant_achievement(self, achievement_id: str) -> Optional[AchievementDefinition]:
        """
        Grant an achievement if not already unlocked.

        Awards the achievement's XP and credit rewards.
        Returns the achievement definition if newly granted, None otherwise.
        """
        defn = ACHIEVEMENT_CATALOG.get(achievement_id)
        if defn is None:
            return None

        progress = self.achievements.get(achievement_id)
        if progress and progress.unlocked:
            return None  # Already have it

        self.achievements[achievement_id] = AchievementProgress(
            achievement_id=achievement_id,
            unlocked=True,
            progress_value=1.0,
            target_value=1.0,
        )
        self.award_xp(defn.xp_reward)
        self.award_credits(defn.credit_reward)
        return defn

    def process_mission_completion(
        self,
        grade: Grade,
        difficulty_multiplier: float = 1.0,
        mission_id: str = "wildfire",
        stars: int = 1,
        is_win: bool = True,
        spacecraft_health_pct: float = 100.0,
        budget_spent_pct: float = 50.0,
        score: float = 85.0,
    ) -> dict[str, Any]:
        """
        Process rewards for completing a mission.

        Evaluates campaign progression, replay rewards, achievements,
        and level-based unlocks.
        """
        # Record into campaign progress
        campaign_result = self.campaign.record_mission_result(
            mission_id=mission_id,
            score=score,
            grade=grade,
            stars=stars,
            is_win=is_win,
            difficulty_multiplier=difficulty_multiplier,
        )

        xp_earned = campaign_result["xp_awarded"]
        credits_earned = campaign_result["credits_awarded"]

        self.award_xp(xp_earned)
        self.award_credits(credits_earned)

        if is_win:
            self.missions_completed += 1

        # Evaluate achievement triggers
        new_achievements: list[str] = []

        if self.missions_completed == 1 and is_win:
            if self.grant_achievement("first_launch"):
                new_achievements.append("first_launch")

        if grade == Grade.A_PLUS:
            if self.grant_achievement("perfect_score"):
                new_achievements.append("perfect_score")

        if stars == 3:
            if self.grant_achievement("three_stars"):
                new_achievements.append("three_stars")

        if is_win and budget_spent_pct <= 50.0:
            if self.grant_achievement("budget_master"):
                new_achievements.append("budget_master")

        if is_win and spacecraft_health_pct >= 95.0:
            if self.grant_achievement("clean_telemetry"):
                new_achievements.append("clean_telemetry")

        if is_win and mission_id == "flood":
            if self.grant_achievement("flood_responder"):
                new_achievements.append("flood_responder")

        if is_win and mission_id == "solar_storm":
            if self.grant_achievement("solar_survivor"):
                new_achievements.append("solar_survivor")

        if is_win and mission_id == "volcano":
            if self.grant_achievement("volcano_veteran"):
                new_achievements.append("volcano_veteran")

        if self.campaign.is_campaign_complete():
            if self.grant_achievement("campaign_champion"):
                new_achievements.append("campaign_champion")

        if campaign_result.get("is_new_best_score") and not campaign_result.get("is_first_completion"):
            if self.grant_achievement("what_if_analyst"):
                new_achievements.append("what_if_analyst")

        # Check for newly unlocked missions based on level and campaign
        newly_unlocked = self.campaign.update_unlocks(self.level)

        return {
            "mission_id": mission_id,
            "xp_earned": xp_earned,
            "credits_earned": credits_earned,
            "stars_earned": stars,
            "best_stars": campaign_result.get("best_stars", stars),
            "new_stars_earned": campaign_result.get("new_stars_earned", 0),
            "is_first_completion": campaign_result["is_first_completion"],
            "new_achievements": new_achievements,
            "newly_unlocked_missions": newly_unlocked,
            "total_xp": self.total_xp,
            "level": self.level,
            "engineering_credits": self.engineering_credits,
            "explanation": campaign_result["explanation"],
        }

    # ── Save / Load Persistence ──────────────────────────────────────────

    def to_json(self, indent: int = 2) -> str:
        """Serialize player profile to JSON string."""
        return self.model_dump_json(indent=indent)

    @classmethod
    def from_json(cls, json_str: str) -> PlayerProfile:
        """Deserialize player profile from JSON string."""
        return cls.model_validate_json(json_str)

    def save_to_file(self, filepath: str | Path) -> None:
        """Save player profile to disk atomically."""
        p = Path(filepath)
        p.parent.mkdir(parents=True, exist_ok=True)
        temp_path = p.with_suffix(".tmp")
        temp_path.write_text(self.to_json(), encoding="utf-8")
        temp_path.replace(p)

    @classmethod
    def load_from_file(cls, filepath: str | Path) -> PlayerProfile:
        """Load player profile from disk."""
        p = Path(filepath)
        if not p.exists():
            raise FileNotFoundError(f"Player profile not found at {p}")
        return cls.from_json(p.read_text(encoding="utf-8"))
