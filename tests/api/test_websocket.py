"""
Tests for the WebSocket health/smoke endpoint — /ws/health.
"""

from __future__ import annotations

import json

import pytest
from starlette.testclient import TestClient

from api.main import app


@pytest.fixture
def sync_client():
    """Starlette's TestClient is synchronous and supports websocket_connect."""
    return TestClient(app)


class TestWebSocketHealth:
    """WebSocket /ws/health — connectivity verification."""

    def test_ws_health_connects_and_returns_status(self, sync_client: TestClient):
        with sync_client.websocket_connect("/ws/health") as ws:
            data = ws.receive_json()
            assert data["type"] == "connected"
            assert data["status"] == "ok"
            assert data["app"] == "LumenOS"

    def test_ws_health_ping_pong(self, sync_client: TestClient):
        with sync_client.websocket_connect("/ws/health") as ws:
            # Receive initial connection message
            data = ws.receive_json()
            assert data["type"] == "connected"

            # Send a ping
            ws.send_text(json.dumps({"type": "ping"}))
            pong = ws.receive_json()
            assert pong["type"] == "pong"

    def test_ws_health_closes_cleanly(self, sync_client: TestClient):
        with sync_client.websocket_connect("/ws/health") as ws:
            # Receive initial message
            ws.receive_json()
            # Send a non-ping message — server should just close
            ws.send_text(json.dumps({"type": "hello"}))

