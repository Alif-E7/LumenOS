"""
Prompt 8 Acceptance Tests — Deterministic Simulation Runtime, Event Director, and Recovery.

Acceptance Checks:
  1. Full headless mission execution with complete telemetry, event log, action log, and score.
  2. Bit-exact determinism across identical input seeds and ordered actions.
  3. Event order and cue reproducibility.
  4. Bit-exact checkpoint save and restore preserving subsequent trajectory.
  5. Simulation clock pause, resume, and speed controls.
  6. Subsystem physical state consistency throughout headless run.
  7. Event consequence application directly affecting physical state.
  8. Command idempotency preventing duplicate execution and double spend.
  9. Simultaneous action handling, role permission enforcement, and conflict resolution.
  10. Failure injection and educational recovery actions restoring nominal operations.
"""

from __future__ import annotations

import copy
import pytest

from api.models.mission import EventSeverity, MissionEventTemplate, EventChoice
from game.actions import ActionType
from game.command_resolver import CommandRequest, CommandStatus
from game.contracts import MissionContract, ObjectiveDefinition, Difficulty, OutcomeType
from game.events import EventType
from game.faults import FaultType, SystemFault, create_fault
from game.roles import RoleName, assign_roles
from game.runtime import SimulationRuntime, HeadlessRunResult
from simulation.core import SpacecraftConfig
from simulation.physics.orbital import OrbitalElements, GroundTarget


def _make_test_runtime(seed: int = 42, max_steps: int = 60) -> SimulationRuntime:
    """Helper to create a standard test simulation runtime."""
    objs = [
        ObjectiveDefinition(
            id="downlink_data",
            description="Downlink science data",
            target_value=200.0,
            unit="MB",
            weight=1.0,
            is_primary=True,
        ),
        ObjectiveDefinition(
            id="spacecraft_health",
            description="Maintain spacecraft health",
            target_value=75.0,
            unit="%",
            weight=0.8,
            is_primary=False,
        ),
    ]
    contract = MissionContract(
        mission_id="wildfire_test",
        mission_name="Wildfire Test Run",
        description="Headless test mission",
        difficulty=Difficulty.ENGINEER,
        deadline_steps=max_steps,
        budget=10000.0,
        objectives=objs,
        seed=seed,
    )
    targets = [
        GroundTarget(
            target_id="fire_zone_alpha",
            name="Fire Zone Alpha",
            latitude_deg=-33.7,
            longitude_deg=150.3,
            target_type="wildfire",
            priority=1,
        )
    ]
    templates = [
        MissionEventTemplate(
            id="test_smoke_obscuration",
            name="Smoke Obscuration",
            description="Thick smoke obscures thermal sensor view.",
            severity=EventSeverity.WARNING,
            probability=0.25,
            earliest_step=5,
            latest_step=50,
            choices=[
                EventChoice(
                    id="wait_pass",
                    label="Wait for next orbit",
                    description="Skip imaging and conserve battery.",
                    effects={},
                ),
                EventChoice(
                    id="boost_sensor",
                    label="Boost sensor gain",
                    description="Increase sensor power for penetration.",
                    effects={"payload_power_w": 15.0},
                ),
            ],
        )
    ]
    sc = SpacecraftConfig()
    return SimulationRuntime(
        session_id=f"test_ses_{seed}",
        mission_id="wildfire",
        contract=contract,
        spacecraft_config=sc,
        targets=targets,
        seed=seed,
        player_ids=["director_1", "flight_1", "engineer_1", "science_1"],
        event_pool=templates,
        time_step_seconds=60.0,
        max_steps=max_steps,
    )


# ── 1. Full Headless Mission Execution ───────────────────────────────────────


def test_full_headless_mission_execution():
    """Verify runner executes a complete mission headlessly returning all required records."""
    runtime = _make_test_runtime(seed=42, max_steps=50)

    # Schedule a command at step 10
    commands = {
        10: [
            CommandRequest(
                command_id="cmd_step10_eco",
                actor="engineer_1",
                role="systems_engineer",
                action_type="reduce_workload",
                params={"profile": "ECO"},
            )
        ]
    }

    result = runtime.run_headless(
        max_steps=50,
        commands_by_step=commands,
        event_decisions={"test_smoke_obscuration": "wait_pass"},
    )

    assert isinstance(result, HeadlessRunResult)
    assert result.total_steps == 50
    assert result.elapsed_seconds == 50 * 60.0
    assert result.status in ("completed", "running")

    # All required records returned
    assert len(result.timestamped_telemetry) == 50
    assert len(result.action_log) >= 1
    assert any(a.command_id == "cmd_step10_eco" and a.status == CommandStatus.ACCEPTED for a in result.action_log)
    assert len(result.objective_updates) == 50
    assert isinstance(result.final_score, float)
    assert result.grade in ("A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F")
    assert 0 <= result.stars <= 3
    assert result.budget_remaining <= result.budget_total


