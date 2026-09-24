#!/bin/bash
# ZINGO — Laptop 3: Dedicated Fast Synthesis Node Launcher (macOS)
# Model: Qwen3:4b (Fast Conversational & General QA)

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "==================================================="
echo "  Starting ZINGO Laptop 3: Fast Synthesis Node     "
echo "  Model : Qwen3:4b (Fast Conversational Lane)      "
echo "  Domain: https://yoyo-evolve-untimed.ngrok-free.dev"
echo "==================================================="

# 1. Acceleration Configuration
export OLLAMA_HOST=0.0.0.0:11434
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KV_CACHE_TYPE=q8_0
export OLLAMA_NUM_PARALLEL=1

# 2. Check Ollama server
if ! pgrep -x "ollama" >/dev/null; then
    echo "[..] Starting local Ollama server..."
    ollama serve >/dev/null 2>&1 &
    sleep 3
else
    echo "[OK] Ollama is already running."
fi

# 3. Verify qwen3:4b
if ollama list | grep -q "qwen3:4b"; then
    echo "[OK] Model 'qwen3:4b' is loaded and ready."
else
    echo "[!] Pulling 'qwen3:4b'..."
    ollama pull qwen3:4b
fi

# 4. Ngrok authentication & tunnel
NGROK_AUTHTOKEN="3JXSoWFqDiJDxkj29nKViFY7epK_3937AJwbR3eBY4t1SZXPW"
PERMANENT_DOMAIN="yoyo-evolve-untimed.ngrok-free.dev"

if command -v ngrok >/dev/null 2>&1; then
    ngrok config add-authtoken "$NGROK_AUTHTOKEN" >/dev/null 2>&1 || true
    echo "[..] Launching Ngrok permanent tunnel to https://$PERMANENT_DOMAIN..."
    ngrok http --domain "$PERMANENT_DOMAIN" --host-header=rewrite 11434 &
else
    echo "[!] ngrok not found in PATH."
fi

echo "==================================================="
echo "  Laptop 3 Node is LIVE at https://$PERMANENT_DOMAIN"
echo "==================================================="
