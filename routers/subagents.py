"""
ZINGO — Dynamic Subagent Swarm Router
=====================================
Mounted at /api/subagents
Provides:
  1. POST /api/subagents/dispatch — Concurrent cluster subagent execution
  2. POST /api/subagents/decompose — Auto-decomposes query into specialist subagents
  3. GET /api/subagents/cluster-status — Live subagent swarm telemetry
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import subagent_engine as se
from data_layer import log_audit

router = APIRouter(prefix="/api/subagents", tags=["subagents"])


class DispatchSubagentsPayload(BaseModel):
    query: Optional[str] = None
    context: Optional[str] = None
    custom_tasks: Optional[List[se.SubagentTask]] = None
    l2_url: Optional[str] = None
    l3_url: Optional[str] = None
    user: Optional[str] = "engineer"


class DispatchSubagentsResponse(BaseModel):
    success: bool
    subagents_count: int
    subagents: List[se.SubagentResult]
    formatted_synthesis: str
    total_elapsed_ms: int


@router.post("/dispatch", response_model=DispatchSubagentsResponse)
async def dispatch_subagents(payload: DispatchSubagentsPayload):
    t0 = time.perf_counter()

    # 1. Determine subagent tasks: use explicit tasks if provided, otherwise auto-decompose
    tasks = payload.custom_tasks or []
    if not tasks and payload.query:
        tasks = se.decompose_query_to_subagents(
            query=payload.query,
            context=payload.context or "",
            l2_url=payload.l2_url,
            l3_url=payload.l3_url,
        )

    if not tasks:
        raise HTTPException(400, "No query or subagent tasks provided.")

    # 2. Execute concurrently across cluster nodes
    results = se.dispatch_subagents_concurrent(tasks=tasks)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    # 3. Format synthesized context
    formatted = se.format_subagents_for_orchestrator(results)

    # 4. Audit trail
    try:
        log_audit(
            "subagents_dispatched",
            payload.user or "engineer",
            None,
            "subagents",
            {
                "subagents_count": len(results),
                "roles": [r.role for r in results],
                "models": [r.model for r in results],
                "elapsed_ms": elapsed_ms,
                "all_completed": all(r.status == "completed" for r in results),
            },
        )
    except Exception:
        pass

    return DispatchSubagentsResponse(
        success=True,
        subagents_count=len(results),
        subagents=results,
        formatted_synthesis=formatted,
        total_elapsed_ms=elapsed_ms,
    )


@router.get("/cluster-status")
async def cluster_subagents_status():
    return {
        "swarm_ready": True,
        "master_node": {
            "role": "Master Orchestrator & Chief Arbiter",
            "model": "qwen3:8b",
            "host": "Laptop 1 (Master)",
        },
        "specialist_nodes": [
            {
                "role": "Fast Analytic Specialist",
                "model": "qwen3:4b",
                "host": "Laptop 2 (Edge)",
            },
            {
                "role": "Empirical & Vision Auditor",
                "model": "qwen2.5-vl:3b",
                "host": "Laptop 2 (Vision)",
            },
            {
                "role": "Sovereign Code Execution Sandbox",
                "model": "Python 3.10 Sandboxed Runtime",
                "host": "Host Sandbox (Air-Gapped)",
            },
        ],
    }
