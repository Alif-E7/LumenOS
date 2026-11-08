"""
WebSocket Room System — Private co-op rooms with role-based commands and authoritative synchronization.

Handles:
- Room creation with private, hard-to-guess room codes (6-char alphanumeric).
- Guest joining via room code + display name (no account required).
- Dynamic role assignment and reassignment by host (1–4 players with configurable bundling).
- Validated command routing through the authoritative game session.
- Real-time state broadcasting and telemetry synchronization to all participants.
- Disconnect & reconnect handling with state restoration and disconnected fallbacks.
- Cross-role coordination requests and emergency overrides.
- Tactical coordination pings and shared activity feed.
- Host controls: start, pause, resume, restart, and end.
- Room expiration and stale room pruning.
"""

from __future__ import annotations

import asyncio
import json
import secrets
import time
from typing import Any, Optional
from uuid import uuid4

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from api.services.game_session import GameSession, SessionManager, session_manager
from game.roles import assign_roles, assign_custom_roles, RoleAssignment, RoleName, _ALL_ROLES


def _generate_room_code() -> str:
    """Generate a 6-char alphanumeric room code, hard to guess."""
    return secrets.token_hex(3).upper()  # e.g. "A3F1B2"


class ActionRequest(BaseModel):
    """A cross-role coordination request between players."""
    request_id: str
    requester_id: str
    requester_name: str
    requester_role: str
    target_role: str
    action_type: str
    params: dict[str, Any] = Field(default_factory=dict)
    reason: str = ""
    created_at: float = Field(default_factory=time.time)
    timeout_seconds: float = 30.0
    status: str = "pending"  # pending | approved | rejected | timed_out


class RoomParticipant:
    """A connected player in a room."""

    def __init__(
        self,
        player_id: str,
        display_name: str,
        websocket: WebSocket,
        is_host: bool = False,
    ):
        self.player_id = player_id
        self.display_name = display_name
        self.websocket = websocket
        self.is_host = is_host
        self.ready = False
        self.connected = True
        self.last_seen = time.time()
        self.disconnected_at: Optional[float] = None
        self.reconnect_token = secrets.token_hex(16)

    async def send(self, message: dict[str, Any]) -> bool:
        """Send a message to this participant. Returns False if disconnected."""
        try:
            await self.websocket.send_json(message)
            return True
        except Exception:
            self.connected = False
            return False


