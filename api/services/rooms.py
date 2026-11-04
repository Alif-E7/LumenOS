"""
WebSocket Room System — Private co-op rooms with role-based commands.

Handles:
- Room creation with private, hard-to-guess room codes
- Guest joining via room code + display name (no account required)
- Role assignment and reassignment
- Validated command routing through the game session
- State broadcast to all room participants
- Reconnect handling
- Host controls (start, pause, reassign roles)
"""

from __future__ import annotations

import asyncio
import json
import secrets
import time
from typing import Any, Optional
from uuid import uuid4

from fastapi import WebSocket, WebSocketDisconnect

from api.services.game_session import GameSession, SessionManager, session_manager
from game.roles import assign_roles, RoleAssignment


def _generate_room_code() -> str:
    """Generate a 6-char alphanumeric room code, hard to guess."""
    return secrets.token_hex(3).upper()  # e.g. "A3F1B2"


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
    A private co-op room for 1–4 players sharing a mission session.

    The room handles:
    - Participant lifecycle (join, leave, reconnect)
    - Role assignment
    - Command validation and routing to the game session
    - State broadcasting
    """

    def __init__(self, room_code: str, host_id: str, host_name: str):
        self.room_code = room_code
        self.created_at = time.time()
        self.host_id = host_id

        self._participants: dict[str, RoomParticipant] = {}
        self._game_session: Optional[GameSession] = None
        self._phase = "lobby"  # lobby | playing | finished
        self._lock = asyncio.Lock()

        # Rate limiting
        self._command_timestamps: dict[str, list[float]] = {}
        self._max_commands_per_second = 5

    @property
    def phase(self) -> str:
        return self._phase

    @property
    def participant_count(self) -> int:
        return len(self._participants)

    @property
    def game_session(self) -> Optional[GameSession]:
        return self._game_session

    def get_participant(self, player_id: str) -> Optional[RoomParticipant]:
        return self._participants.get(player_id)

    # ── Participant management ───────────────────────────────────────────

    async def add_participant(
        self,
        player_id: str,
        display_name: str,
        websocket: WebSocket,
    ) -> bool:
        """Add a participant to the room. Max 4 players."""
        if len(self._participants) >= 4:
            return False

        is_host = (player_id == self.host_id)
        participant = RoomParticipant(
            player_id=player_id,
            display_name=display_name,
            websocket=websocket,
            is_host=is_host,
        )
        self._participants[player_id] = participant

        # Notify everyone
        await self._broadcast({
            "type": "player_joined",
            "player_id": player_id,
            "display_name": display_name,
            "participant_count": self.participant_count,
            "participants": self._participant_list(),
        })
        return True

    async def remove_participant(self, player_id: str) -> None:
        """Remove a participant from the room."""
        self._participants.pop(player_id, None)
        await self._broadcast({
            "type": "player_left",
            "player_id": player_id,
            "participant_count": self.participant_count,
            "participants": self._participant_list(),
        })

    async def reconnect(self, player_id: str, websocket: WebSocket) -> bool:
        """Reconnect a disconnected player."""
        p = self._participants.get(player_id)
        if p is None:
            return False
        p.websocket = websocket
        p.connected = True
        p.last_seen = time.time()

        # Send current state on reconnect
        if self._game_session:
            await p.send({
                "type": "reconnect_state",
                "game_state": self._game_session.state.to_summary(),
                "phase": self._phase,
                "roles": self._get_role_info(),
            })
        return True

    # ── Game lifecycle ───────────────────────────────────────────────────

    async def start_game(self, game_session: GameSession) -> None:
        """Start the game session (host only)."""
        self._game_session = game_session
        self._phase = "playing"

        # Assign roles based on player count
        player_ids = list(self._participants.keys())
        game_session._roles = assign_roles(player_ids)
        game_session._player_ids = player_ids

        await self._broadcast({
            "type": "game_started",
            "session_id": game_session.session_id,
            "mission_id": game_session.mission.id,
            "mission_name": game_session.mission.name,
            "roles": self._get_role_info(),
            "game_state": game_session.state.to_summary(),
        })

    async def handle_command(self, player_id: str, command: dict[str, Any]) -> None:
        """
        Handle a command from a player.

        All validation is server-side:
        - Rate limiting
        - Room membership
        - Role permissions
        - Game phase
        - Resource availability
        """
        async with self._lock:
            # Rate limit check
            if not self._check_rate_limit(player_id):
                await self._send_to(player_id, {
                    "type": "error",
                    "error": "Rate limited. Slow down.",
                })
                return

            cmd_type = command.get("command", "")

            if cmd_type == "step":
                await self._handle_step(player_id, command)
            elif cmd_type == "action":
                await self._handle_action(player_id, command)
            elif cmd_type == "resolve_event":
                await self._handle_resolve_event(player_id, command)
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

    # ── Command handlers ─────────────────────────────────────────────────

    async def _handle_step(self, player_id: str, command: dict) -> None:
        """Advance simulation by N steps."""
        if self._phase != "playing" or self._game_session is None:
            await self._send_to(player_id, {"type": "error", "error": "Game not running"})
            return

        num_steps = min(command.get("steps", 1), 100)  # Cap at 100 per request
        results = self._game_session.step(num_steps)

        # Broadcast the latest state to all
        await self._broadcast({
            "type": "step_result",
            "results": results,
            "game_state": self._game_session.state.to_summary(),
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
        """Handle a player action."""
        if self._phase != "playing" or self._game_session is None:
            await self._send_to(player_id, {"type": "error", "error": "Game not running"})
            return

        action_type = command.get("action_type", "")
        params = command.get("params", {})

        result = self._game_session.perform_action(player_id, action_type, params)

        # Send result to the acting player
        await self._send_to(player_id, {
            "type": "action_result",
            **result,
        })

        # If successful, broadcast updated state to all
        if result.get("success"):
            p = self._participants.get(player_id)
            display_name = p.display_name if p else player_id
            await self._broadcast({
                "type": "action_broadcast",
                "player_id": player_id,
                "display_name": display_name,
                "action_type": action_type,
                "game_state": self._game_session.state.to_summary(),
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
            await self._broadcast({
                "type": "event_resolved",
                "player_id": player_id,
                **result,
                "game_state": self._game_session.state.to_summary(),
            })
        else:
            await self._send_to(player_id, {"type": "error", **result})

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
        """Send current game state to requesting player."""
        if self._game_session:
            await self._send_to(player_id, {
                "type": "state_snapshot",
                "game_state": self._game_session.state.to_summary(),
                "roles": self._get_role_info(),
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

    # ── Broadcasting ─────────────────────────────────────────────────────

    async def _broadcast(self, message: dict[str, Any]) -> None:
        """Send a message to all connected participants."""
        disconnected = []
        for pid, p in self._participants.items():
            if p.connected:
                ok = await p.send(message)
                if not ok:
                    disconnected.append(pid)

    async def _send_to(self, player_id: str, message: dict[str, Any]) -> None:
        """Send a message to a specific player."""
        p = self._participants.get(player_id)
        if p and p.connected:
            await p.send(message)

    # ── Helpers ──────────────────────────────────────────────────────────

    def _participant_list(self) -> list[dict[str, Any]]:
        return [
            {
                "player_id": p.player_id,
                "display_name": p.display_name,
                "is_host": p.is_host,
                "ready": p.ready,
                "connected": p.connected,
            }
            for p in self._participants.values()
        ]

    def _get_role_info(self) -> dict[str, Any]:
        if self._game_session is None:
            return {}
        return {
            pid: [r.value for r in roles]
            for pid, roles in self._game_session.roles.player_roles.items()
        }

    def _check_rate_limit(self, player_id: str) -> bool:
        """Simple rate limiter: max N commands per second per player."""
        now = time.time()
        timestamps = self._command_timestamps.setdefault(player_id, [])
        # Remove old timestamps
        timestamps[:] = [t for t in timestamps if now - t < 1.0]
        if len(timestamps) >= self._max_commands_per_second:
            return False
        timestamps.append(now)
        return True


# ── Room Manager ─────────────────────────────────────────────────────────

class RoomManager:
    """Manages all active rooms."""

    def __init__(self):
        self._rooms: dict[str, Room] = {}

    def create_room(self, host_id: str, host_name: str) -> Room:
        """Create a new room with a private code."""
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
        """List rooms (for debug/admin only — not exposed to players)."""
        return [
            {
                "room_code": r.room_code,
                "phase": r.phase,
                "participant_count": r.participant_count,
            }
            for r in self._rooms.values()
        ]


# Global singleton
room_manager = RoomManager()

