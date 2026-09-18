"""
ZINGO — Chain of Thought Streaming Engine
==========================================
Replaces the original run_ollama_stream in server.py.

HOW IT WORKS:
Qwen3 natively wraps its thinking inside <think>...</think> tags when
think=True is passed. This parser reads the stream character by character,
routes <think> content as SSE type="thinking" events and everything outside
as type="chunk" events. The frontend renders them in separate UI zones.

SSE event types emitted:
  meta        — sent first, carries model/effort/sources metadata
  thinking_start — reasoning phase initiated
  thinking    — live reasoning token (inside <think> block)
  think_step  — emitted when a logical step boundary is detected
  thinking_end   — reasoning phase concluded
  chunk       — final answer token (outside <think> block)
  context     — RAG sources metadata
  done        — stream complete, carries eval_count, elapsed_ms, think_steps
  error       — something went wrong
"""

import json
from datetime import datetime
from typing import Any, Dict, Generator, List, Optional
import requests

try:
    from data_layer import log_ollama_call as default_log_ollama_call
except ImportError:
    default_log_ollama_call = None

try:
    import llm
    DEFAULT_ENDPOINT = llm.GENERATE_ENDPOINT
    DEFAULT_MODEL = llm.DEFAULT_MODEL
except ImportError:
    DEFAULT_ENDPOINT = "http://127.0.0.1:11434/api/generate"
    DEFAULT_MODEL = "qwen3:8b"


# ---------------------------------------------------------------------------
# Step boundary detector
# ---------------------------------------------------------------------------

def _detect_step_boundaries(thinking_buffer: str):
    """
    Split accumulated thinking text into logical steps sequentially.
    A step boundary is: double newline, or transition from sentence to new
    capitalised sentence starting with a reasoning marker word.
    Returns (steps_found, remaining_buffer).
    """
    markers = [
        "\n\n",
        "\nStep ", "\nFirst", "\nSecond", "\nThird", "\nNext",
        "\nNow", "\nSo ", "\nTherefore", "\nHowever", "\nChecking",
        "\nAnalysing", "\nAnalyzing", "\nLooking", "\nConclusion",
        "\nFinally", "\nBased on", "\nGiven that",
    ]
    steps = []
    remaining = thinking_buffer

    while True:
        earliest_idx = -1
        matched_marker = None
        for marker in markers:
            idx = remaining.find(marker)
            if idx != -1:
                if earliest_idx == -1 or idx < earliest_idx:
                    earliest_idx = idx
                    matched_marker = marker

        if matched_marker is not None and earliest_idx != -1:
            part = remaining[:earliest_idx].strip()
            if part:
                steps.append(part)
            if matched_marker == "\n\n":
                remaining = remaining[earliest_idx + len(matched_marker):]
            else:
                # Keep the marker keyword at the start of the next step
                remaining = remaining[earliest_idx + 1:].strip()
        else:
            break

    return steps, remaining


# ---------------------------------------------------------------------------
# Core CoT streaming generator
# ---------------------------------------------------------------------------

