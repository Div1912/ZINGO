"""
ZINGO — Hardware-Adaptive Quantized Model & Memory Orchestrator
==============================================================
Provides dynamic hardware telemetry, VRAM/RAM budgeting, and layer-offload
recommendations to run 16B MoE and 32B quantized models safely without OOM crashes.
"""

from __future__ import annotations

import ctypes
import os
import platform
import requests
from typing import Dict, Any, List, Optional
from fastapi import APIRouter

hardware_router = APIRouter(prefix="/api/hardware", tags=["Hardware Orchestrator"])

# ---------------------------------------------------------------------------
# Native System Memory Telemetry
# ---------------------------------------------------------------------------

class MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_ulong),
        ("dwMemoryLoad", ctypes.c_ulong),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


def get_system_ram() -> Dict[str, float]:
    """Returns system RAM in GB using native OS APIs."""
    if platform.system() == "Windows":
        try:
            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
            return {
                "total_gb": round(stat.ullTotalPhys / (1024**3), 2),
                "available_gb": round(stat.ullAvailPhys / (1024**3), 2),
                "used_gb": round((stat.ullTotalPhys - stat.ullAvailPhys) / (1024**3), 2),
                "load_percent": stat.dwMemoryLoad,
            }
        except Exception:
            pass

    # Linux / macOS fallback
    try:
        total = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
        avail = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_AVPHYS_PAGES")
        return {
            "total_gb": round(total / (1024**3), 2),
            "available_gb": round(avail / (1024**3), 2),
            "used_gb": round((total - avail) / (1024**3), 2),
            "load_percent": round(((total - avail) / total) * 100, 1),
        }
    except Exception:
        return {"total_gb": 16.0, "available_gb": 8.0, "used_gb": 8.0, "load_percent": 50.0}


def get_ollama_memory_footprint(ollama_host: str = "http://127.0.0.1:11434") -> Dict[str, Any]:
    """Queries Ollama /api/ps to inspect active in-memory models and VRAM usage."""
    try:
        resp = requests.get(f"{ollama_host}/api/ps", timeout=2.5)
        if resp.ok:
            data = resp.json()
            models = data.get("models", [])
            total_vram_bytes = sum(m.get("size_vram", 0) for m in models)
            total_ram_bytes = sum(m.get("size", 0) - m.get("size_vram", 0) for m in models)
            return {
                "active_models": models,
                "total_vram_mb": round(total_vram_bytes / (1024**2), 1),
                "total_ram_mb": round(total_ram_bytes / (1024**2), 1),
            }
    except Exception:
        pass
    return {"active_models": [], "total_vram_mb": 0.0, "total_ram_mb": 0.0}


# ---------------------------------------------------------------------------
# Dynamic Context Budgeting & Layer Offload
# ---------------------------------------------------------------------------

MODEL_SPECS = {
    "qwen3:8b": {
        "tier": "Tier 1: Fast Sovereign Synthesis",
        "params": "8B Dense",
        "quant": "Q4_K_M (~4.9 GB)",
        "bytes_per_token_kv": 128 * 1024, # 128KB per token KV cache
        "base_vram_gb": 5.5,
        "recommended_min_ram_gb": 12.0,
    },
    "deepseek-coder-v2:16b-lite": {
        "tier": "Tier 2: MoE Deep Coding Engine",
        "params": "16B MoE (2.4B active per token)",
        "quant": "Q4_K_M (~9.2 GB)",
        "bytes_per_token_kv": 192 * 1024,
        "base_vram_gb": 9.5,
        "recommended_min_ram_gb": 16.0,
    },
    "qwen2.5-coder:14b": {
        "tier": "Tier 2: Dense Coder",
        "params": "14B Dense",
        "quant": "Q4_K_M (~8.9 GB)",
        "bytes_per_token_kv": 160 * 1024,
        "base_vram_gb": 9.2,
        "recommended_min_ram_gb": 16.0,
    },
    "qwen2.5-coder:32b": {
        "tier": "Tier 3: Enterprise Synthesis Engine",
        "params": "32B Dense",
        "quant": "Q4_K_M (~19.5 GB)",
        "bytes_per_token_kv": 256 * 1024,
        "base_vram_gb": 20.0,
        "recommended_min_ram_gb": 32.0,
    },
    "qwen2.5-vl:3b": {
        "tier": "Worker: Multimodal & Fast Planner",
        "params": "3B Multimodal",
        "quant": "Q4_K_M (~2.1 GB)",
        "bytes_per_token_kv": 64 * 1024,
        "base_vram_gb": 2.5,
        "recommended_min_ram_gb": 8.0,
    },
}


def calculate_safe_num_ctx(model_name: str, available_ram_gb: float) -> int:
    """
    Computes maximum safe context window (num_ctx) to prevent fatal OOM crashes.
    """
    spec = MODEL_SPECS.get(model_name)
    if not spec:
        for k in MODEL_SPECS:
            if k.split(":")[0] in model_name:
                spec = MODEL_SPECS[k]
                break

    if not spec:
        return 4096

    bytes_per_token = spec.get("bytes_per_token_kv", 128 * 1024)

    # Allow at most 30% of remaining available RAM for KV cache expansion
    allowed_kv_bytes = (available_ram_gb * 0.30) * (1024**3)
    max_tokens = int(allowed_kv_bytes / max(bytes_per_token, 1))

    if max_tokens < 2048:
        return 2048
    elif max_tokens < 4096:
        return 4096
    elif max_tokens < 8192:
        return 8192
    elif max_tokens < 16384:
        return 16384
    elif max_tokens < 32768:
        return 32768
    else:
        return 65536


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@hardware_router.get("/telemetry")
async def hardware_telemetry():
    """Returns real-time host RAM, VRAM allocation, and model headroom."""
    ram = get_system_ram()
    ollama_mem = get_ollama_memory_footprint()
    return {
        "status": "online",
        "host_ram": ram,
        "ollama_footprint": ollama_mem,
        "recommended_safe_context": {
            model: calculate_safe_num_ctx(model, ram["available_gb"])
            for model in MODEL_SPECS
        },
    }


@hardware_router.get("/profiles")
async def model_profiles():
    """Returns model profiles, quantization tiers, and hardware requirements."""
    ram = get_system_ram()
    profiles = []
    for model_id, spec in MODEL_SPECS.items():
        is_supported = ram["total_gb"] >= (spec["recommended_min_ram_gb"] - 2.0)
        safe_ctx = calculate_safe_num_ctx(model_id, ram["available_gb"])
        profiles.append({
            "model_id": model_id,
            "tier": spec["tier"],
            "parameters": spec["params"],
            "quantization": spec["quant"],
            "hardware_supported": is_supported,
            "recommended_min_ram_gb": spec["recommended_min_ram_gb"],
            "recommended_context_window": safe_ctx,
        })
    return {"profiles": profiles, "current_system_ram_gb": ram["total_gb"]}
