@echo off
title SyncShala - Learn anywhere. Sync everywhere.
echo ========================================================
echo   Starting SyncShala (All-In-One Localhost)
echo   Tagline: Learn anywhere. Sync everywhere.
echo   URL: http://127.0.0.1:8000
echo ========================================================
echo.

cd /d "%~dp0"
set PYTHONPATH=backend

if not exist "backend\.venv\Scripts\python.exe" (
    echo Virtual environment not found. Setting up...
    python -m venv backend\.venv
    backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
)

echo Starting Server on http://127.0.0.1:8000 ...
backend\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
pause
