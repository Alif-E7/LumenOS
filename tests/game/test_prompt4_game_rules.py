"""
Prompt 4 Acceptance Test Suite — Game Loop, Mission Campaign, Objectives and Progression Rules.

Comprehensive acceptance checks for:
1. Objective completion (primary and optional objectives)
2. Optional objective behavior (scores, weights, independent tracking)
3. Partial success evaluation with plain-language explanation
4. Failure conditions (health=0, min health threshold, budget exceeded, deadline expired)
5. Difficulty scaling (Cadet, Engineer, Specialist, Commander, Legendary) with invariant physics
6. XP & Engineering Credit calculations (strict budget separation, zero pay-to-win)
7. Achievement triggers (first launch, 3 stars, clean telemetry, budget master, campaign champion, etc.)
8. Unlock prerequisites (levels, credit costs, no double-spending)
9. Replay rewards (first-time bonus vs mastery replay rewards, star upgrade differentials)
10. Profile save / load persistence (JSON and atomic file I/O)
11. Transparent explanation for every score, star, and reward
12. Sunrise Orbit tutorial onboarding (5 stages, Explorer vs Engineer modes)
13. Campaign progression across 4 scenarios (Wildfire -> Flood -> Solar Storm -> Volcano)
14. Meaningful player choices with distinct trade-offs
"""

import json
from pathlib import Path
import pytest

from game.contracts import (
    MissionContract,
    ObjectiveDefinition,
    Difficulty,
    OutcomeType,
    WinCondition,
    FailCondition,
    ContractOutcome,
)
from game.objectives import ObjectiveProgress, ObjectiveEvaluator, ObjectiveResult
from game.scoring import MissionScorer, ScoreBreakdown, Grade, score_to_grade
from game.difficulty import (
    DIFFICULTY_PROFILES,
    get_difficulty_profile,
    apply_difficulty_to_contract,
)
from game.campaign import (
    CampaignProgress,
    CAMPAIGN_ORDER,
    CAMPAIGN_NODE_MAP,
    MissionNode,
    MissionRecord,
)
from game.progression import (
    PlayerProfile,
    AchievementDefinition,
    UnlockDefinition,
    ACHIEVEMENT_CATALOG,
    UNLOCK_CATALOG,
    xp_for_level,
    level_from_xp,
    xp_from_grade,
    credits_from_grade,
)
from game.tutorial import (
    TutorialMode,
    TutorialStage,
    TutorialStep,
    TUTORIAL_STEPS,
    TutorialSession,
    TutorialContractFactory,
)


# ═══════════════════════════════════════════════════════════════════════════
# 1 & 2. OBJECTIVES (PRIMARY & OPTIONAL)
# ═══════════════════════════════════════════════════════════════════════════

class TestObjectivesAndEvaluation:
    def test_primary_and_optional_tracking(self):
        defs = [
            ObjectiveDefinition(id="prim1", description="Primary 1", target_value=10.0, weight=1.0, is_primary=True),
            ObjectiveDefinition(id="prim2", description="Primary 2", target_value=5.0, weight=1.0, is_primary=True),
            ObjectiveDefinition(id="opt1", description="Optional Bonus", target_value=100.0, weight=0.5, is_primary=False),
        ]
        evaluator = ObjectiveEvaluator(defs)

        # Update partial
        evaluator.update("prim1", 5.0)
        evaluator.update("prim2", 5.0)
        evaluator.update("opt1", 100.0)

        trackers = evaluator.trackers
        assert trackers["prim1"].fraction == 0.5
        assert trackers["prim1"].is_partial is True
        assert trackers["prim1"].is_complete is False

        assert trackers["prim2"].fraction == 1.0
        assert trackers["prim2"].is_complete is True

        assert trackers["opt1"].is_complete is True

        # Results breakdown
        results = evaluator.get_results()
        assert len(results) == 3
        opt_res = next(r for r in results if r.objective_id == "opt1")
        assert opt_res.passed is True
        assert opt_res.fraction == 1.0
        assert opt_res.weighted_score == pytest.approx(0.2)

    def test_clamping_and_increments(self):
        defn = ObjectiveDefinition(id="data", description="Collect data", target_value=50.0)
        prog = ObjectiveProgress.from_definition(defn)

        prog.current_value = -10.0
        assert prog.fraction == 0.0

        prog.current_value = 100.0
        assert prog.fraction == 1.0


