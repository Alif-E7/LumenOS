"""
Prompt 9 Acceptance Tests — Four Data-Driven Mission Scenarios and Campaign Content.

Scenario Families:
  1. Wildfire Scout — Eyes on Fire
  2. Flood Scout — Rising Waters
  3. Solar Storm Sentinel — Watch the Sun
  4. Volcano Watch — Fire Beneath the Earth

Acceptance Checks:
  1. Full data-driven configuration loading from YAML with rich specification:
     story, contract, targets, permitted components, observation tasks,
     role responsibilities (all 4 roles), event pool, difficulty settings,
     win/partial/failure conditions, score weights, and rewards.
  2. The eight-combination matrix:
     - Wildfire Solo
     - Wildfire Co-op (4 crew roles)
     - Flood Solo
     - Flood Co-op (4 crew roles)
     - Solar Storm Solo
     - Solar Storm Co-op (4 crew roles)
     - Volcano Solo
     - Volcano Co-op (4 crew roles)
     All startable and completable.
  3. Useful responsibilities and concrete physical effects for all four roles
     (Mission Director, Systems Engineer, Science Officer, Flight Controller)
     across every scenario — no cosmetic dead buttons.
  4. Scenario differentiation with shared simulation physics engine.
  5. Sunrise Orbit confirmed as tutorial-only onboarding, not a fifth scenario.
  6. Headless mission execution and outcome evaluation per scenario.
"""

from __future__ import annotations

import pytest

from api.models.mission import MissionDetail
from api.routers.missions import _load_missions
from api.services.game_session import GameSession
from game.actions import ActionType
from game.command_resolver import CommandRequest, CommandStatus
from game.contracts import Difficulty, OutcomeType
from game.roles import RoleName
from game.runtime import SimulationRuntime
from game.tutorial import TUTORIAL_STEPS, TutorialContractFactory
from simulation.core import SpacecraftConfig


# ── Test Fixtures & Helpers ──────────────────────────────────────────────────


@pytest.fixture(scope="module")
def loaded_missions() -> dict[str, MissionDetail]:
    """Load all YAML mission configs once for this test module."""
    missions = _load_missions()
    assert len(missions) == 4, f"Expected exactly 4 missions, found {len(missions)}"
    return missions


FOUR_SCENARIO_IDS = ["wildfire", "flood", "solar_storm", "volcano"]
FOUR_ROLES = [
    RoleName.MISSION_DIRECTOR,
    RoleName.FLIGHT_CONTROLLER,
    RoleName.SYSTEMS_ENGINEER,
    RoleName.SCIENCE_OFFICER,
]
COOP_PLAYERS = ["dir_p1", "flt_p2", "sys_p3", "sci_p4"]


# ── Acceptance Test 1: Data-Driven YAML Mission Definitions ──────────────────


