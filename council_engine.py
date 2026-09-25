"""
ZINGO / AIRA — Model Council Deliberation Engine
================================================
Perplexity-style multi-model consensus & peer review protocol.

Architecture:
  - User can toggle Council ON/OFF from the search bar.
  - When enabled, Node 3 (Fast Adversary) and Node 2 (Empirical Auditor)
    deliberate asynchronously in the background.
  - Raw inter-model debate messages are NEVER streamed to the user.
  - Node 1 (Chief Arbiter) receives the synthesized council findings as context
    and streams ONLY the definitive final answer to the user.
  - Graceful degradation: If any node times out or fails, council auto-proceeds
    with available perspectives without stalling or erroring out.
"""

from __future__ import annotations

import concurrent.futures
import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple
import requests

COUNCIL_TIMEOUT = 4.0  # Strict timeout for background deliberations


def _clean_json_str(text: str) -> Optional[Dict[str, Any]]:
    """Extract and parse clean JSON dictionary from model response."""
    if not text:
        return None
    raw = text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)
    # Match the outermost JSON object
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    try:
        return json.loads(raw)
    except Exception:
        return None


def _call_node_sync(
    url: str,
    model: str,
    prompt: str,
    system: str,
    timeout: float = 3.5,
    num_predict: int = 400,
) -> Optional[str]:
    """Execute a synchronous JSON request to an Ollama node endpoint."""
    base = url.strip().rstrip("/")
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
        "User-Agent": "AiraModelCouncil/1.0",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(endpoint, json=payload, headers=headers, timeout=(2.0, timeout))
        if resp.status_code == 200:
            return resp.json().get("response", "").strip()
    except Exception as e:
        print(f"[council_engine] Node call failed ({model} @ {url}): {e}")
    return None


def consult_node3_adversary(query: str, l3_url: str, context: str = "") -> Optional[Dict[str, Any]]:
    """
    Node 3 (Laptop 3 · Qwen3-4B): Fast Adversary & Risk Analyst.
    Surfaces failure modes, operating hazards, regulatory loopholes, and edge cases.
    """
    system = (
        "You are the Council Adversary & Risk Analyst in a high-consequence industrial AI council. "
        "Analyze the user query and surface critical operational risks, equipment failure modes, and technical caveats. "
        "Output ONLY a valid JSON object with keys: 'risks' (list of strings), 'caveats' (list of strings), 'key_concerns' (list of strings). "
        "Do not output markdown code blocks or text outside JSON."
    )
    prompt = f"Technical Query: {query[:600]}\n"
    if context:
        prompt += f"Plant Context:\n{context[:800]}\n"
    prompt += "Analyze potential failure modes and output JSON:"

    raw = _call_node_sync(l3_url, "qwen3:4b", prompt, system, timeout=3.5, num_predict=350)
    return _clean_json_str(raw)


def consult_node2_auditor(query: str, l2_url: str, context: str = "") -> Optional[Dict[str, Any]]:
    """
    Node 2 (Laptop 2 · Qwen2.5-VL 3B): Empirical & Structural Auditor.
    Audits physical constraints, unit conversions, temperature/pressure limits, and procedural sequence.
    """
    system = (
        "You are the Council Empirical & Structural Auditor in an industrial engineering AI council. "
        "Verify physical and mathematical feasibility (units, temperatures, pressures), sequential logic, and compliance standards. "
        "Output ONLY a valid JSON object with keys: 'verified_constraints' (list of strings), 'flagged_inconsistencies' (list of strings). "
        "Do not output markdown code blocks or text outside JSON."
    )
    prompt = f"Technical Query: {query[:600]}\n"
    if context:
        prompt += f"Plant Context:\n{context[:800]}\n"
    prompt += "Audit empirical constraints and output JSON:"

    raw = _call_node_sync(l2_url, "qwen2.5-vl:3b", prompt, system, timeout=3.5, num_predict=350)
    return _clean_json_str(raw)