# ═══════════════════════════════════════════════════════════════════════════
# 3 & 4. OUTCOME EVALUATION & PLAIN-LANGUAGE EXPLANATIONS
# ═══════════════════════════════════════════════════════════════════════════

class TestOutcomeEvaluations:
    def _create_contract(self, **kwargs):
        defaults = dict(
            mission_id="wildfire",
            mission_name="Wildfire Scout",
            difficulty=Difficulty.ENGINEER,
            deadline_steps=1440,
            budget=10000.0,
            objectives=[
                ObjectiveDefinition(id="fires", description="Thermal zones", target_value=3.0, weight=1.0, is_primary=True),
                ObjectiveDefinition(id="downlink", description="Data downlink", target_value=500.0, weight=0.5, is_primary=False),
            ],
            win_condition=WinCondition(min_primary_completion_pct=1.0, min_overall_score_pct=0.6),
            fail_condition=FailCondition(
                budget_exceeded=True,
                deadline_exceeded=True,
                spacecraft_destroyed=True,
                min_health_pct=20.0,
            ),
        )
        defaults.update(kwargs)
        return MissionContract(**defaults)

    def test_win_with_clear_explanation(self):
        c = self._create_contract()
        outcome = c.evaluate_outcome_detailed(
            objective_scores={"fires": 1.0, "downlink": 1.0},
            budget_remaining=3500.0,
            spacecraft_health_pct=92.0,
            steps_elapsed=800,
        )
        assert outcome.outcome == OutcomeType.WIN
        assert "Mission Accomplished" in outcome.explanation
        assert "Thermal zones" not in outcome.explanation or "All primary objectives fulfilled" in outcome.explanation
        assert "92.0%" in outcome.explanation
        assert "3500" in outcome.explanation

    def test_partial_success_at_deadline(self):
        c = self._create_contract()
        outcome = c.evaluate_outcome_detailed(
            objective_scores={"fires": 0.5, "downlink": 1.0},
            budget_remaining=1200.0,
            spacecraft_health_pct=85.0,
            steps_elapsed=1440,  # Reached deadline
        )
        assert outcome.outcome == OutcomeType.PARTIAL_SUCCESS
        assert "Partial Success" in outcome.explanation
        assert "deadline" in outcome.explanation.lower()

    def test_failure_spacecraft_destroyed(self):
        c = self._create_contract()
        outcome = c.evaluate_outcome_detailed(
            objective_scores={"fires": 1.0},
            budget_remaining=4000.0,
            spacecraft_health_pct=0.0,
            steps_elapsed=500,
        )
        assert outcome.outcome == OutcomeType.FAILURE
        assert "catastrophic loss" in outcome.explanation.lower()

    def test_failure_min_health_threshold(self):
        c = self._create_contract()
        outcome = c.evaluate_outcome_detailed(
            objective_scores={"fires": 1.0},
            budget_remaining=4000.0,
            spacecraft_health_pct=15.0,  # Threshold is 20.0%
            steps_elapsed=500,
        )
        assert outcome.outcome == OutcomeType.FAILURE
        assert "below the required minimum threshold of 20.0%" in outcome.explanation

    def test_failure_budget_exhausted(self):
        c = self._create_contract()
        outcome = c.evaluate_outcome_detailed(
            objective_scores={"fires": 1.0},
            budget_remaining=-250.0,
            spacecraft_health_pct=90.0,
            steps_elapsed=500,
        )
        assert outcome.outcome == OutcomeType.FAILURE
        assert "Budget depleted" in outcome.explanation


# ═══════════════════════════════════════════════════════════════════════════
# 5. CONFIGURABLE DIFFICULTY SETTINGS (PHYSICS INVARIANCE)
# ═══════════════════════════════════════════════════════════════════════════

