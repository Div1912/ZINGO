#!/bin/bash
# ==============================================================================
# ZINGO — Laptop 2: Dedicated Multimodal & Vision Node Launcher (macOS)
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PERMANENT_DOMAIN="unfailing-idealism-caretaker.ngrok-free.dev"

echo "==================================================="
echo "  Starting ZINGO Laptop 2: Multimodal Node (macOS) "
echo "  Model: Qwen2.5-VL:3b (Multimodal & Vision)        "
echo "==================================================="
echo ""

# 1. Ensure Ollama listens on all network interfaces (LAN accessible by Laptop 1)
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_FLASH_ATTENTION=1

# 2. Check if Ollama is running
if pgrep -x "ollama" >/dev/null; then
    echo "[OK] Ollama is already running."
else
    echo "[..] Launching Ollama in background (listening on 0.0.0.0:11434)..."
    ollama serve >/dev/null 2>&1 &
    sleep 3
fi

# 3. Verify qwen2.5vl:3b model availability
echo "[..] Checking local model status..."
if ollama list | grep -q "qwen2.5vl"; then
    echo "[OK] Model 'qwen2.5vl:3b' is loaded and ready."
else
    echo "[!] 'qwen2.5vl:3b' not detected. Pulling model now..."
    ollama pull qwen2.5vl:3b
fi

# 4. Check and Launch Ngrok Permanent Tunnel
NGROK_BIN="$DIR/ngrok"
if [ ! -f "$NGROK_BIN" ]; then
    NGROK_BIN=$(which ngrok 2>/dev/null)
fi

if [ -x "$NGROK_BIN" ]; then
    if pgrep -f "ngrok.*${PERMANENT_DOMAIN}" >/dev/null; then
        echo "[OK] Ngrok permanent tunnel is already running."
    else
        echo "[..] Launching Ngrok permanent tunnel to ${PERMANENT_DOMAIN} (port 11434)..."
        "$NGROK_BIN" http --url "$PERMANENT_DOMAIN" --host-header=rewrite 11434 >/dev/null 2>&1 &
        sleep 2
        if pgrep -f "ngrok.*${PERMANENT_DOMAIN}" >/dev/null; then
            echo "[OK] Ngrok tunnel active: https://${PERMANENT_DOMAIN}"
        else
            echo "[!] Note: If ngrok exited, ensure your authtoken is set:"
            echo "    ./ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>"
        fi
    fi
else
    echo "[!] ngrok binary not found in $DIR."
fi

# 5. Detect local IP address for Laptop 1 connection
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo ""
echo "==================================================="
echo "  Laptop 2 Multimodal Node is LIVE!                "
echo "==================================================="
echo "  Permanent Tunnel: https://${PERMANENT_DOMAIN}"
echo "  Local Endpoint  : http://127.0.0.1:11434"
echo "  LAN Endpoint    : http://${LOCAL_IP}:11434"
echo ""
echo "  Laptop 1 & Web UI are pre-configured to use:"
echo "  https://${PERMANENT_DOMAIN}"
echo "==================================================="
echo ""
