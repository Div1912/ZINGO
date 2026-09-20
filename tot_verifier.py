"""
ZINGO — Multi-Agent Tree-of-Thought (ToT) Test-Driven Verification Engine
========================================================================
Coordinates a multi-node cooperative pipeline:
  1. Node 2 (Fast Planner / QA Architect): Generates formal test specifications and edge-case assertions.
  2. Node 1 (Deep Synthesizer): Generates implementation code specifically satisfying test contracts.
  3. Client Browser Sandbox: Executes the tests in WebAssembly / Sandbox Realm.
  4. Self-Healing Loop: Auto-repairs failed assertions before user delivery.
"""

from __future__ import annotations

import json
import re
import time
import requests
from typing import Dict, Any, List, Optional, Tuple


def extract_json_payload(text: str) -> Optional[Dict[str, Any]]:
    """Extracts JSON object from markdown or raw text."""
    try:
        # Try direct parse
        return json.loads(text.strip())
    except Exception:
        pass

    # Search for JSON block
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass

    # Find curly braces
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            pass

    return None


def generate_test_specification(
    query: str,
    custom_node_url: Optional[str] = None,
    default_l2_url: str = "https://unfailing-idealism-caretaker.ngrok-free.dev",
) -> Optional[Dict[str, Any]]:
    """
    Queries Node 2 (qwen2.5-vl:3b worker) to generate a formal, executable test suite
    and edge-case contracts for the user's task in < 1 second.
    """
    if not query or len(query.strip()) < 15:
        return None

    complex_coding_keywords = (
        "create", "build", "code", "app", "function", "implement", "calculate",
        "algorithm", "validate", "convert", "parse", "component", "script",
        "pipeline", "class", "module", "discount", "cart", "todo"
    )
    q_low = query.lower()
    if not any(k in q_low for k in complex_coding_keywords):
        return None

    l2_base = (custom_node_url or default_l2_url).strip().rstrip("/")
    if l2_base.endswith("/api/generate"):
        l2_endpoint = l2_base
    elif l2_base.endswith("/api/chat"):
        l2_endpoint = l2_base.replace("/api/chat", "/api/generate")
    else:
        l2_endpoint = f"{l2_base}/api/generate"

    prompt = f"""Task: {query.strip()[:1000]}

Generate 3-4 strict automated unit tests and edge cases that any correct implementation of this task must satisfy.
Return ONLY valid JSON matching this schema:
{{
  "framework": "javascript",
  "test_cases": [
    {{"name": "test scenario 1", "assertion_code": "expect(fn(args)).toBe(expected)"}},
    {{"name": "test edge case 2", "assertion_code": "expect(fn(edge)).toBe(expected)"}}
  ]
}}"""

    payload = {
        "model": "qwen2.5-vl:3b",
        "prompt": prompt,
        "system": "You are an automated QA engineer. Output ONLY valid JSON test cases with executable assertion descriptions. No commentary, no explanations.",
        "stream": False,
        "options": {
            "num_predict": 220,
            "temperature": 0.1,
        },
        "keep_alive": -1,
    }

    try:
        t0 = time.time()
        resp = requests.post(
            l2_endpoint,
            json=payload,
            headers={"ngrok-skip-browser-warning": "true", "User-Agent": "ZingoToTVerifier/1.0"},
            timeout=(1.5, 3.5),
        )
        if resp.status_code == 200:
            raw_text = resp.json().get("response", "")
            parsed = extract_json_payload(raw_text)
            if parsed and "test_cases" in parsed and isinstance(parsed["test_cases"], list):
                elapsed_ms = int((time.time() - t0) * 1000)
                print(f"[tot_verifier] Node 2 generated {len(parsed['test_cases'])} test cases in {elapsed_ms}ms.")
                return parsed
    except Exception as err:
        print(f"[tot_verifier] Test specification generation skipped (non-critical): {err}")

    return None


def format_tot_instruction(test_spec: Dict[str, Any]) -> str:
    """Formats the generated test spec into clear verification instructions for Node 1."""
    test_cases = test_spec.get("test_cases", [])
    if not test_cases:
        return ""

    lines = [
        "\n[MANDATORY ARCHITECTURAL VERIFICATION SUITE]:",
        "Your implementation must strictly pass the following automated test cases and edge cases:",
    ]
    for i, tc in enumerate(test_cases, 1):
        name = tc.get("name", f"Test {i}")
        assertion = tc.get("assertion_code", "")
        lines.append(f"{i}. {name}: `{assertion}`")

    lines.append("Ensure your implementation provides the necessary functions, return types, and handles edge conditions gracefully.\n")
    return "\n".join(lines)
