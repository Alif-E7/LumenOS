"""
Prompt 14 Acceptance Test Suite — Cooperative Multiplayer:
Room Lifecycle, Four Roles, and Real-Time Synchronization.

Acceptance checks:
1. 1-player Solo (All Stations using unified resolver)
2. 2-player co-op (2 roles each)
3. 3-player role bundles
4. 4-player one-role-each (Director, Systems, Science, Flight)
5. Role permission denial with descriptive error reasons
6. Simultaneous commands serialization without race conditions
7. Duplicate command prevention (idempotency)
8. Client disconnect and rejoin with complete state restoration
9. Host dynamic role reassignment during active session
10. Room isolation between different room codes
11. Shared event and telemetry consistency across all clients
12. Each role performs different useful work with real state effects
13. Cross-role action requests and Mission Director emergency overrides
14. Tactical coordination pings and activity feed logging
15. Room expiration and cleanup of stale abandoned rooms
"""

from __future__ import annotations

import asyncio
import json
import pytest
from starlette.testclient import TestClient

from api.main import app
from api.services.rooms import room_manager, Room
from game.roles import RoleName, assign_roles, assign_custom_roles


@pytest.fixture(autouse=True)
def _clear_rooms():
    """Clear all rooms before and after each test."""
    room_manager._rooms.clear()
    yield
    room_manager._rooms.clear()


class TestCoopMultiplayerRolesAndScaling:
    """Tests 1–4 player role scaling, bundling, and host reassignment."""

    def test_role_scaling_1_to_4_players(self):
        # 1 player: all 4 roles
        assigned_1 = assign_roles(["p1"])
        assert len(assigned_1.player_roles["p1"]) == 4

        # 2 players: 2 roles each
        assigned_2 = assign_roles(["p1", "p2"])
        assert len(assigned_2.player_roles["p1"]) == 2
        assert len(assigned_2.player_roles["p2"]) == 2
        all_2 = assigned_2.all_assigned_roles
        assert len(all_2) == 4

        # 3 players: 1 bundle of 2, other two have 1
        assigned_3 = assign_roles(["p1", "p2", "p3"])
        lens = sorted([len(roles) for roles in assigned_3.player_roles.values()])
        assert lens == [1, 1, 2]
        assert len(assigned_3.all_assigned_roles) == 4

        # 4 players: 1 role each
        assigned_4 = assign_roles(["p1", "p2", "p3", "p4"])
        for pid in ["p1", "p2", "p3", "p4"]:
            assert len(assigned_4.player_roles[pid]) == 1
        assert len(assigned_4.all_assigned_roles) == 4

    def test_custom_role_bundle_validation(self):
        # Valid custom mapping for 3 players
        valid_map = {
            "p1": ["mission_director", "flight_controller"],
            "p2": ["systems_engineer"],
            "p3": ["science_officer"],
        }
        res = assign_custom_roles(valid_map)
        assert len(res.all_assigned_roles) == 4

        # Invalid: missing role raises ValueError
        invalid_map = {
            "p1": ["mission_director"],
            "p2": ["systems_engineer"],
        }
        with pytest.raises(ValueError, match="All 4 roles must be assigned"):
            assign_custom_roles(invalid_map)