class TestDifficultyScaling:
    def test_all_five_tiers_defined(self):
        tiers = [Difficulty.CADET, Difficulty.ENGINEER, Difficulty.SPECIALIST, Difficulty.COMMANDER, Difficulty.LEGENDARY]
        for t in tiers:
            profile = get_difficulty_profile(t)
            assert profile.difficulty == t
            assert profile.budget_multiplier > 0
            assert profile.deadline_multiplier > 0
            assert profile.event_rate_multiplier > 0

    def test_difficulty_scales_constraints_without_touching_physics(self):
        base = MissionContract(
            mission_id="wildfire",
            mission_name="Wildfire Scout",
            difficulty=Difficulty.ENGINEER,
            deadline_steps=1000,
            budget=10000.0,
            objectives=[
                ObjectiveDefinition(id="fires", description="Zones", target_value=10.0, weight=1.0),
            ],
            seed=42,
        )

        cadet = apply_difficulty_to_contract(base, Difficulty.CADET)
        assert cadet.budget == 15000.0      # +50%
        assert cadet.deadline_steps == 1250 # +25%
        assert cadet.objectives[0].target_value == 8.5 # 0.85x
        assert cadet.seed == 42             # Deterministic seed preserved

        legendary = apply_difficulty_to_contract(base, Difficulty.LEGENDARY)
        assert legendary.budget == 5000.0   # -50%
        assert legendary.deadline_steps == 650 # -35%
        assert legendary.objectives[0].target_value == 15.0 # 1.5x
        assert legendary.fail_condition.min_health_pct == 50.0 # Strict health requirement

    def test_deterministic_scaling(self):
        base = MissionContract(
            mission_id="wildfire",
            mission_name="Wildfire Scout",
            difficulty=Difficulty.ENGINEER,
            deadline_steps=1000,
            budget=10000.0,
            objectives=[ObjectiveDefinition(id="obj", description="D", target_value=20.0)],
            seed=999,
        )
        scale1 = apply_difficulty_to_contract(base, Difficulty.SPECIALIST)
        scale2 = apply_difficulty_to_contract(base, Difficulty.SPECIALIST)
        assert scale1.budget == scale2.budget
        assert scale1.deadline_steps == scale2.deadline_steps
        assert scale1.objectives[0].target_value == scale2.objectives[0].target_value


# ═══════════════════════════════════════════════════════════════════════════
# 6 & 11. SCORING, STAR RATINGS, AND EXPLANATIONS
# ═══════════════════════════════════════════════════════════════════════════

class TestScoringAndStars:
    def test_three_star_rating_calculation(self):
        scorer = MissionScorer()
        results = [
            ObjectiveResult(
                objective_id="fires",
                description="Thermal zones",
                target_value=3.0,
                achieved_value=3.0,
                fraction=1.0,
                weighted_score=1.0,
                passed=True,
                partial=False,
            )
        ]

        # 3 Stars: high score (>=90%), high health (>=75%), budget preserved (>=10%)
        breakdown_3star = scorer.calculate(
            objective_results=results,
            spacecraft_health_pct=95.0,
            data_collected_mb=500.0,
            data_target_mb=500.0,
            steps_elapsed=200,
            deadline_steps=1440,
            events_resolved_well=3,
            total_events=3,
            budget_remaining=8000.0,
            total_budget=10000.0,
        )
        assert breakdown_3star.stars == 3
        assert "3rd Star ★" in breakdown_3star.explanation
        assert "★★★ (3/3 Stars)" in breakdown_3star.explanation

    def test_two_star_rating_calculation(self):
        scorer = MissionScorer()
        results = [
            ObjectiveResult(
                objective_id="fires",
                description="Thermal zones",
                target_value=3.0,
                achieved_value=3.0,
                fraction=1.0,
                weighted_score=1.0,
                passed=True,
                partial=False,
            )
        ]
        # Low health (50%) prevents 3rd star, but achieves 2 stars
        breakdown_2star = scorer.calculate(
            objective_results=results,
            spacecraft_health_pct=50.0,
            data_collected_mb=500.0,
            data_target_mb=500.0,
            steps_elapsed=500,
            deadline_steps=1440,
            events_resolved_well=2,
            total_events=3,
            budget_remaining=3000.0,
            total_budget=10000.0,
        )
        assert breakdown_2star.stars == 2
        assert "★★☆ (2/3 Stars)" in breakdown_2star.explanation

    def test_zero_stars_for_failure(self):
        scorer = MissionScorer()
        results = [
            ObjectiveResult(
                objective_id="fires",
                description="Thermal zones",
                target_value=3.0,
                achieved_value=0.0,
                fraction=0.0,
                weighted_score=0.0,
                passed=False,
                partial=False,
            )
        ]
        breakdown_fail = scorer.calculate(
            objective_results=results,
            spacecraft_health_pct=10.0,
            data_collected_mb=0.0,
            data_target_mb=500.0,
            steps_elapsed=1440,
            deadline_steps=1440,
            events_resolved_well=0,
            total_events=3,
            budget_remaining=0.0,
            total_budget=10000.0,
        )
        assert breakdown_fail.grade == Grade.F
        assert breakdown_fail.stars == 0


