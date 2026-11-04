"""Tests for the game layer — contracts, roles, events, scoring, progression."""

from game.contracts import (
    MissionContract, ObjectiveDefinition, Difficulty, OutcomeType,
    WinCondition, FailCondition,
)
from game.roles import (
    RoleName, RoleAssignment, PERMISSION_MATRIX, assign_roles, has_permission,
)
from game.actions import ActionType, build_action, ACTION_CATALOG
from game.events import EventDirector, EventPhase
from game.objectives import ObjectiveProgress, ObjectiveEvaluator
from game.scoring import MissionScorer, ScoringConfig, score_to_grade, Grade
from game.progression import (
    PlayerProfile, xp_for_level, level_from_xp,
    xp_from_grade, credits_from_grade,
    ACHIEVEMENT_CATALOG, UNLOCK_CATALOG,
)
from game.state import GameState
from api.models.mission import MissionEventTemplate, EventChoice, EventSeverity

import pytest


# ═══════════════════════════════════════════════════════════════════════════
# CONTRACTS
# ═══════════════════════════════════════════════════════════════════════════

class TestContracts:
    def _make_contract(self, **kwargs):
        defaults = dict(
            mission_id="test",
            mission_name="Test Mission",
            objectives=[
                ObjectiveDefinition(id="obj1", description="Primary obj", target_value=10.0, is_primary=True),
                ObjectiveDefinition(id="obj2", description="Optional obj", target_value=5.0, is_primary=False, weight=0.5),
            ],
        )
        defaults.update(kwargs)
        return MissionContract(**defaults)

    def test_primary_and_optional_objectives(self):
        c = self._make_contract()
        assert len(c.primary_objectives) == 1
        assert len(c.optional_objectives) == 1

    def test_win_outcome(self):
        c = self._make_contract()
        outcome = c.evaluate_outcome(
            objective_scores={"obj1": 1.0, "obj2": 1.0},
            budget_remaining=5000.0,
            spacecraft_health_pct=90.0,
            steps_elapsed=500,
        )
        assert outcome == OutcomeType.WIN

    def test_failure_health_zero(self):
        c = self._make_contract()
        outcome = c.evaluate_outcome(
            objective_scores={"obj1": 1.0},
            budget_remaining=5000.0,
            spacecraft_health_pct=0.0,
            steps_elapsed=100,
        )
        assert outcome == OutcomeType.FAILURE

    def test_failure_budget_exceeded(self):
        c = self._make_contract()
        outcome = c.evaluate_outcome(
            objective_scores={"obj1": 0.5},
            budget_remaining=-100.0,
            spacecraft_health_pct=80.0,
            steps_elapsed=100,
        )
        assert outcome == OutcomeType.FAILURE

    def test_partial_success(self):
        c = self._make_contract(deadline_steps=100)
        outcome = c.evaluate_outcome(
            objective_scores={"obj1": 0.5, "obj2": 0.3},
            budget_remaining=5000.0,
            spacecraft_health_pct=80.0,
            steps_elapsed=100,  # At deadline
        )
        assert outcome == OutcomeType.PARTIAL_SUCCESS

    def test_difficulty_from_int(self):
        assert Difficulty.from_int(1) == Difficulty.CADET
        assert Difficulty.from_int(5) == Difficulty.LEGENDARY
        assert Difficulty.from_int(99) == Difficulty.ENGINEER  # fallback


# ═══════════════════════════════════════════════════════════════════════════
# ROLES & PERMISSIONS
# ═══════════════════════════════════════════════════════════════════════════

