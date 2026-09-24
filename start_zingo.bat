@echo off
title ZINGO Backend & Tunnel Launcher
echo ===================================================
echo   Starting ZINGO Backend & Ngrok Tunnel
echo ===================================================
echo.

:: 1. Ensure Ollama acceleration variables are set
set OLLAMA_FLASH_ATTENTION=1
set OLLAMA_KV_CACHE_TYPE=q8_0
set OLLAMA_NUM_PARALLEL=1
set OLLAMA_MODELS=D:\OllamaModels

:: 2. Check if Ollama is running; if not, start it
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I /N "ollama.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Ollama is already running.
) else (
    echo [..] Starting Ollama server...
    where ollama >nul 2>&1
    if "%ERRORLEVEL%"=="0" (
        start /B "" ollama serve
    ) else if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        start /B "" "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    ) else if exist "C:\Users\rajdi\AppData\Local\Programs\Ollama\ollama.exe" (
        start /B "" "C:\Users\rajdi\AppData\Local\Programs\Ollama\ollama.exe" serve
    ) else (
        echo [!] Warning: ollama.exe not found in PATH or standard directories.
    )
    timeout /t 3 /nobreak >nul
)

:: 3. Check and Start FastAPI Backend on Port 8000
netstat -ano | find "LISTENING" | find ":8000" >nul
if "%ERRORLEVEL%"=="0" (
    echo [OK] Backend is already running on port 8000.
) else (
    echo [..] Starting Python Backend on http://localhost:8000...
    start "ZINGO Backend (:8000)" cmd /k "cd /d %~dp0 && python server.py"
    timeout /t 3 /nobreak >nul
)

:: 4. Check and Start Ngrok Tunnel
tasklist /FI "IMAGENAME eq ngrok.exe" 2>NUL | find /I /N "ngrok.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Ngrok is already running.
) else (
    echo [..] Starting Ngrok tunnel to splendid-sensibly-primate.ngrok-free.app...
    start "ZINGO Ngrok Tunnel" cmd /k "cd /d %~dp0 && ngrok.exe http --domain splendid-sensibly-primate.ngrok-free.app 8000"
)

echo.
echo ===================================================
echo   Ready! Your deployed site is connected:
echo   Domain: https://splendid-sensibly-primate.ngrok-free.app
echo ===================================================
timeout /t 4 /nobreak >nul