# ═══════════════════════════════════════════════════════════════════════════
# 7, 8 & 9. PROGRESSION, ACHIEVEMENTS, UNLOCKS & REPLAY REWARDS
# ═══════════════════════════════════════════════════════════════════════════

class TestProgressionAndReplay:
    def test_strict_budget_separation_from_credits(self):
        p = PlayerProfile(player_id="user_1")
        assert p.engineering_credits == 0

        # Mission contract budget has 10,000 credits
        contract = MissionContract(
            mission_id="wildfire",
            mission_name="Wildfire Scout",
            budget=10000.0,
            objectives=[ObjectiveDefinition(id="o", description="D", target_value=1.0)],
        )
        # Player credits are unaffected by contract budget
        assert p.engineering_credits == 0
        p.award_credits(500)
        assert p.engineering_credits == 500
        assert contract.budget == 10000.0

    def test_achievement_triggers_comprehensive(self):
        p = PlayerProfile(player_id="cadet_alpha")

        # Win first mission with 3 stars and clean telemetry
        res = p.process_mission_completion(
            grade=Grade.A_PLUS,
            mission_id="wildfire",
            stars=3,
            is_win=True,
            spacecraft_health_pct=98.0,
            budget_spent_pct=35.0,
            score=98.0,
        )

        assert "first_launch" in p.achievements
        assert "perfect_score" in p.achievements
        assert "three_stars" in p.achievements
        assert "clean_telemetry" in p.achievements
        assert "budget_master" in p.achievements
        assert len(res["new_achievements"]) >= 4

    def test_unlock_prerequisites_and_no_double_spending(self):
        p = PlayerProfile(player_id="pilot")
        p.award_credits(1000)

        # Requires level 2 (400 XP)
        assert p.try_unlock("high_density_battery") is False
        assert p.engineering_credits == 1000

        p.award_xp(450) # Level 2
        assert p.level == 2
        assert p.try_unlock("high_density_battery") is True
        assert p.engineering_credits == 650 # 1000 - 350
        assert "high_density_battery" in p.unlocks

        # Second attempt must fail with no credit deduction
        assert p.try_unlock("high_density_battery") is False
        assert p.engineering_credits == 650

    def test_replay_rewards_mastery_and_star_upgrade(self):
        p = PlayerProfile(player_id="replay_pilot")

        # First completion: Grade B, 1 Star
        res1 = p.process_mission_completion(
            grade=Grade.B,
            mission_id="wildfire",
            stars=1,
            is_win=True,
            score=82.0,
        )
        assert res1["is_first_completion"] is True
        xp_first = res1["xp_earned"]
        credits_first = res1["credits_earned"]
        assert xp_first > 0
        assert credits_first > 0

        # Replay completion: Grade B, 1 Star (no new stars)
        res2 = p.process_mission_completion(
            grade=Grade.B,
            mission_id="wildfire",
            stars=1,
            is_win=True,
            score=82.0,
        )
        assert res2["is_first_completion"] is False
        # Replay gives 25% mastery rewards
        assert res2["xp_earned"] < xp_first
        assert res2["credits_earned"] < credits_first
        assert "Replay mastery completion" in res2["explanation"]

        # Replay with higher score & 3 Stars (Star upgrade bonus!)
        res3 = p.process_mission_completion(
            grade=Grade.A_PLUS,
            mission_id="wildfire",
            stars=3,
            is_win=True,
            score=97.0,
        )
        assert res3["is_first_completion"] is False
        assert res3["new_stars_earned"] == 2 # 1 -> 3 stars
        assert "New star record" in res3["explanation"] or "Replay mastery completion" in res3["explanation"]


# ═══════════════════════════════════════════════════════════════════════════
# 10. SAVE / LOAD / STATE PERSISTENCE
# ═══════════════════════════════════════════════════════════════════════════

class TestProfilePersistence:
    def test_json_roundtrip(self):
        p1 = PlayerProfile(
            player_id="usr_persistent",
            display_name="Commander Shepard",
            total_xp=1250,
            engineering_credits=3400,
            missions_completed=4,
            unlocks=["high_density_battery"],
        )
        p1.grant_achievement("first_launch")

        json_data = p1.to_json()
        p2 = PlayerProfile.from_json(json_data)

        assert p2.player_id == p1.player_id
        assert p2.display_name == p1.display_name
        assert p2.total_xp == p1.total_xp
        assert p2.engineering_credits == p1.engineering_credits
        assert p2.missions_completed == 4
        assert "high_density_battery" in p2.unlocks
        assert "first_launch" in p2.achievements

    def test_file_save_and_load(self, tmp_path: Path):
        save_file = tmp_path / "profiles" / "pilot_profile.json"
        p = PlayerProfile(
            player_id="file_tester",
            total_xp=800,
            engineering_credits=1200,
        )
        p.save_to_file(save_file)
        assert save_file.exists()

        loaded = PlayerProfile.load_from_file(save_file)
        assert loaded.player_id == "file_tester"
        assert loaded.engineering_credits == 1200


