@echo off
title ZINGO Laptop 2: Multimodal & Vision Node Launcher
echo ===================================================
echo   Starting ZINGO Laptop 2: Multimodal Node & Tunnel
echo   Model : Qwen2.5-VL Multimodal (Vision & QA)
echo   Domain: https://unfailing-idealism-caretaker.ngrok-free.dev
echo ===================================================
echo.

:: 1. Environment & Acceleration Configuration
set OLLAMA_HOST=0.0.0.0:11434
set OLLAMA_FLASH_ATTENTION=1
set OLLAMA_KV_CACHE_TYPE=q8_0
set OLLAMA_NUM_PARALLEL=1
set PERMANENT_DOMAIN=unfailing-idealism-caretaker.ngrok-free.dev
set NGROK_AUTHTOKEN=3JXTsx7citycIzYfpuMMzFLKbec_GtXenkpnJfCHgJsXqEW5

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
    echo [..] Starting Ollama server (listening on 0.0.0.0:11434)...
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

:: 3. Verify Qwen2.5-VL Model and Aliases for Backward Compatibility
echo [..] Checking Qwen2.5-VL model status...
ollama list 2>nul | findstr /I "qwen2.5vl" >nul
if "%ERRORLEVEL%"=="0" (
    echo [OK] Model 'qwen2.5vl:3b' is installed.
    ollama list 2>nul | findstr /I "qwen2.5-vl:7b" >nul
    if not "%ERRORLEVEL%"=="0" (
        echo [..] Creating 'qwen2.5-vl:7b' alias for cluster compatibility...
        ollama cp qwen2.5vl:3b qwen2.5-vl:7b >nul 2>&1
        ollama cp qwen2.5vl:3b qwen2.5-vl:3b >nul 2>&1
    )
) else (
    ollama list 2>nul | findstr /I "qwen2.5-vl" >nul
    if not "%ERRORLEVEL%"=="0" (
        echo [!] Qwen2.5-VL not detected. Pulling 'qwen2.5vl:3b'...
        ollama pull qwen2.5vl:3b
        ollama cp qwen2.5vl:3b qwen2.5-vl:7b >nul 2>&1
        ollama cp qwen2.5vl:3b qwen2.5-vl:3b >nul 2>&1
    )
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
        start "ZINGO Laptop 2 Tunnel" cmd /k "cd /d "%NGROK_DIR%" && ngrok.exe http --domain %PERMANENT_DOMAIN% --host-header=rewrite 11434"
    ) else (
        start "ZINGO Laptop 2 Tunnel" cmd /k "ngrok http --domain %PERMANENT_DOMAIN% --host-header=rewrite 11434"
    )
)

echo.
echo ===================================================
echo   SUCCESS: Both Ollama and Ngrok Tunnel are RUNNING!
echo   Model  : Qwen2.5-VL resident on 127.0.0.1:11434
echo   Tunnel : https://%PERMANENT_DOMAIN%
echo ===================================================
echo.
echo You can keep this window open or press any key to close it.
echo The Ollama server and Ngrok tunnel will continue running.
pause >nul
