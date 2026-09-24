"""
ZINGO — Local Model Gateway
===========================
Every LLM call in ZINGO goes through this module. It exists for three reasons:

  1. There is exactly ONE network destination in the whole codebase: 127.0.0.1:11434.
  2. Every call is logged to `ollama_calls` — that table is the sovereignty proof.
  3. JSON-mode extraction with repair + retry, because industrial parsing needs strict JSON.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional

import requests

from data_layer import log_ollama_call

# The ONLY permitted network host in ZINGO.
OLLAMA_HOST = "http://127.0.0.1:11434"
GENERATE_ENDPOINT = f"{OLLAMA_HOST}/api/generate"
CHAT_ENDPOINT = f"{OLLAMA_HOST}/api/chat"
TAGS_ENDPOINT = f"{OLLAMA_HOST}/api/tags"

DEFAULT_MODEL = "qwen3:8b"

# Task-type routing. Falls back to DEFAULT_MODEL when the preferred model is not pulled.
TASK_MODEL_MAP = {
    "chat": "qwen3:8b",
    "general": "qwen3:4b",
    "fast": "qwen3:4b",
    "summary": "qwen3:4b",
    "extraction": "qwen3:4b",
    "document": "qwen3:8b",
    "analysis": "qwen3:8b",
    "code": "qwen2.5-coder:7b",
    "vision": "qwen2.5vl:3b",
}

_model_cache: Dict[str, Any] = {"models": [], "checked_at": 0.0}


class ModelUnavailable(RuntimeError):
    """Raised when the local Ollama node cannot be reached."""


def list_models(force: bool = False) -> List[str]:
    """Return locally pulled model tags (cached for 30s)."""
    now = time.time()
    if not force and _model_cache["models"] and now - _model_cache["checked_at"] < 30:
        return _model_cache["models"]
    try:
        r = requests.get(TAGS_ENDPOINT, timeout=4)
        models = [m.get("name") for m in r.json().get("models", [])] if r.ok else []
    except Exception:
        models = []
    _model_cache.update({"models": models, "checked_at": now})
    return models


def resolve_model(task_type: str = "chat", requested: Optional[str] = None) -> str:
    """Pick the best locally available model for a task type or requested identifier."""
    available = list_models()
    normalized_task = (task_type or "chat").lower()

    if requested:
        req_clean = requested.strip().lower()
        if not available:
            return requested
        if requested in available:
            return requested
        # Explicit 4b match
        if "4b" in req_clean:
            for m in available:
                if "4b" in m.lower():
                    return m
            return "qwen3:4b"
        # Fuzzy match for requested model variants (e.g. qwen2.5vl, qwen2.5-vl)
        for m in available:
            m_clean = m.lower()
            if req_clean in m_clean or m_clean.startswith(req_clean.split(":")[0]):
                return m
        if "vl" in req_clean or "vision" in req_clean:
            for m in available:
                if "vl" in m.lower() or "vision" in m.lower() or "llava" in m.lower():
                    return m

    # Vision / Multimodal routing
    if normalized_task == "vision":
        for m in available:
            if "vl" in m.lower() or "vision" in m.lower() or "llava" in m.lower():
                return m

    # Fast / general conversational routing -> prefer qwen3:4b
    if normalized_task in ("general", "fast", "summary", "extraction"):
        for m in available:
            if "4b" in m.lower():
                return m

    preferred = TASK_MODEL_MAP.get(normalized_task, DEFAULT_MODEL)
    if not available:
        return preferred
    if preferred in available:
        return preferred
    base = preferred.split(":")[0]
    for m in available:
        if m.startswith(base):
            return m
    return DEFAULT_MODEL if DEFAULT_MODEL in available else available[0]


def generate(prompt: str, system: Optional[str] = None, model: Optional[str] = None,
             feature: str = "core", task_type: str = "general", temperature: float = 0.2,
             json_mode: bool = False, num_predict: int = 1400,
             effort: Optional[str] = None, timeout: int = 240,
             images: Optional[List[str]] = None) -> str:
    """Single-shot completion against the local node. Supports multimodal vision payloads. Always audited."""
    resolved_task = "vision" if images and task_type == "general" else task_type
    model_name = resolve_model(resolved_task, model)

    options = {"temperature": temperature, "num_predict": num_predict, "top_p": 0.9}
    think_flag = False
    if effort:
        eff = effort.lower()
        if "max" in eff:
            options = {"temperature": 0.7, "num_predict": 8192, "top_p": 0.95}
            think_flag = True
        elif "deep" in eff or "reason" in eff or "research" in eff:
            options = {"temperature": 0.6, "num_predict": 4096, "top_p": 0.9}
            think_flag = True
        else:
            options = {"temperature": 0.2, "num_predict": 1024, "top_p": 0.8}
            think_flag = False

    payload: Dict[str, Any] = {
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "think": think_flag,
        "options": options,
        "keep_alive": -1,
    }
    if system:
        payload["system"] = system
    if json_mode:
        payload["format"] = "json"
    if images:
        payload["images"] = images

    started = time.perf_counter()
    try:
        r = requests.post(GENERATE_ENDPOINT, json=payload, timeout=timeout)
        r.raise_for_status()
        text = r.json().get("response", "") or ""
        duration = int((time.perf_counter() - started) * 1000)
        log_ollama_call(GENERATE_ENDPOINT, model_name, feature,
                        len(prompt) + len(system or ""), len(text), duration, True)
        return _strip_reasoning(text)
    except Exception as exc:
        duration = int((time.perf_counter() - started) * 1000)
        log_ollama_call(GENERATE_ENDPOINT, model_name, feature,
                        len(prompt) + len(system or ""), 0, duration, False)
        raise ModelUnavailable(f"Local model call failed: {exc}") from exc


def _strip_reasoning(text: str) -> str:
    """qwen3 emits <think>...</think> blocks; strip them from user-facing text."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