class Room:
    """
    A private co-op room for 1–4 players sharing an authoritative mission session.

    The room handles:
    - Participant lifecycle (join, leave, disconnect, reconnect)
    - Role assignment & dynamic reassignment by host
    - Command serialization, role verification, and idempotency
    - Cross-role action requests and Mission Director approvals
    - State and telemetry broadcasting to all participants
    - Host controls (start, pause, resume, restart, end)
    """

    def __init__(self, room_code: str, host_id: str, host_name: str):
        self.room_code = room_code
        self.created_at = time.time()
        self.last_activity = time.time()
        self.host_id = host_id
        self.host_name = host_name

        self._participants: dict[str, RoomParticipant] = {}
        self._game_session: Optional[GameSession] = None
        self._phase = "lobby"  # lobby | playing | finished
        self._is_paused = False
        self._lock = asyncio.Lock()

        # Idempotency and processed command cache
        self._processed_commands: dict[str, dict[str, Any]] = {}
        # Rate limiting
        self._command_timestamps: dict[str, list[float]] = {}
        self._max_commands_per_second = 10

        # Cross-role requests & activity feed
        self._pending_requests: dict[str, ActionRequest] = {}
        self._activity_feed: list[dict[str, Any]] = []
        self._max_activity_feed = 50

        # Custom role bundle overrides
        self._custom_roles: Optional[dict[str, list[str]]] = None
        self._initial_mission_id: Optional[str] = None
        self._initial_spacecraft_config: Optional[Any] = None

    @property
    def phase(self) -> str:
        return self._phase

    @property
    def is_paused(self) -> bool:
        return self._is_paused

    @property
    def participant_count(self) -> int:
        return len(self._participants)

    @property
    def game_session(self) -> Optional[GameSession]:
        return self._game_session

    @property
    def activity_feed(self) -> list[dict[str, Any]]:
        return list(self._activity_feed)

    @property
    def pending_requests(self) -> list[dict[str, Any]]:
        return [r.model_dump() for r in self._pending_requests.values()]

    def get_participant(self, player_id: str) -> Optional[RoomParticipant]:
        return self._participants.get(player_id)

    def _add_activity(self, entry: dict[str, Any]) -> None:
        """Append an entry to the rolling activity feed."""
        if "timestamp" not in entry:
            entry["timestamp"] = time.time()
        self._activity_feed.append(entry)
        if len(self._activity_feed) > self._max_activity_feed:
            self._activity_feed = self._activity_feed[-self._max_activity_feed:]

    # ── Participant Management ───────────────────────────────────────────

    async def add_participant(
        self,
        player_id: str,
        display_name: str,
        websocket: WebSocket,
    ) -> bool:
        """Add a participant to the room. Max 4 players."""
        if len(self._participants) >= 4 and player_id not in self._participants:
            return False

        is_host = (player_id == self.host_id)
        participant = RoomParticipant(
            player_id=player_id,
            display_name=display_name,
            websocket=websocket,
            is_host=is_host,
        )
        self._participants[player_id] = participant
        self.last_activity = time.time()

        self._add_activity({
            "type": "player_joined",
            "player_id": player_id,
            "display_name": display_name,
            "is_host": is_host,
        })

        # Notify everyone
        await self._broadcast({
            "type": "player_joined",
            "player_id": player_id,
            "display_name": display_name,
            "participant_count": self.participant_count,
            "participants": self._participant_list(),
            "roles": self._get_role_info(),
        })
        return True

    async def remove_participant(self, player_id: str) -> None:
        """Remove a participant completely from the room."""
        p = self._participants.pop(player_id, None)
        self.last_activity = time.time()
        if p:
            self._add_activity({
                "type": "player_left",
                "player_id": player_id,
                "display_name": p.display_name,
            })
            await self._broadcast({
                "type": "player_left",
                "player_id": player_id,
                "participant_count": self.participant_count,
                "participants": self._participant_list(),
                "roles": self._get_role_info(),
            })

    async def handle_disconnect(self, player_id: str) -> None:
        """Handle a client WebSocket disconnect without dropping their slot."""
        p = self._participants.get(player_id)
        if p:
            p.connected = False
            p.disconnected_at = time.time()
            self.last_activity = time.time()

            self._add_activity({
                "type": "player_disconnected",
                "player_id": player_id,
                "display_name": p.display_name,
            })

            # Check if any pending requests were waiting for this player's role
            self._clean_expired_requests()

            await self._broadcast({
                "type": "player_disconnected",
                "player_id": player_id,
                "display_name": p.display_name,
                "participants": self._participant_list(),
            })

    async def reconnect(self, player_id: str, websocket: WebSocket) -> bool:
        """Reconnect a previously disconnected player and restore full snapshot."""
        p = self._participants.get(player_id)
        if p is None:
            return False

        p.websocket = websocket
        p.connected = True
        p.last_seen = time.time()
        p.disconnected_at = None
        self.last_activity = time.time()

        self._add_activity({
            "type": "player_reconnected",
            "player_id": player_id,
            "display_name": p.display_name,
        })

        # Send full snapshot on reconnect
        snapshot_payload: dict[str, Any] = {
            "type": "reconnect_state",
            "phase": self._phase,
            "is_paused": self._is_paused,
            "roles": self._get_role_info(),
            "participants": self._participant_list(),
            "pending_requests": [r.model_dump() for r in self._pending_requests.values()],
            "activity_feed": list(self._activity_feed),
        }
        if self._game_session:
            snapshot_payload["state"] = self._game_session.get_full_state()
            snapshot_payload["telemetry"] = self._game_session.get_telemetry()

        await p.send(snapshot_payload)

        # Notify the rest of the room
        await self._broadcast({
            "type": "player_reconnected",
            "player_id": player_id,
            "display_name": p.display_name,
            "participants": self._participant_list(),
        })
        return True

    # ── Role Assignment & Reassignment ───────────────────────────────────

    async def reassign_roles(
        self,
        requester_id: str,
        role_assignments: dict[str, list[str]],
    ) -> dict[str, Any]:
        """
        Host reassigns crew roles.
        Validates:
        1. Requester is host.
        2. All players in role_assignments are valid room participants.
        3. All 4 canonical crew roles are assigned across the roster.
        """
        if requester_id != self.host_id:
            return {"success": False, "error": "Only the host can reassign roles"}

        # Validate players
        for pid in role_assignments.keys():
            if pid not in self._participants:
                return {"success": False, "error": f"Player '{pid}' is not in this room"}

        try:
            new_role_assignment = assign_custom_roles(role_assignments)
        except ValueError as err:
            return {"success": False, "error": str(err)}

        self._custom_roles = {
            pid: [r.value for r in roles]
            for pid, roles in new_role_assignment.player_roles.items()
        }

        if self._game_session:
            self._game_session._roles = new_role_assignment

        self.last_activity = time.time()
        self._add_activity({
            "type": "roles_reassigned",
            "actor": requester_id,
            "roles": self._get_role_info(),
        })

        await self._broadcast({
            "type": "roles_updated",
            "roles": self._get_role_info(),
            "updated_by": requester_id,
            "participants": self._participant_list(),
        })

        return {"success": True, "roles": self._get_role_info()}

    # ── Game Lifecycle ───────────────────────────────────────────────────

    async def start_game(
        self,
        game_session: GameSession,
        custom_roles: Optional[dict[str, list[str]]] = None,
    ) -> None:
        """Start the game session (host only)."""
        self._game_session = game_session
        self._phase = "playing"
        self._is_paused = False
        self.last_activity = time.time()

        player_ids = list(self._participants.keys())
        game_session._player_ids = player_ids

        # Assign roles based on player count or custom bundles
        if custom_roles:
            try:
                game_session._roles = assign_custom_roles(custom_roles)
            except Exception:
                game_session._roles = assign_roles(player_ids)
        elif self._custom_roles:
            try:
                game_session._roles = assign_custom_roles(self._custom_roles)
            except Exception:
                game_session._roles = assign_roles(player_ids)
        else:
            game_session._roles = assign_roles(player_ids)

        self._add_activity({
            "type": "mission_started",
            "mission_id": game_session.mission.id,
            "mission_name": game_session.mission.name,
            "participants": len(player_ids),
        })

        await self._broadcast({
            "type": "game_started",
            "session_id": game_session.session_id,
            "mission_id": game_session.mission.id,
            "mission_name": game_session.mission.name,
            "roles": self._get_role_info(),
            "state": game_session.get_full_state(),
            "telemetry": game_session.get_telemetry(),
            "participants": self._participant_list(),
        })

    # ── Master Command Dispatcher ────────────────────────────────────────

    async def handle_command(self, player_id: str, command: dict[str, Any]) -> None:
        """
        Handle a command from a player. All commands are serialized and validated server-side.
        """
        async with self._lock:
            self.last_activity = time.time()

            # Rate limit check
            if not self._check_rate_limit(player_id):
                await self._send_to(player_id, {
                    "type": "error",
                    "error": "Rate limited. Slow down.",
                })
                return

            cmd_type = command.get("command", "")

            # Idempotency check for action commands
            cmd_id = command.get("command_id") or command.get("id")
            if cmd_id and cmd_id in self._processed_commands:
                cached = self._processed_commands[cmd_id]
                await self._send_to(player_id, {
                    "type": "action_result",
                    "command_id": cmd_id,
                    "duplicate": True,
                    **cached,
                })
                return

            # Clean up timed-out cross-role requests non-blockingly
            self._clean_expired_requests()

            if cmd_type == "start":
                await self._handle_start(player_id, command)
            elif cmd_type == "pause":
                await self._handle_pause(player_id)
            elif cmd_type == "resume":
                await self._handle_resume(player_id)
            elif cmd_type == "restart":
                await self._handle_restart(player_id)
            elif cmd_type == "end":
                await self._handle_end(player_id)
            elif cmd_type == "reassign_roles":
                role_map = command.get("role_assignments") or command.get("roles") or {}
                res = await self.reassign_roles(player_id, role_map)
                if not res.get("success"):
                    await self._send_to(player_id, {"type": "error", **res})
            elif cmd_type == "step":
                await self._handle_step(player_id, command)
            elif cmd_type == "action":
                await self._handle_action(player_id, command)
            elif cmd_type == "resolve_event":
                await self._handle_resolve_event(player_id, command)
            elif cmd_type == "request_action":
                await self._handle_request_action(player_id, command)
            elif cmd_type == "respond_action_request":
                await self._handle_respond_action_request(player_id, command)
            elif cmd_type == "tactical_ping":
                await self._handle_tactical_ping(player_id, command)
            elif cmd_type == "advisory_respond":
                await self._handle_advisory_respond(player_id, command)
            elif cmd_type == "set_automation":
                await self._handle_set_automation(player_id, command)
            elif cmd_type == "ready":
                await self._handle_ready(player_id)
            elif cmd_type == "get_state":
                await self._handle_get_state(player_id)
            elif cmd_type == "get_score":
                await self._handle_get_score(player_id)
            else:
                await self._send_to(player_id, {
                    "type": "error",
                    "error": f"Unknown command: {cmd_type}",
                })

    # ── Internal Command Handlers ────────────────────────────────────────

    async def _handle_start(self, player_id: str, command: dict) -> None:
        """Host-only: start mission."""
        if player_id != self.host_id:
            await self._send_to(player_id, {
                "type": "error",
                "error": "Only the host can start the mission",
            })
            return

        if self._phase == "playing":
            await self._send_to(player_id, {"type": "error", "error": "Mission already started"})
            return

        mission_id = command.get("mission_id", "wildfire")

        from api.routers.missions import _load_missions
        mission = _load_missions().get(mission_id)
        if mission is None:
            await self._send_to(player_id, {
                "type": "error",
                "error": f"Mission '{mission_id}' not found",
            })
            return

        from simulation.core import SpacecraftConfig
        from simulation.physics.orbital import OrbitalElements

        spacecraft = SpacecraftConfig(
            name=f"Orbiter — {mission.name}",
            orbital=OrbitalElements(
                semi_major_axis_km=6371.0 + mission.orbit_altitude_km,
                inclination_deg=mission.orbit_inclination_deg,
            ),
        )

        self._initial_mission_id = mission_id
        self._initial_spacecraft_config = spacecraft

        player_ids = list(self._participants.keys())
        game_session = session_manager.create_session(
            mission=mission,
            spacecraft_config=spacecraft,
            player_ids=player_ids,
        )

        custom_roles = command.get("roles") or self._custom_roles
        await self.start_game(game_session, custom_roles=custom_roles)

    async def _handle_pause(self, player_id: str) -> None:
        """Host, Mission Director, or Flight Controller can pause the simulation."""
        if self._phase != "playing" or self._game_session is None:
            await self._send_to(player_id, {"type": "error", "error": "Game is not running"})
            return

        roles = self._get_player_roles(player_id)
        if player_id != self.host_id and "flight_controller" not in roles and "mission_director" not in roles:
            await self._send_to(player_id, {"type": "error", "error": "Only host, Mission Director, or Flight Controller can pause"})
            return

        self._is_paused = True
        self._add_activity({
            "type": "game_paused",
            "paused_by": player_id,
        })
        await self._broadcast({
            "type": "game_paused",
            "paused_by": player_id,
            "is_paused": True,
        })

    async def _handle_resume(self, player_id: str) -> None:
        """Host, Mission Director, or Flight Controller can resume the simulation."""
        if self._phase != "playing" or self._game_session is None:
            await self._send_to(player_id, {"type": "error", "error": "Game is not running"})
            return

        roles = self._get_player_roles(player_id)
        if player_id != self.host_id and "flight_controller" not in roles and "mission_director" not in roles:
            await self._send_to(player_id, {"type": "error", "error": "Only host, Mission Director, or Flight Controller can resume"})
            return

        self._is_paused = False
        self._add_activity({
            "type": "game_resumed",
            "resumed_by": player_id,
        })
        await self._broadcast({
            "type": "game_resumed",
            "resumed_by": player_id,
            "is_paused": False,
        })

    async def _handle_restart(self, player_id: str) -> None:
        """Host-only: restart mission from step 0."""
        if player_id != self.host_id:
            await self._send_to(player_id, {"type": "error", "error": "Only the host can restart the mission"})
            return

        if not self._initial_mission_id:
            await self._send_to(player_id, {"type": "error", "error": "No mission available to restart"})
            return

        from api.routers.missions import _load_missions
        mission = _load_missions().get(self._initial_mission_id)
        if not mission:
            await self._send_to(player_id, {"type": "error", "error": "Mission definition not found"})
            return

        spacecraft = self._initial_spacecraft_config
        player_ids = list(self._participants.keys())
        new_session = session_manager.create_session(
            mission=mission,
            spacecraft_config=spacecraft,
            player_ids=player_ids,
        )

        self._pending_requests.clear()
        self._processed_commands.clear()
        self._is_paused = False
        await self.start_game(new_session)

        self._add_activity({
            "type": "mission_restarted",
            "restarted_by": player_id,
        })
        await self._broadcast({
            "type": "game_restarted",
            "session_id": new_session.session_id,
            "state": new_session.get_full_state(),
            "telemetry": new_session.get_telemetry(),
            "roles": self._get_role_info(),
        })

    async def _handle_end(self, player_id: str) -> None:
        """Host-only: terminate/end mission and trigger final score evaluation."""
        if player_id != self.host_id:
            await self._send_to(player_id, {"type": "error", "error": "Only the host can end the mission"})
            return

        if self._game_session is None:
            await self._send_to(player_id, {"type": "error", "error": "No active mission"})
            return

        self._phase = "finished"
        breakdown = self._game_session.get_score_breakdown()
        self._add_activity({
            "type": "mission_ended",
            "ended_by": player_id,
            "score": breakdown.total_score,
            "grade": breakdown.grade.value,
        })
        await self._broadcast({
            "type": "game_finished",
            "outcome": self._game_session.state.outcome.value if self._game_session.state.outcome else "manual_termination",
            "score": breakdown.total_score,
            "grade": breakdown.grade.value,
            "breakdown": {
                cat.category.value: {
                    "score": cat.weighted_score,
                    "explanation": cat.explanation,
                }
                for cat in breakdown.categories
            },
        })

    async def _handle_step(self, player_id: str, command: dict) -> None:
        """Advance simulation by N steps."""
        if self._phase != "playing" or self._game_session is None:
            await self._send_to(player_id, {"type": "error", "error": "Game not running"})
            return

        if self._is_paused:
            await self._send_to(player_id, {"type": "error", "error": "Game is paused"})
            return

        num_steps = min(command.get("steps", 1), 100)
        results = self._game_session.step(num_steps)

        # Broadcast the latest state to all
        await self._broadcast({
            "type": "step_result",
            "results": results,
            "state": self._game_session.get_full_state(),
        })

        # Check if game finished
        if self._game_session.is_finished:
            self._phase = "finished"
            breakdown = self._game_session.get_score_breakdown()
            await self._broadcast({
                "type": "game_finished",
                "outcome": self._game_session.state.outcome.value if self._game_session.state.outcome else "unknown",
                "score": breakdown.total_score,
                "grade": breakdown.grade.value,
                "breakdown": {
                    cat.category.value: {
                        "score": cat.weighted_score,
                        "explanation": cat.explanation,
                    }
                    for cat in breakdown.categories
                },
            })

    async def _handle_action(self, player_id: str, command: dict) -> None:
        """Handle a player action with authoritative validation and idempotency."""
        if self._phase != "playing" or self._game_session is None:
            await self._send_to(player_id, {"type": "error", "error": "Game not running"})
            return

        if self._is_paused:
            await self._send_to(player_id, {"type": "error", "error": "Game is paused"})
            return

        cmd_id = command.get("command_id") or command.get("id")
        action_type = command.get("action_type", "")
        params = command.get("params", {})

        result = self._game_session.perform_action(player_id, action_type, params)

        if cmd_id:
            self._processed_commands[cmd_id] = result

        # Send result to the acting player
        await self._send_to(player_id, {
            "type": "action_result",
            "command_id": cmd_id,
            **result,
        })

        p = self._participants.get(player_id)
        display_name = p.display_name if p else player_id
        roles = self._get_player_roles(player_id)

        self._add_activity({
            "type": "action",
            "player_id": player_id,
            "display_name": display_name,
            "roles": roles,
            "action_type": action_type,
            "success": result.get("success", False),
            "error": result.get("error"),
        })

        # If successful, broadcast updated state to all
        if result.get("success"):
            await self._broadcast({
                "type": "action_broadcast",
                "player_id": player_id,
                "display_name": display_name,
                "roles": roles,
                "action_type": action_type,
                "budget_cost": result.get("budget_cost", 0.0),
                "state": self._game_session.get_full_state(),
            })

    async def _handle_resolve_event(self, player_id: str, command: dict) -> None:
        """Handle event resolution."""
        if self._phase != "playing" or self._game_session is None:
            await self._send_to(player_id, {"type": "error", "error": "Game not running"})
            return

        event_id = command.get("event_id", "")
        choice_id = command.get("choice_id", "")

        result = self._game_session.resolve_event(player_id, event_id, choice_id)

        if result.get("success"):
            p = self._participants.get(player_id)
            display_name = p.display_name if p else player_id
            self._add_activity({
                "type": "event_resolved",
                "player_id": player_id,
                "display_name": display_name,
                "event_id": event_id,
                "choice_id": choice_id,
            })
            await self._broadcast({
                "type": "event_resolved",
                "player_id": player_id,
                "display_name": display_name,
                **result,
                "state": self._game_session.get_full_state(),
            })
        else:
            await self._send_to(player_id, {"type": "error", **result})

    async def _handle_request_action(self, player_id: str, command: dict) -> None:
        """Create a pending cross-role action request."""
        target_role = command.get("target_role", "")
        action_type = command.get("action_type", "")
        params = command.get("params", {})
        reason = command.get("reason", "")
        req_id = command.get("request_id") or f"req_{uuid4().hex[:8]}"

        p = self._participants.get(player_id)
        requester_name = p.display_name if p else player_id
        requester_roles = self._get_player_roles(player_id)
        requester_role = requester_roles[0] if requester_roles else "crew"

        req = ActionRequest(
            request_id=req_id,
            requester_id=player_id,
            requester_name=requester_name,
            requester_role=requester_role,
            target_role=target_role,
            action_type=action_type,
            params=params,
            reason=reason,
            created_at=time.time(),
            timeout_seconds=float(command.get("timeout_seconds", 30.0)),
        )
        self._pending_requests[req_id] = req

        self._add_activity({
            "type": "action_requested",
            "request_id": req_id,
            "requester_id": player_id,
            "requester_name": requester_name,
            "target_role": target_role,
            "action_type": action_type,
            "reason": reason,
        })

        await self._broadcast({
            "type": "action_requested",
            "request": req.model_dump(),
            "pending_requests": [r.model_dump() for r in self._pending_requests.values()],
        })

    async def _handle_respond_action_request(self, player_id: str, command: dict) -> None:
        """Approve or reject a pending cross-role action request."""
        req_id = command.get("request_id", "")
        decision = command.get("decision", "").lower()  # approve | reject
        override_reason = command.get("reason", "")

        if req_id not in self._pending_requests:
            await self._send_to(player_id, {
                "type": "error",
                "error": f"Request '{req_id}' not found or already resolved",
            })
            return

        req = self._pending_requests[req_id]
        responder_roles = self._get_player_roles(player_id)

        # Permissions: must hold target_role OR mission_director (emergency override)
        is_target_role = req.target_role in responder_roles
        is_director = "mission_director" in responder_roles or player_id == self.host_id
        if not (is_target_role or is_director):
            await self._send_to(player_id, {
                "type": "error",
                "error": f"Role permission denied: requires '{req.target_role}' or 'mission_director' override",
            })
            return

        if decision == "approve":
            if self._game_session is None:
                await self._send_to(player_id, {"type": "error", "error": "No active mission"})
                return

            action_res = self._game_session.perform_action(
                player_id=player_id,
                action_type=req.action_type,
                params=req.params,
            )

            if action_res.get("success"):
                self._pending_requests.pop(req_id, None)
                self._add_activity({
                    "type": "request_approved",
                    "request_id": req_id,
                    "approved_by": player_id,
                    "action_type": req.action_type,
                })
                await self._broadcast({
                    "type": "request_approved",
                    "request_id": req_id,
                    "approved_by": player_id,
                    "action_result": action_res,
                    "pending_requests": [r.model_dump() for r in self._pending_requests.values()],
                    "state": self._game_session.get_full_state(),
                })
            else:
                await self._send_to(player_id, {
                    "type": "error",
                    "error": f"Action execution failed: {action_res.get('error')}",
                })
        else:
            self._pending_requests.pop(req_id, None)
            self._add_activity({
                "type": "request_rejected",
                "request_id": req_id,
                "rejected_by": player_id,
                "reason": override_reason,
            })
            await self._broadcast({
                "type": "request_rejected",
                "request_id": req_id,
                "rejected_by": player_id,
                "reason": override_reason,
                "pending_requests": [r.model_dump() for r in self._pending_requests.values()],
            })

    async def _handle_tactical_ping(self, player_id: str, command: dict) -> None:
        """Handle quick tactical coordination pings between stations."""
        ping_type = command.get("ping_type", "MESSAGE")
        message = command.get("message", "")

        p = self._participants.get(player_id)
        display_name = p.display_name if p else player_id
        roles = self._get_player_roles(player_id)

        ping_payload = {
            "type": "tactical_ping",
            "player_id": player_id,
            "display_name": display_name,
            "roles": roles,
            "ping_type": ping_type,
            "message": message,
            "timestamp": time.time(),
        }

        self._add_activity(ping_payload)
        await self._broadcast(ping_payload)

    async def _handle_advisory_respond(self, player_id: str, command: dict) -> None:
        """Handle player response to a predictive advisory recommendation."""
        if self._phase != "playing" or self._game_session is None:
            await self._send_to(player_id, {"type": "error", "error": "Game not running"})
            return

        rec_id = command.get("recommendation_id", "")
        action = command.get("action", "")
        modified_params = command.get("modified_parameters")

        result = self._game_session.respond_to_advisory(
            player_id=player_id,
            recommendation_id=rec_id,
            action=action,
            modified_parameters=modified_params,
        )

        await self._send_to(player_id, {
            "type": "advisory_response_result",
            **result,
        })

        if result.get("success"):
            await self._broadcast({
                "type": "advisory_updated",
                "player_id": player_id,
                "recommendation_id": rec_id,
                "action": action,
                "advisory": self._game_session.get_advisory_state(),
                "state": self._game_session.get_full_state(),
            })

    async def _handle_set_automation(self, player_id: str, command: dict) -> None:
        """Enable or disable LumenOS advisory autopilot automation."""
        if self._phase != "playing" or self._game_session is None:
            await self._send_to(player_id, {"type": "error", "error": "Game not running"})
            return

        enabled = bool(command.get("enabled", False))
        result = self._game_session.set_advisory_automation(player_id=player_id, enabled=enabled)

        await self._send_to(player_id, {
            "type": "advisory_automation_result",
            **result,
        })

        if result.get("success"):
            await self._broadcast({
                "type": "advisory_automation_changed",
                "player_id": player_id,
                "enabled": enabled,
                "advisory": self._game_session.get_advisory_state(),
            })

    async def _handle_ready(self, player_id: str) -> None:
        """Toggle player ready status in lobby."""
        p = self._participants.get(player_id)
        if p:
            p.ready = not p.ready
            await self._broadcast({
                "type": "ready_status",
                "player_id": player_id,
                "ready": p.ready,
                "participants": self._participant_list(),
                "all_ready": all(pp.ready for pp in self._participants.values()),
            })

    async def _handle_get_state(self, player_id: str) -> None:
        """Send current game state and pending items to requesting player."""
        if self._game_session:
            await self._send_to(player_id, {
                "type": "state_snapshot",
                "state": self._game_session.get_full_state(),
                "telemetry": self._game_session.get_telemetry(),
                "roles": self._get_role_info(),
                "is_paused": self._is_paused,
                "pending_requests": [r.model_dump() for r in self._pending_requests.values()],
                "activity_feed": list(self._activity_feed),
            })

    async def _handle_get_score(self, player_id: str) -> None:
        """Send current score breakdown."""
        if self._game_session:
            breakdown = self._game_session.get_score_breakdown()
            await self._send_to(player_id, {
                "type": "score_breakdown",
                "total_score": breakdown.total_score,
                "grade": breakdown.grade.value,
                "categories": [
                    {
                        "category": cat.category.value,
                        "score": cat.weighted_score,
                        "max": cat.max_possible * cat.weight,
                        "explanation": cat.explanation,
                    }
                    for cat in breakdown.categories
                ],
            })

    # ── Broadcasting & Helpers ───────────────────────────────────────────

    async def _broadcast(self, message: dict[str, Any]) -> None:
        """Send a message to all connected participants."""
        disconnected = []
        for pid, p in self._participants.items():
            if p.connected:
                ok = await p.send(message)
                if not ok:
                    disconnected.append(pid)

        for pid in disconnected:
            await self.handle_disconnect(pid)

    async def _send_to(self, player_id: str, message: dict[str, Any]) -> None:
        """Send a message to a specific player."""
        p = self._participants.get(player_id)
        if p and p.connected:
            ok = await p.send(message)
            if not ok:
                await self.handle_disconnect(player_id)

    def _participant_list(self) -> list[dict[str, Any]]:
        return [
            {
                "player_id": p.player_id,
                "display_name": p.display_name,
                "is_host": p.is_host,
                "ready": p.ready,
                "connected": p.connected,
                "roles": self._get_player_roles(p.player_id),
            }
            for p in self._participants.values()
        ]

    def _get_player_roles(self, player_id: str) -> list[str]:
        if self._game_session:
            roles = self._game_session.roles.player_roles.get(player_id, [])
            return [r.value for r in roles]
        if self._custom_roles and player_id in self._custom_roles:
            return self._custom_roles[player_id]
        pids = list(self._participants.keys())
        if 1 <= len(pids) <= 4:
            try:
                assigned = assign_roles(pids)
                return [r.value for r in assigned.player_roles.get(player_id, [])]
            except Exception:
                pass
        return []

    def _get_role_info(self) -> dict[str, list[str]]:
        if self._game_session:
            return {
                pid: [r.value for r in roles]
                for pid, roles in self._game_session.roles.player_roles.items()
            }
        if self._custom_roles:
            return dict(self._custom_roles)
        pids = list(self._participants.keys())
        if 1 <= len(pids) <= 4:
            try:
                assigned = assign_roles(pids)
                return {
                    pid: [r.value for r in roles]
                    for pid, roles in assigned.player_roles.items()
                }
            except Exception:
                pass
        return {}

    def _clean_expired_requests(self) -> None:
        """Safely prune expired cross-role requests to prevent freezing mission progress."""
        now = time.time()
        expired = []
        for req_id, req in list(self._pending_requests.items()):
            if now - req.created_at > req.timeout_seconds:
                expired.append(req_id)
                self._pending_requests.pop(req_id, None)

        if expired:
            self._add_activity({
                "type": "requests_timed_out",
                "expired_ids": expired,
            })
            asyncio.create_task(self._broadcast({
                "type": "requests_timed_out",
                "expired_ids": expired,
                "pending_requests": [r.model_dump() for r in self._pending_requests.values()],
            }))

    def _check_rate_limit(self, player_id: str) -> bool:
        """Simple rate limiter: max N commands per second per player."""
        now = time.time()
        timestamps = self._command_timestamps.setdefault(player_id, [])
        timestamps[:] = [t for t in timestamps if now - t < 1.0]
        if len(timestamps) >= self._max_commands_per_second:
            return False
        timestamps.append(now)
        return True


