Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  SyncShala - Learn anywhere. Sync everywhere." -ForegroundColor Green
Write-Host "  URL: http://127.0.0.1:8000" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$env:PYTHONPATH = "backend"

if (-Not (Test-Path "backend\.venv\Scripts\python.exe")) {
    Write-Host "Setting up Python virtual environment..." -ForegroundColor Yellow
    python -m venv backend\.venv
    & "backend\.venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
}

Write-Host "Starting All-In-One Server on http://127.0.0.1:8000 ..." -ForegroundColor Green
& "backend\.venv\Scripts\python.exe" -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