class TestRoles:
    def test_four_roles_defined(self):
        assert len(RoleName) == 4

    def test_permission_matrix_covers_all_roles(self):
        for role in RoleName:
            assert role in PERMISSION_MATRIX, f"Missing permissions for {role}"

    def test_role_permissions_nonempty(self):
        for role in RoleName:
            perms = PERMISSION_MATRIX[role]
            assert len(perms) > 0, f"{role} has no permissions"

    def test_has_permission(self):
        assert has_permission(RoleName.SYSTEMS_ENGINEER, ActionType.TOGGLE_SUBSYSTEM)
        assert not has_permission(RoleName.SCIENCE_OFFICER, ActionType.TOGGLE_SUBSYSTEM)

    def test_set_control_mode_shared(self):
        """SET_CONTROL_MODE should be available to all roles."""
        for role in RoleName:
            assert has_permission(role, ActionType.SET_CONTROL_MODE)

    def test_assign_roles_4_players(self):
        assignment = assign_roles(["p1", "p2", "p3", "p4"])
        assert len(assignment.player_roles) == 4
        # Each player should have exactly 1 role
        for roles in assignment.player_roles.values():
            assert len(roles) == 1

    def test_assign_roles_1_player(self):
        assignment = assign_roles(["solo"])
        roles = assignment.player_roles["solo"]
        assert len(roles) == 4  # All four roles

    def test_assign_roles_2_players(self):
        assignment = assign_roles(["p1", "p2"])
        # Each should have 2 roles
        for roles in assignment.player_roles.values():
            assert len(roles) == 2
        # All roles should be covered
        all_roles = set()
        for roles in assignment.player_roles.values():
            all_roles.update(roles)
        assert all_roles == set(RoleName)

    def test_assign_roles_invalid(self):
        with pytest.raises(ValueError):
            assign_roles([])
        with pytest.raises(ValueError):
            assign_roles(["1", "2", "3", "4", "5"])

    def test_can_perform(self):
        assignment = assign_roles(["p1", "p2", "p3", "p4"])
        # First player is mission director
        assert assignment.can_perform("p1", ActionType.ALLOCATE_BUDGET)
        assert not assignment.can_perform("p1", ActionType.TOGGLE_SUBSYSTEM)


# ═══════════════════════════════════════════════════════════════════════════
# ACTIONS
# ═══════════════════════════════════════════════════════════════════════════

class TestActions:
    def test_action_catalog_has_all_types(self):
        for at in ActionType:
            assert at in ACTION_CATALOG, f"Missing catalog entry for {at}"

    def test_build_action(self):
        action = build_action(ActionType.TOGGLE_SUBSYSTEM, {"subsystem_name": "payload", "active": False})
        assert action.action_type == ActionType.TOGGLE_SUBSYSTEM
        assert action.budget_cost == 0.0

    def test_orbital_maneuver_costs_budget(self):
        action = build_action(ActionType.ADJUST_ORBIT, {"delta_altitude_km": 10.0})
        assert action.budget_cost == 500.0

    def test_ai_prediction_costs_budget(self):
        action = build_action(ActionType.REQUEST_AI_PREDICTION, {"query": "power forecast"})
        assert action.budget_cost == 100.0


# ═══════════════════════════════════════════════════════════════════════════
# EVENTS
# ═══════════════════════════════════════════════════════════════════════════

class TestEvents:
    def _make_pool(self):
        return [
            MissionEventTemplate(
                id="test_event",
                name="Test Event",
                description="A test event.",
                severity=EventSeverity.WARNING,
                probability=1.0,  # Guaranteed trigger
                earliest_step=5,
                choices=[
                    EventChoice(id="c1", label="Choice A", description="Do A", effects={"power_w": -10}),
                    EventChoice(id="c2", label="Choice B", description="Do B", effects={"power_w": 10}),
                ],
                auto_resolve_steps=10,
            ),
        ]

    def test_event_director_triggers_event(self):
        director = EventDirector(self._make_pool(), seed=42)
        # Advance past earliest_step
        for step in range(1, 10):
            events = director.tick(step)
            if events:
                break
        assert len(director.active_events) > 0 or len(director.resolved_events) > 0

    def test_event_deterministic(self):
        pool = self._make_pool()
        d1 = EventDirector(pool, seed=99)
        d2 = EventDirector(pool, seed=99)
        events1 = []
        events2 = []
        for step in range(1, 50):
            events1.extend(d1.tick(step))
            events2.extend(d2.tick(step))
        assert len(events1) == len(events2)
        for e1, e2 in zip(events1, events2):
            assert e1.template_id == e2.template_id
            assert e1.triggered_step == e2.triggered_step

    def test_resolve_event(self):
        director = EventDirector(self._make_pool(), seed=42)
        # Trigger event
        triggered = None
        for step in range(1, 20):
            events = director.tick(step)
            if events:
                triggered = events[0]
                break
        assert triggered is not None

        result = director.resolve_event(triggered.event_id, "c1")
        assert result is not None
        assert result.choice_id == "c1"
        assert result.effects == {"power_w": -10}

    def test_auto_resolve_expired(self):
        director = EventDirector(self._make_pool(), seed=42)
        # Trigger event, then advance past deadline
        triggered = None
        for step in range(1, 20):
            events = director.tick(step)
            if events:
                triggered = events[0]
                break
        assert triggered is not None
        deadline = triggered.deadline_step
        for step in range(triggered.triggered_step + 1, deadline + 2):
            director.tick(step)
        # Should have auto-resolved
        assert any(e.phase == EventPhase.EXPIRED for e in director.resolved_events)