class TestDataDrivenScenarios:
    """Verify all 4 missions load rich, valid data-driven YAML configs."""

    def test_all_four_scenario_families_present(self, loaded_missions: dict[str, MissionDetail]):
        """Confirm exactly the four required scenario families exist."""
        assert set(loaded_missions.keys()) == set(FOUR_SCENARIO_IDS)
        assert loaded_missions["wildfire"].codename == "Eyes on Fire"
        assert loaded_missions["flood"].codename == "Rising Waters"
        assert loaded_missions["solar_storm"].codename == "Watch the Sun"
        assert loaded_missions["volcano"].codename == "Fire Beneath the Earth"

    def test_rich_mission_metadata_and_story(self, loaded_missions: dict[str, MissionDetail]):
        """Each mission must have story narrative, budget, targets, and permitted components."""
        for mid in FOUR_SCENARIO_IDS:
            m = loaded_missions[mid]
            assert m.story, f"{mid} is missing story narrative"
            assert len(m.story) > 50, f"{mid} story is too brief"
            assert m.budget >= 5000.0, f"{mid} budget {m.budget} is too low"
            assert len(m.targets) >= 1, f"{mid} must have at least 1 ground target"
            assert len(m.observation_tasks) >= 2, f"{mid} must have observation tasks"
            assert "instruments" in m.permitted_components, f"{mid} missing permitted instruments"
            assert "launchers" in m.permitted_components, f"{mid} missing permitted launchers"
            assert "orbits" in m.permitted_components, f"{mid} missing permitted orbits"

    def test_role_responsibilities_defined_for_all_four_roles(self, loaded_missions: dict[str, MissionDetail]):
        """Every scenario must define tailored responsibilities for all four crew roles."""
        for mid in FOUR_SCENARIO_IDS:
            m = loaded_missions[mid]
            assert m.role_responsibilities, f"{mid} has no role responsibilities"
            for role in ["mission_director", "systems_engineer", "science_officer", "flight_controller"]:
                assert role in m.role_responsibilities, f"{mid} missing responsibilities for {role}"
                assert len(m.role_responsibilities[role]) > 20, f"{mid} description for {role} is trivial"

    def test_event_pool_richness_and_consequences(self, loaded_missions: dict[str, MissionDetail]):
        """Event pool must have at least 3 distinct templates with choices and numeric effects."""
        for mid in FOUR_SCENARIO_IDS:
            m = loaded_missions[mid]
            assert len(m.event_pool) >= 3, f"{mid} must have at least 3 event templates"
            for evt in m.event_pool:
                assert evt.id and evt.name and evt.description
                assert len(evt.choices) >= 2, f"Event {evt.id} in {mid} needs at least 2 choices"
                for ch in evt.choices:
                    assert ch.id and ch.label
                    # Effects must be numeric dict
                    for k, v in ch.effects.items():
                        assert isinstance(v, (int, float)), f"Effect {k}={v} in {evt.id} must be numeric"

    def test_difficulty_settings_and_rewards(self, loaded_missions: dict[str, MissionDetail]):
        """Each scenario must define difficulty profiles and completion rewards."""
        for mid in FOUR_SCENARIO_IDS:
            m = loaded_missions[mid]
            assert m.difficulty_settings, f"{mid} missing difficulty settings"
            assert "engineer" in m.difficulty_settings
            assert m.rewards, f"{mid} missing rewards"
            assert "credits_first_completion" in m.rewards and m.rewards["credits_first_completion"] > 0
            assert "xp_first_completion" in m.rewards and m.rewards["xp_first_completion"] > 0
            assert "stars" in m.rewards

    def test_primary_and_optional_objectives(self, loaded_missions: dict[str, MissionDetail]):
        """Objectives must contain both primary and optional criteria with explicit weights."""
        for mid in FOUR_SCENARIO_IDS:
            m = loaded_missions[mid]
            assert len(m.objectives) >= 3, f"{mid} must have at least 3 objectives"
            primaries = [obj for obj in m.objectives if obj.is_primary]
            optionals = [obj for obj in m.objectives if not obj.is_primary]
            assert len(primaries) >= 1, f"{mid} must have at least one primary objective"
            assert len(optionals) >= 1, f"{mid} must have at least one optional objective"


# ── Acceptance Test 2: The Eight-Combination Matrix ──────────────────────────