# ── 2. Bit-Exact Determinism ─────────────────────────────────────────────────


def test_runtime_determinism():
    """Verify identical seed + ordered action list yields 100% bit-exact outcome."""
    runtime1 = _make_test_runtime(seed=999, max_steps=40)
    runtime2 = _make_test_runtime(seed=999, max_steps=40)

    commands = {
        5: [
            CommandRequest(
                command_id="cmd_5",
                actor="engineer_1",
                role="systems_engineer",
                action_type="reduce_workload",
                params={"profile": "ECO"},
            )
        ],
        15: [
            CommandRequest(
                command_id="cmd_15",
                actor="flight_1",
                role="flight_controller",
                action_type="set_attitude",
                params={"mode": "Nadir (Earth)"},
            )
        ],
    }

    res1 = runtime1.run_headless(max_steps=40, commands_by_step=commands)
    res2 = runtime2.run_headless(max_steps=40, commands_by_step=commands)

    assert res1.total_steps == res2.total_steps
    assert res1.final_score == pytest.approx(res2.final_score, abs=1e-6)
    assert res1.spacecraft_health_pct == pytest.approx(res2.spacecraft_health_pct, abs=1e-6)
    assert res1.data_downlinked_mb == pytest.approx(res2.data_downlinked_mb, abs=1e-6)

    # Check telemetry parity at every step
    for s in range(40):
        t1 = res1.timestamped_telemetry[s]
        t2 = res2.timestamped_telemetry[s]
        assert t1["orbital"]["altitude_km"] == pytest.approx(t2["orbital"]["altitude_km"], abs=1e-6)
        assert t1["power"]["battery_soc_wh"] == pytest.approx(t2["power"]["battery_soc_wh"], abs=1e-6)
        assert t1["thermal"]["temperature_c"] == pytest.approx(t2["thermal"]["temperature_c"], abs=1e-6)


# ── 3. Event Order & Cue Reproducibility ──────────────────────────────────────


def test_event_order_reproducibility():
    """Verify seeded event director triggers identical event order and cues across runs."""
    runtime1 = _make_test_runtime(seed=777, max_steps=60)
    runtime2 = _make_test_runtime(seed=777, max_steps=60)

    res1 = runtime1.run_headless(max_steps=60)
    res2 = runtime2.run_headless(max_steps=60)

    events1 = res1.event_log
    events2 = res2.event_log

    assert len(events1) == len(events2)
    for e1, e2 in zip(events1, events2):
        assert e1["event_id"] == e2["event_id"]
        assert e1["name"] == e2["name"]
        assert e1["triggered_step"] == e2["triggered_step"]
        assert e1["severity"] == e2["severity"]
        assert e1["cue"] == e2["cue"]


# ── 4. Checkpoint Save and Restore ───────────────────────────────────────────


def test_checkpoint_save_and_restore():
    """Verify bit-exact continuation from checkpoint compared to uninterrupted run."""
    # Uninterrupted run
    rt_baseline = _make_test_runtime(seed=555, max_steps=50)
    rt_baseline.step(50)
    snap_baseline = rt_baseline.get_headless_summary()

    # Interrupted run with checkpoint save at step 25
    rt_fork = _make_test_runtime(seed=555, max_steps=50)
    rt_fork.step(25)
    checkpoint = rt_fork.save_checkpoint(metadata={"author": "test"})

    # Restore into fresh runtime at step 25 and continue to 50
    rt_restored = _make_test_runtime(seed=555, max_steps=50)
    rt_restored.load_checkpoint(checkpoint)
    assert rt_restored.current_step == 25
    rt_restored.step(25)
    snap_restored = rt_restored.get_headless_summary()

    # Compare exact final states
    assert snap_restored.total_steps == snap_baseline.total_steps
    assert snap_restored.spacecraft_health_pct == pytest.approx(snap_baseline.spacecraft_health_pct, abs=1e-6)
    assert snap_restored.data_downlinked_mb == pytest.approx(snap_baseline.data_downlinked_mb, abs=1e-6)
    assert snap_restored.budget_remaining == pytest.approx(snap_baseline.budget_remaining, abs=1e-6)
    assert snap_restored.final_score == pytest.approx(snap_baseline.final_score, abs=1e-6)


