@echo off
title MyAI Service — AlpasFarm
echo.
echo  ================================
echo   MyAI Service for AlpasFarm
echo  ================================
echo.

cd /d "%~dp0"

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.10+
    pause
    exit /b 1
)

REM Check if venv exists, create if not
if not exist ".venv" (
    echo [SETUP] Creating virtual environment...
    python -m venv .venv
    echo [SETUP] Installing dependencies...
    .venv\Scripts\pip install -r requirements.txt --quiet
    echo [SETUP] Done.
)

REM Activate and run
echo [START] Starting MyAI on http://localhost:8000
echo [INFO]  Press Ctrl+C to stop
echo.
.venv\Scripts\uvicorn main:app --host 127.0.0.1 --port 8000 --reload
pause
