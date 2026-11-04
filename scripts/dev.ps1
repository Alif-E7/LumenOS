# LumenOS Development Servers (Windows)
# Starts both the FastAPI backend and Vite frontend dev servers.

$ErrorActionPreference = "Stop"

Write-Host "=== LumenOS Development Servers ===" -ForegroundColor Cyan
Write-Host ""

# Activate Python venv
& "$PSScriptRoot\..\\.venv\Scripts\activate"

# Start backend in background
Write-Host "[API] Starting FastAPI on http://localhost:8000 ..." -ForegroundColor Yellow
$backend = Start-Process -PassThru -NoNewWindow powershell -ArgumentList @(
    "-Command",
    "cd '$PSScriptRoot\..'; .\.venv\Scripts\activate; python -m uvicorn api.main:app --reload --port 8000"
)

# Start frontend in background
Write-Host "[WEB] Starting Vite on http://localhost:5173 ..." -ForegroundColor Yellow
$frontend = Start-Process -PassThru -NoNewWindow powershell -ArgumentList @(
    "-Command",
    "cd '$PSScriptRoot\..\apps\web'; npm run dev"
)

Write-Host ""
Write-Host "Both servers are running. Press Ctrl+C to stop." -ForegroundColor Green
Write-Host "  API:  http://localhost:8000/api/health" -ForegroundColor Cyan
Write-Host "  API Docs:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  Web:  http://localhost:5173" -ForegroundColor Cyan
Write-Host ""

try {
    Wait-Process -Id $backend.Id
} finally {
    Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
    Stop-Process -Id $frontend.Id -ErrorAction SilentlyContinue
}