def run_ollama_stream_cot(
    payload: Dict[str, Any],
    context: str = "",
    sources: Optional[List[Dict[str, Any]]] = None,
    feature: str = "chat",
    log_ollama_call=None,
) -> Generator[str, None, None]:
    """
    Stream SSE events from Ollama with full chain-of-thought separation.
    Replaces original run_ollama_stream.
    """
    if log_ollama_call is None:
        log_ollama_call = default_log_ollama_call

    started = datetime.now()
    endpoint = payload.get("_endpoint", DEFAULT_ENDPOINT)
    model_name = payload.get("model", DEFAULT_MODEL)
    effort = payload.get("_effort", "Fast")
    think_enabled = payload.get("think", False)

    # ── Meta event ──────────────────────────────────────────────────────────
    meta_payload = {
        "type": "meta",
        "ocr_context_found": bool(context),
        "context_length": len(context),
        "model": model_name,
        "sources": sources or [],
        "effort": effort,
        "node_endpoint": endpoint,
        "thinking_enabled": bool(think_enabled),
    }
    yield f"data: {json.dumps(meta_payload)}\n\n"

    if context:
        yield f"data: {json.dumps({'type': 'context', 'context_length': len(context), 'sources': sources or []})}\n\n"

    # ── Connect to Ollama with cluster failover ──────────────────────────────
    clean_payload = {k: v for k, v in payload.items() if not k.startswith("_")}
    req = None

    try:
        try:
            req = requests.post(
                endpoint,
                json=clean_payload,
                stream=True,
                timeout=10 if endpoint != DEFAULT_ENDPOINT else 600,
            )
            req.raise_for_status()
        except Exception as remote_err:
            if clean_payload.get("model") != DEFAULT_MODEL or endpoint != DEFAULT_ENDPOINT:
                print(f"[cluster/model fallback] Error with model {clean_payload.get('model')} at {endpoint}: {remote_err}. Falling back to {DEFAULT_MODEL}.")
                clean_payload["model"] = DEFAULT_MODEL
                model_name = DEFAULT_MODEL
                endpoint = DEFAULT_ENDPOINT
                req = requests.post(
                    endpoint,
                    json=clean_payload,
                    stream=True,
                    timeout=600,
                )
                req.raise_for_status()
            else:
                raise remote_err
    except Exception as e:
        elapsed_ms = int((datetime.now() - started).total_seconds() * 1000)
        if log_ollama_call:
            try:
                log_ollama_call(endpoint, model_name, feature, len(clean_payload.get("prompt", "")), 0, elapsed_ms, False)
            except Exception:
                pass
        yield f"data: {json.dumps({'type': 'error', 'error': str(e), 'done': True})}\n\n"
        return

    # ── Parse stream ─────────────────────────────────────────────────────────
    in_think_block = False          # Are we inside <think>...</think>?
    is_dedicated_thinking = False   # Is Ollama streaming via dedicated 'thinking' field?
    think_buf = ""                  # Accumulates current thinking text
    answer_buf = ""                 # Accumulates final answer text
    char_buf = ""                   # Raw character buffer for tag detection
    total_tokens = 0
    think_step_count = 0

    OPEN_TAG = "<think>"
    CLOSE_TAG = "</think>"
    open_idx = 0
    close_idx = 0

    def flush_think_buf(buf: str, force: bool = False):
        nonlocal think_step_count
        if not buf.strip():
            return "", []

        steps, remaining = _detect_step_boundaries(buf)
        events = []

        for step in steps:
            if step.strip():
                think_step_count += 1
                events.append(json.dumps({
                    "type": "think_step",
                    "step_number": think_step_count,
                    "content": step.strip(),
                }))

        if force and remaining.strip():
            think_step_count += 1
            events.append(json.dumps({
                "type": "think_step",
                "step_number": think_step_count,
                "content": remaining.strip(),
            }))
            remaining = ""

        return remaining, events

    with req as response:
        for line in response.iter_lines():
            if not line:
                continue

            try:
                raw = line.decode("utf-8") if isinstance(line, (bytes, bytearray)) else line
                data = json.loads(raw)
            except Exception:
                continue

            chunk_text = data.get("response", "")
            dedicated_thinking = data.get("thinking", "")
            done = bool(data.get("done"))
            total_tokens = data.get("eval_count", total_tokens)

            # Handle dedicated thinking field if Ollama returns it directly
            if dedicated_thinking:
                if not is_dedicated_thinking:
                    is_dedicated_thinking = True
                    in_think_block = True
                    yield f"data: {json.dumps({'type': 'thinking_start', 'message': 'Reasoning...'})}\n\n"
                think_buf += dedicated_thinking
                yield f"data: {json.dumps({'type': 'thinking', 'chunk': dedicated_thinking})}\n\n"
                if len(think_buf) > 100:
                    think_buf, events = flush_think_buf(think_buf, force=False)
                    for ev in events:
                        yield f"data: {ev}\n\n"
                continue

            # If we were in dedicated thinking and now received non-empty response text,
            # conclude the dedicated thinking phase before streaming the answer
            if is_dedicated_thinking and chunk_text:
                is_dedicated_thinking = False
                in_think_block = False
                think_buf, events = flush_think_buf(think_buf, force=True)
                for ev in events:
                    yield f"data: {ev}\n\n"
                yield f"data: {json.dumps({'type': 'thinking_end', 'total_steps': think_step_count})}\n\n"

            # Fast-path: When outside thinking tags and no partial tag match, stream entire token chunk
            if not in_think_block and open_idx == 0 and OPEN_TAG not in chunk_text and "<" not in chunk_text:
                answer_buf += chunk_text
                yield f"data: {json.dumps({'type': 'chunk', 'chunk': chunk_text, 'done': False})}\n\n"
                continue

            # Process character-by-character for inline <think> tags
            for char in chunk_text:
                char_buf += char

                if not in_think_block:
                    if OPEN_TAG[open_idx] == char:
                        open_idx += 1
                        if open_idx == len(OPEN_TAG):
                            in_think_block = True
                            open_idx = 0
                            yield f"data: {json.dumps({'type': 'thinking_start', 'message': 'Reasoning...'})}\n\n"
                            char_buf = ""
                    else:
                        if open_idx > 0:
                            emit_text = OPEN_TAG[:open_idx]
                            answer_buf += emit_text
                            yield f"data: {json.dumps({'type': 'chunk', 'chunk': emit_text, 'done': False})}\n\n"
                            open_idx = 0

                        answer_buf += char
                        yield f"data: {json.dumps({'type': 'chunk', 'chunk': char, 'done': False})}\n\n"
                        char_buf = ""

                else:
                    if CLOSE_TAG[close_idx] == char:
                        close_idx += 1
                        if close_idx == len(CLOSE_TAG):
                            in_think_block = False
                            close_idx = 0
                            think_buf, events = flush_think_buf(think_buf, force=True)
                            for ev in events:
                                yield f"data: {ev}\n\n"
                            yield f"data: {json.dumps({'type': 'thinking_end', 'total_steps': think_step_count})}\n\n"
                            char_buf = ""
                    else:
                        if close_idx > 0:
                            partial = CLOSE_TAG[:close_idx]
                            think_buf += partial
                            yield f"data: {json.dumps({'type': 'thinking', 'chunk': partial})}\n\n"
                            close_idx = 0

                        think_buf += char
                        yield f"data: {json.dumps({'type': 'thinking', 'chunk': char})}\n\n"

                        if len(think_buf) > 100:
                            think_buf, events = flush_think_buf(think_buf, force=False)
                            for ev in events:
                                yield f"data: {ev}\n\n"

                        char_buf = ""

            if done:
                break

    # ── Final flush ──────────────────────────────────────────────────────────
    if in_think_block:
        yield f"data: {json.dumps({'type': 'thinking_end', 'total_steps': think_step_count})}\n\n"

    if think_buf.strip():
        _, events = flush_think_buf(think_buf, force=True)
        for ev in events:
            yield f"data: {ev}\n\n"

    if sources:
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources, 'done': False})}\n\n"

    elapsed_ms = int((datetime.now() - started).total_seconds() * 1000)

    yield f"data: {json.dumps({'type': 'done', 'done': True, 'eval_count': total_tokens, 'elapsed_ms': elapsed_ms, 'think_steps': think_step_count, 'answer_length': len(answer_buf)})}\n\n"

    # ── Log call ─────────────────────────────────────────────────────────────
    if log_ollama_call:
        try:
            log_ollama_call(
                endpoint,
                model_name,
                feature,
                len(clean_payload.get("prompt", "")),
                len(answer_buf),
                elapsed_ms,
                True,
            )
        except Exception:
            try:
                log_ollama_call(
                    endpoint=endpoint,
                    model=model_name,
                    prompt_length=len(clean_payload.get("prompt", "")),
                    response_length=len(answer_buf),
                    duration_ms=elapsed_ms,
                    feature=feature,
                )
            except Exception:
                pass