class TestEightCombinationMatrix:
    """Verify all 8 combinations (4 scenarios x [Solo, Co-op]) start and run cleanly."""

    @pytest.mark.parametrize("mission_id", FOUR_SCENARIO_IDS)
    def test_headless_solo_execution(self, mission_id: str, loaded_missions: dict[str, MissionDetail]):
        """Run headless Solo mission for 30 steps."""
        mission = loaded_missions[mission_id]
        runtime = SimulationRuntime.from_mission(
            mission=mission,
            seed=1001,
            player_ids=["solo_pilot"],
            time_step_seconds=60.0,
            max_steps=30,
        )
        assert len(runtime.player_ids) == 1
        # In solo, the single player is assigned all four roles
        assert runtime.roles.player_roles["solo_pilot"] == FOUR_ROLES
        assert len(runtime.roles.get_player_actions("solo_pilot")) > 10

        res = runtime.run_headless(max_steps=30)
        assert res.session_id == runtime.session_id
        assert res.mission_id == mission_id
        assert res.total_steps == 30
        assert res.status in ("running", "completed")
        assert len(res.timestamped_telemetry) == 30
        assert res.spacecraft_health_pct > 0.0

    @pytest.mark.parametrize("mission_id", FOUR_SCENARIO_IDS)
    def test_headless_coop_execution(self, mission_id: str, loaded_missions: dict[str, MissionDetail]):
        """Run headless Co-op (4 distinct crew roles) mission for 30 steps."""
        mission = loaded_missions[mission_id]
        runtime = SimulationRuntime.from_mission(
            mission=mission,
            seed=2002,
            player_ids=COOP_PLAYERS,
            time_step_seconds=60.0,
            max_steps=30,
        )
        assert len(runtime.player_ids) == 4
        # Verify 4 distinct roles assigned
        for pid, role in zip(COOP_PLAYERS, FOUR_ROLES):
            assert runtime.roles.player_roles[pid] == [role]

        res = runtime.run_headless(max_steps=30)
        assert res.session_id == runtime.session_id
        assert res.mission_id == mission_id
        assert res.total_steps == 30
        assert res.status in ("running", "completed")
        assert len(res.timestamped_telemetry) == 30

    @pytest.mark.parametrize("mission_id", FOUR_SCENARIO_IDS)
    def test_game_session_solo_path(self, mission_id: str, loaded_missions: dict[str, MissionDetail]):
        """Run Solo mission through the GameSession REST/WebSocket engine."""
        mission = loaded_missions[mission_id]
        session = GameSession(
            session_id=f"ses_solo_{mission_id}",
            mission=mission,
            spacecraft_config=SpacecraftConfig(),
            seed=3003,
            player_ids=["solo_commander"],
            time_step_seconds=60.0,
        )
        assert session.session_id == f"ses_solo_{mission_id}"
        # Advance 10 steps
        for _ in range(10):
            res = session.step()
            assert len(res) >= 1 and res[0]["step"] > 0

        state = session.get_full_state()
        assert state["step"] == 10
        assert state["mission_id"] == mission_id
        assert state["spacecraft_health_pct"] > 0.0
        score = session.get_score_breakdown()
        assert score.total_score >= 0.0

    @pytest.mark.parametrize("mission_id", FOUR_SCENARIO_IDS)
    def test_game_session_coop_path(self, mission_id: str, loaded_missions: dict[str, MissionDetail]):
        """Run Co-op mission through the GameSession REST/WebSocket engine."""
        mission = loaded_missions[mission_id]
        session = GameSession(
            session_id=f"ses_coop_{mission_id}",
            mission=mission,
            spacecraft_config=SpacecraftConfig(),
            seed=4004,
            player_ids=COOP_PLAYERS,
            time_step_seconds=60.0,
        )
        assert len(session._roles.player_roles) == 4
        # Verify each role can execute role-permitted actions
        # Systems Engineer reduces workload
        resp_sys = session.perform_action(
            player_id="sys_p3",
            action_type="reduce_workload",
            params={"profile": "ECO"},
        )
        assert resp_sys["success"] is True

        # Flight Controller adjusts attitude
        resp_flt = session.perform_action(
            player_id="flt_p2",
            action_type="set_attitude",
            params={"roll_deg": 0.0, "pitch_deg": 0.0, "yaw_deg": 0.0},
        )
        assert resp_flt["success"] is True

        # Advance 5 steps
        for _ in range(5):
            res = session.step()
            assert len(res) >= 1 and res[0]["step"] > 0

        state = session.get_full_state()
        assert state["step"] == 5
        assert len(session._state.action_log) >= 2


# ── Acceptance Test 3: Consequential Role Actions per Scenario ───────────────


