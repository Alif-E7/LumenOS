# LumenOS Development Setup Script (Windows)
# Run this once after cloning the repository.

$ErrorActionPreference = "Stop"

Write-Host "=== LumenOS Setup ===" -ForegroundColor Cyan

# 1. Python virtual environment
if (-not (Test-Path ".venv")) {
    Write-Host "[1/4] Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
} else {
    Write-Host "[1/4] Python venv already exists." -ForegroundColor Green
}

# 2. Activate and install Python deps
Write-Host "[2/4] Installing Python dependencies..." -ForegroundColor Yellow
& .\.venv\Scripts\activate
pip install -e ".[dev]" --quiet

# 3. Frontend dependencies
Write-Host "[3/4] Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location apps\web
npm install
Set-Location ..\..

# 4. Verify
Write-Host "[4/4] Verifying installation..." -ForegroundColor Yellow
python -c "import fastapi; import pydantic; import numpy; print('Python packages OK')"
node -e "console.log('Node packages OK')"

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host "Run 'scripts\dev.ps1' to start development servers."