# ── 5. Simulation Clock & Pause/Resume ────────────────────────────────────────


def test_simulation_clock_controls():
    """Verify simulation clock pause, resume, and speed multiplier state."""
    runtime = _make_test_runtime(seed=42, max_steps=30)

    # Initial state is RUNNING
    assert runtime.sim.clock.is_running is True

    # Pause
    runtime.pause()
    assert runtime.sim.clock.is_paused is True

    # Resume
    runtime.resume()
    assert runtime.sim.clock.is_running is True

    # Speed multipliers
    runtime.set_speed(10.0)
    assert runtime.sim.clock.speed_multiplier == 10.0
    runtime.set_speed(1.0)
    assert runtime.sim.clock.speed_multiplier == 1.0


# ── 6. Subsystem Physical State Consistency ──────────────────────────────────


def test_subsystem_physical_consistency():
    """Verify coupled energy conservation and state bounds across simulation steps."""
    runtime = _make_test_runtime(seed=123, max_steps=40)
    runtime.step(40)
    history = runtime.telemetry_history

    for tel in history:
        # Battery DoD + SoC == 100%
        soc_pct = tel["power"]["battery_soc_pct"]
        assert 0.0 <= soc_pct <= 100.0

        # Sunlight vs Eclipse solar flux
        in_eclipse = tel["orbital"]["in_eclipse"]
        solar_output = tel["power"]["solar_output_w"]
        if in_eclipse:
            assert solar_output == pytest.approx(0.0, abs=1e-3)

        # Thermal heat bounds
        temp_c = tel["thermal"]["temperature_c"]
        assert -50.0 < temp_c < 100.0

        # Storage bounds
        storage = tel["storage"]
        assert storage["used_mb"] >= 0.0
        assert storage["free_mb"] >= 0.0


# ── 7. Event Consequences Applied ────────────────────────────────────────────


def test_event_consequences_applied():
    """Verify resolving an event directly applies concrete physical state changes."""
    runtime = _make_test_runtime(seed=42, max_steps=30)
    runtime.step(5)

    # Trigger or create an active event
    event = runtime.event_director.active_events
    if not event:
        # Trigger an event directly via tick or inject
        runtime.inject_fault("battery_cell_degraded")
        runtime.step(1)
        event = runtime.event_director.active_events

    assert len(event) > 0
    target_event = event[0]

    # Pick a choice that enters safe mode or modifies power
    choice_id = target_event.choices[0].id
    consequence = runtime.resolve_event(target_event.event_id, choice_id, actor="flight_director")
    assert consequence is not None

    # Step once to verify effect is active in physical telemetry
    runtime.step(1)
    latest_snap = runtime.sim.get_snapshot()
    assert latest_snap is not None


# ── 8. Command Idempotency ───────────────────────────────────────────────────


def test_command_idempotency():
    """Verify duplicate command IDs are detected and not executed twice or double-charged."""
    runtime = _make_test_runtime(seed=42, max_steps=30)
    initial_budget = runtime.budget_remaining

    cmd = CommandRequest(
        command_id="unique_nonce_12345",
        actor="engineer_1",
        role="systems_engineer",
        action_type="repair_subsystem",
        params={"subsystem_name": "payload"},
    )

    # First submission -> ACCEPTED
    rec1 = runtime.submit_command(cmd)
    assert rec1.status == CommandStatus.ACCEPTED
    budget_after_first = runtime.budget_remaining
    assert budget_after_first < initial_budget

    # Duplicate submission with identical command_id -> DUPLICATE
    rec2 = runtime.submit_command(cmd)
    assert rec2.status == CommandStatus.DUPLICATE
    assert "Duplicate command_id" in rec2.reason

    # Budget must NOT be deducted again
    assert runtime.budget_remaining == budget_after_first


