"""
Comprehensive verification tests for Prompt 15:
- Mission Results, Scoring & Critical Safety Caps
- Co-op Crew Contribution Summary & Anti-Spam Mechanics
- Progression, XP, Engineering Credits & Replay Rules
- Mission Replay Trajectory & Key Event Scrubbing
- Deterministic What-If Branching Engine & Side-by-Side Comparison
- Educational Lifecycle Cost-Per-Useful-Result Analysis
"""

import pytest
from game.objectives import ObjectiveResult
from game.scoring import MissionScorer, ScoringConfig, Grade, ScoreBreakdown
from game.team_contribution import calculate_team_contributions, RoleContributionSummary
from game.cost_analysis import calculate_cost_per_useful_result, LifecycleCostModel
from game.replay import (
    replay_store,
    WhatIfEngine,
    WhatIfBranchRequest,
    MissionTrajectoryRecord,
    StepReplaySnapshot,
    KeyEvent,
)
from game.progression import PlayerProfile
from game.runtime import SimulationRuntime
from api.routers.missions import _load_missions


# ── 1. Scoring & Critical Safety Caps ─────────────────────────────────────────


class TestScoringAndSafetyCaps:
    """Verify that vehicle health failure cannot be masked by science return."""

    def test_nominal_high_performance_scoring(self):
        scorer = MissionScorer()
        results = [
            ObjectiveResult(
                objective_id="obj_science",
                description="Downlink science",
                target_value=500.0,
                achieved_value=500.0,
                fraction=1.0,
                weighted_score=1.0,
                passed=True,
                partial=False,
            )
        ]
        breakdown = scorer.calculate(
            objective_results=results,
            spacecraft_health_pct=95.0,
            data_collected_mb=500.0,
            data_target_mb=500.0,
            steps_elapsed=300,
            deadline_steps=1440,
            events_resolved_well=3,
            total_events=3,
            budget_remaining=8000.0,
            total_budget=10000.0,
        )
        assert breakdown.grade in (Grade.A, Grade.A_PLUS)
        assert breakdown.stars >= 2
        assert not breakdown.safety_cap_triggered
        assert len(breakdown.categories) == 6

    def test_critical_safety_cap_overrides_high_science(self):
        """Even with 100% science, 0% health must trigger hard safety cap."""
        scorer = MissionScorer()
        results = [
            ObjectiveResult(
                objective_id="obj_science",
                description="Downlink science",
                target_value=1000.0,
                achieved_value=1000.0,
                fraction=1.0,
                weighted_score=1.0,
                passed=True,
                partial=False,
            )
        ]
        breakdown = scorer.calculate(
            objective_results=results,
            spacecraft_health_pct=0.0,  # VEHICLE DESTROYED
            data_collected_mb=1000.0,
            data_target_mb=1000.0,
            steps_elapsed=200,
            deadline_steps=1440,
            events_resolved_well=5,
            total_events=5,
            budget_remaining=9000.0,
            total_budget=10000.0,
        )
        # Safety cap must cap total score at 40%, Grade F, 0 Stars
        assert breakdown.safety_cap_triggered is True
        assert breakdown.total_score <= 40.0
        assert breakdown.grade == Grade.F
        assert breakdown.stars == 0
        assert any("0.0%" in flag or "integrity" in flag for flag in breakdown.safety_flags)
        assert "Mission Failed" in breakdown.success_failure_causes[0]

    def test_explicit_critical_safety_violation_flag(self):
        scorer = MissionScorer()
        breakdown = scorer.calculate(
            objective_results=[],
            spacecraft_health_pct=50.0,
            data_collected_mb=100.0,
            data_target_mb=500.0,
            steps_elapsed=100,
            deadline_steps=1000,
            events_resolved_well=1,
            total_events=1,
            budget_remaining=5000.0,
            total_budget=10000.0,
            critical_safety_violation=True,
            safety_violation_details=["Severe thermal runaway breached safe battery limits."],
        )
        assert breakdown.safety_cap_triggered is True
        assert breakdown.grade == Grade.F
        assert breakdown.stars == 0
        assert any("thermal runaway" in f for f in breakdown.safety_flags)


