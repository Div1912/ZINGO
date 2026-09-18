"""
ZINGO — Claude-Grade User Settings & Identity Router
===================================================
Exposes endpoints for Profile, Capabilities, Permissions, Memory Files,
and Connectors. Synchronizes with local SQLite and powers real-time
LLM system prompt injection.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
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
    build_claude_identity_prompt,
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
    res = toggle_user_connector(
        connector_key=connector_key,
        status=payload.status,
        user_id=user_id,
        account_email=payload.account_email,
        config=payload.config,
    )
    return res


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
    prompt = build_claude_identity_prompt(user_id)
    return {"user_id": user_id, "prompt": prompt}