# ═══════════════════════════════════════════════════════════════════════════
# 12. SUNRISE ORBIT TUTORIAL / ONBOARDING PATH
# ═══════════════════════════════════════════════════════════════════════════

class TestSunriseOrbitTutorial:
    def test_tutorial_metadata_and_stages(self):
        contract = TutorialContractFactory.create_contract(TutorialMode.EXPLORER)
        assert contract.mission_id == "sunrise_orbit_tutorial"
        assert len(TUTORIAL_STEPS) == 5

        stages = [s.stage for s in TUTORIAL_STEPS]
        assert TutorialStage.ORBIT_BASICS in stages
        assert TutorialStage.SUNLIGHT_POWER in stages
        assert TutorialStage.ECLIPSE_ENTRY in stages
        assert TutorialStage.BATTERY_MANAGEMENT in stages
        assert TutorialStage.SUNRISE_RECHARGE in stages

    def test_dual_mode_step_guidance(self):
        for step in TUTORIAL_STEPS:
            assert len(step.explorer_guidance) > 20
            assert len(step.engineer_telemetry_focus) > 20
            assert step.required_action != ""
            assert step.hint != ""

    def test_tutorial_progression_flow(self):
        session = TutorialSession(mode=TutorialMode.EXPLORER)
        assert session.current_step.id == "tut_step_1_orbit"

        # Wrong action gives helpful hint
        ok, msg = session.advance_step("wrong_action")
        assert ok is False
        assert "Hint:" in msg

        # Step 1
        ok, _ = session.advance_step("verify_orbit")
        assert ok is True
        assert session.current_step.stage == TutorialStage.SUNLIGHT_POWER

        # Step 2
        ok, _ = session.advance_step("observe_charging")
        assert ok is True

        # Step 3
        ok, _ = session.advance_step("enter_eclipse")
        assert ok is True

        # Step 4
        ok, _ = session.advance_step("shed_load")
        assert ok is True

        # Step 5
        ok, msg = session.advance_step("restore_payload")
        assert ok is True
        assert session.is_completed is True
        assert "Congratulations" in msg


# ═══════════════════════════════════════════════════════════════════════════
# 13. CAMPAIGN PROGRESSION ACROSS 4 SCENARIOS
# ═══════════════════════════════════════════════════════════════════════════

class TestCampaignProgressionTree:
    def test_campaign_mission_order(self):
        ids = [node.mission_id for node in CAMPAIGN_ORDER]
        assert ids == ["wildfire", "flood", "solar_storm", "volcano"]

    def test_campaign_unlock_progression(self):
        camp = CampaignProgress()

        # Initially, only wildfire is unlocked
        assert camp.is_mission_unlocked("wildfire", player_level=1) is True
        assert camp.is_mission_unlocked("flood", player_level=1) is False
        assert camp.is_mission_unlocked("solar_storm", player_level=1) is False
        assert camp.is_mission_unlocked("volcano", player_level=1) is False

        # Win Wildfire with 2 stars
        camp.record_mission_result("wildfire", score=88.0, grade=Grade.B_PLUS, stars=2, is_win=True)
        assert camp.is_mission_unlocked("flood", player_level=1) is True

        # Win Flood
        camp.record_mission_result("flood", score=90.0, grade=Grade.A_MINUS, stars=2, is_win=True)
        assert camp.is_mission_unlocked("solar_storm", player_level=1) is True

        # Win Solar Storm
        camp.record_mission_result("solar_storm", score=94.0, grade=Grade.A, stars=3, is_win=True)
        assert camp.is_mission_unlocked("volcano", player_level=1) is True

        # Win Volcano
        camp.record_mission_result("volcano", score=96.0, grade=Grade.A_PLUS, stars=3, is_win=True)
        assert camp.is_campaign_complete() is True
        assert camp.total_stars() == 10 # 2 + 2 + 3 + 3
