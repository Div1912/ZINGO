"""
ZINGO — Temporal Reasoning & Escalation Router
==============================================
Mounted at /api/temporal
Exposes endpoints to query chronological asset timelines and trigger escalation evaluations.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query

from data_layer import (
    get_incident_escalations,
    get_equipment_temporal_events,
)
from temporal_reasoning import (
    evaluate_temporal_escalations,
    build_temporal_chat_context,
)

router = APIRouter(prefix="/api/temporal", tags=["temporal"])


@router.get("/timeline/{tag}")
async def get_asset_timeline(tag: str):
    """Retrieve full chronological timeline across weeks for an asset."""
    events = get_equipment_temporal_events(tag)
    context_text = build_temporal_chat_context(tag)
    return {
        "equipment_tag": tag.upper(),
        "total_events": len(events),
        "events": events,
        "narrative_context": context_text,
    }


@router.get("/escalations")
async def list_escalations(
    equipment_tag: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """List all automated incident escalations."""
    escs = get_incident_escalations(equipment_tag=equipment_tag, status=status)
    return {
        "total": len(escs),
        "escalations": escs,
    }


@router.post("/evaluate/{tag}")
async def run_escalation_evaluation(tag: str):
    """Evaluate temporal SLA and degradation rules on-demand for an asset."""
    triggered = evaluate_temporal_escalations(tag)
    return {
        "equipment_tag": tag.upper(),
        "escalations_triggered": len(triggered),
        "details": triggered,
    }