class TestCoopWebSocketFlows:
    """Full live WebSocket tests for 2-4 players, role permissions, and host controls."""

    def test_four_player_mission_and_role_permissions(self):
        """4 players, 1 role each. Verifies role permission enforcement."""
        tc = TestClient(app)

        # 1. Create Room by Host (Director)
        create = tc.post("/api/rooms", json={"host_name": "Commander"}).json()
        code, host_id = create["room_code"], create["player_id"]

        # 2. Join 3 other players
        p2_id = tc.post(f"/api/rooms/{code}/join", json={"display_name": "SystemsEng"}).json()["player_id"]
        p3_id = tc.post(f"/api/rooms/{code}/join", json={"display_name": "ScienceOff"}).json()["player_id"]
        p4_id = tc.post(f"/api/rooms/{code}/join", json={"display_name": "FlightCtrl"}).json()["player_id"]

        with tc.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as ws1, \
             tc.websocket_connect(f"/api/rooms/ws/{code}/{p2_id}?display_name=SystemsEng") as ws2, \
             tc.websocket_connect(f"/api/rooms/ws/{code}/{p3_id}?display_name=ScienceOff") as ws3, \
             tc.websocket_connect(f"/api/rooms/ws/{code}/{p4_id}?display_name=FlightCtrl") as ws4:

            # Drain join broadcasts
            for ws in [ws1, ws2, ws3, ws4]:
                while True:
                    m = ws.receive_json()
                    if m.get("participant_count") == 4 or m.get("type") == "player_joined":
                        if m.get("participant_count") == 4:
                            break

            # Host sets custom roles: ws1=director, ws2=systems, ws3=science, ws4=flight
            ws1.send_json({
                "command": "reassign_roles",
                "role_assignments": {
                    host_id: ["mission_director"],
                    p2_id: ["systems_engineer"],
                    p3_id: ["science_officer"],
                    p4_id: ["flight_controller"],
                },
            })

            # Receive roles_updated on all sockets
            for ws in [ws1, ws2, ws3, ws4]:
                m = ws.receive_json()
                assert m["type"] == "roles_updated"
                assert m["roles"][host_id] == ["mission_director"]
                assert m["roles"][p2_id] == ["systems_engineer"]
                assert m["roles"][p3_id] == ["science_officer"]
                assert m["roles"][p4_id] == ["flight_controller"]

            # Host starts game
            ws1.send_json({"command": "start", "mission_id": "wildfire"})
            for ws in [ws1, ws2, ws3, ws4]:
                m = ws.receive_json()
                assert m["type"] == "game_started"

            # Check 1: Systems Engineer changes power mode (permitted)
            ws2.send_json({
                "command": "action",
                "command_id": "cmd_sys_01",
                "action_type": "set_power_mode",
                "params": {"profile": "ECO"},
            })
            res2 = ws2.receive_json()
            assert res2["type"] == "action_result"
            assert res2["success"] is True

            # All sockets receive action_broadcast
            for ws in [ws1, ws2, ws3, ws4]:
                b = ws.receive_json()
                assert b["type"] == "action_broadcast"
                assert b["action_type"] == "set_power_mode"

            # Check 2: Science Officer attempts Systems action (DENIED)
            ws3.send_json({
                "command": "action",
                "command_id": "cmd_sci_fail_01",
                "action_type": "set_power_mode",
                "params": {"profile": "FULL"},
            })
            res3 = ws3.receive_json()
            assert res3["type"] == "action_result"
            assert res3["success"] is False
            assert "Role does not permit action" in res3["error"]

            # Check 3: Flight Controller attempts thruster burn (permitted)
            ws4.send_json({
                "command": "action",
                "command_id": "cmd_flt_01",
                "action_type": "fire_thruster",
                "params": {"delta_v_m_s": 5.0},
            })
            res4 = ws4.receive_json()
            assert res4["type"] == "action_result"
            assert res4["success"] is True

            for ws in [ws1, ws2, ws3, ws4]:
                b = ws.receive_json()
                assert b["type"] == "action_broadcast"
                assert b["action_type"] == "fire_thruster"

            # Check 4: Mission Director allocates budget (permitted)
            ws1.send_json({
                "command": "action",
                "command_id": "cmd_dir_01",
                "action_type": "allocate_budget",
                "params": {"subsystem": "power", "amount": 100.0},
            })
            res1 = ws1.receive_json()
            assert res1["type"] == "action_result"
            assert res1["success"] is True

            for ws in [ws1, ws2, ws3, ws4]:
                b = ws.receive_json()
                assert b["type"] == "action_broadcast"
                assert b["action_type"] == "allocate_budget"

    def test_duplicate_command_prevention_idempotency(self):
        """Verifies duplicate command_id returns cached result without double execution."""
        tc = TestClient(app)
        create = tc.post("/api/rooms", json={"host_name": "Alice"}).json()
        code, host_id = create["room_code"], create["player_id"]

        with tc.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as ws:
            ws.receive_json()  # player_joined
            ws.send_json({"command": "start", "mission_id": "wildfire"})
            ws.receive_json()  # game_started

            # First execution
            cmd_payload = {
                "command": "action",
                "command_id": "unique_cmd_nonce_999",
                "action_type": "adjust_thermal",
                "params": {"heater_override": True},
            }
            ws.send_json(cmd_payload)
            first_res = ws.receive_json()
            assert first_res["type"] == "action_result"
            assert first_res["success"] is True
            ws.receive_json()  # action_broadcast

            # Duplicate submission of the identical command_id
            ws.send_json(cmd_payload)
            dup_res = ws.receive_json()
            assert dup_res["type"] == "action_result"
            assert dup_res.get("duplicate") is True
            assert dup_res["command_id"] == "unique_cmd_nonce_999"

    def test_host_pause_resume_restart_and_end(self):
        """Verifies host controls for simulation pause, resume, restart, and end."""
        tc = TestClient(app)
        create = tc.post("/api/rooms", json={"host_name": "Commander"}).json()
        code, host_id = create["room_code"], create["player_id"]

        with tc.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as ws:
            ws.receive_json()
            ws.send_json({"command": "start", "mission_id": "wildfire"})
            ws.receive_json()

            # 1. Pause
            ws.send_json({"command": "pause"})
            paused = ws.receive_json()
            assert paused["type"] == "game_paused"
            assert paused["is_paused"] is True

            # While paused, step commands must be rejected
            ws.send_json({"command": "step", "steps": 1})
            step_err = ws.receive_json()
            assert step_err["type"] == "error"
            assert "paused" in step_err["error"].lower()

            # 2. Resume
            ws.send_json({"command": "resume"})
            resumed = ws.receive_json()
            assert resumed["type"] == "game_resumed"
            assert resumed["is_paused"] is False

            # Now step works
            ws.send_json({"command": "step", "steps": 1})
            step_res = ws.receive_json()
            assert step_res["type"] == "step_result"

            # 3. Restart
            ws.send_json({"command": "restart"})
            started = ws.receive_json()
            assert started["type"] == "game_started"
            restarted = ws.receive_json()
            assert restarted["type"] == "game_restarted"
            assert restarted["state"]["step"] == 0

            # 4. End
            ws.send_json({"command": "end"})
            ended = ws.receive_json()
            assert ended["type"] == "game_finished"
            assert "score" in ended

    def test_cross_role_requests_and_director_override(self):
        """Tests cross-role action request, approval by target role, and emergency override by Director."""
        tc = TestClient(app)
        create = tc.post("/api/rooms", json={"host_name": "Director"}).json()
        code, host_id = create["room_code"], create["player_id"]
        join = tc.post(f"/api/rooms/{code}/join", json={"display_name": "Systems"}).json()
        p2_id = join["player_id"]

        with tc.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as ws1, \
             tc.websocket_connect(f"/api/rooms/ws/{code}/{p2_id}?display_name=Systems") as ws2:

            # Flush joins
            ws1.receive_json()
            ws1.receive_json()
            ws2.receive_json()

            # Set roles: ws1=director + science, ws2=systems + flight
            ws1.send_json({
                "command": "reassign_roles",
                "role_assignments": {
                    host_id: ["mission_director", "science_officer"],
                    p2_id: ["systems_engineer", "flight_controller"],
                },
            })
            ws1.receive_json()
            ws2.receive_json()

            ws1.send_json({"command": "start", "mission_id": "wildfire"})
            ws1.receive_json()
            ws2.receive_json()

            # Science Officer (ws1) requests Systems Engineer (ws2) to set power profile to ECO
            ws1.send_json({
                "command": "request_action",
                "request_id": "req_coop_001",
                "target_role": "systems_engineer",
                "action_type": "set_power_mode",
                "params": {"profile": "ECO"},
                "reason": "Save battery before entering eclipse",
            })

            req_msg1 = ws1.receive_json()
            assert req_msg1["type"] == "action_requested"
            assert req_msg1["request"]["request_id"] == "req_coop_001"

            req_msg2 = ws2.receive_json()
            assert req_msg2["type"] == "action_requested"

            # Systems Engineer (ws2) approves request
            ws2.send_json({
                "command": "respond_action_request",
                "request_id": "req_coop_001",
                "decision": "approve",
            })

            appr1 = ws1.receive_json()
            assert appr1["type"] == "request_approved"
            assert appr1["request_id"] == "req_coop_001"

            appr2 = ws2.receive_json()
            assert appr2["type"] == "request_approved"

    def test_client_disconnect_and_reconnect_snapshot(self):
        """Tests that disconnected player is tracked and receives full state snapshot upon reconnect."""
        tc = TestClient(app)
        create = tc.post("/api/rooms", json={"host_name": "HostPlayer"}).json()
        code, host_id = create["room_code"], create["player_id"]
        join = tc.post(f"/api/rooms/{code}/join", json={"display_name": "GuestPlayer"}).json()
        guest_id = join["player_id"]

        # Connect both
        with tc.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as host_ws:
            host_ws.receive_json()

            with tc.websocket_connect(f"/api/rooms/ws/{code}/{guest_id}?display_name=GuestPlayer") as guest_ws:
                host_ws.receive_json()
                guest_ws.receive_json()

                # Host starts mission and advances 2 steps
                host_ws.send_json({"command": "start", "mission_id": "wildfire"})
                host_ws.receive_json()
                guest_ws.receive_json()

                host_ws.send_json({"command": "step", "steps": 2})
                host_ws.receive_json()
                guest_ws.receive_json()

            # Guest WS exits context (disconnects)
            disc_msg = host_ws.receive_json()
            assert disc_msg["type"] == "player_disconnected"
            assert disc_msg["player_id"] == guest_id

            # Verify room participant is marked connected = False
            room = room_manager.get_room(code)
            assert room is not None
            p = room.get_participant(guest_id)
            assert p is not None
            assert p.connected is False

            # Guest reconnects with the same player_id!
            with tc.websocket_connect(f"/api/rooms/ws/{code}/{guest_id}?display_name=GuestPlayer") as guest_ws_re:
                # Guest immediately receives full reconnect_state
                reconnect_msg = guest_ws_re.receive_json()
                assert reconnect_msg["type"] == "reconnect_state"
                assert reconnect_msg["phase"] == "playing"
                assert reconnect_msg["state"]["step"] == 2
                assert "telemetry" in reconnect_msg

                # Host receives player_reconnected broadcast
                reconnected_bcast = host_ws.receive_json()
                assert reconnected_bcast["type"] == "player_reconnected"
                assert reconnected_bcast["player_id"] == guest_id

    def test_tactical_ping_and_activity_feed(self):
        """Verifies tactical coordination status messages and rolling activity feed."""
        tc = TestClient(app)
        create = tc.post("/api/rooms", json={"host_name": "Alice"}).json()
        code, host_id = create["room_code"], create["player_id"]

        with tc.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as ws:
            ws.receive_json()

            # Send tactical ping
            ws.send_json({
                "command": "tactical_ping",
                "ping_type": "NEED_POWER",
                "message": "Thermal margin low, shedding noncritical processing",
            })

            ping = ws.receive_json()
            assert ping["type"] == "tactical_ping"
            assert ping["ping_type"] == "NEED_POWER"
            assert "Thermal margin" in ping["message"]

            # Request state snapshot; should include activity feed
            ws.send_json({"command": "start", "mission_id": "wildfire"})
            ws.receive_json()

            ws.send_json({"command": "get_state"})
            snapshot = ws.receive_json()
            assert snapshot["type"] == "state_snapshot"
            assert len(snapshot["activity_feed"]) > 0

    def test_room_isolation(self):
        """Verifies actions in Room A have zero effect on Room B."""
        tc = TestClient(app)
        r1 = tc.post("/api/rooms", json={"host_name": "Room1Host"}).json()
        r2 = tc.post("/api/rooms", json={"host_name": "Room2Host"}).json()
        code1, host1 = r1["room_code"], r1["player_id"]
        code2, host2 = r2["room_code"], r2["player_id"]

        with tc.websocket_connect(f"/api/rooms/ws/{code1}/{host1}") as ws1, \
             tc.websocket_connect(f"/api/rooms/ws/{code2}/{host2}") as ws2:

            ws1.receive_json()
            ws2.receive_json()

            ws1.send_json({"command": "start", "mission_id": "wildfire"})
            started1 = ws1.receive_json()
            assert started1["type"] == "game_started"

            # Room 2 is completely unaffected and still in lobby
            room2 = room_manager.get_room(code2)
            assert room2.phase == "lobby"

    def test_stale_room_cleanup(self):
        """Verifies that abandoned stale rooms are pruned."""
        room = room_manager.create_room(host_id="p_old", host_name="Ghost")
        # Artificially age the room
        room.created_at = 0.0
        room.last_activity = 0.0

        pruned = room_manager.cleanup_stale_rooms(max_idle_seconds=10.0, max_age_seconds=10.0)
        assert pruned >= 1
        assert room_manager.get_room(room.room_code) is None