# --------------------------------------------------------------------------------------
# Strict JSON extraction
# --------------------------------------------------------------------------------------

def _extract_json_blob(text: str) -> Optional[str]:
    """Pull the first balanced JSON object/array out of a model response."""
    text = _strip_reasoning(text)
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    start = min([i for i in (text.find("{"), text.find("[")) if i != -1], default=-1)
    if start == -1:
        return None
    opener = text[start]
    closer = "}" if opener == "{" else "]"
    depth, in_str, esc = 0, False, False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return text[start:]


def _repair(blob: str) -> str:
    blob = blob.replace("“", '"').replace("”", '"').replace("’", "'")
    blob = re.sub(r",\s*([}\]])", r"\1", blob)              # trailing commas
    blob = re.sub(r"\bNone\b", "null", blob)
    blob = re.sub(r"\bTrue\b", "true", blob)
    blob = re.sub(r"\bFalse\b", "false", blob)
    # single-quoted keys/values -> double quoted (models love python dict style)
    if blob.count("'") > blob.count('"'):
        blob = re.sub(r"'([^'\\]*)'", r'"\1"', blob)
    return blob


def parse_json(text: str) -> Optional[Any]:
    blob = _extract_json_blob(text)
    if not blob:
        return None
    for candidate in (blob, _repair(blob)):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    return None


def generate_json(prompt: str, system: Optional[str] = None, model: Optional[str] = None,
                  feature: str = "core", task_type: str = "extraction",
                  default: Any = None, retries: int = 1, num_predict: int = 2000) -> Any:
    """Ask for JSON, parse it, and retry once with a stricter instruction on failure."""
    attempt_prompt = prompt
    last_raw = ""
    for attempt in range(retries + 1):
        try:
            raw = generate(attempt_prompt, system=system, model=model, feature=feature,
                           task_type=task_type, temperature=0.0 if attempt else 0.1,
                           json_mode=True, num_predict=num_predict)
        except ModelUnavailable:
            raise
        last_raw = raw
        parsed = parse_json(raw)
        if parsed is not None:
            return parsed
        attempt_prompt = (
            prompt
            + "\n\nYour previous answer was not valid JSON. "
              "Return ONLY the raw JSON value. No prose, no markdown fences, no explanation. "
              "Start your response with { or [ and end it with } or ]."
        )
    print(f"[ZINGO] JSON parse failed after retries. Raw head: {last_raw[:200]!r}")
    return default


def health() -> Dict[str, Any]:
    """Local node reachability + pulled models."""
    models = list_models(force=True)
    return {
        "ollama": "connected" if models else "disconnected",
        "host": OLLAMA_HOST,
        "available_models": models,
        "active_model": resolve_model("chat"),
        "external_hosts_configured": 0,
    }
