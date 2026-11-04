"""
Progression — XP, Engineering Credits, achievements, and unlocks.

Engineering Credits (earned through gameplay) are completely separate
from Mission Budget (the constraint within a contract). Players earn XP
and credits for completing missions; credits unlock new capabilities.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from game.scoring import Grade


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
}

# ── Unlock catalog ───────────────────────────────────────────────────────────

UNLOCK_CATALOG: dict[str, UnlockDefinition] = {
    "advanced_thermal": UnlockDefinition(
        id="advanced_thermal",
        name="Advanced Thermal Control",
        description="Unlock advanced thermal management modules.",
        unlock_type=UnlockType.SPACECRAFT_MODULE,
        credit_cost=500,
        required_level=3,
        icon="🌡️",
    ),
    "ai_anomaly_detector": UnlockDefinition(
        id="ai_anomaly_detector",
        name="AI Anomaly Detector",
        description="Enable LumenOS AI to predict subsystem anomalies (may be wrong!).",
        unlock_type=UnlockType.AI_CAPABILITY,
        credit_cost=750,
        required_level=5,
        icon="🤖",
    ),
    "solar_storm_mission": UnlockDefinition(
        id="solar_storm_mission",
        name="Solar Storm Mission",
        description="Unlock the Solar Storm advanced mission.",
        unlock_type=UnlockType.MISSION,
        credit_cost=300,
        required_level=2,
        icon="☀️",
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
        return self.level

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
    ) -> dict[str, int]:
        """
        Process rewards for completing a mission.

        Returns a dict with xp_earned and credits_earned.
        """
        xp = xp_from_grade(grade)
        credits = credits_from_grade(grade, difficulty_multiplier)

        self.award_xp(xp)
        self.award_credits(credits)
        self.missions_completed += 1

        # Check for first_launch achievement
        if self.missions_completed == 1:
            self.grant_achievement("first_launch")

        # Check for perfect_score achievement
        if grade == Grade.A_PLUS:
            self.grant_achievement("perfect_score")

        return {"xp_earned": xp, "credits_earned": credits}
