"""
Co-op Room REST + WebSocket endpoints.

Provides HTTP endpoints for room creation / joining and a WebSocket
endpoint that delegates all live game commands to the Room.handle_command()
method from the room management service.
"""

from __future__ import annotations

import json
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from api.services.rooms import room_manager


router = APIRouter(prefix="/rooms", tags=["rooms"])


# ── Request / Response models ────────────────────────────────────────────────


class CreateRoomRequest(BaseModel):
    """Request body for creating a co-op room."""
    host_name: str = Field(min_length=1, max_length=30)


class CreateRoomResponse(BaseModel):
    """Response returned when a room is created."""
    room_code: str
    player_id: str


class JoinRoomRequest(BaseModel):
    """Request body for joining a room."""
    display_name: str = Field(min_length=1, max_length=30)


class ParticipantInfo(BaseModel):
    """Summary of a room participant."""
    player_id: str
    display_name: str
    is_host: bool
    ready: bool
    connected: bool


class JoinRoomResponse(BaseModel):
    """Response returned when a player joins a room."""
    player_id: str
    participants: list[ParticipantInfo]


class RoomInfoResponse(BaseModel):
    """Summary of room state."""
    room_code: str
    phase: str
    participant_count: int
    participants: list[ParticipantInfo]


# ── Helpers ──────────────────────────────────────────────────────────────────


def _get_room_or_404(room_code: str):
    """Retrieve a room by code or raise 404."""
    room = room_manager.get_room(room_code)
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room '{room_code}' not found",
        )
    return room


# ── REST Endpoints ───────────────────────────────────────────────────────────


@router.post("", response_model=CreateRoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(body: CreateRoomRequest):
    """Create a new co-op room. The creator becomes the host."""
    host_id = f"player_{uuid4().hex[:8]}"
    room = room_manager.create_room(host_id=host_id, host_name=body.host_name)
    return CreateRoomResponse(room_code=room.room_code, player_id=host_id)


@router.post("/{room_code}/join", response_model=JoinRoomResponse)
async def join_room(room_code: str, body: JoinRoomRequest):
    """Join an existing room as a participant."""
    room = _get_room_or_404(room_code)

    if room.participant_count >= 4:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Room is full (max 4 players)",
        )

    player_id = f"player_{uuid4().hex[:8]}"

    # NOTE: The participant is registered in the room on WebSocket connect,
    # not here.  This endpoint validates the room exists and returns a player_id
    # the client uses when connecting via WebSocket.
    participants = [
        ParticipantInfo(**p)
        for p in room._participant_list()
    ]

    return JoinRoomResponse(player_id=player_id, participants=participants)


@router.get("/{room_code}", response_model=RoomInfoResponse)
async def get_room_info(room_code: str):
    """Get current room information."""
    room = _get_room_or_404(room_code)
    participants = [
        ParticipantInfo(**p)
        for p in room._participant_list()
    ]
    return RoomInfoResponse(
        room_code=room.room_code,
        phase=room.phase,
        participant_count=room.participant_count,
        participants=participants,
    )


# ── WebSocket Endpoint ──────────────────────────────────────────────────────
# NOTE: When deploying behind nginx/Caddy, proxy /ws/* paths with:
#   location /ws/ {
#       proxy_pass http://backend;
#       proxy_http_version 1.1;
#       proxy_set_header Upgrade $http_upgrade;
#       proxy_set_header Connection "upgrade";
#   }


@router.websocket("/ws/{room_code}/{player_id}")
async def room_websocket(websocket: WebSocket, room_code: str, player_id: str):
    """
    WebSocket endpoint for live room interaction.

    Validates room existence and player membership, then routes all
    incoming messages to Room.handle_command(). Handles disconnects
    gracefully.
    """
    room = room_manager.get_room(room_code)
    if room is None:
        await websocket.close(code=4004, reason="Room not found")
        return

    await websocket.accept()

    # Try reconnect first, otherwise add as new participant
    reconnected = await room.reconnect(player_id, websocket)
    if not reconnected:
        added = await room.add_participant(
            player_id=player_id,
            display_name=f"Player-{player_id[-4:]}",
            websocket=websocket,
        )
        if not added:
            await websocket.send_json({"type": "error", "error": "Room is full"})
            await websocket.close(code=4009, reason="Room is full")
            return

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                command = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "error": "Invalid JSON",
                })
                continue

            await room.handle_command(player_id, command)

    except WebSocketDisconnect:
        # Mark participant as disconnected but keep in room for reconnect
        participant = room.get_participant(player_id)
        if participant is not None:
            participant.connected = False