# ═══════════════════════════════════════════════════════════════════════════
# OBJECTIVES
# ═══════════════════════════════════════════════════════════════════════════

class TestObjectives:
    def test_objective_progress(self):
        p = ObjectiveProgress(
            objective_id="test", description="Test", target_value=100.0,
        )
        assert p.fraction == 0.0
        assert p.is_failed
        p.current_value = 50.0
        assert p.fraction == 0.5
        assert p.is_partial
        p.current_value = 100.0
        assert p.fraction == 1.0
        assert p.is_complete

    def test_evaluator(self):
        defs = [
            ObjectiveDefinition(id="a", description="A", target_value=10.0),
            ObjectiveDefinition(id="b", description="B", target_value=5.0),
        ]
        ev = ObjectiveEvaluator(defs)
        ev.update("a", 7.0)
        ev.increment("b", 3.0)
        scores = ev.get_scores()
        assert scores["a"] == 0.7
        assert scores["b"] == 0.6
        results = ev.get_results()
        assert len(results) == 2


# ═══════════════════════════════════════════════════════════════════════════
# SCORING
# ═══════════════════════════════════════════════════════════════════════════

class TestScoring:
    def test_grade_thresholds(self):
        assert score_to_grade(0.97) == Grade.A_PLUS
        assert score_to_grade(0.85) == Grade.B
        assert score_to_grade(0.50) == Grade.F

    def test_scorer_perfect(self):
        from game.objectives import ObjectiveResult
        scorer = MissionScorer()
        results = [
            ObjectiveResult(
                objective_id="a", description="A",
                target_value=10.0, achieved_value=10.0,
                fraction=1.0, weighted_score=1.0,
                passed=True, partial=False,
            ),
        ]
        breakdown = scorer.calculate(
            objective_results=results,
            spacecraft_health_pct=100.0,
            data_collected_mb=500.0,
            data_target_mb=500.0,
            steps_elapsed=0,
            deadline_steps=1440,
            events_resolved_well=5,
            total_events=5,
            budget_remaining=10000.0,
            total_budget=10000.0,
        )
        assert breakdown.grade == Grade.A_PLUS
        assert breakdown.score_fraction >= 0.97

    def test_scorer_poor(self):
        from game.objectives import ObjectiveResult
        scorer = MissionScorer()
        results = [
            ObjectiveResult(
                objective_id="a", description="A",
                target_value=10.0, achieved_value=0.0,
                fraction=0.0, weighted_score=0.0,
                passed=False, partial=False,
            ),
        ]
        breakdown = scorer.calculate(
            objective_results=results,
            spacecraft_health_pct=10.0,
            data_collected_mb=0.0,
            data_target_mb=500.0,
            steps_elapsed=1440,
            deadline_steps=1440,
            events_resolved_well=0,
            total_events=5,
            budget_remaining=0.0,
            total_budget=10000.0,
        )
        assert breakdown.grade == Grade.F
        assert breakdown.score_fraction < 0.3

    def test_scoring_transparent(self):
        """Score breakdown should explain each category."""
        from game.objectives import ObjectiveResult
        scorer = MissionScorer()
        results = [
            ObjectiveResult(
                objective_id="a", description="A",
                target_value=10.0, achieved_value=7.0,
                fraction=0.7, weighted_score=0.7,
                passed=False, partial=True,
            ),
        ]
        breakdown = scorer.calculate(
            objective_results=results,
            spacecraft_health_pct=80.0,
            data_collected_mb=300.0,
            data_target_mb=500.0,
            steps_elapsed=700,
            deadline_steps=1440,
            events_resolved_well=3,
            total_events=4,
            budget_remaining=6000.0,
            total_budget=10000.0,
        )
        assert len(breakdown.categories) == 6
        for cat in breakdown.categories:
            assert cat.explanation != ""


