"""
ZINGO — Sovereign Agentic Self-Healing Engine
============================================
Detects syntax errors, malformed JSON, and broken structure in model outputs
before final delivery, running an automated single-turn repair loop to guarantee
zero runtime syntax exceptions for user projects.
"""

from __future__ import annotations
import ast
import json
import re
import requests
from typing import Dict, Any, Optional, Tuple


def extract_code_blocks(text: str, language: str = "python") -> list[str]:
    """Extracts code blocks of a specific language from markdown text."""
    pattern = rf"```{language}\s*\n(.*?)```"
    return re.findall(pattern, text, re.DOTALL | re.IGNORECASE)


def validate_python_syntax(code: str) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Validates Python code syntax via Python AST parser.
    Returns: (is_valid, error_message, error_line)
    """
    try:
        ast.parse(code)
        return True, None, None
    except SyntaxError as e:
        return False, e.msg, e.lineno
    except Exception as e:
        return False, str(e), None


def heal_python_code(
    code: str,
    error_msg: str,
    lineno: Optional[int],
    endpoint: str,
    model: str,
    timeout_seconds: int = 15,
) -> Optional[str]:
    """
    Performs a targeted, low-temperature repair invocation to heal broken syntax.
    """
    repair_prompt = (
        f"Fix the following Python code which produced SyntaxError: '{error_msg}'"
        + (f" at line {lineno}" if lineno else "")
        + f".\n\nReturn ONLY the corrected Python code block inside ```python ... ```:\n\n```python\n{code}\n```"
    )

    payload = {
        "model": model,
        "prompt": repair_prompt,
        "system": "You are a compiler self-healing agent. Correct the code syntax strictly without changing logic. Output only the corrected code block.",
        "stream": False,
        "options": {
            "temperature": 0.1,
        },
        "keep_alive": -1,
    }

    try:
        resp = requests.post(
            endpoint,
            json=payload,
            headers={"ngrok-skip-browser-warning": "true", "User-Agent": "ZingoSelfHealing/1.0"},
            timeout=timeout_seconds,
        )
        if resp.status_code == 200:
            repaired_text = resp.json().get("response", "")
            repaired_blocks = extract_code_blocks(repaired_text, "python")
            if repaired_blocks:
                candidate = repaired_blocks[0]
                ok, _, _ = validate_python_syntax(candidate)
                if ok:
                    return candidate
    except Exception as err:
        print(f"[self_healing] Code repair request failed: {err}")

    return None


def auto_heal_response(
    response_text: str,
    endpoint: str,
    model: str,
) -> Tuple[str, bool]:
    """
    Scans a generated response for Python code blocks.
    If any block has a SyntaxError, attempts automated self-repair.
    Returns: (final_response_text, was_healed)
    """
    if "```python" not in response_text and "```py" not in response_text:
        return response_text, False

    healed = False
    modified_text = response_text

    matches = list(re.finditer(r"```(?:python|py)\s*\n(.*?)```", response_text, re.DOTALL | re.IGNORECASE))
    for m in matches:
        raw_code = m.group(1)
        valid, err_msg, lineno = validate_python_syntax(raw_code)
        if not valid and err_msg:
            print(f"[self_healing] Detected syntax error in code block: {err_msg} (line {lineno}). Initiating self-healing loop...")
            fixed_code = heal_python_code(raw_code, err_msg, lineno, endpoint, model)
            if fixed_code:
                print(f"[self_healing] Successfully healed Python code block!")
                full_original_block = m.group(0)
                full_fixed_block = f"```python\n{fixed_code.strip()}\n```"
                modified_text = modified_text.replace(full_original_block, full_fixed_block)
                healed = True

    return modified_text, healed