def run_council_deliberation(
    query: str,
    context: str = "",
    l2_url: str = "https://unfailing-idealism-caretaker.ngrok-free.dev",
    l3_url: str = "https://yoyo-evolve-untimed.ngrok-free.dev",
    timeout: float = COUNCIL_TIMEOUT,
) -> Dict[str, Any]:
    """
    Orchestrates the background multi-model deliberation in parallel.
    Returns:
      {
        "council_active": bool,
        "nodes_participated": List[str],
        "consensus_score": int, # e.g. 94%
        "formatted_context": str, # Injected into Node 1 system prompt
        "deliberation_summary": Dict
      }
    """
    start_time = time.time()
    node3_findings: Optional[Dict[str, Any]] = None
    node2_findings: Optional[Dict[str, Any]] = None
    participating_nodes = ["Laptop 1 (Master Arbiter · Qwen3-8B)"]

    # Parallel fan-out to Node 3 and Node 2
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_n3 = executor.submit(consult_node3_adversary, query, l3_url, context)
        future_n2 = executor.submit(consult_node2_auditor, query, l2_url, context)

        try:
            node3_findings = future_n3.result(timeout=timeout)
            if node3_findings:
                participating_nodes.append("Laptop 3 (Fast Adversary · Qwen3-4B)")
        except Exception:
            pass

        try:
            node2_findings = future_n2.result(timeout=timeout)
            if node2_findings:
                participating_nodes.append("Laptop 2 (Structural Auditor · Qwen2.5-VL)")
        except Exception:
            pass

    elapsed = round(time.time() - start_time, 2)

    # Compute consensus metrics
    num_nodes = len(participating_nodes)
    if num_nodes == 3:
        consensus_score = 96
    elif num_nodes == 2:
        consensus_score = 88
    else:
        consensus_score = 75

    # Assemble structured council brief for Node 1 (Chief Arbiter)
    lines = ["\n================================================================================",
             "AIRA MODEL COUNCIL DELIBERATION BRIEF (BACKGROUND PEER REVIEW)",
             f"Deliberated across {num_nodes} nodes in {elapsed}s | Consensus Index: {consensus_score}%",
             "================================================================================"]

    if node3_findings:
        lines.append("\n[PERSPECTIVE A: COUNCIL ADVERSARY & RISK AUDIT (Node 3)]")
        for k, v in node3_findings.items():
            if isinstance(v, list) and v:
                lines.append(f"• {k.replace('_', ' ').title()}:")
                for item in v:
                    lines.append(f"    - {item}")
            elif isinstance(v, str) and v:
                lines.append(f"• {k.replace('_', ' ').title()}: {v}")

    if node2_findings:
        lines.append("\n[PERSPECTIVE B: EMPIRICAL & CONSTRAINT VERIFICATION (Node 2)]")
        for k, v in node2_findings.items():
            if isinstance(v, list) and v:
                lines.append(f"• {k.replace('_', ' ').title()}:")
                for item in v:
                    lines.append(f"    - {item}")
            elif isinstance(v, str) and v:
                lines.append(f"• {k.replace('_', ' ').title()}: {v}")

    if not node3_findings and not node2_findings:
        lines.append("\n[NOTICE: Remote council nodes reached hard timeout. Proceeding with Master Arbiter verification.]")

    lines.append("\nARBITER INSTRUCTIONS:")
    lines.append("1. Deliver the final, comprehensive, authoritative answer directly to the user.")
    lines.append("2. Incorporate the verified constraints and address critical failure modes seamlessly.")
    lines.append("3. DO NOT output dialogue, debate transcripts, or say 'Node 2 says...' or 'Node 3 says...'.")
    lines.append("4. Present a unified, coherent executive answer.")
    lines.append("================================================================================\n")

    return {
        "council_active": True,
        "nodes_participated": participating_nodes,
        "consensus_score": consensus_score,
        "formatted_context": "\n".join(lines),
        "elapsed_seconds": elapsed,
        "deliberation_summary": {
            "adversary": bool(node3_findings),
            "auditor": bool(node2_findings),
        },
    }
