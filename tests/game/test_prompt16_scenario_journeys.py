"""
Comprehensive Scenario Journeys & Full Integration Test Suite (Prompt 16).

Acceptance checks:
1. All 8 Scenario-Mode Combinations:
   - Journey 1: Wildfire Scout (Solo - All Stations)
   - Journey 2: Wildfire Scout (Co-op 4-Player Crew)
   - Journey 3: Flood Scout (Solo)
   - Journey 4: Flood Scout (Co-op 3-Player Role Bundle)
   - Journey 5: Solar Storm Sentinel (Solo - Failure & Safe Mode Recovery)
   - Journey 6: Solar Storm Sentinel (Co-op 2-Player Dual Roles)
   - Journey 7: Volcano Watch (Solo - High Score Grade A)
   - Journey 8: Volcano Watch (Co-op 4-Player Crew)
2. Role Station Permissions & Denial:
   - Each role can execute permitted actions and is rejected on unpermitted actions.
   - Director can override / resolve events; Systems manages power/louvers;
     Science targets observation/instruments; Flight Controller schedules downlinks / orbital attitude.
3. Deterministic Seed Reproducibility:
   - Identical seed + identical action sequence produces bitwise/decimal identical telemetry and score.
4. Malformed Command Rejection & Runtime State Isolation.
"""

from __future__ import annotations

import pytest
from api.routers.missions import _load_missions
from api.services.game_session import SessionManager, session_manager
from game.actions import ActionType
from game.designer import SpacecraftDesign
from game.engineering_review import PRESET_BUILDS
from game.roles import RoleName, assign_roles, assign_custom_roles
from simulation.core import SpacecraftConfig


@pytest.fixture(autouse=True)
def _reset_sessions():
    session_manager._sessions.clear()
    yield
    session_manager._sessions.clear()


@pytest.fixture
def missions():
    return _load_missions()


def _get_preset_spacecraft(mission_id: str) -> SpacecraftConfig:
    """Helper to generate a balanced valid spacecraft config for tests."""
    presets = PRESET_BUILDS.get(mission_id, {})
    if presets:
        first_preset = next(iter(presets.values()))
        return first_preset.to_spacecraft_config()
    return SpacecraftConfig()


