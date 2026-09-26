"""
ZINGO / AIRA — Autonomous Dynamic Subagent Swarm Engine
=======================================================
Enables the Master Orchestrator (Laptop 1 · Qwen3-8B) to autonomously
decompose complex, high-end multi-disciplinary engineering queries, spawn
specialized parallel subagents across cluster nodes (Laptop 2 · Qwen3-4B & Qwen2.5-VL),
and synthesize their findings into a unified, rigorous executive response.

Resilience & Guardrails:
  - Strict high-complexity task classification (regular coding, simple scripts,
    and single-domain questions are handled directly by the Master model).
  - Pre-flight circuit breaker: detects offline or unreachable cluster nodes
    and aborts subagent dispatch pre-flight with 0 delay.
  - Fail-safe synthesis: if any subagent fails or is offline, error messages
    are NEVER injected into the orchestrator prompt. Zero broken states.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple
import requests
from pydantic import BaseModel

DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:11434"
DEFAULT_LAPTOP2_VISION = "https://unfailing-idealism-caretaker.ngrok-free.dev"
DEFAULT_LAPTOP2_FAST4B = "https://yoyo-evolve-untimed.ngrok-free.dev"
SUBAGENT_TIMEOUT = 4.0  # Fast timeout to preserve interactive streaming speed

# Global circuit breaker cache: url -> (is_healthy, timestamp)
_node_health_cache: Dict[str, Tuple[bool, float]] = {}


def is_cluster_node_healthy(url: str, ttl_seconds: float = 30.0) -> bool:
    """
    Fast circuit breaker check with TTL cache to avoid stalling on dead/offline nodes.
    Prevents hangs when ngrok tunnels expire or remote laptops are disconnected.
    """
    if not url:
        return False
    if "127.0.0.1" in url or "localhost" in url:
        return True  # Loopback master node is always resident

    now = time.time()
    if url in _node_health_cache:
        healthy, ts = _node_health_cache[url]
        if now - ts < ttl_seconds:
            return healthy

    try:
        base = url.strip().rstrip("/")
        ping_url = f"{base}/api/tags"
        r = requests.get(
            ping_url,
            headers={"ngrok-skip-browser-warning": "true", "User-Agent": "ZingoHealth/1.0"},
            timeout=(0.8, 1.2),
        )
        is_ok = (r.status_code == 200)
        _node_health_cache[url] = (is_ok, now)
        return is_ok
    except Exception:
        _node_health_cache[url] = (False, now)
        return False


# Explicit user triggers requesting multi-agent swarm
EXPLICIT_SWARM_TRIGGERS = (
    "swarm", "subagent", "sub-agent", "subagents", "multi-agent", "multiagent",
    "agent team", "team of agents", "parallel agents", "dispatch agents",
    "specialist council", "multi-perspective", "delegate to subagents",
)

# High-complexity multi-disciplinary engineering domains requiring dual-perspective analysis
HIGH_COMPLEXITY_DOMAINS = (
    # Root Cause Failure & Metallurgical Investigation
    "root cause failure analysis", "root cause analysis", "rca investigation",
    "failure investigation", "metallurgical failure", "tube rupture investigation",
    "high temperature hydrogen attack", "htha assessment", "creep and fatigue analysis",
    # Refinery Revamp & Multi-Unit Optimization
    "plant revamp study", "crude assay switch revamp", "multi-unit optimization",
    "debottlenecking study", "furnace revamp", "column revamp study",
    # Process Safety, Relief Scenarios & HAZOP
    "hazop and sil", "sil verification study", "lopa analysis",
    "overpressure relief scenario", "psv sizing and hazop", "safety instrumented system verification",
    "fire case relief scenario", "two-phase relief sizing",
    # Coupled Thermo-Hydraulic & Metallurgy Degradation
    "naphthenic acid corrosion and fouling", "thermal hydraulic and stress analysis",
    "co-boiler tube stress and flue gas analysis", "amine stress corrosion cracking",
)


def is_high_complexity_subagent_task(query: str, effort: str = "") -> bool:
    """
    Strict classifier: Only returns True for genuine high-end, multi-domain engineering tasks
    or explicit subagent swarm requests.
    Regular coding, scripts, general questions, and single-topic queries are handled directly
    by the Master model.
    """
    if not query or len(query.strip()) < 25:
        return False

    q_low = query.lower().strip()

    # 1. Explicit request for subagents or swarm
    if any(k in q_low for k in EXPLICIT_SWARM_TRIGGERS):
        return True

    # 2. Exclude standard coding requests, scripts, greetings, or single-question prompts
    SIMPLE_CODING_PATTERNS = (
        "write a python script", "write a script", "write a code", "create a python",
        "write python", "write code", "how to write", "fix this code", "debug this",
        "write a function", "write a query", "create a table", "plot this",
        "what is", "explain how", "how does", "summarize",
    )
    if any(q_low.startswith(p) or f" {p}" in q_low for p in SIMPLE_CODING_PATTERNS):
        return False

    # 3. Check for specific high-end complex engineering domains
    if any(k in q_low for k in HIGH_COMPLEXITY_DOMAINS):
        return True

    # 4. If user selected 'Deep Research' or 'Max Effort' AND query crosses multiple disciplines
    eff_lower = (effort or "").lower()
    is_deep_effort = "deep" in eff_lower or "max" in eff_lower
    if is_deep_effort:
        has_thermal = any(k in q_low for k in ("heat duty", "lmtd", "exchanger", "thermodynamic", "reflux", "furnace", "cdu", "vdu"))
        has_metallurgy = any(k in q_low for k in ("metallurgy", "corrosion", "fouling", "sa-179", "sa-106", "api 571"))
        has_safety = any(k in q_low for k in ("hazop", "psv", "relief", "oisd-105", "sil", "interlock", "trip"))
        if sum([has_thermal, has_metallurgy, has_safety]) >= 2:
            return True

    return False


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

    resp = requests.post(endpoint, json=payload, headers=headers, timeout=(1.2, timeout))
    if resp.status_code == 200:
        data = resp.json()
        out = data.get("response", "").strip()
        eval_count = data.get("eval_count", len(out) // 4)
        return out, eval_count
    raise RuntimeError(f"HTTP {resp.status_code}")


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

    task_order = {t.id: i for i, t in enumerate(tasks)}
    results.sort(key=lambda r: task_order.get(r.id, 999))
    return results


def decompose_query_to_subagents(
    query: str,
    context: str = "",
    l2_url: Optional[str] = None,
    l3_url: Optional[str] = None,
    effort: str = "",
) -> List[SubagentTask]:
    """
    Decomposes HIGH-END engineering queries into specialized subagents.
    Returns empty list [] for regular tasks so the Master model handles them directly.
    """
    if not is_high_complexity_subagent_task(query, effort):
        return []

    node_l3 = (l3_url or DEFAULT_LAPTOP2_FAST4B).rstrip("/")
    node_l2 = (l2_url or DEFAULT_LAPTOP2_VISION).rstrip("/")

    # Pre-flight check: Are the cluster edge nodes actually online?
    l3_online = is_cluster_node_healthy(node_l3)
    l2_online = is_cluster_node_healthy(node_l2)

    if not l3_online and not l2_online:
        print("[subagents] Cluster edge nodes are offline. Aborting subagent swarm pre-flight.")
        return []

    clean_q = query.strip()
    q_lower = clean_q.lower()
    tasks: List[SubagentTask] = []

    # Domain 1: Thermal Hydraulic & Metallurgy Co-Analysis
    if any(k in q_lower for k in ("exchanger", "cdu", "vdu", "furnace", "corrosion", "metallurgy", "fouling", "temperature", "cot", "bundle", "tube")):
        if l3_online:
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
        if l2_online:
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

    # Domain 2: Process Control & Plant Safety (HAZOP/SIL)
    if any(k in q_lower for k in ("hazop", "safety", "psv", "relief", "interlock", "trip", "sil", "valve", "loop")):
        if l3_online:
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
        if l2_online:
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

    # Domain 3: Explicit Swarm Request — Multi-Perspective Operational & Standards Audit
    if any(k in q_lower for k in EXPLICIT_SWARM_TRIGGERS):
        if l3_online:
            tasks.append(
                SubagentTask(
                    id="sub-empirical",
                    role="Empirical Operational Specialist",
                    model="qwen3:4b",
                    node_url=node_l3,
                    prompt=f"Analyze operational constraints, plant experience, and precedent for: {clean_q}",
                    system_prompt="You are an Operations Superintendent. Provide field-grounded engineering considerations.",
                )
            )
        if l2_online:
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

    return []


def format_subagents_for_orchestrator(subagent_results: List[SubagentResult]) -> str:
    """
    Formats subagent findings into clean architectural context for the Chief Arbiter.
    STRICT FILTER: ONLY includes successfully completed subagents.
    Never pollutes the orchestrator prompt with error strings or failed outputs.
    """
    if not subagent_results:
        return ""

    successful = [
        r for r in subagent_results
        if r.status == "completed" and r.output and not r.output.startswith("[Subagent")
    ]
    if not successful:
        return ""

    blocks = ["=== DELEGATED CLUSTER SUBAGENT BRIEFINGS (PARALLEL DECOMPOSITION) ==="]
    for res in successful:
        status_label = f"[COMPLETED in {res.elapsed_ms}ms]"
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
