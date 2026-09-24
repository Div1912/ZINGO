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

:: 3. Verify Qwen2.5-VL Model and Aliases for Backward Compatibility
echo [..] Verifying Qwen2.5-VL model status...
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

:: 4. Check and Start Python Backend on Port 8000 (Optional / Node Server)
where python >nul 2>&1
if "%ERRORLEVEL%"=="0" (
    netstat -ano | find "LISTENING" | find ":8000" >nul
    if "%ERRORLEVEL%"=="0" (
        echo [OK] Python Backend is already running on port 8000.
    ) else (
        echo [..] Starting Python Backend on http://localhost:8000...
        start "ZINGO Laptop 2 Backend (:8000)" cmd /k "cd /d %~dp0 && python server.py"
        timeout /t 3 /nobreak >nul
    )
)

:: 5. Check and Start Ngrok Permanent Tunnel (Port 11434)
tasklist /FI "IMAGENAME eq ngrok.exe" 2>NUL | find /I /N "ngrok.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Ngrok is already running.
) else (
    echo [..] Starting Ngrok tunnel to %PERMANENT_DOMAIN%...
    if exist "%~dp0ngrok.exe" (
        start "ZINGO Laptop 2 Tunnel" cmd /k "cd /d %~dp0 && ngrok.exe http --url %PERMANENT_DOMAIN% --host-header=rewrite 11434"
    ) else (
        where ngrok >nul 2>&1
        if "%ERRORLEVEL%"=="0" (
            start "ZINGO Laptop 2 Tunnel" cmd /k "ngrok http --url %PERMANENT_DOMAIN% --host-header=rewrite 11434"
        ) else (
            echo [!] Error: ngrok.exe not found in %~dp0 or PATH.
        )
    )
)

echo.
echo ===================================================
echo   Ready! Laptop 2 Multimodal Node is LIVE:
echo   Permanent Tunnel : https://%PERMANENT_DOMAIN%
echo   Local Ollama     : http://127.0.0.1:11434
echo   Model Resident   : Qwen2.5-VL Multimodal
echo ===================================================
timeout /t 5 /nobreak >nul
