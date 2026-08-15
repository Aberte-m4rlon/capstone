@echo off
title Ollama — MyAI Backend
echo.
echo  ================================
echo   Starting Ollama for MyAI
echo  ================================
echo.

REM Allow browser to call Ollama directly
set OLLAMA_ORIGINS=http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,https://capstone-delta-jet.vercel.app

REM Add Ollama to PATH
set PATH=%PATH%;%LOCALAPPDATA%\Programs\Ollama

echo [INFO] Starting ollama serve on port 11434...
echo [INFO] CORS allowed for AlpasFarm frontend
echo [INFO] Press Ctrl+C to stop
echo.
ollama serve

pause