# ── Room Manager ─────────────────────────────────────────────────────────

class RoomManager:
    """Manages all active rooms and handles lifecycle pruning."""

    def __init__(self):
        self._rooms: dict[str, Room] = {}

    def create_room(self, host_id: str, host_name: str) -> Room:
        """Create a new room with a private, hard-to-guess 6-char code."""
        code = _generate_room_code()
        while code in self._rooms:
            code = _generate_room_code()
        room = Room(room_code=code, host_id=host_id, host_name=host_name)
        self._rooms[code] = room
        return room

    def get_room(self, room_code: str) -> Optional[Room]:
        return self._rooms.get(room_code)

    def remove_room(self, room_code: str) -> bool:
        return self._rooms.pop(room_code, None) is not None

    def list_rooms(self) -> list[dict[str, Any]]:
        """List rooms summary for debug/admin inspection."""
        return [
            {
                "room_code": r.room_code,
                "phase": r.phase,
                "is_paused": r.is_paused,
                "participant_count": r.participant_count,
                "created_at": r.created_at,
                "last_activity": r.last_activity,
            }
            for r in self._rooms.values()
        ]

    def cleanup_stale_rooms(
        self,
        max_idle_seconds: float = 1800.0,
        max_age_seconds: float = 86400.0,
    ) -> int:
        """
        Prune rooms that are abandoned (all disconnected for max_idle_seconds)
        or exceeded max_age_seconds (24h).
        """
        now = time.time()
        to_remove = []
        for code, room in self._rooms.items():
            is_all_disconnected = all(not p.connected for p in room._participants.values())
            age = now - room.created_at
            idle = now - room.last_activity
            if age > max_age_seconds or (is_all_disconnected and idle > max_idle_seconds):
                to_remove.append(code)

        for code in to_remove:
            self._rooms.pop(code, None)

        return len(to_remove)


# Global singleton
room_manager = RoomManager()
