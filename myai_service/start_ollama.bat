@echo off
title Ollama — MyAI Backend
echo.
echo  ================================
echo   Starting Ollama for MyAI
echo  ================================
echo.

REM OLLAMA_ORIGINS is already set as a permanent Windows environment variable.
REM If you need to reset it manually, run this in PowerShell:
REM   [System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,https://capstone-delta-jet.vercel.app", "User")
REM Then restart Ollama from the system tray.

set PATH=%PATH%;%LOCALAPPDATA%\Programs\Ollama

echo [INFO] Starting ollama serve on port 11434...
echo [INFO] NOTE: If Ollama is already running in the system tray, close it first.
echo [INFO] Press Ctrl+C to stop
echo.
ollama serve

pause
