#!/usr/bin/env bash
# LumenOS Development Servers (Linux/macOS/Git Bash)
# Starts both the FastAPI backend and Vite frontend dev servers.
# Windows users can use scripts/dev.ps1 instead.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== LumenOS Development Servers ==="

if [ ! -d ".venv" ]; then
    echo "[1/2] Creating Python virtual environment..."
    python -m venv .venv
    ./.venv/bin/python -m pip install -e ".[dev]" --quiet || ./.venv/Scripts/python.exe -m pip install -e ".[dev]" --quiet
fi

PY=".venv/bin/python"
[ -x "$PY" ] || PY=".venv/Scripts/python.exe"

echo "[API] Starting FastAPI on http://localhost:8000 ..."
"$PY" -m uvicorn api.main:app --reload --port 8000 &
BACKEND_PID=$!

echo "[WEB] Starting Vite on http://localhost:5173 ..."
(cd apps/web && npm run dev) &
FRONTEND_PID=$!

cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "Both servers are running. Press Ctrl+C to stop."
echo "  API:       http://localhost:8000/api/health"
echo "  API Docs:  http://localhost:8000/docs"
echo "  Web:       http://localhost:5173"
echo ""

wait