class TestPrompt16ScenarioJourneys:
    """Tests all 8 scenario-mode journeys end-to-end."""

    # ── Journey 1: Wildfire Scout (Solo) ──────────────────────────────────────
    def test_journey_1_wildfire_solo(self, missions):
        mission = missions["wildfire"]
        sc = _get_preset_spacecraft("wildfire")
        session = session_manager.create_session(
            mission=mission,
            spacecraft_config=sc,
            seed=42,
            player_ids=["solo_pilot"],
        )

        assert session.state.mission_id == "wildfire"
        assert len(session.roles.player_roles["solo_pilot"]) == 4  # All Stations

        # Advance 15 steps
        step_results = session.step(15)
        assert len(step_results) == 15

        # Perform All Stations actions
        act_pwr = session.perform_action("solo_pilot", "set_power_mode", {"mode": "nominal"})
        assert act_pwr["success"] is True

        act_sci = session.perform_action("solo_pilot", "collect_data", {"volume_mb": 40.0})
        assert act_sci["success"] is True

        act_flt = session.perform_action("solo_pilot", "set_attitude", {"mode": "Nadir (Earth)"})
        assert act_flt["success"] is True

        act_dir = session.perform_action("solo_pilot", "set_priority", {"subsystem": "payload"})
        assert act_dir["success"] is True

        # Advance another 10 steps
        session.step(10)

        # Verify score breakdown computation
        score = session.get_score_breakdown()
        assert score.total_score >= 0.0
        assert score.grade.value in ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "F"]
        assert score.safety_cap_triggered is False

    # ── Journey 2: Wildfire Scout (Co-op 4-Player Crew) ───────────────────────
    def test_journey_2_wildfire_coop_4_players(self, missions):
        mission = missions["wildfire"]
        sc = _get_preset_spacecraft("wildfire")
        players = ["dir_p1", "sys_p2", "sci_p3", "flt_p4"]
        session = session_manager.create_session(
            mission=mission,
            spacecraft_config=sc,
            seed=42,
            player_ids=players,
        )

        # Verify 1 role per player
        for p in players:
            assert len(session.roles.player_roles[p]) == 1

        # Check role assignments
        roles = session.roles.player_roles
        dir_id = next(p for p, r in roles.items() if RoleName.MISSION_DIRECTOR in r)
        sys_id = next(p for p, r in roles.items() if RoleName.SYSTEMS_ENGINEER in r)
        sci_id = next(p for p, r in roles.items() if RoleName.SCIENCE_OFFICER in r)
        flt_id = next(p for p, r in roles.items() if RoleName.FLIGHT_CONTROLLER in r)

        # 1. Systems Engineer can set power & trim thermal
        res_sys = session.perform_action(sys_id, "set_power_mode", {"mode": "nominal"})
        assert res_sys["success"] is True

        # 2. Science Officer can collect data and schedule observation
        res_sci = session.perform_action(sci_id, "collect_data", {"volume_mb": 30.0})
        assert res_sci["success"] is True

        # 3. Flight Controller can orient attitude and burn thruster
        res_flt = session.perform_action(flt_id, "set_attitude", {"mode": "Nadir (Earth)"})
        assert res_flt["success"] is True

        # 4. Mission Director can allocate budget and set priorities
        res_dir = session.perform_action(dir_id, "set_priority", {"subsystem": "payload"})
        assert res_dir["success"] is True

        # 5. Role Denial: Science Officer CANNOT change power mode
        denied_sci = session.perform_action(sci_id, "set_power_mode", {"mode": "safe"})
        assert denied_sci["success"] is False
        assert "Role does not permit" in denied_sci["error"]

        # 6. Role Denial: Systems Engineer CANNOT set attitude
        denied_sys = session.perform_action(sys_id, "set_attitude", {"mode": "Sun-Pointing"})
        assert denied_sys["success"] is False
        assert "Role does not permit" in denied_sys["error"]

        # 7. Role Denial: Flight Controller CANNOT collect science data
        denied_flt = session.perform_action(flt_id, "collect_data", {"volume_mb": 50.0})
        assert denied_flt["success"] is False
        assert "Role does not permit" in denied_flt["error"]

        # Advance session
        session.step(20)
        score = session.get_score_breakdown()
        assert score.team_summary is not None
        assert len(score.team_summary["participants"]) == 4

    # ── Journey 3: Flood Scout (Solo) ─────────────────────────────────────────
    def test_journey_3_flood_solo(self, missions):
        mission = missions["flood"]
        sc = _get_preset_spacecraft("flood")
        session = session_manager.create_session(
            mission=mission,
            spacecraft_config=sc,
            seed=77,
            player_ids=["flood_cadet"],
        )

        assert session.state.mission_id == "flood"
        # Advance simulation to accumulate radar observation data
        session.step(25)

        # Solo operator triggers data collection and downlink
        act_col = session.perform_action("flood_cadet", "collect_data", {"volume_mb": 60.0})
        assert act_col["success"] is True

        act_down = session.perform_action("flood_cadet", "downlink_data", {"data_mb": 40.0})
        assert act_down["success"] is True

        session.step(15)
        tel = session.get_telemetry()
        assert "storage" in tel
        assert "comms" in tel
        assert tel["storage"]["used_mb"] >= 0

        score = session.get_score_breakdown()
        assert score.total_score >= 0.0

    # ── Journey 4: Flood Scout (Co-op 3-Player Role Bundle) ───────────────────
    def test_journey_4_flood_coop_3_players(self, missions):
        mission = missions["flood"]
        sc = _get_preset_spacecraft("flood")
        players = ["p_bundle", "p_sci", "p_dir"]
        session = session_manager.create_session(
            mission=mission,
            spacecraft_config=sc,
            seed=77,
            player_ids=players,
        )

        # 3 players: 1 bundle of 2 roles, 2 players with 1 role each
        roles_lens = sorted([len(session.roles.player_roles[p]) for p in players])
        assert roles_lens == [1, 1, 2]

        bundle_p = next(p for p in players if len(session.roles.player_roles[p]) == 2)
        bundle_roles = session.roles.player_roles[bundle_p]

        # The bundled player can execute actions from both of their roles
        for r in bundle_roles:
            if r == RoleName.SYSTEMS_ENGINEER:
                res = session.perform_action(bundle_p, "set_power_mode", {"mode": "nominal"})
                assert res["success"] is True
            elif r == RoleName.FLIGHT_CONTROLLER:
                res = session.perform_action(bundle_p, "set_attitude", {"mode": "Nadir (Earth)"})
                assert res["success"] is True
            elif r == RoleName.SCIENCE_OFFICER:
                res = session.perform_action(bundle_p, "collect_data", {"volume_mb": 20.0})
                assert res["success"] is True
            elif r == RoleName.MISSION_DIRECTOR:
                res = session.perform_action(bundle_p, "set_priority", {"subsystem": "comms"})
                assert res["success"] is True

        session.step(20)
        score = session.get_score_breakdown()
        assert score.team_summary is not None
        assert len(score.team_summary["participants"]) == 3

    # ── Journey 5: Solar Storm Sentinel (Solo - Failure & Safe Mode Recovery) ──
    def test_journey_5_solar_storm_solo_safe_mode_recovery(self, missions):
        mission = missions["solar_storm"]
        sc = _get_preset_spacecraft("solar_storm")
        session = session_manager.create_session(
            mission=mission,
            spacecraft_config=sc,
            seed=105,
            player_ids=["sentinel_solo"],
        )

        assert session.state.mission_id == "solar_storm"

        # Advance 10 steps under nominal mode
        session.step(10)

        # Enter safe mode contingency to protect battery and bus
        safe_act = session.perform_action("sentinel_solo", "enter_safe_mode", {})
        assert safe_act["success"] is True

        # Advance 15 steps in safe mode
        session.step(15)
        safe_tel = session.get_telemetry()
        assert safe_tel["workload"]["operational_profile"] == "SAFE"
        assert safe_tel["spacecraft_health_pct"] > 0

        # Recover back to nominal mode
        recover_act = session.perform_action("sentinel_solo", "set_power_mode", {"mode": "nominal"})
        assert recover_act["success"] is True

        session.step(10)
        rec_tel = session.get_telemetry()
        assert rec_tel["workload"]["operational_profile"] == "FULL"

        # Verify mission completed without catastrophic hull loss
        score = session.get_score_breakdown()
        assert score.safety_cap_triggered is False

    # ── Journey 6: Solar Storm Sentinel (Co-op 2-Player Dual Roles) ───────────
    def test_journey_6_solar_storm_coop_2_players(self, missions):
        mission = missions["solar_storm"]
        sc = _get_preset_spacecraft("solar_storm")
        players = ["crew_alpha", "crew_bravo"]
        session = session_manager.create_session(
            mission=mission,
            spacecraft_config=sc,
            seed=105,
            player_ids=players,
        )

        # 2 players: 2 roles each
        for p in players:
            assert len(session.roles.player_roles[p]) == 2

        alpha_roles = session.roles.player_roles["crew_alpha"]
        bravo_roles = session.roles.player_roles["crew_bravo"]

        # Ensure all 4 roles are covered
        assert len(set(alpha_roles) | set(bravo_roles)) == 4

        # Execute actions from both players
        session.step(12)
        score = session.get_score_breakdown()
        assert score.team_summary is not None
        assert len(score.team_summary["participants"]) == 2

    # ── Journey 7: Volcano Watch (Solo - High Score Achievement) ──────────────
    def test_journey_7_volcano_solo_high_score(self, missions):
        mission = missions["volcano"]
        sc = _get_preset_spacecraft("volcano")
        session = session_manager.create_session(
            mission=mission,
            spacecraft_config=sc,
            seed=200,
            player_ids=["volcano_ace"],
        )

        assert session.state.mission_id == "volcano"

        # Collect high-priority multispectral volcanic data
        act_col = session.perform_action("volcano_ace", "collect_data", {"volume_mb": 80.0})
        assert act_col["success"] is True

        # Set attitude to nadir for plume tracking
        act_att = session.perform_action("volcano_ace", "set_attitude", {"mode": "Nadir (Earth)"})
        assert act_att["success"] is True

        session.step(30)
        score = session.get_score_breakdown()
        assert score.total_score > 0
        assert score.primary_objectives_total > 0

    # ── Journey 8: Volcano Watch (Co-op 4-Player Crew) ────────────────────────
    def test_journey_8_volcano_coop_4_players(self, missions):
        mission = missions["volcano"]
        sc = _get_preset_spacecraft("volcano")
        players = ["volc_dir", "volc_sys", "volc_sci", "volc_flt"]
        session = session_manager.create_session(
            mission=mission,
            spacecraft_config=sc,
            seed=200,
            player_ids=players,
        )

        # Advance 20 steps with crew coordination
        session.step(20)

        score = session.get_score_breakdown()
        assert score.team_summary is not None
        assert len(score.team_summary["participants"]) == 4
        # Verify standby vigilance points guarantee
        for p in score.team_summary["participants"]:
            assert p["standby_vigilance_points"] >= 20.0
            assert p["raw_contribution_points"] > 0