# ═══════════════════════════════════════════════════════════════════════════
# PROGRESSION
# ═══════════════════════════════════════════════════════════════════════════

class TestProgression:
    def test_xp_level_calculation(self):
        assert level_from_xp(0) == 1
        assert level_from_xp(100) == 1  # Level 2 needs 400
        assert level_from_xp(400) == 2
        assert level_from_xp(900) == 3

    def test_player_profile_xp(self):
        p = PlayerProfile(player_id="test")
        assert p.level == 1
        p.award_xp(500)
        assert p.total_xp == 500

    def test_engineering_credits_separate(self):
        """Engineering Credits (progression) must be separate from mission budget."""
        p = PlayerProfile(player_id="test")
        p.award_credits(1000)
        assert p.engineering_credits == 1000
        # This is player progression currency, NOT mission budget

    def test_spend_credits(self):
        p = PlayerProfile(player_id="test")
        p.award_credits(500)
        assert p.spend_credits(300) is True
        assert p.engineering_credits == 200
        assert p.spend_credits(500) is False  # Not enough
        assert p.engineering_credits == 200  # Unchanged

    def test_mission_completion_rewards(self):
        p = PlayerProfile(player_id="test")
        rewards = p.process_mission_completion(Grade.A)
        assert rewards["xp_earned"] == 400
        assert rewards["credits_earned"] == 800
        assert p.missions_completed == 1

    def test_first_launch_achievement(self):
        p = PlayerProfile(player_id="test")
        p.process_mission_completion(Grade.B)
        assert "first_launch" in p.achievements
        assert p.achievements["first_launch"].unlocked

    def test_perfect_score_achievement(self):
        p = PlayerProfile(player_id="test")
        p.process_mission_completion(Grade.A_PLUS)
        assert "perfect_score" in p.achievements

    def test_unlock_requires_level_and_credits(self):
        p = PlayerProfile(player_id="test")
        p.award_credits(10000)
        # Level 1, need level 2 for solar_storm_mission
        assert p.try_unlock("solar_storm_mission") is False
        # Level up
        p.award_xp(500)  # Should be at least level 2
        assert p.try_unlock("solar_storm_mission") is True
        assert "solar_storm_mission" in p.unlocks

    def test_cannot_unlock_twice(self):
        p = PlayerProfile(player_id="test")
        p.award_credits(10000)
        p.award_xp(1000)
        p.try_unlock("solar_storm_mission")
        credits_before = p.engineering_credits
        assert p.try_unlock("solar_storm_mission") is False  # Already unlocked
        assert p.engineering_credits == credits_before  # No credits spent


# ═══════════════════════════════════════════════════════════════════════════
# GAME STATE
# ═══════════════════════════════════════════════════════════════════════════

class TestGameState:
    def test_game_state_creation(self):
        gs = GameState(session_id="s1", mission_id="wildfire")
        assert gs.status == "pending"
        assert gs.budget_remaining == 10000.0

    def test_spend_budget(self):
        gs = GameState(budget_total=1000.0, budget_remaining=1000.0)
        assert gs.spend_budget(300.0) is True
        assert gs.budget_remaining == 700.0
        assert gs.spend_budget(800.0) is False
        assert gs.budget_remaining == 700.0  # Unchanged

    def test_log_action(self):
        gs = GameState()
        gs.log_action(step=1, player_id="p1", action_type="toggle_subsystem", result="ok")
        assert len(gs.action_log) == 1
        assert gs.action_log[0].player_id == "p1"

    def test_summary(self):
        gs = GameState(session_id="s1", mission_id="wildfire")
        summary = gs.to_summary()
        assert summary["session_id"] == "s1"
        assert "spacecraft_health_pct" in summary

