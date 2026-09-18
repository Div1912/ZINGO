"""
ZINGO — Behavioral Learning Router
==================================
Mounted at /api/learning
Exposes endpoints to query learned preferences, toggle rules, and view edit diffs.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from data_layer import (
    get_learned_preferences,
    toggle_learned_preference,
    get_engineer_edits,
)

router = APIRouter(prefix="/api/learning", tags=["learning"])


class TogglePreferencePayload(BaseModel):
    status: str  # ACTIVE, PROVISIONAL, DISABLED


@router.get("/preferences")
async def list_learned_preferences(
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """List all preferences learned from engineer sign-off diffs."""
    prefs = get_learned_preferences(project_id=project_id, status=status)
    active_count = len([p for p in prefs if p.get("status") == "ACTIVE"])
    return {
        "total": len(prefs),
        "active_count": active_count,
        "preferences": prefs,
    }


@router.post("/preferences/{pref_id}/toggle")
async def update_preference_status(pref_id: int, payload: TogglePreferencePayload):
    """Enable or disable a learned preference rule."""
    if payload.status not in ("ACTIVE", "PROVISIONAL", "DISABLED"):
        raise HTTPException(400, "Status must be ACTIVE, PROVISIONAL, or DISABLED")
    success = toggle_learned_preference(pref_id, payload.status)
    return {"id": pref_id, "status": payload.status, "success": success}


@router.get("/edits")
async def list_engineer_edits(
    item_type: Optional[str] = Query(None),
    item_id: Optional[int] = Query(None),
    limit: int = Query(50, le=200),
):
    """List raw diffs captured when engineers edited AI-drafted notes before signing."""
    edits = get_engineer_edits(item_type=item_type, item_id=item_id, limit=limit)
    return {"total": len(edits), "edits": edits}
