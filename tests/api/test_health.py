"""
Tests for the health and system info endpoints.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app


@pytest.fixture
async def client():
    """Async test client for the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """GET /api/health returns 200 with status ok."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["app"] == "LumenOS"
    assert "version" in data


@pytest.mark.asyncio
async def test_system_info(client: AsyncClient):
    """GET /api/info returns system metadata."""
    resp = await client.get("/api/info")
    assert resp.status_code == 200
    data = resp.json()
    assert data["app"] == "LumenOS"
    assert data["database"] == "sqlite"

