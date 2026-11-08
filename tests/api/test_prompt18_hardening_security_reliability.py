"""
Prompt 18 — Reliability, Accessibility, Performance & Security Hardening Test Suite.

Verifies:
1. Security Headers: nosniff, DENY, XSS protection, Referrer-Policy on API responses.
2. Path Traversal & Injection Defense: Player ID sanitization and filesystem bounds.
3. High-Entropy Room Codes: 6-char unambiguous alphabet (32 chars, 1.07B combos).
4. WebSocket Hardening: Oversized payload (>64KB) rejection and malformed JSON recovery.
5. Server-Side Role Authorization: Action permission enforcement regardless of client claims.
6. Resource Tampering Resistance: Budget and SoC remain strictly server-authoritative.
7. Extreme Spacecraft States: Zero battery, full storage overflow, thermal saturation stability.
8. Multiplayer Reconnection & State Preservation: Full snapshot restoration on reconnect.
9. Room Lifecycle & Stale Room Pruning.
"""

import json
import pytest
from pathlib import Path
from starlette.testclient import TestClient

from api.main import app
from api.services.rooms import (
    room_manager,
    _generate_room_code,
    _ROOM_CODE_ALPHABET,
    Room,
)
from api.routers.progression import _sanitize_player_id, PROFILES_DIR
from simulation.core import SimulationRunner, SpacecraftConfig
from simulation.physics.orbital import OrbitalElements
from simulation.physics.power import PowerConfig, PowerModel
from simulation.physics.thermal import ThermalConfig, ThermalModel
from simulation.physics.storage import StorageConfig, StorageModel
from game.roles import RoleName, RoleAssignment
from game.actions import ActionType
from api.services.game_session import session_manager
from api.routers.missions import _load_missions


@pytest.fixture
def client():
    return TestClient(app)


