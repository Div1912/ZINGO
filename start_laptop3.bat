@echo off
title ZINGO Laptop 3: Fast Synthesis Node Launcher
echo ===================================================
echo   Starting ZINGO Laptop 3: Fast Synthesis Node & Tunnel
echo   Model  : Qwen3:4b (Fast Conversational & Synthesis)
echo   Domain : https://yoyo-evolve-untimed.ngrok-free.dev
echo ===================================================
echo.

:: 1. Environment & Acceleration Configuration
set OLLAMA_HOST=0.0.0.0:11434
set OLLAMA_FLASH_ATTENTION=1
set OLLAMA_KV_CACHE_TYPE=q8_0
set OLLAMA_NUM_PARALLEL=1
set PERMANENT_DOMAIN=yoyo-evolve-untimed.ngrok-free.dev
set NGROK_AUTHTOKEN=3JXSoWFqDiJDxkj29nKViFY7epK_3937AJwbR3eBY4t1SZXPW

:: 2. Check if Ollama is running; if not, launch it
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I /N "ollama.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Ollama is already running.
) else (
    echo [..] Starting Ollama server (listening on 0.0.0.0:11434)...
    where ollama >nul 2>&1
    if "%ERRORLEVEL%"=="0" (
        start /B "" ollama serve
    ) else if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        start /B "" "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    ) else if exist "%PROGRAMFILES%\Ollama\ollama.exe" (
        start /B "" "%PROGRAMFILES%\Ollama\ollama.exe" serve
    ) else (
        echo [!] Warning: ollama.exe not found in PATH or standard directories.
    )
    timeout /t 4 /nobreak >nul
)

:: 3. Verify Qwen3-4B Model Status
echo [..] Verifying Qwen3-4B model status...
ollama list 2>nul | findstr /I "qwen3:4b" >nul
if "%ERRORLEVEL%"=="0" (
    echo [OK] Model 'qwen3:4b' is installed.
) else (
    echo [!] 'qwen3:4b' not detected. Pulling model now...
    ollama pull qwen3:4b
)

:: 4. Ensure Ngrok Auth Token is configured
if exist "%~dp0ngrok.exe" (
    "%~dp0ngrok.exe" config add-authtoken %NGROK_AUTHTOKEN% >nul 2>&1
) else (
    where ngrok >nul 2>&1
    if "%ERRORLEVEL%"=="0" (
        ngrok config add-authtoken %NGROK_AUTHTOKEN% >nul 2>&1
    )
)

:: 5. Check and Start Ngrok Permanent Tunnel (Port 11434)
tasklist /FI "IMAGENAME eq ngrok.exe" 2>NUL | find /I /N "ngrok.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Ngrok is already running.
) else (
    echo [..] Starting Ngrok permanent tunnel to https://%PERMANENT_DOMAIN%...
    if exist "%~dp0ngrok.exe" (
        start "ZINGO Laptop 3 Tunnel" cmd /k "cd /d %~dp0 && ngrok.exe http --domain %PERMANENT_DOMAIN% --host-header=rewrite 11434"
    ) else (
        where ngrok >nul 2>&1
        if "%ERRORLEVEL%"=="0" (
            start "ZINGO Laptop 3 Tunnel" cmd /k "ngrok http --domain %PERMANENT_DOMAIN% --host-header=rewrite 11434"
        ) else (
            echo [!] Error: ngrok.exe not found in %~dp0 or PATH.
        )
    )
)

echo.
echo ===================================================
echo   Ready! Laptop 3 Fast Synthesis Node is LIVE:
echo   Permanent Tunnel : https://%PERMANENT_DOMAIN%
echo   Local Ollama     : http://127.0.0.1:11434
echo   Model Resident   : Qwen3:4b (Fast Lane)
echo ===================================================
timeout /t 5 /nobreak >nul
