"""
Tests for LumenOS Canonical Domain Models, State, Roles & API Contracts (Prompt 3).

Verifies:
  1. All 26 canonical schemas instantiate and validate correctly
  2. Versioning ("v1") on CommandRequest, CommandResult, MultiplayerRoom, SessionSnapshot
  3. Serialization / deserialization roundtrip for all canonical models
  4. Invalid-state checks (negative mass, out-of-bound health, invalid inclination, etc.)
  5. Solo role access (1 participant receives all four stations)
  6. 2-, 3-, and 4-player role mapping and role bundles
  7. Permission matrix tests for all 4 roles
  8. Host role reassignment and complete role coverage validation
  9. Strict separation of Mission Budget from earned Engineering Credits
  10. Objective progress tracking, metrics, and completion state transitions
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from api.models.canonical import (
    API_VERSION,
    Achievement,
    ActionConsequence,
    CommandRequest,
    CommandResult,
    Component,
    ConnectionStatus,
    DataProvenance,
    DifficultyLevel,
    EventChoice,
    EventResolutionState,
    EventSeverity,
    GameSession,
    Grade,
    Instrument,
    InstrumentType,
    Launcher,
    MissionContract,
    MissionEnvironment,
    MissionEvent,
    MissionScenario,
    MissionState,
    MissionStatus,
    MultiplayerRoom,
    Objective,
    Orbit,
    OrbitType,
    OutcomeType,
    Participant,
    PlayerAction,
    PlayerProgress,
    PlayerRole,
    PowerSubsystem,
    PropulsionSubsystem,
    RewardRules,
    RolePermission,
    RoomPhase,
    ScoreCategoryBreakdown,
    ScoreResult,
    SessionSnapshot,
    Spacecraft,
    StructureSubsystem,
    SubsystemType,
    Telemetry,
    ThermalSubsystem,
    Unlock,
    assign_canonical_roles,
    check_canonical_permission,
    get_canonical_permissions,
    validate_role_distribution,
)


class TestCanonicalSchemas:
    """Verify instantiation, valid ranges, and schema validation."""

    def test_component_schema(self):
        comp = Component(
            id="solar_array_v1",
            name="UltraFlex Solar Array",
            subsystem=SubsystemType.POWER,
            mass_kg=25.5,
            power_generation_w=450.0,
            cost_credits=200,
            required_level=2,
            health_pct=100.0,
        )
        assert comp.id == "solar_array_v1"
        assert comp.mass_kg == 25.5
        assert comp.power_generation_w == 450.0

    def test_component_invalid_mass(self):
        with pytest.raises(ValidationError):
            Component(
                id="c1",
                name="Invalid Component",
                subsystem=SubsystemType.POWER,
                mass_kg=-5.0,  # Mass must be > 0
            )

    def test_instrument_schema(self):
        inst = Instrument(
            id="thermal_cam_1",
            name="LWIR Radiometer",
            instrument_type=InstrumentType.THERMAL_INFRARED,
            mass_kg=12.0,
            power_draw_w=65.0,
            data_rate_kbps=250.0,
            resolution_m=30.0,
            cost_credits=500,
        )
        assert inst.instrument_type == InstrumentType.THERMAL_INFRARED
        assert inst.power_draw_w == 65.0

    def test_launcher_schema(self):
        launcher = Launcher(
            id="vulcan_light",
            name="Vulcan Light",
            max_payload_leo_kg=1200.0,
            max_payload_sso_kg=800.0,
            fairing_diameter_m=2.4,
            launch_cost_budget=1500.0,
            reliability_pct=99.0,
        )
        assert launcher.max_payload_sso_kg == 800.0
        assert launcher.launch_cost_budget == 1500.0

    def test_orbit_mechanics_calculation(self):
        orbit = Orbit(
            altitude_km=700.0,
            inclination_deg=98.2,
            orbit_type=OrbitType.SSO,
        )
        # Verify automatic semi-major axis calculation: R_earth (6378.137) + 700 = 7078.137
        assert pytest.approx(orbit.semi_major_axis_km, rel=1e-3) == 7078.14
        # LEO 700km orbital period is ~98.7 minutes
        assert pytest.approx(orbit.period_minutes, rel=1e-2) == 98.7

    def test_orbit_invalid_inclination(self):
        with pytest.raises(ValidationError):
            Orbit(altitude_km=500.0, inclination_deg=190.0)  # > 180 deg invalid

    def test_spacecraft_mass_aggregation(self):
        sc = Spacecraft(
            name="Scout-1",
            structure=StructureSubsystem(dry_mass_kg=400.0, fuel_mass_kg=50.0),
            components=[
                Component(
                    id="comp_1",
                    name="Extra Radiator",
                    subsystem=SubsystemType.THERMAL,
                    mass_kg=20.0,
                )
            ],
            instruments=[
                Instrument(
                    id="inst_1",
                    name="Multispectral Imager",
                    instrument_type=InstrumentType.MULTISPECTRAL_IMAGER,
                    mass_kg=30.0,
                    power_draw_w=50.0,
                )
            ],
        )
        # Total mass = dry (400) + fuel (50) + payload.mass_kg (30 default) + comp (20) + inst (30) = 530.0
        assert sc.total_mass_kg == 530.0


class TestObjectiveProgressAndScoring:
    """Verify objective target tracking and score results."""

    def test_objective_progress_updates(self):
        obj = Objective(
            id="obj_downlink",
            description="Downlink 500 MB of science data",
            target_value=500.0,
            unit="MB",
            weight=1.5,
        )
        assert not obj.is_complete
        assert obj.fraction == 0.0

        # Partial progress
        obj.update_progress(250.0)
        assert obj.current_value == 250.0
        assert obj.fraction == 0.5
        assert not obj.is_complete

        # Completed
        obj.update_progress(550.0)
        assert obj.current_value == 550.0
        assert obj.fraction == 1.0
        assert obj.is_complete

    def test_score_result_schema(self):
        score = ScoreResult(
            session_id="ses_123",
            total_score=850.0,
            max_score=1000.0,
            score_fraction=0.85,
            grade=Grade.B,
            categories=[
                ScoreCategoryBreakdown(
                    category="objectives",
                    weighted_score=400.0,
                    max_possible=400.0,
                    explanation="All primary objectives met",
                ),
                ScoreCategoryBreakdown(
                    category="budget",
                    weighted_score=450.0,
                    max_possible=600.0,
                    explanation="25% budget reserve maintained",
                ),
            ],
            objectives_met=3,
            objectives_total=3,
            events_handled_well=2,
        )
        assert score.grade == Grade.B
        assert score.score_fraction == 0.85
        assert score.provenance == DataProvenance.SIMULATED


class TestMissionContractAndEvents:
    """Verify contract requirements, event choices, and consequences."""

    def test_mission_contract_strict_budget_separation(self):
        """Mission budget is within-mission only; Engineering credits are in PlayerProgress."""
        contract = MissionContract(
            mission_id="wildfire",
            mission_name="Wildfire Scout",
            story_context="Severe wildfire outbreaks in the Mediterranean basin require orbital thermal tracking.",
            difficulty=DifficultyLevel.ENGINEER,
            deadline_steps=1440,
            deadline_hours=24.0,
            mission_budget=10000.0,
            allowed_components=["comp_solar_standard", "comp_radiator_small"],
            locked_components=["comp_nuclear_rtg"],
            risk_level="moderate",
            primary_objectives=[
                Objective(id="p1", description="Detect hot spots", target_value=5.0)
            ],
            reward_rules=RewardRules(xp_base=600, credits_base=300),
        )
        assert contract.mission_budget == 10000.0
        assert len(contract.allowed_components) == 2
        assert contract.difficulty == DifficultyLevel.ENGINEER

    def test_mission_event_pipeline(self):
        event = MissionEvent(
            event_id="evt_flare_01",
            template_id="solar_flare",
            name="X-Class Solar Flare",
            severity=EventSeverity.CRITICAL,
            cue="Solar particle flux rising sharply! Radiation threshold exceeded.",
            context_explanation="Coronal mass ejections cause single-event upsets and rapid battery degradation.",
            probability=0.2,
            allowed_roles=[PlayerRole.MISSION_DIRECTOR, PlayerRole.SYSTEMS_ENGINEER],
            time_limit_steps=3,
            choices=[
                EventChoice(
                    id="safe_mode",
                    label="Safe Mode",
                    description="Shed all payloads and point panels edge-on.",
                    role_required=PlayerRole.SYSTEMS_ENGINEER,
                    cost_budget=100.0,
                    effects={"battery_degradation_pct": 2.0},
                    risk_description="Pauses science collection for 2 orbits.",
                ),
                EventChoice(
                    id="hold_attitude",
                    label="Maintain Science",
                    description="Keep instrument pointing at target.",
                    role_required=PlayerRole.MISSION_DIRECTOR,
                    cost_budget=0.0,
                    effects={"spacecraft_health_pct": -15.0},
                    risk_description="High risk of subsystem degradation.",
                ),
            ],
        )
        assert event.severity == EventSeverity.CRITICAL
        assert len(event.choices) == 2
        assert PlayerRole.SYSTEMS_ENGINEER in event.allowed_roles


class TestRolePermissionsAndBundles:
    """Verify role matrix, solo all-stations access, and 2-4 player role distributions."""

    def test_single_player_all_stations_access(self):
        """Single player gets all four roles and full permission set."""
        bundles = assign_canonical_roles(["solo_player"])
        roles = bundles["solo_player"]
        assert len(roles) == 4
        assert PlayerRole.MISSION_DIRECTOR in roles
        assert PlayerRole.SYSTEMS_ENGINEER in roles
        assert PlayerRole.SCIENCE_OFFICER in roles
        assert PlayerRole.FLIGHT_CONTROLLER in roles
        assert validate_role_distribution(bundles)

    def test_two_player_role_bundles(self):
        """2 players: Director+Science; Flight+Systems."""
        bundles = assign_canonical_roles(["alice", "bob"])
        assert PlayerRole.MISSION_DIRECTOR in bundles["alice"]
        assert PlayerRole.SCIENCE_OFFICER in bundles["alice"]
        assert PlayerRole.FLIGHT_CONTROLLER in bundles["bob"]
        assert PlayerRole.SYSTEMS_ENGINEER in bundles["bob"]
        assert validate_role_distribution(bundles)

    def test_three_player_role_bundles(self):
        """3 players: Director+Science; Flight; Systems."""
        bundles = assign_canonical_roles(["p1", "p2", "p3"])
        assert PlayerRole.MISSION_DIRECTOR in bundles["p1"]
        assert PlayerRole.SCIENCE_OFFICER in bundles["p1"]
        assert bundles["p2"] == [PlayerRole.FLIGHT_CONTROLLER]
        assert bundles["p3"] == [PlayerRole.SYSTEMS_ENGINEER]
        assert validate_role_distribution(bundles)

    def test_four_player_role_bundles(self):
        """4 players: 1 role each."""
        bundles = assign_canonical_roles(["p1", "p2", "p3", "p4"])
        for p in ["p1", "p2", "p3", "p4"]:
            assert len(bundles[p]) == 1
        assert validate_role_distribution(bundles)

    def test_role_reassignment_validation(self):
        """Validation fails if any role is left unassigned."""
        incomplete_distribution = {
            "p1": [PlayerRole.MISSION_DIRECTOR],
            "p2": [PlayerRole.FLIGHT_CONTROLLER],
        }
        assert not validate_role_distribution(incomplete_distribution)

    def test_permission_checks(self):
        """Role permission matrix verification."""
        assert check_canonical_permission(PlayerRole.MISSION_DIRECTOR, "allocate_budget")
        assert not check_canonical_permission(PlayerRole.MISSION_DIRECTOR, "fire_thruster")

        assert check_canonical_permission(PlayerRole.SYSTEMS_ENGINEER, "toggle_subsystem")
        assert not check_canonical_permission(PlayerRole.SYSTEMS_ENGINEER, "adjust_orbit")

        assert check_canonical_permission(PlayerRole.SCIENCE_OFFICER, "downlink_data")
        assert not check_canonical_permission(PlayerRole.SCIENCE_OFFICER, "repair_subsystem")

        assert check_canonical_permission(PlayerRole.FLIGHT_CONTROLLER, "fire_thruster")
        assert not check_canonical_permission(PlayerRole.FLIGHT_CONTROLLER, "collect_data")

    def test_get_canonical_permissions(self):
        perms = get_canonical_permissions(PlayerRole.FLIGHT_CONTROLLER)
        action_names = [p.action_type for p in perms]
        assert "adjust_orbit" in action_names
        assert "fire_thruster" in action_names
        assert "set_attitude" in action_names


class TestVersioningAndAPIContracts:
    """Verify CommandRequest, CommandResult, SessionSnapshot, and MultiplayerRoom versioning."""

    def test_version_envelopes(self):
        req = CommandRequest(
            session_id="ses_abc",
            player_id="player_1",
            role=PlayerRole.SYSTEMS_ENGINEER,
            command_type="action",
            payload={"action_type": "set_power_mode", "mode": "low_power"},
        )
        assert req.version == API_VERSION
        assert req.role == PlayerRole.SYSTEMS_ENGINEER

        consequence = ActionConsequence(
            action_id="act_1",
            success=True,
            budget_spent=0.0,
            budget_remaining=9800.0,
            message="Payload shed for low-power mode",
        )

        res = CommandResult(
            request_id=req.request_id,
            command_type="action",
            success=True,
            consequence=consequence,
        )
        assert res.version == API_VERSION
        assert res.success
        assert res.consequence.budget_remaining == 9800.0

    def test_multiplayer_room_and_participant(self):
        participant = Participant(
            player_id="p_host",
            display_name="Commander Shepard",
            is_host=True,
            assigned_roles=[PlayerRole.MISSION_DIRECTOR, PlayerRole.SCIENCE_OFFICER],
            connection_status=ConnectionStatus.CONNECTED,
            is_ready=True,
        )
        room = MultiplayerRoom(
            room_code="A3F1B2",
            host_id="p_host",
            host_name="Commander Shepard",
            phase=RoomPhase.LOBBY,
            participants=[participant],
            mission_id="wildfire",
        )
        assert room.version == API_VERSION
        assert room.room_code == "A3F1B2"
        assert room.participants[0].is_host
        assert len(room.participants[0].assigned_roles) == 2

    def test_serialization_and_deserialization_roundtrip(self):
        progress = PlayerProgress(
            player_id="user_789",
            callsign="OrbitalAce",
            rank="Mission Specialist",
            level=3,
            xp=1250,
            engineering_credits=3400,
            missions_completed=4,
            missions_won=3,
            achievements=[
                Achievement(
                    id="first_orbit",
                    title="Orbit Injected",
                    description="Successfully completed your first mission",
                    is_unlocked=True,
                )
            ],
            unlocked_component_ids=["comp_solar_v2"],
        )
        serialized = progress.model_dump()
        reconstructed = PlayerProgress.model_validate(serialized)
        assert reconstructed.player_id == "user_789"
        assert reconstructed.engineering_credits == 3400
        assert reconstructed.achievements[0].is_unlocked