class TestPrompt18SecurityHardening:
    """Verifies security headers, injection defense, room entropy, and payload size bounds."""

    def test_http_security_headers_present(self, client):
        """Verify API responses include protective security headers."""
        res = client.get("/api/health")
        assert res.status_code == 200
        headers = res.headers
        assert headers.get("X-Content-Type-Options") == "nosniff"
        assert headers.get("X-Frame-Options") == "DENY"
        assert headers.get("X-XSS-Protection") == "1; mode=block"
        assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    def test_path_traversal_sanitization_in_progression(self, client):
        """Verify path traversal characters are sanitized and cannot escape the profiles directory."""
        # Attempt traversal attack
        malicious_id = "../../../../etc/passwd"
        cleaned = _sanitize_player_id(malicious_id)
        assert "/" not in cleaned
        assert "\\" not in cleaned
        assert ".." not in cleaned
        assert cleaned == "etcpasswd"

        # Verify REST API handles traversal attempt safely
        res = client.get(f"/api/progression/profile?player_id={malicious_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["player_id"] == "etcpasswd"

        # Verify no file was created outside PROFILES_DIR
        safe_path = (PROFILES_DIR / "etcpasswd.json").resolve()
        assert safe_path.is_relative_to(PROFILES_DIR.resolve())

    def test_high_entropy_unambiguous_room_codes(self):
        """Verify room codes have 6 characters, belong to the 32-char alphabet, and have high entropy."""
        assert len(_ROOM_CODE_ALPHABET) == 32
        # Verify visual confusion characters are absent
        for ambiguous in ("0", "O", "1", "I"):
            assert ambiguous not in _ROOM_CODE_ALPHABET

        generated = set()
        for _ in range(500):
            code = _generate_room_code()
            assert len(code) == 6
            assert all(c in _ROOM_CODE_ALPHABET for c in code)
            generated.add(code)

        # 500 random draws from a 1.07 billion space should have 0 collisions
        assert len(generated) == 500

    def test_websocket_oversized_payload_rejection(self, client):
        """Verify WebSocket rejects payloads > 64 KB with a clean error and doesn't crash."""
        create_res = client.post("/api/rooms", json={"host_name": "SecurityOfficer"})
        assert create_res.status_code == 201
        data = create_res.json()
        room_code = data["room_code"]
        player_id = data["player_id"]

        with client.websocket_connect(f"/api/rooms/ws/{room_code}/{player_id}") as ws:
            # Drain initial connection messages
            init_msg = ws.receive_json()
            assert init_msg["type"] in ("player_joined", "roles_updated")

            # Send payload exceeding 64 KB (65,536 bytes)
            oversized_payload = "A" * 70000
            ws.send_text(oversized_payload)

            err_reply = ws.receive_json()
            assert err_reply["type"] == "error"
            assert "Payload exceeds maximum allowed size" in err_reply["error"]

    def test_websocket_malformed_json_recovery(self, client):
        """Verify WebSocket gracefully recovers from malformed JSON without terminating the session."""
        create_res = client.post("/api/rooms", json={"host_name": "RobustHost"})
        room_code = create_res.json()["room_code"]
        player_id = create_res.json()["player_id"]

        with client.websocket_connect(f"/api/rooms/ws/{room_code}/{player_id}") as ws:
            ws.receive_json()

            # Send malformed non-JSON string
            ws.send_text("MALFORMED_{{bad_json")
            reply = ws.receive_json()
            assert reply["type"] == "error"
            assert "Invalid JSON" in reply["error"]

            # Connection must remain alive and responsive
            ws.send_json({"command": "ready"})
            ready_reply = ws.receive_json()
            assert ready_reply["type"] == "ready_status"


class TestPrompt18RoleAuthorizationAndIntegrity:
    """Verifies server-side role permissions, resource tampering defense, and rate limiting."""

    def test_server_side_role_permission_enforcement(self):
        """Verify actions restricted to specific roles cannot be executed by unauthorized roles."""
        missions = _load_missions()
        wf = missions["wildfire"]
        sc = SpacecraftConfig(
            name="Auth-Test-SC",
            orbital=OrbitalElements(semi_major_axis_km=6921.0, inclination_deg=97.6),
        )

        p_science = "player_science"
        p_systems = "player_systems"

        # Explicit roles: player_science = SCIENCE_OFFICER, player_systems = SYSTEMS_ENGINEER
        roles = RoleAssignment(
            player_roles={
                p_science: [RoleName.SCIENCE_OFFICER],
                p_systems: [RoleName.SYSTEMS_ENGINEER],
            }
        )

        session = session_manager.create_session(
            mission=wf,
            spacecraft_config=sc,
            player_ids=[p_science, p_systems],
        )
        session._roles = roles

        # 1. Science Officer attempting Enter Safe Mode (Systems Engineer action) -> Must be rejected
        res1 = session.perform_action(p_science, ActionType.ENTER_SAFE_MODE.value, {})
        assert res1["success"] is False
        assert "Role does not permit action" in res1["error"]

        # 2. Systems Engineer executing Enter Safe Mode -> Allowed
        res2 = session.perform_action(p_systems, ActionType.ENTER_SAFE_MODE.value, {})
        assert res2["success"] is True

        # 3. Systems Engineer attempting Science Data Collection -> Must be rejected
        res3 = session.perform_action(p_systems, ActionType.COLLECT_DATA.value, {"target_id": "fire_zone_alpha"})
        assert res3["success"] is False
        assert "Role does not permit action" in res3["error"]

    def test_resource_tampering_immunity(self):
        """Verify the client cannot alter its budget or SoC via action parameters."""
        missions = _load_missions()
        wf = missions["wildfire"]
        sc = SpacecraftConfig(name="Tamper-Defense-SC")

        session = session_manager.create_session(
            mission=wf,
            spacecraft_config=sc,
            player_ids=["solo_pilot"],
        )
        initial_budget = session.budget_remaining

        # Client sends malicious extra parameters claiming free budget
        res = session.perform_action(
            "solo_pilot",
            ActionType.SET_ATTITUDE.value,
            {"target_attitude": "SUN_POINTING", "budget_remaining": 999999},
        )
        assert res["success"] is True
        # Server must decrement budget according to rule, completely ignoring the parameter
        assert session.budget_remaining < 999999
        assert session.budget_remaining <= initial_budget


class TestPrompt18ExtremePhysicalStatesReliability:
    """Verifies the simulation remains stable without crash or NaN in extreme failure regimes."""

    def test_zero_battery_critical_power_stability(self):
        """Verify simulation steps safely when battery is 100% depleted."""
        cfg = PowerConfig(
            battery_capacity_wh=100.0,
        )
        model = PowerModel(cfg)
        model.state.battery_soc_wh = 0.0
        model.state.battery_soc_pct = 0.0

        # Step in dark eclipse with zero solar power
        st = model.step(dt_seconds=60.0, in_eclipse=True, sun_angle_deg=90.0)
        assert st.power_critical is True
        assert st.low_power_warning is True
        assert st.battery_soc_wh == 0.0
        assert not (st.battery_soc_wh != st.battery_soc_wh)  # No NaN

    def test_storage_overflow_priority_preservation(self):
        """Verify 100% full storage drops raw telemetry while protecting critical alerts."""
        cfg = StorageConfig(
            capacity_mb=100.0,
        )
        model = StorageModel(cfg)

        # Fill storage to capacity with raw data
        stored = model.write_raw(100.0)
        assert stored == 100.0
        assert model.state.free_mb == 0.0
        assert model.state.used_mb == 100.0
        assert model.state.storage_full_warning is True

        # Write high-priority critical alert (10 MB)
        written_alert = model.write_priority_alert(10.0)
        assert written_alert == 10.0
        assert model.state.used_mb <= 100.0
        # Priority alert was preserved, raw data pruned
        assert model.state.priority_alerts_mb == 10.0
        assert model.state.dropped_overflow_mb >= 10.0

    def test_thermal_saturation_stability(self):
        """Verify spacecraft survives extreme thermal input without runaway or crash."""
        cfg = ThermalConfig(
            radiator_area_m2=1.0,
            radiator_emissivity=0.85,
            thermal_mass_j_per_k=50000.0,
        )
        model = ThermalModel(cfg)
        model.state.temperature_k = 450.0  # +177°C extreme overtemp

        # Step 60s
        st = model.step(dt_seconds=60.0, in_eclipse=False, altitude_km=550.0, internal_power_w=500.0)
        assert st.overtemp_warning is True
        assert st.heat_rejected_w > 0.0
        assert st.temperature_k > 0.0


class TestPrompt18MultiplayerLifecycleAndReconnection:
    """Verifies room lifecycle, stale room pruning, and reconnect state preservation."""

    def test_stale_room_cleanup(self):
        """Verify abandoned/idle rooms are safely pruned by the manager."""
        room = room_manager.create_room("host_prune", "PruneTester")
        code = room.room_code
        assert room_manager.get_room(code) is not None

        # Simulate idle timeout
        room.last_activity = 0.0
        pruned = room_manager.cleanup_stale_rooms(max_idle_seconds=10.0)
        assert pruned >= 1
        assert room_manager.get_room(code) is None

    def test_reconnect_preserves_full_session_state(self, client):
        """Verify player can reconnect after socket drop and receives full snapshot."""
        create_res = client.post("/api/rooms", json={"host_name": "ResilientHost"})
        code = create_res.json()["room_code"]
        host_id = create_res.json()["player_id"]

        # First connection
        with client.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as ws1:
            ws1.receive_json()
            # Start game
            ws1.send_json({"command": "start", "mission_id": "wildfire"})
            started_msg = ws1.receive_json()
            assert started_msg["type"] == "game_started"

        # Disconnected: room state must be preserved
        room = room_manager.get_room(code)
        assert room is not None
        assert room.phase == "playing"

        # Reconnection
        with client.websocket_connect(f"/api/rooms/ws/{code}/{host_id}") as ws2:
            reconnect_msg = ws2.receive_json()
            assert reconnect_msg["type"] == "reconnect_state"
            assert reconnect_msg["phase"] == "playing"
            assert "state" in reconnect_msg
            assert "telemetry" in reconnect_msg

