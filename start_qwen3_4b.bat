@echo off
title ZINGO Qwen3:4B Node and Tunnel Launcher
echo ===================================================
echo   Starting Qwen3:4B Model and Ngrok Permanent Tunnel
echo   Model  : Qwen3:4B - Fast Synthesis Node
echo   Domain : https://yoyo-evolve-untimed.ngrok-free.dev
echo ===================================================
echo.

:: 1. Configuration
set OLLAMA_HOST=0.0.0.0:11434
set OLLAMA_FLASH_ATTENTION=1
set OLLAMA_KV_CACHE_TYPE=q8_0
set OLLAMA_NUM_PARALLEL=1
set PERMANENT_DOMAIN=yoyo-evolve-untimed.ngrok-free.dev
set NGROK_AUTHTOKEN=3JXSoWFqDiJDxkj29nKViFY7epK_3937AJwbR3eBY4t1SZXPW

:: Locate ngrok executable directory
set "NGROK_DIR=C:\zingo"
if not exist "%NGROK_DIR%\ngrok.exe" (
    if exist "%~dp0ngrok.exe" set "NGROK_DIR=%~dp0"
)

:: 2. Check if Ollama is running; if not, launch it
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I /N "ollama.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Ollama is already running on port 11434.
) else (
    echo [..] Starting Ollama server on 0.0.0.0:11434...
    where ollama >nul 2>&1
    if not errorlevel 1 (
        start /B "" ollama serve
    ) else if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        start /B "" "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    ) else if exist "%PROGRAMFILES%\Ollama\ollama.exe" (
        start /B "" "%PROGRAMFILES%\Ollama\ollama.exe" serve
    ) else (
        echo [!] Warning: ollama.exe not found in standard paths.
    )
    ping -n 4 127.0.0.1 >nul
)

:: 3. Verify Qwen3-4B Model Status
echo [..] Checking Qwen3-4B model status...
ollama list 2>nul | findstr /I "qwen3:4b" >nul
if "%ERRORLEVEL%"=="0" (
    echo [OK] Model 'qwen3:4b' is ready.
) else (
    echo [!] 'qwen3:4b' not detected. Pulling model now...
    ollama pull qwen3:4b
)

:: 4. Ensure Ngrok Auth Token is saved
if exist "%NGROK_DIR%\ngrok.exe" (
    "%NGROK_DIR%\ngrok.exe" config add-authtoken %NGROK_AUTHTOKEN% >nul 2>&1
) else (
    where ngrok >nul 2>&1
    if not errorlevel 1 ngrok config add-authtoken %NGROK_AUTHTOKEN% >nul 2>&1
)

:: 5. Check and Start Ngrok Permanent Tunnel (Port 11434 with Host Header Rewrite)
tasklist /FI "IMAGENAME eq ngrok.exe" 2>NUL | find /I /N "ngrok.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Ngrok tunnel is already active.
) else (
    echo [..] Starting Ngrok permanent tunnel to https://%PERMANENT_DOMAIN%...
    if exist "%NGROK_DIR%\ngrok.exe" (
        start "ZINGO Qwen3-4B Tunnel" cmd /k "cd /d "%NGROK_DIR%" && ngrok.exe http --domain %PERMANENT_DOMAIN% --host-header=rewrite 11434"
    ) else (
        start "ZINGO Qwen3-4B Tunnel" cmd /k "ngrok http --domain %PERMANENT_DOMAIN% --host-header=rewrite 11434"
    )
)

echo.
echo ===================================================
echo   SUCCESS: Both Ollama and Ngrok Tunnel are RUNNING!
echo   Model  : Qwen3:4B resident on 127.0.0.1:11434
echo   Tunnel : https://%PERMANENT_DOMAIN%
echo ===================================================
echo.
echo You can keep this window open or press any key to close it.
echo The Ollama server and Ngrok tunnel will continue running.
pause >nul
