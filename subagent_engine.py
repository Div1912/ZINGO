"""
ZINGO / AIRA — Autonomous Dynamic Subagent Swarm Engine
=======================================================
Enables the Master Orchestrator (Laptop 1 · Qwen3-8B) to autonomously
decompose complex engineering queries, spawn specialized parallel subagents
across cluster nodes (Laptop 2 · Qwen3-4B & Qwen2.5-VL), and synthesize
their findings into a unified, rigorous executive response.

Cluster Node Roles:
  - Primary / Orchestrator: Laptop 1 (Qwen3-8B)
  - Fast Analytic Specialist: Laptop 2 / Edge (Qwen3-4B)
  - Empirical & Vision Auditor: Laptop 2 (Qwen2.5-VL)
  - Code / Computational Specialist: Qwen2.5-Coder / Python Sandbox
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import re
import time
from typing import Any, Dict, List, Optional
import requests
from pydantic import BaseModel

DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:11434"
DEFAULT_LAPTOP2_VISION = "https://unfailing-idealism-caretaker.ngrok-free.dev"
DEFAULT_LAPTOP2_FAST4B = "https://yoyo-evolve-untimed.ngrok-free.dev"
SUBAGENT_TIMEOUT = 5.0  # Strict timeout to preserve interactive streaming speed


class SubagentTask(BaseModel):
    id: str
    role: str
    model: str = "qwen3:4b"
    prompt: str
    system_prompt: Optional[str] = None
    node_url: Optional[str] = None


class SubagentResult(BaseModel):
    id: str
    role: str
    model: str
    output: str
    status: str  # "completed" | "failed" | "timed_out"
    elapsed_ms: int
    tokens_used: int = 0


def _call_ollama_subagent(
    endpoint_url: str,
    model: str,
    prompt: str,
    system: str,
    timeout: float = SUBAGENT_TIMEOUT,
    num_predict: int = 350,
) -> Tuple[str, int]:
    """Calls a cluster Ollama node synchronously for a subagent."""
    base = endpoint_url.strip().rstrip("/")
    if base.endswith("/api/generate"):
        endpoint = base
    elif base.endswith("/api/chat"):
        endpoint = base.replace("/api/chat", "/api/generate")
    else:
        endpoint = f"{base}/api/generate"

    payload = {
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": False,
        "options": {
            "num_predict": num_predict,
            "temperature": 0.2,
        },
        "keep_alive": -1,
    }
    headers = {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "AiraSubagentSwarm/1.0",
        "Content-Type": "application/json",
    }

    resp = requests.post(endpoint, json=payload, headers=headers, timeout=(1.5, timeout))
    if resp.status_code == 200:
        data = resp.json()
        out = data.get("response", "").strip()
        eval_count = data.get("eval_count", len(out) // 4)
        return out, eval_count
    raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:100]}")


def execute_single_subagent(task: SubagentTask, default_url: str = DEFAULT_LOCAL_ENDPOINT) -> SubagentResult:
    """Executes a single subagent task against its resolved cluster node."""
    target_url = task.node_url or default_url
    system_prompt = task.system_prompt or (
        f"You are a specialized engineering subagent operating in the role of: {task.role}. "
        "Provide a direct, rigorous, highly technical assessment. Be concise (max 150 words). "
        "Do not include pleasantries, introductory remarks, or filler."
    )

    t0 = time.perf_counter()
    try:
        output, tokens = _call_ollama_subagent(
            endpoint_url=target_url,
            model=task.model,
            prompt=task.prompt,
            system=system_prompt,
            timeout=SUBAGENT_TIMEOUT,
        )
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return SubagentResult(
            id=task.id,
            role=task.role,
            model=task.model,
            output=output,
            status="completed",
            elapsed_ms=elapsed_ms,
            tokens_used=tokens,
        )
    except requests.Timeout:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return SubagentResult(
            id=task.id,
            role=task.role,
            model=task.model,
            output=f"[Subagent timed out after {SUBAGENT_TIMEOUT}s]",
            status="timed_out",
            elapsed_ms=elapsed_ms,
        )
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return SubagentResult(
            id=task.id,
            role=task.role,
            model=task.model,
            output=f"[Subagent error: {exc}]",
            status="failed",
            elapsed_ms=elapsed_ms,
        )


def dispatch_subagents_concurrent(
    tasks: List[SubagentTask],
    default_url: str = DEFAULT_LOCAL_ENDPOINT,
    max_workers: int = 4,
) -> List[SubagentResult]:
    """Dispatches multiple subagent tasks simultaneously across cluster nodes."""
    if not tasks:
        return []

    results: List[SubagentResult] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(tasks), max_workers)) as executor:
        future_map = {
            executor.submit(execute_single_subagent, task, default_url): task
            for task in tasks
        }
        for future in concurrent.futures.as_completed(future_map):
            try:
                res = future.result()
                results.append(res)
            except Exception as e:
                task = future_map[future]
                results.append(
                    SubagentResult(
                        id=task.id,
                        role=task.role,
                        model=task.model,
                        output=f"[Execution failure: {e}]",
                        status="failed",
                        elapsed_ms=0,
                    )
                )

    # Sort results by original task order
    task_order = {t.id: i for i, t in enumerate(tasks)}
    results.sort(key=lambda r: task_order.get(r.id, 999))
    return results


def decompose_query_to_subagents(
    query: str,
    context: str = "",
    l2_url: Optional[str] = None,
    l3_url: Optional[str] = None,
) -> List[SubagentTask]:
    """
    Analyzes user query and decomposes complex multi-domain problems
    into 2 specialized subagent tasks for parallel cluster dispatch.
    """
    clean_q = query.strip()
    if len(clean_q) < 20:
        return []

    node_l3 = (l3_url or DEFAULT_LAPTOP2_FAST4B).rstrip("/")
    node_l2 = (l2_url or DEFAULT_LAPTOP2_VISION).rstrip("/")

    q_lower = clean_q.lower()

    # Rule-based domain decomposition for instant, zero-latency subagent formulation:
    tasks: List[SubagentTask] = []

    # Case A: Thermal / Metallurgy / Mechanical Inspection
    if any(k in q_lower for k in ("exchanger", "cdu", "vdu", "furnace", "corrosion", "metallurgy", "fouling", "temperature", "cot", "bundle", "tube")):
        tasks.append(
            SubagentTask(
                id="sub-thermal",
                role="Thermal Hydraulic Analyst",
                model="qwen3:4b",
                node_url=node_l3,
                prompt=f"Analyze thermodynamic & fluid flow parameters for: {clean_q}\nProvide heat duty, LMTD, and pressure drop considerations.",
                system_prompt="You are a Senior Thermal Hydraulic Engineer. Provide crisp quantitative factors and operational limits.",
            )
        )
        tasks.append(
            SubagentTask(
                id="sub-metallurgy",
                role="Mechanical Integrity & Materials Specialist",
                model="qwen2.5-vl:3b",
                node_url=node_l2,
                prompt=f"Analyze metallurgy, fouling mechanisms, and OISD standards for: {clean_q}\nCheck SA-179/SA-106 metallurgy, naphthenic acid corrosion, and safe operating limits.",
                system_prompt="You are an Asset Integrity & Metallurgy Specialist. Cite material standards (API 571, OISD) concisely.",
            )
        )
        return tasks

    # Case B: Instrument / Control Loop / Process Safety
    if any(k in q_lower for k in ("valve", "transmitter", "safety", "psv", "pressure", "trip", "alarm", "sis", "interlock", "loop")):
        tasks.append(
            SubagentTask(
                id="sub-instrument",
                role="Instrumentation & Control Specialist",
                model="qwen3:4b",
                node_url=node_l3,
                prompt=f"Evaluate control loop dynamics, valve sizing (Cv), and sensor response for: {clean_q}",
                system_prompt="You are a Senior Automation & Control Engineer. Provide loop tuning, fail-safe states, and DCS alarm parameters.",
            )
        )
        tasks.append(
            SubagentTask(
                id="sub-safety",
                role="Process Safety & Hazop Lead",
                model="qwen2.5-vl:3b",
                node_url=node_l2,
                prompt=f"Perform Hazop risk screening and relief scenario analysis for: {clean_q}",
                system_prompt="You are a Process Safety Consultant. Highlight overpressure scenarios, SIL ratings, and OISD-105 compliance.",
            )
        )
        return tasks

    # Case C: Coding / Engineering Calculation / Optimization
    if any(k in q_lower for k in ("code", "script", "algorithm", "function", "calculate", "python", "optimization", "yield", "simulate")):
        tasks.append(
            SubagentTask(
                id="sub-architect",
                role="Computational Engineering Architect",
                model="qwen3:4b",
                node_url=node_l3,
                prompt=f"Formulate mathematical model and calculation steps for: {clean_q}",
                system_prompt="You are a Computational Engineer. Specify inputs, thermodynamic formulas, and expected numerical bounds.",
            )
        )
        tasks.append(
            SubagentTask(
                id="sub-qa",
                role="Edge-Case & Verification Auditor",
                model="qwen2.5-vl:3b",
                node_url=node_l2,
                prompt=f"Audit mathematical formulas and edge cases for: {clean_q}\nIdentify division-by-zero, extreme temperatures, or invalid thermodynamic states.",
                system_prompt="You are a Quality & Verification Specialist. Provide strict validation assertions and boundary conditions.",
            )
        )
        return tasks

    # Default Generalized Dual-Perspective Subagents
    tasks.append(
        SubagentTask(
            id="sub-empirical",
            role="Empirical Operational Specialist",
            model="qwen3:4b",
            node_url=node_l3,
            prompt=f"Analyze practical operational constraints, refinery field experience, and operational precedents for: {clean_q}",
            system_prompt="You are an Operations Superintendent. Provide field-grounded engineering considerations.",
        )
    )
    tasks.append(
        SubagentTask(
            id="sub-standards",
            role="Regulatory & Engineering Standards Auditor",
            model="qwen2.5-vl:3b",
            node_url=node_l2,
            prompt=f"Cross-reference OISD, API, and industrial safety standards for: {clean_q}",
            system_prompt="You are a Standards Compliance Officer. Cite relevant OISD, API, and statutory norms.",
        )
    )
    return tasks


def format_subagents_for_orchestrator(subagent_results: List[SubagentResult]) -> str:
    """Formats subagent findings into clean architectural context for the Chief Arbiter."""
    if not subagent_results:
        return ""

    blocks = ["=== DELEGATED CLUSTER SUBAGENT BRIEFINGS (PARALLEL DECOMPOSITION) ==="]
    for res in subagent_results:
        status_label = f"[{res.status.upper()} in {res.elapsed_ms}ms]"
        blocks.append(
            f"--- Subagent: {res.role} ({res.model}) {status_label} ---\n"
            f"{res.output}\n"
        )
    blocks.append(
        "=== SYNTHESIS INSTRUCTIONS FOR CHIEF ARBITER ===\n"
        "Synthesize the specialized findings above into your final response. "
        "Ground your calculations and recommendations in these specialist briefings, "
        "presenting a cohesive, authoritative, and unified engineering solution to the user."
    )
    return "\n\n".join(blocks)
