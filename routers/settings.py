"""
ZINGO — Production-Grade User Settings & Identity Router
=========================================================
Exposes endpoints for Profile, Capabilities, Permissions, Memory Files,
Connectors, and real connectivity tests for industrial data sources.
Synchronizes with local SQLite and powers real-time LLM system prompt injection.
"""

from __future__ import annotations

import socket
import time
from typing import Any, Dict, List, Optional

import requests as http_requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from data_layer import (
    get_user_profile,
    upsert_user_profile,
    get_user_capabilities,
    update_user_capabilities,
    get_user_memory_files,
    add_user_memory_file,
    update_user_memory_file,
    delete_user_memory_file,
    clear_user_memory_files,
    get_user_permissions,
    update_user_permissions,
    get_user_connectors,
    toggle_user_connector,
    delete_user_account,
    build_zingo_identity_prompt,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


# --------------------------------------------------------------------------------------
# Payloads
# --------------------------------------------------------------------------------------

class ProfilePayload(BaseModel):
    user_id: Optional[str] = "default_user"
    full_name: Optional[str] = None
    preferred_name: Optional[str] = None
    work_role: Optional[str] = None
    personal_preferences: Optional[str] = None


class CapabilitiesPayload(BaseModel):
    user_id: Optional[str] = "default_user"
    artifacts_enabled: Optional[bool] = None
    inline_visualizations: Optional[bool] = None
    code_execution: Optional[bool] = None
    switch_models_on_flagged: Optional[bool] = None
    generate_memory_from_chats: Optional[bool] = None
    include_sensitive_topics: Optional[bool] = None
    tool_access_mode: Optional[str] = None


class PermissionsPayload(BaseModel):
    user_id: Optional[str] = "default_user"
    location_permitted: Optional[bool] = None
    location_label: Optional[str] = None
    location_coords: Optional[str] = None
    calendar_permitted: Optional[bool] = None
    calendar_account: Optional[str] = None


class MemoryFilePayload(BaseModel):
    user_id: Optional[str] = "default_user"
    title: str
    content: str
    category: Optional[str] = "general"
    is_sensitive: Optional[bool] = False


class ConnectorTogglePayload(BaseModel):
    user_id: Optional[str] = "default_user"
    status: Optional[str] = None
    account_email: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class ConnectorTestPayload(BaseModel):
    user_id: Optional[str] = "default_user"
    endpoint: str
    connector_type: Optional[str] = "http"   # "http" | "tcp" | "opc_ua"
    api_key: Optional[str] = None
    timeout_ms: Optional[int] = 3000


# --------------------------------------------------------------------------------------
# Profile Endpoints
# --------------------------------------------------------------------------------------

@router.get("/profile")
async def get_profile(user_id: str = "default_user"):
    return get_user_profile(user_id)


@router.post("/profile")
async def update_profile(payload: ProfilePayload):
    user_id = payload.user_id or "default_user"
    return upsert_user_profile(
        user_id=user_id,
        full_name=payload.full_name,
        preferred_name=payload.preferred_name,
        work_role=payload.work_role,
        personal_preferences=payload.personal_preferences,
    )


# --------------------------------------------------------------------------------------
# Capabilities Endpoints
# --------------------------------------------------------------------------------------

@router.get("/capabilities")
async def get_capabilities(user_id: str = "default_user"):
    return get_user_capabilities(user_id)


@router.post("/capabilities")
async def update_capabilities(payload: CapabilitiesPayload):
    user_id = payload.user_id or "default_user"
    updates = {k: v for k, v in payload.dict().items() if k != "user_id" and v is not None}
    return update_user_capabilities(user_id, **updates)


# --------------------------------------------------------------------------------------
# Permissions Endpoints
# --------------------------------------------------------------------------------------

@router.get("/permissions")
async def get_permissions(user_id: str = "default_user"):
    return get_user_permissions(user_id)


@router.post("/permissions")
async def update_permissions(payload: PermissionsPayload):
    user_id = payload.user_id or "default_user"
    updates = {k: v for k, v in payload.dict().items() if k != "user_id" and v is not None}
    return update_user_permissions(user_id, **updates)


# --------------------------------------------------------------------------------------
# Connectors Endpoints
# --------------------------------------------------------------------------------------

@router.get("/connectors")
async def get_connectors(user_id: str = "default_user"):
    conns = get_user_connectors(user_id)
    return {"total": len(conns), "connectors": conns}


@router.post("/connectors/{connector_key}/toggle")
async def toggle_connector(connector_key: str, payload: ConnectorTogglePayload):
    user_id = payload.user_id or "default_user"
    # Block toggling built-in connectors — they are always active
    conns = get_user_connectors(user_id)
    for c in conns:
        if c.get("connector_key") == connector_key:
            cfg = c.get("config") or {}
            if isinstance(cfg, dict) and cfg.get("builtin"):
                raise HTTPException(status_code=400, detail="Built-in connectors cannot be toggled — they are always active.")
            break
    res = toggle_user_connector(
        connector_key=connector_key,
        status=payload.status,
        user_id=user_id,
        account_email=payload.account_email,
        config=payload.config,
    )
    return res


@router.post("/connectors/{connector_key}/test")
async def test_connector(connector_key: str, payload: ConnectorTestPayload):
    """
    Real connectivity test for an industrial data connector.
    - For HTTP/REST endpoints (Aspen IP21, SAP OData): sends a lightweight GET request.
    - For TCP/OPC UA endpoints (Honeywell DCS): opens a raw TCP socket connection.
    Returns {reachable, latency_ms, error}.
    """
    endpoint = (payload.endpoint or "").strip()
    if not endpoint:
        return {"reachable": False, "latency_ms": 0, "error": "No endpoint configured."}

    timeout_s = max(1, (payload.timeout_ms or 3000)) / 1000.0
    t0 = time.monotonic()

    try:
        if payload.connector_type in ("tcp", "opc_ua"):
            # TCP socket test (OPC UA, Modbus, raw TCP)
            clean = endpoint.replace("opc.tcp://", "").replace("tcp://", "")
            parts = clean.split(":")
            host = parts[0]
            port_str = parts[1].split("/")[0] if len(parts) > 1 else "4840"
            port = int(port_str) if port_str.isdigit() else 4840
            with socket.create_connection((host, port), timeout=timeout_s):
                pass
            latency_ms = int((time.monotonic() - t0) * 1000)
            return {"reachable": True, "latency_ms": latency_ms, "error": None}
        else:
            # HTTP REST test
            url = endpoint if endpoint.startswith("http") else f"http://{endpoint}"
            headers: Dict[str, str] = {"Accept": "application/json"}
            if payload.api_key:
                headers["Authorization"] = f"Bearer {payload.api_key}"
            resp = http_requests.get(url, headers=headers, timeout=timeout_s, allow_redirects=True)
            latency_ms = int((time.monotonic() - t0) * 1000)
            if resp.status_code < 500:
                return {"reachable": True, "latency_ms": latency_ms, "error": None, "status_code": resp.status_code}
            return {
                "reachable": False, "latency_ms": latency_ms,
                "error": f"Server returned HTTP {resp.status_code}",
                "status_code": resp.status_code,
            }

    except socket.timeout:
        return {"reachable": False, "latency_ms": int((time.monotonic() - t0) * 1000),
                "error": "Connection timed out — endpoint unreachable on local network."}
    except ConnectionRefusedError:
        return {"reachable": False, "latency_ms": int((time.monotonic() - t0) * 1000),
                "error": "Connection refused — service may not be running on that port."}
    except Exception as e:
        return {"reachable": False, "latency_ms": int((time.monotonic() - t0) * 1000), "error": str(e)}


# --------------------------------------------------------------------------------------
# Memory Files Endpoints
# --------------------------------------------------------------------------------------

@router.get("/memory")
async def get_memory_files(user_id: str = "default_user", category: Optional[str] = None):
    files = get_user_memory_files(user_id, category=category)
    return {"total": len(files), "memories": files}


@router.post("/memory")
async def create_memory_file(payload: MemoryFilePayload):
    user_id = payload.user_id or "default_user"
    return add_user_memory_file(
        user_id=user_id,
        title=payload.title,
        content=payload.content,
        category=payload.category or "general",
        is_sensitive=bool(payload.is_sensitive),
    )


@router.put("/memory/{memory_id}")
async def edit_memory_file(memory_id: int, payload: MemoryFilePayload):
    res = update_user_memory_file(
        memory_id=memory_id,
        title=payload.title,
        content=payload.content,
        category=payload.category,
        is_sensitive=payload.is_sensitive,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Memory file not found")
    return res


@router.delete("/memory/{memory_id}")
async def remove_memory_file(memory_id: int):
    ok = delete_user_memory_file(memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Memory file not found")
    return {"success": True, "deleted_id": memory_id}


@router.delete("/memory")
async def wipe_all_memory(user_id: str = "default_user"):
    clear_user_memory_files(user_id)
    return {"success": True, "message": "All user memory files cleared."}


# --------------------------------------------------------------------------------------
# Account Actions & Prompt Inspection
# --------------------------------------------------------------------------------------

@router.post("/account/delete")
async def delete_account(user_id: str = "default_user"):
    delete_user_account(user_id)
    return {"success": True, "message": "User account and associated memories reset to clean defaults."}


@router.get("/model-identity")
async def get_model_identity_prompt(user_id: str = "default_user"):
    prompt = build_zingo_identity_prompt(user_id)
    return {"user_id": user_id, "prompt": prompt}