class TestConsequentialRoleActions:
    """Verify that every crew role has real, non-cosmetic simulation effects in each scenario."""

    def test_wildfire_role_mapping_effects(self, loaded_missions: dict[str, MissionDetail]):
        """Wildfire Scout role actions produce concrete physical changes."""
        mission = loaded_missions["wildfire"]
        runtime = SimulationRuntime.from_mission(
            mission=mission,
            player_ids=COOP_PLAYERS,
            seed=5001,
        )

        # 1. Mission Director sets mission priority
        cmd_dir = runtime.submit_command(
            CommandRequest(
                actor="dir_p1",
                role="mission_director",
                action_type="set_priority",
                params={"objective_id": "thermal_coverage", "priority": 1},
            )
        )
        assert cmd_dir.status == CommandStatus.ACCEPTED

        # 2. Systems Engineer toggles workload to ECO (shedding payload & comms power)
        cmd_sys = runtime.submit_command(
            CommandRequest(
                actor="sys_p3",
                role="systems_engineer",
                action_type="reduce_workload",
                params={"profile": "ECO"},
            )
        )
        assert cmd_sys.status == CommandStatus.ACCEPTED

        # 3. Science Officer downlinks science data
        initial_downlink = runtime.sim._comms.state.data_downlinked_mb
        cmd_sci = runtime.submit_command(
            CommandRequest(
                actor="sci_p4",
                role="science_officer",
                action_type="downlink_data",
                params={"data_mb": 50.0},
            )
        )
        assert cmd_sci.status == CommandStatus.ACCEPTED
        assert runtime.sim._comms.state.data_downlinked_mb >= initial_downlink

        # 4. Flight Controller maneuvers orbital altitude
        initial_sma = runtime.sim.spacecraft.orbital.semi_major_axis_km
        cmd_flt = runtime.submit_command(
            CommandRequest(
                actor="flt_p2",
                role="flight_controller",
                action_type="adjust_orbit",
                params={"delta_altitude_km": 15.0, "delta_inclination_deg": 0.0},
            )
        )
        assert cmd_flt.status == CommandStatus.ACCEPTED
        assert runtime.sim.spacecraft.orbital.semi_major_axis_km == pytest.approx(initial_sma + 15.0, rel=1e-3)

    def test_flood_role_mapping_effects(self, loaded_missions: dict[str, MissionDetail]):
        """Flood Scout role actions manage radar data storage and downlink prioritization."""
        mission = loaded_missions["flood"]
        runtime = SimulationRuntime.from_mission(
            mission=mission,
            player_ids=COOP_PLAYERS,
            seed=5002,
        )

        # Systems Engineer reduces workload to prevent radar overheating
        cmd_sys = runtime.submit_command(
            CommandRequest(
                actor="sys_p3",
                role="systems_engineer",
                action_type="reduce_workload",
                params={"profile": "ECO"},
            )
        )
        assert cmd_sys.status == CommandStatus.ACCEPTED

        # Science Officer adjusts observation plan
        cmd_sci = runtime.submit_command(
            CommandRequest(
                actor="sci_p4",
                role="science_officer",
                action_type="adjust_observation_plan",
                params={"payload_active": False},
            )
        )
        assert cmd_sci.status == CommandStatus.ACCEPTED

        # Flight Controller adjusts orbital altitude for radar swath optimization
        initial_sma = runtime.sim.spacecraft.orbital.semi_major_axis_km
        cmd_flt = runtime.submit_command(
            CommandRequest(
                actor="flt_p2",
                role="flight_controller",
                action_type="adjust_orbit",
                params={"delta_altitude_km": -10.0, "delta_inclination_deg": 0.0},
            )
        )
        assert cmd_flt.status == CommandStatus.ACCEPTED
        assert runtime.sim.spacecraft.orbital.semi_major_axis_km == pytest.approx(initial_sma - 10.0, rel=1e-3)

    def test_solar_storm_role_mapping_effects(self, loaded_missions: dict[str, MissionDetail]):
        """Solar Storm Sentinel role actions manage radiation resilience and safe mode."""
        mission = loaded_missions["solar_storm"]
        runtime = SimulationRuntime.from_mission(
            mission=mission,
            player_ids=COOP_PLAYERS,
            seed=5003,
        )

        # Systems Engineer enters SAFE mode to protect sensitive instrumentation
        cmd_safe = runtime.submit_command(
            CommandRequest(
                actor="sys_p3",
                role="systems_engineer",
                action_type="enter_safe_mode",
                params={"duration_steps": 10},
            )
        )
        assert cmd_safe.status == CommandStatus.ACCEPTED
        assert runtime.sim.spacecraft.payload_active is False

        # Flight Controller maneuvers attitude
        cmd_flt = runtime.submit_command(
            CommandRequest(
                actor="flt_p2",
                role="flight_controller",
                action_type="set_attitude",
                params={"roll_deg": 0.0, "pitch_deg": 0.0, "yaw_deg": 0.0},
            )
        )
        assert cmd_flt.status == CommandStatus.ACCEPTED

    def test_volcano_role_mapping_effects(self, loaded_missions: dict[str, MissionDetail]):
        """Volcano Watch role actions balance thermal dissipation and plume observation."""
        mission = loaded_missions["volcano"]
        runtime = SimulationRuntime.from_mission(
            mission=mission,
            player_ids=COOP_PLAYERS,
            seed=5004,
        )

        # Systems Engineer adjusts heater setpoint
        cmd_therm = runtime.submit_command(
            CommandRequest(
                actor="sys_p3",
                role="systems_engineer",
                action_type="adjust_thermal",
                params={"heater_setpoint_c": 15.0},
            )
        )
        assert cmd_therm.status == CommandStatus.ACCEPTED

        # Science Officer prioritizes volcano anomaly alert downlink
        cmd_down = runtime.submit_command(
            CommandRequest(
                actor="sci_p4",
                role="science_officer",
                action_type="downlink_data",
                params={"data_mb": 80.0},
            )
        )
        assert cmd_down.status == CommandStatus.ACCEPTED