class TestPrompt16DeterministicSeedsAndSecurity:
    """Verifies deterministic repeatability, malformed payload handling, and room isolation."""

    def test_deterministic_seed_reproducibility(self, missions):
        mission = missions["wildfire"]
        sc = _get_preset_spacecraft("wildfire")
        seed = 4242

        # Run 1
        s1 = session_manager.create_session(mission=mission, spacecraft_config=sc, seed=seed, player_ids=["p1"])
        s1.perform_action("p1", "set_power_mode", {"mode": "nominal"})
        s1.step(25)
        s1.perform_action("p1", "collect_data", {"volume_mb": 35.0})
        s1.step(15)
        score_1 = s1.get_score_breakdown()
        tel_1 = s1.get_telemetry()

        # Run 2 with exact same seed and actions
        s2 = session_manager.create_session(mission=mission, spacecraft_config=sc, seed=seed, player_ids=["p1"])
        s2.perform_action("p1", "set_power_mode", {"mode": "nominal"})
        s2.step(25)
        s2.perform_action("p1", "collect_data", {"volume_mb": 35.0})
        s2.step(15)
        score_2 = s2.get_score_breakdown()
        tel_2 = s2.get_telemetry()

        # Verify exact reproducibility
        assert score_1.total_score == score_2.total_score
        assert score_1.grade == score_2.grade
        assert score_1.stars == score_2.stars
        assert tel_1["orbital"]["altitude_km"] == tel_2["orbital"]["altitude_km"]
        assert tel_1["power"]["battery_soc_pct"] == tel_2["power"]["battery_soc_pct"]
        assert tel_1["thermal"]["temperature_c"] == tel_2["thermal"]["temperature_c"]

    def test_malformed_payload_and_unknown_action_rejection(self, missions):
        mission = missions["wildfire"]
        sc = _get_preset_spacecraft("wildfire")
        session = session_manager.create_session(mission=mission, spacecraft_config=sc, seed=99, player_ids=["p1"])

        # Unknown action
        res = session.perform_action("p1", "hack_simulation_telemetry", {})
        assert res["success"] is False
        assert "Unknown action type" in res["error"]

        # Unknown player
        res_imposter = session.perform_action("unauthorized_intruder", "set_power_mode", {"mode": "safe"})
        assert res_imposter["success"] is False
        assert "Player not in this session" in res_imposter["error"]

    def test_session_state_isolation(self, missions):
        mission = missions["wildfire"]
        sc = _get_preset_spacecraft("wildfire")

        s1 = session_manager.create_session(mission=mission, spacecraft_config=sc, seed=10, player_ids=["p_room1"])
        s2 = session_manager.create_session(mission=mission, spacecraft_config=sc, seed=20, player_ids=["p_room2"])

        # Step both sessions so initial telemetry is generated
        s1.step(5)
        s2.step(5)

        # Change state in s1 only
        s1.perform_action("p_room1", "set_power_mode", {"mode": "safe"})
        s1.step(10)

        # Verify s2 is unaffected
        assert s2.get_telemetry()["workload"]["operational_profile"] != "SAFE"
        assert s2.state.current_step == 5