# ── 2. Co-op Team Contribution System ────────────────────────────────────────


class TestTeamContribution:
    """Verify co-op contribution breakdown, anti-spam, and vigilance allocation."""

    def test_balanced_crew_contributions(self):
        roles_map = {
            "p_dir": ["Mission Director"],
            "p_sys": ["Systems Engineer"],
            "p_sci": ["Science Officer"],
            "p_fc": ["Flight Controller"],
        }
        actions = [
            {"actor": "p_dir", "action_type": "respond_to_event", "status": "SUCCESS"},
            {"actor": "p_sys", "action_type": "set_heater", "status": "SUCCESS"},
            {"actor": "p_sci", "action_type": "set_operational_profile", "status": "SUCCESS"},
            {"actor": "p_fc", "action_type": "set_downlink_mode", "status": "SUCCESS"},
        ]
        breakdown = calculate_team_contributions(
            action_log=actions,
            roles_map=roles_map,
            telemetry_summary={"data_downlinked_mb": 450.0, "spacecraft_health_pct": 92.0},
        )
        assert len(breakdown.participants) == 4
        # All members should have reasonable share (~20-30%)
        total_pct = sum(p.contribution_percentage for p in breakdown.participants)
        assert abs(total_pct - 100.0) < 0.2
        for p in breakdown.participants:
            assert p.contribution_percentage > 15.0
            assert len(p.role_highlights) > 0

    def test_anti_spam_diminishing_returns(self):
        """One player clicking 100 times must not monopolize the contribution percentage."""
        roles_map = {
            "spammer": ["Systems Engineer"],
            "careful_player": ["Flight Controller"],
        }
        # Spammer repeats the exact same toggle 50 times
        spammed_actions = [
            {"actor": "spammer", "action_type": "toggle_heater", "status": "SUCCESS"}
            for _ in range(50)
        ]
        # Careful player does 3 strategic actions
        careful_actions = [
            {"actor": "careful_player", "action_type": "set_downlink_mode", "status": "SUCCESS"},
            {"actor": "careful_player", "action_type": "purge_storage", "status": "SUCCESS"},
            {"actor": "careful_player", "action_type": "adjust_attitude", "status": "SUCCESS"},
        ]
        actions = spammed_actions + careful_actions

        breakdown = calculate_team_contributions(
            action_log=actions,
            roles_map=roles_map,
        )
        spammer = breakdown.get_participant("spammer")
        careful = breakdown.get_participant("careful_player")

        assert spammer is not None and careful is not None
        assert spammer.spam_filtered_count >= 45
        # The careful player must retain a substantial contribution share (> 30%)
        assert careful.contribution_percentage >= 30.0

    def test_standby_vigilance_guarantee_for_quiet_roles(self):
        """A role whose specific emergency was not triggered still gets standby credit."""
        roles_map = {
            "active_worker": ["Science Officer"],
            "standby_sentinel": ["Systems Engineer"],
        }
        actions = [
            {"actor": "active_worker", "action_type": "observe_target", "status": "SUCCESS"}
            for _ in range(4)
        ]
        breakdown = calculate_team_contributions(
            action_log=actions,
            roles_map=roles_map,
        )
        standby = breakdown.get_participant("standby_sentinel")
        assert standby is not None
        assert standby.standby_vigilance_points >= 20.0
        assert standby.contribution_percentage >= 20.0


# ── 3. Educational Cost-Per-Useful-Result Analysis ────────────────────────────


