"""
ZINGO — Plant-Aware Artifacts Router
====================================
Mounted at /api/artifacts
Exposes endpoints to query real plant context for equipment tags and
persist calculation sheet outputs back into the asset memory.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from data_layer import (
    save_artifact_state,
    get_artifact_state,
    save_equipment_memory,
    log_audit,
)
from plant_artifacts import (
    get_plant_context,
    get_plant_calculation_templates,
)

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])


class SaveArtifactStatePayload(BaseModel):
    equipment_tag: Optional[str] = None
    title: str
    state: Any
    project_id: Optional[str] = None
    saved_by: Optional[str] = "engineer"
    update_equipment_memory: bool = True


@router.get("/plant-context/{tag}")
async def fetch_plant_context(tag: str):
    """Retrieve full engineering context for an equipment tag from graph and DB."""
    try:
        return get_plant_context(tag)
    except Exception as exc:
        raise HTTPException(500, f"Failed to retrieve plant context for {tag}: {exc}")


@router.get("/templates")
async def list_plant_templates():
    """Retrieve plant-aware interactive calculation and simulation templates."""
    return {"templates": get_plant_calculation_templates()}


@router.get("/{artifact_id}/state")
async def fetch_artifact_state(artifact_id: str):
    """Retrieve previously saved calculation inputs and outputs for an artifact."""
    state = get_artifact_state(artifact_id)
    if not state:
        raise HTTPException(404, f"No saved state for artifact {artifact_id}")
    return state


@router.post("/{artifact_id}/save-state")
async def persist_artifact_state(artifact_id: str, payload: SaveArtifactStatePayload):
    """Save calculated results from an artifact and optionally write to equipment memory."""
    res = save_artifact_state(
        artifact_id=artifact_id,
        tag=payload.equipment_tag,
        title=payload.title,
        state=payload.state,
        saved_by=payload.saved_by,
        project_id=payload.project_id,
    )

    # If linked to an equipment tag and requested, update episodic memory
    if payload.update_equipment_memory and payload.equipment_tag and isinstance(payload.state, dict):
        tag = payload.equipment_tag.upper()
        for key, val in payload.state.items():
            if key not in ("inputs", "timestamp") and isinstance(val, (str, int, float, bool)):
                save_equipment_memory(
                    tag=tag,
                    memory_type="calculated_parameter",
                    key=str(key),
                    value=str(val),
                    source_doc_id=None,
                )

    log_audit("artifact_state_persisted", payload.saved_by or "engineer", None, "artifacts",
              {"artifact_id": artifact_id, "tag": payload.equipment_tag, "title": payload.title})

    return {"status": "saved", "artifact_id": artifact_id, "result": res}