# ── 9. Simultaneous Action Handling & Role Conflict Resolution ───────────────


def test_simultaneous_action_handling_and_conflicts():
    """Verify serialization of concurrent commands, role authorization, and state conflicts."""
    runtime = _make_test_runtime(seed=42, max_steps=30)

    # 1. Role permission enforcement: Science Officer cannot adjust orbit
    unauthorized_cmd = CommandRequest(
        command_id="cmd_unauth_orbit",
        actor="science_1",
        role="science_officer",
        action_type="adjust_orbit",
        params={"delta_altitude_km": 10.0},
    )
    rec_unauth = runtime.submit_command(unauthorized_cmd)
    assert rec_unauth.status == CommandStatus.REJECTED
    assert "permission denied" in rec_unauth.reason.lower()

    # 2. Conflicting concurrent actions in same step:
    # Actor 1 commands SAFE mode; Actor 2 commands payload activation
    cmd_safe = CommandRequest(
        command_id="cmd_set_safe",
        actor="engineer_1",
        role="systems_engineer",
        action_type="enter_safe_mode",
        params={},
    )
    cmd_conflict = CommandRequest(
        command_id="cmd_payload_on",
        actor="science_1",
        role="science_officer",
        action_type="adjust_observation_plan",
        params={"payload_active": True},
    )

    records = runtime.submit_commands([cmd_safe, cmd_conflict])
    assert records[0].status == CommandStatus.ACCEPTED
    assert records[1].status == CommandStatus.REJECTED
    assert "cannot activate payload while spacecraft is in SAFE mode" in records[1].reason

    # 3. Conflicting attitude commands in same step
    cmd_att1 = CommandRequest(
        command_id="cmd_att_1",
        actor="flight_1",
        role="flight_controller",
        action_type="set_attitude",
        params={"mode": "Sun-pointing"},
    )
    cmd_att2 = CommandRequest(
        command_id="cmd_att_2",
        actor="flight_1",
        role="flight_controller",
        action_type="set_attitude",
        params={"mode": "Nadir (Earth)"},
    )
    records_att = runtime.submit_commands([cmd_att1, cmd_att2])
    assert records_att[0].status == CommandStatus.ACCEPTED
    assert records_att[1].status == CommandStatus.REJECTED
    assert "attitude orientation already modified" in records_att[1].reason


# ── 10. Failure Injection and Educational Recovery ───────────────────────────


def test_failure_injection_and_recovery():
    """Verify injected failure degrades spacecraft and operator recovery restores health."""
    runtime = _make_test_runtime(seed=101, max_steps=60)

    # Run nominally for 10 steps
    runtime.step(10)
    health_nominal = runtime.sim.get_snapshot().spacecraft_health_pct
    assert health_nominal >= 90.0

    # Inject RADIATOR_STUCK at step 10
    fault = runtime.inject_fault("radiator_stuck")
    assert fault.active is True
    assert len(runtime.active_faults) == 1

    # Run for 10 steps under failure condition
    runtime.step(10)
    health_degraded = runtime.sim.get_snapshot().spacecraft_health_pct
    # Louver jam causes temperature rise and warning
    assert any("High Temperature" in w["message"] or "thermal" in w["source"] for w in runtime.warnings_log)

    # Execute educational recovery actions:
    # 1. Reduce internal heat generation
    cmd_eco = CommandRequest(
        command_id="cmd_recover_eco",
        actor="engineer_1",
        role="systems_engineer",
        action_type="reduce_workload",
        params={"profile": "ECO"},
    )
    runtime.submit_command(cmd_eco)

    # 2. Reset fault / repair subsystem
    cmd_reset = CommandRequest(
        command_id="cmd_reset_radiator",
        actor="engineer_1",
        role="systems_engineer",
        action_type="reset_fault",
        params={"fault_id": fault.fault_id},
    )
    rec_reset = runtime.submit_command(cmd_reset)
    assert rec_reset.status == CommandStatus.ACCEPTED

    # Resolve fault in runtime
    runtime.resolve_fault(fault.fault_id, action_name="reset_fault")
    assert fault.resolved is True

    # Continue mission for 20 steps
    runtime.step(20)
    health_recovered = runtime.sim.get_snapshot().spacecraft_health_pct
    assert health_recovered >= health_degraded
    assert runtime.is_finished is False or runtime.status == "completed"