class TestCostPerUsefulResult:
    """Verify amortized lifecycle economics and educational assumptions."""

    def test_cost_analysis_amortization(self):
        analysis = calculate_cost_per_useful_result(
            data_downlinked_mb=800.0,
            alerts_delivered=10,
            budget_spent_credits=4500.0,
            steps_elapsed=90,          # 1.5 hours = ~1 orbit
            time_step_seconds=60.0,
            bus_capex_usd=14_000_000.0,
            launch_capex_usd=6_000_000.0,
            design_lifespan_years=3.0,
        )
        assert analysis.total_capex_usd == 20_000_000.0
        assert 15700 <= analysis.design_lifetime_orbits <= 17600
        assert analysis.amortized_capex_per_orbit_usd > 1200.0
        assert analysis.amortized_capex_per_orbit_usd < 1300.0
        assert analysis.cost_per_mb_usd > 0.0
        assert analysis.cost_per_alert_usd > 0.0
        # Edge efficiency multiplier against $185/MB flagship benchmark
        assert analysis.cost_efficiency_multiplier > 10.0
        assert len(analysis.educational_assumptions) >= 4


# ── 4. Replay Trajectory & What-If Branching ──────────────────────────────────


class TestReplayAndWhatIfEngine:
    """Verify trajectory recording, checkpoint scrubbing, and What-If execution."""

    def test_create_trajectory_from_runtime(self):
        missions = _load_missions()
        wf = missions.get("wildfire")
        assert wf is not None

        runtime = SimulationRuntime.from_mission(wf, seed=42)
        runtime.step(15)

        trajectory = replay_store.create_from_runtime(runtime)
        assert trajectory.session_id == runtime.session_id
        assert trajectory.total_steps == 15
        assert len(trajectory.steps) == 15
        assert len(trajectory.key_events) >= 1  # Should have detected eclipse/contact/status

    def test_what_if_branch_execution_determinism(self):
        missions = _load_missions()
        wf = missions.get("wildfire")
        assert wf is not None

        # Base run: 25 steps
        runtime = SimulationRuntime.from_mission(wf, seed=42)
        runtime.step(25)
        trajectory = replay_store.create_from_runtime(runtime)

        # What-If branch at Step 10: switch to ECO operational profile
        request = WhatIfBranchRequest(
            branch_step=10,
            modified_actions=[
                {"actor": "what_if_agent", "action_type": "set_operational_profile", "params": {"profile": "ECO"}}
            ],
            label="Energy Conservation Branch",
        )

        comparison = WhatIfEngine.run_what_if(trajectory=trajectory, request=request)
        assert comparison.is_what_if is True
        assert comparison.semantic_tag == "NEW SIMULATION (WHAT-IF)"
        assert comparison.branch_step == 10
        assert len(comparison.original_trajectory) == 25
        assert len(comparison.modified_trajectory) == 25
        assert comparison.delta_explanation != ""


# ── 5. Progression & Replay Anti-Exploitation ─────────────────────────────────


class TestProgressionAndReplayRules:
    """Verify first-time completion vs replay mastery rewards."""

    def test_first_completion_vs_replay_rewards(self):
        profile = PlayerProfile(player_id="cadet_zero")

        # First completion: Full rewards
        res1 = profile.process_mission_completion(
            grade=Grade.A,
            mission_id="wildfire",
            stars=2,
            is_win=True,
            score=88.0,
        )
        assert res1["is_first_completion"] is True
        xp1 = res1["xp_earned"]
        cred1 = res1["credits_earned"]
        assert xp1 >= 400
        assert cred1 >= 800

        # Replay completion with same stars: 25% mastery rewards
        res2 = profile.process_mission_completion(
            grade=Grade.A,
            mission_id="wildfire",
            stars=2,
            is_win=True,
            score=89.0,
        )
        assert res2["is_first_completion"] is False
        assert res2["xp_earned"] <= int(xp1 * 0.35)
        assert res2["credits_earned"] <= int(cred1 * 0.35)

        # Replay with higher stars (2★ -> 3★): Awards mastery + incremental star bonus
        res3 = profile.process_mission_completion(
            grade=Grade.A_PLUS,
            mission_id="wildfire",
            stars=3,
            is_win=True,
            score=98.0,
        )
        assert res3["new_stars_earned"] == 1
        assert "New star record" in res3["explanation"]
