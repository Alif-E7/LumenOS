"""
LumenOS Game Layer — Mission contracts, roles, events, scoring, and progression.

This package sits between the simulation engine and the API/UI layers,
providing the game mechanics that turn a physics simulation into an
educational strategy game.
"""

from game.contracts import (
    MissionContract,
    ObjectiveDefinition,
    Difficulty,
    OutcomeType,
    ContractOutcome,
    WinCondition,
    FailCondition,
)
from game.roles import RoleName, RoleAssignment
from game.state import GameState
from game.scoring import MissionScorer, ScoreBreakdown, Grade, score_to_grade
from game.progression import (
    PlayerProfile,
    AchievementDefinition,
    UnlockDefinition,
    ACHIEVEMENT_CATALOG,
    UNLOCK_CATALOG,
)
from game.campaign import (
    CampaignProgress,
    MissionRecord,
    MissionNode,
    CAMPAIGN_ORDER,
    CAMPAIGN_NODE_MAP,
)
from game.difficulty import (
    DifficultyProfile,
    DIFFICULTY_PROFILES,
    get_difficulty_profile,
    apply_difficulty_to_contract,
)
from game.tutorial import (
    TutorialMode,
    TutorialStage,
    TutorialStep,
    TUTORIAL_STEPS,
    TutorialSession,
    TutorialContractFactory,
)
from game.catalog import (
    SubsystemType,
    CatalogItem,
    ALL_CATALOG_ITEMS,
    CATALOG_BY_ID,
    LAUNCHERS,
    ORBIT_OPTIONS,
    INSTRUMENTS,
    COMPUTERS,
    BATTERIES,
    SOLAR_ARRAYS,
    THERMAL_SYSTEMS,
    COMMS_SYSTEMS,
    STORAGE_SYSTEMS,
    SHIELDING_SYSTEMS,
    LAUNCHER_CAPACITIES_KG,
    get_catalog_item,
    get_items_by_subsystem,
)
from game.designer import (
    SpacecraftDesign,
    LiveEngineeringMetrics,
    DesignerEngine,
)
from game.engineering_review import (
    ReviewStatus,
    LaunchReadiness,
    EngineeringCheckResult,
    PreLaunchReviewReport,
    PreLaunchReviewer,
    PRESET_BUILDS,
)

__all__ = [
    "MissionContract",
    "ObjectiveDefinition",
    "Difficulty",
    "OutcomeType",
    "ContractOutcome",
    "WinCondition",
    "FailCondition",
    "RoleName",
    "RoleAssignment",
    "GameState",
    "MissionScorer",
    "ScoreBreakdown",
    "Grade",
    "score_to_grade",
    "PlayerProfile",
    "AchievementDefinition",
    "UnlockDefinition",
    "ACHIEVEMENT_CATALOG",
    "UNLOCK_CATALOG",
    "CampaignProgress",
    "MissionRecord",
    "MissionNode",
    "CAMPAIGN_ORDER",
    "CAMPAIGN_NODE_MAP",
    "DifficultyProfile",
    "DIFFICULTY_PROFILES",
    "get_difficulty_profile",
    "apply_difficulty_to_contract",
    "TutorialMode",
    "TutorialStage",
    "TutorialStep",
    "TUTORIAL_STEPS",
    "TutorialSession",
    "TutorialContractFactory",
    "SubsystemType",
    "CatalogItem",
    "ALL_CATALOG_ITEMS",
    "CATALOG_BY_ID",
    "LAUNCHERS",
    "ORBIT_OPTIONS",
    "INSTRUMENTS",
    "COMPUTERS",
    "BATTERIES",
    "SOLAR_ARRAYS",
    "THERMAL_SYSTEMS",
    "COMMS_SYSTEMS",
    "STORAGE_SYSTEMS",
    "SHIELDING_SYSTEMS",
    "LAUNCHER_CAPACITIES_KG",
    "get_catalog_item",
    "get_items_by_subsystem",
    "SpacecraftDesign",
    "LiveEngineeringMetrics",
    "DesignerEngine",
    "ReviewStatus",
    "LaunchReadiness",
    "EngineeringCheckResult",
    "PreLaunchReviewReport",
    "PreLaunchReviewer",
    "PRESET_BUILDS",
]