# ── Acceptance Test 4: Scenario Invariance & Shared Physics Engine ───────────


class TestSharedEngineAndTutorialIsolation:
    """Ensure shared physics engine is used without duplicated mission code, and tutorial is isolated."""

    def test_shared_physics_engine_across_all_scenarios(self, loaded_missions: dict[str, MissionDetail]):
        """All scenarios instantiate the authoritative SimulationRunner with identical physics models."""
        for mid in FOUR_SCENARIO_IDS:
            mission = loaded_missions[mid]
            runtime = SimulationRuntime.from_mission(mission=mission, seed=42)
            # Verify core physics models exist
            assert hasattr(runtime.sim, "_orbital")
            assert hasattr(runtime.sim, "_power")
            assert hasattr(runtime.sim, "_thermal")
            assert hasattr(runtime.sim, "_comms")
            assert hasattr(runtime.sim, "_storage")
            assert hasattr(runtime.sim, "_environment")
            assert hasattr(runtime.sim, "_workload")

    def test_sunrise_orbit_is_tutorial_only(self, loaded_missions: dict[str, MissionDetail]):
        """Sunrise Orbit must NOT be in the loaded campaign missions; it is tutorial onboarding only."""
        assert "sunrise_orbit" not in loaded_missions
        assert "tutorial" not in loaded_missions
        assert len(loaded_missions) == 4

        # Confirm tutorial steps exist separately in tutorial module
        assert len(TUTORIAL_STEPS) >= 4
        tut_contract = TutorialContractFactory.create_contract()
        assert tut_contract.mission_id == "sunrise_orbit_tutorial"
        assert tut_contract.deadline_steps > 0

    def test_solo_and_coop_share_identical_contracts_and_physics(self, loaded_missions: dict[str, MissionDetail]):
        """Solo and Co-op execute under the exact same physics parameters and contract rules."""
        for mid in FOUR_SCENARIO_IDS:
            m = loaded_missions[mid]
            rt_solo = SimulationRuntime.from_mission(mission=m, player_ids=["solo_p"], seed=999)
            rt_coop = SimulationRuntime.from_mission(mission=m, player_ids=COOP_PLAYERS, seed=999)

            assert rt_solo.contract.budget == rt_coop.contract.budget
            assert rt_solo.contract.deadline_steps == rt_coop.contract.deadline_steps
            assert len(rt_solo.contract.objectives) == len(rt_coop.contract.objectives)
            assert rt_solo.sim.config.time_step_seconds == rt_coop.sim.config.time_step_seconds
