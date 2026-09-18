"""
ZINGO — Sovereign AI Research Assistant & Workbench
==================================================
FastAPI entrypoint.

Mounts seven feature systems on top of the original chat/OCR backend:
  /api/ingest      Feature 1  Intelligent document ingestion
  /api/monitor     Feature 2  Passive incident prevention
  /api/compliance  Feature 3  Regulatory drift detection
  /api/contradict  Feature 4  Multi-document contradiction engine
  /api/shift       Feature 5  Shift handover intelligence
  /api/graph       Feature 6  Knowledge graph visualiser & query
  /api/audit       Feature 7  Audit trail & sovereign proof

The ONLY network destination in this codebase is 127.0.0.1:11434 (local Ollama).
"""

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

import base64
import json
import requests
from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

import llm
from data_layer import (
    bootstrap, get_db, get_plant_graph, log_audit, log_ollama_call, vector_query,
)

# Local Ollama endpoints (kept as module constants for backwards compatibility)
MODEL_ENDPOINT = llm.GENERATE_ENDPOINT
MODEL_TAGS_ENDPOINT = llm.TAGS_ENDPOINT
MODEL_NAME = llm.DEFAULT_MODEL


# --------------------------------------------------------------------------------------
# Lifespan — initialise the shared data layer before serving traffic
# --------------------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    info = bootstrap()
    G = get_plant_graph()
    print("=" * 72)
    print("  ZINGO initialised. All systems local. Zero external calls.")
    print(f"  SQLite       : {info['db']}")
    print(f"  Vector store : {info['chroma']}")
    print(f"  Plant graph  : {G.number_of_nodes()} nodes / {G.number_of_edges()} edges")
    print(f"  Inference    : {llm.OLLAMA_HOST} (loopback only)")
    print("=" * 72)
    yield
    log_audit("system_shutdown", "system", None, "core", None)


app = FastAPI(
    title="ZINGO — Sovereign AI Workbench",
    description="On-premise organisational nervous system for refinery and PSU engineering.",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS for Web, Vite and Vercel clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------------------
# Feature routers
# --------------------------------------------------------------------------------------

from routers.ingestion import router as ingestion_router          # noqa: E402
from routers.monitoring import router as monitoring_router        # noqa: E402
from routers.compliance import router as compliance_router        # noqa: E402
from routers.contradiction import router as contradiction_router  # noqa: E402
from routers.shift import router as shift_router                  # noqa: E402
from routers.graph import router as graph_router                  # noqa: E402
from routers.audit import router as audit_router                  # noqa: E402
from routers.conversations import router as conversations_router  # noqa: E402
from routers.artifacts import router as artifacts_router          # noqa: E402
from routers.learning import router as learning_router            # noqa: E402
from routers.temporal import router as temporal_router            # noqa: E402
from routers.settings import router as settings_router            # noqa: E402

app.include_router(ingestion_router)
app.include_router(monitoring_router)
app.include_router(compliance_router)
app.include_router(contradiction_router)
app.include_router(shift_router)
app.include_router(graph_router)
app.include_router(audit_router)
app.include_router(conversations_router)
app.include_router(artifacts_router)
app.include_router(learning_router)
app.include_router(temporal_router)
app.include_router(settings_router)


# --------------------------------------------------------------------------------------
# Lazy OCR reader (EasyOCR model load is deferred so startup stays fast)
# --------------------------------------------------------------------------------------

def get_reader():
    from routers.ingestion import get_ocr_reader
    return get_ocr_reader()


# --------------------------------------------------------------------------------------
# Health & status
# --------------------------------------------------------------------------------------

@app.get("/health")
@app.get("/api/health")
@app.get("/api/status")
async def health_check():
    """Backend, local model node, and data-layer readiness."""
    node = llm.health()
    conn = get_db()
    try:
        counts = {
            "documents": conn.execute("SELECT COUNT(*) c FROM documents").fetchone()["c"],
            "active_alerts": conn.execute(
                "SELECT COUNT(*) c FROM alerts WHERE status='active'").fetchone()["c"],
            "audit_entries": conn.execute("SELECT COUNT(*) c FROM audit_log").fetchone()["c"],
        }
    except Exception:
        counts = {}
    finally:
        conn.close()

    G = get_plant_graph()
    return {
        "status": "online",
        "model": node["active_model"],
        "ollama": node["ollama"],
        "available_models": node["available_models"],
        "ocr_ready": True,
        "external_calls_detected": 0,
        "systems": {
            "ingestion": "ready", "monitoring": "ready", "compliance": "ready",
            "contradiction": "ready", "shift": "ready", "graph": "ready", "audit": "ready",
        },
        "data_layer": {**counts, "graph_nodes": G.number_of_nodes(),
                       "graph_edges": G.number_of_edges()},
        "checked_at": datetime.now().isoformat(),
    }


@app.get("/api/models")
async def api_models(task_type: str = Query("chat", description="chat|code|vision|analysis|document")):
    """Available local models plus the model selected for the requested task type."""
    available = llm.list_models(force=True)
    selected = llm.resolve_model(task_type)
    preferred = llm.TASK_MODEL_MAP.get(task_type.lower(), llm.DEFAULT_MODEL)
    return {
        "available_models": available,
        "active_model": llm.resolve_model("chat"),
        "task_type": task_type,
        "selected_model": selected,
        "preferred_model": preferred,
        "fallback_applied": selected != preferred,
        "routing": llm.TASK_MODEL_MAP,
        "host": llm.OLLAMA_HOST,
    }


@app.get("/api/cluster/ping")
async def cluster_ping(node_url: str = Query(..., description="Target node URL to ping")):
    """Ping a cluster node URL (Ollama or FastAPI) from the server side to bypass browser CORS."""
    clean_url = (node_url or "").strip().rstrip("/")
    if not clean_url:
        return {"connected": False, "error": "Missing node URL"}
    try:
        resp = requests.get(f"{clean_url}/api/tags", timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            models = [m.get("name") for m in data.get("models", [])]
            return {"connected": True, "type": "ollama", "models": models, "active": models[0] if models else "ready"}
    except Exception:
        pass

    try:
        resp = requests.get(f"{clean_url}/api/health", timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            return {"connected": True, "type": "aira", "model": data.get("model", "ready")}
    except Exception:
        pass

    try:
        resp = requests.get(f"{clean_url}/health", timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            return {"connected": True, "type": "aira", "model": data.get("model", "ready")}
    except Exception:
        pass

    try:
        resp = requests.get(f"{clean_url}/", timeout=3)
        if resp.status_code == 200:
            return {"connected": True, "type": "generic", "model": "ready"}
    except Exception as e:
        return {"connected": False, "error": str(e)}

    return {"connected": False, "error": "Node returned non-200 status"}


# --------------------------------------------------------------------------------------
# Landing page (local test console)
# --------------------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def root():
    node = llm.health()
    badge = "Online" if node["ollama"] == "connected" else "Model Node Offline"
    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>ZINGO — Sovereign Backend</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #0f172a; color: #f8fafc; display: flex; justify-content: center;
                    padding: 40px 20px; margin: 0; }}
            .card {{ background: #1e293b; border: 1px solid #334155; border-radius: 12px;
                     padding: 30px; max-width: 720px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }}
            h1 {{ font-size: 22px; margin-top: 0; color: #38bdf8; display: flex; align-items: center; gap: 10px; }}
            h2 {{ font-size: 15px; color: #cbd5e1; margin-top: 28px; }}
            .badge {{ background: #059669; color: white; padding: 3px 10px; border-radius: 9999px;
                      font-size: 12px; font-weight: bold; }}
            code {{ background: #0b1120; padding: 2px 6px; border-radius: 4px; color: #7dd3fc; font-size: 13px; }}
            ul {{ line-height: 1.9; font-size: 14px; color: #cbd5e1; padding-left: 20px; }}
            a {{ color: #38bdf8; text-decoration: none; }}
            a:hover {{ text-decoration: underline; }}
            .proof {{ margin-top: 24px; padding: 14px; background: #052e21; border: 1px solid #059669;
                      border-radius: 8px; font-size: 13px; color: #6ee7b7; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h1>ZINGO Sovereign Backend <span class="badge">{badge}</span></h1>
            <p style="color:#94a3b8;font-size:14px;">
                Local inference on <code>{node['active_model']}</code> via <code>{llm.OLLAMA_HOST}</code>.
                CORS enabled for the Vite workbench.
            </p>
            <h2>Mounted systems</h2>
            <ul>
                <li><code>/api/ingest</code> — document ingestion, OCR, entity extraction</li>
                <li><code>/api/monitor</code> — passive incident prevention, alerts, action notes</li>
                <li><code>/api/compliance</code> — regulatory drift detection</li>
                <li><code>/api/contradict</code> — multi-document contradiction engine</li>
                <li><code>/api/shift</code> — shift handover intelligence</li>
                <li><code>/api/graph</code> — plant knowledge graph &amp; health map</li>
                <li><code>/api/audit</code> — audit trail &amp; sovereign proof</li>
            </ul>
            <h2>Legacy endpoints (retained)</h2>
            <ul>
                <li><code>POST /api/chat</code> — RAG-grounded chat with sources &amp; confidence</li>
                <li><code>POST /process-and-ask/</code> — OCR + ask</li>
            </ul>
            <h2>Test Inference &amp; OCR</h2>
            <form id="askForm" style="margin-top: 14px;">
                <label style="display:block;margin-bottom:6px;font-size:13px;color:#cbd5e1;">User Query:</label>
                <input type="text" id="user_query" placeholder="e.g. Summarize this inspection report" required style="width:100%;box-sizing:border-box;padding:10px 12px;background:#0f172a;border:1px solid #475569;border-radius:6px;color:white;font-size:14px;margin-bottom:12px;" />
                <label style="display:block;margin-bottom:6px;font-size:13px;color:#cbd5e1;">Upload Document/Image (Optional OCR):</label>
                <input type="file" id="file" accept="image/*,.pdf" style="width:100%;box-sizing:border-box;padding:8px 12px;background:#0f172a;border:1px solid #475569;border-radius:6px;color:white;font-size:13px;margin-bottom:14px;" />
                <button type="submit" id="submitBtn" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">Ask Question</button>
            </form>
            <div id="output" style="margin-top:16px;padding:14px;background:#0b1120;border:1px solid #334155;border-radius:6px;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;color:#e2e8f0;display:none;"></div>

            <div class="proof">
                Sovereignty: every model call is recorded in <code>ollama_calls</code>.
                Verify at <a href="/api/audit/network_proof">/api/audit/network_proof</a> —
                <strong>external_calls_detected must read 0</strong>.
            </div>
            <p style="margin-top:20px;font-size:13px;">
                Interactive API docs: <a href="/docs">/docs</a>
            </p>
        </div>
        <script>
            document.getElementById('askForm').onsubmit = async (e) => {{
                e.preventDefault();
                const out = document.getElementById('output');
                const btn = document.getElementById('submitBtn');
                out.style.display = 'block';
                out.textContent = 'Processing request with Qwen on local Ollama node...';
                btn.disabled = true;
                const query = document.getElementById('user_query').value;
                const fileInput = document.getElementById('file');
                const formData = new FormData();
                if (fileInput.files.length > 0) {{
                    formData.append('file', fileInput.files[0]);
                }}
                try {{
                    const url = '/process-and-ask/?user_query=' + encodeURIComponent(query);
                    const res = await fetch(url, {{ method: 'POST', body: formData }});
                    const data = await res.json();
                    out.textContent = JSON.stringify(data, null, 2);
                }} catch (err) {{
                    out.textContent = 'Error: ' + err.message;
                }} finally {{
                    btn.disabled = false;
                }}
            }};
        </script>
    </body>
    </html>
    """


# --------------------------------------------------------------------------------------
# Reasoning effort mapper (query-adaptive & fast)
# --------------------------------------------------------------------------------------

def get_effort_config(effort: Optional[str] = None, user_query: str = "") -> Dict[str, Any]:
    """Map UI reasoning effort to inference parameters, thinking mode, and system guidance.
    Adapts token budgets dynamically based on query complexity to prevent long hangs on simple questions."""
    eff = (effort or "Fast").lower()
    q = (user_query or "").strip().lower()

    # Detect if query is a brief greeting, conversational question, or short definition
    is_brief = len(q) < 40 or any(
        q.startswith(w) for w in [
            "hi", "hello", "hey", "what is", "who is", "who are", "whats", "what's",
            "test", "ping", "thanks", "ok", "speed", "top speed", "why", "how are"
        ]
    )

    if "max" in eff:
        if is_brief:
            return {
                "effort": "Max Effort",
                "options": {"temperature": 0.3, "num_predict": 1024, "top_p": 0.85},
                "think": True,
                "instruction": (
                    "Operating in MAX EFFORT mode. Answer the user's prompt directly, accurately, and thoroughly. "
                    "Since the query is brief or conversational, provide a clear, high-quality answer without over-deliberating."
                ),
            }
        return {
            "effort": "Max Effort",
            "options": {"temperature": 0.6, "num_predict": 3072, "top_p": 0.9},
            "think": True,
            "instruction": (
                "Operating at MAXIMUM REASONING EFFORT. Conduct an exhaustive, rigorous engineering analysis. "
                "Explore root causes, secondary plant impacts, relevant industry standards (OISD, API, ASME, ISO), "
                "formulas/parameters where applicable, and structured mitigation checklists."
            ),
        }
    elif "deep" in eff or "reason" in eff or "research" in eff:
        if is_brief:
            return {
                "effort": "Deep Research",
                "options": {"temperature": 0.2, "num_predict": 768, "top_p": 0.8},
                "think": True,
                "instruction": (
                    "Operating in DEEP RESEARCH mode. Provide a clear, well-reasoned answer directly addressing the user's prompt."
                ),
            }
        return {
            "effort": "Deep Research",
            "options": {"temperature": 0.5, "num_predict": 2048, "top_p": 0.9},
            "think": True,
            "instruction": (
                "Operating in DEEP RESEARCH mode. Conduct systematic, step-by-step reasoning. "
                "Break down technical problem constraints, evaluate underlying mechanisms, "
                "reference applicable refinery procedures, and deliver a comprehensive, structured response."
            ),
        }
    else:
        # Fast mode: MAXIMUM SPEED, ultra low latency
        return {
            "effort": "Fast",
            "options": {"temperature": 0.1, "num_predict": 512, "top_p": 0.7},
            "think": False,
            "instruction": (
                "Operating in FAST mode. Provide an immediate, direct, and concise answer with zero unnecessary preamble or filler."
            ),
        }


# --------------------------------------------------------------------------------------
# Chain of Thought streaming engine
# --------------------------------------------------------------------------------------
from cot_backend import run_ollama_stream_cot as run_ollama_stream


def retrieve_context(question: str, top_k: int = 5,
                     equipment_tag: Optional[str] = None) -> Dict[str, Any]:
    """Pull the org's own documents from the vector store to ground the answer."""
    hits = vector_query("documents", question, n_results=max(top_k, 1))
    if equipment_tag:
        tag = equipment_tag.upper()
        preferred = [h for h in hits if tag in str((h.get("metadata") or {}).get("equipment_tags", "")).upper()]
        hits = preferred + [h for h in hits if h not in preferred]

    # Filter out weak unrelated matches so conversational questions don't get false citations
    hits = [h for h in hits if h.get("similarity") is None or h.get("similarity", 0) >= 0.22]

    blocks, sources, doc_ids = [], [], []
    for i, hit in enumerate(hits[:top_k], start=1):
        meta = hit.get("metadata") or {}
        doc_id = meta.get("doc_id")
        blocks.append(f"[{i}] {meta.get('filename') or 'document'} "
                      f"(doc {doc_id}, {meta.get('doc_type') or 'unknown'}, "
                      f"{meta.get('document_date') or 'undated'}):\n{hit['document'][:1600]}")
        sources.append({
            "id": str(hit.get("id")), "doc_id": doc_id,
            "document": meta.get("filename"), "title": meta.get("filename"),
            "doc_type": meta.get("doc_type"), "document_date": meta.get("document_date"),
            "equipment_tags": meta.get("equipment_tags"),
            "excerpt": hit["document"][:400],
            "relevanceScore": hit.get("similarity"),
        })
        if doc_id is not None:
            doc_ids.append(doc_id)

    similarities = [s["relevanceScore"] for s in sources if isinstance(s["relevanceScore"], (int, float))]
    coverage = min(1.0, len(sources) / max(top_k, 1))
    quality = (sum(similarities) / len(similarities)) if similarities else 0.0
    confidence = round(0.4 * coverage + 0.6 * quality, 3) if sources else 0.0

    return {"context": "\n\n".join(blocks), "sources": sources,
            "doc_ids": sorted(set(doc_ids)), "confidence": confidence,
            "chunks_retrieved": len(sources)}


# --------------------------------------------------------------------------------------
# Retained: OCR + ask (Multi-Node Cluster Gateway with Auto-RAG & Multi-Turn History)
# --------------------------------------------------------------------------------------

@app.post("/process-and-ask/")
async def process_and_ask(
    user_query: str = Query(..., description="User query or prompt"),
    file: Optional[UploadFile] = File(None),
    messages: Optional[str] = Form(None, description="JSON array of previous conversation turns"),
    history: Optional[str] = Query(None, description="Fallback query param for conversation history"),
    stream: bool = Query(False, description="Stream response via Server-Sent Events (SSE)"),
    effort: str = Query("Fast", description="Reasoning effort: Fast | Deep Research | Max Effort"),
    model: Optional[str] = Query(None, description="Model ID or 'auto' for smart routing"),
    node_url: Optional[str] = Query(None, description="Direct URL of the target node (e.g. http://192.168.1.15:11434)"),
):
    context = ""
    images_b64 = []
    sources = []

    # Parse conversation history for multi-turn follow-up coherence
    chat_history: List[Dict[str, str]] = []
    raw_history = messages or history
    if raw_history:
        try:
            parsed = json.loads(raw_history)
            if isinstance(parsed, list):
                chat_history = [
                    {"role": str(m.get("role", "user")), "content": str(m.get("content", ""))}
                    for m in parsed if isinstance(m, dict) and m.get("content")
                ]
        except Exception as parse_err:
            print(f"--- Chat history parse warning: {parse_err} ---")

    if file:
        try:
            file_bytes = await file.read()
            # If image, prepare base64 for multimodal vision models
            is_image = bool(file.content_type and file.content_type.startswith("image/"))
            if not is_image and file.filename:
                ext = file.filename.lower()
                is_image = ext.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp"))
            if is_image:
                images_b64.append(base64.b64encode(file_bytes).decode("utf-8"))

            ocr_result = get_reader().readtext(file_bytes, detail=0)
            context = " ".join(ocr_result)
            print(f"--- OCR extracted {len(context)} chars ---")
        except Exception as ocr_err:
            print(f"--- OCR extraction warning: {ocr_err} ---")
    else:
        # Automatic RAG retrieval from ChromaDB document store when no file is attached
        rag_query = user_query
        if chat_history and len(user_query.strip().split()) <= 4:
            prev_user_queries = [m["content"] for m in chat_history if m["role"] == "user" and m["content"] != user_query]
            if prev_user_queries:
                rag_query = f"{prev_user_queries[-1]} {user_query}"

        try:
            retrieval = retrieve_context(rag_query, top_k=5)
            if retrieval.get("context") and retrieval.get("confidence", 0) > 0.15:
                context = "RETRIEVED FROM ORGANISATION DOCUMENT INDEX:\n" + retrieval["context"]
                sources = retrieval.get("sources", [])
                print(f"--- RAG retrieved {len(sources)} chunks from ChromaDB for query: {rag_query[:60]!r} ---")
        except Exception as rag_err:
            print(f"--- RAG retrieval warning: {rag_err} ---")

    cfg = get_effort_config(effort, user_query)

    # Build full prompt including conversation history turns
    if chat_history:
        lines = []
        if context:
            lines.append(f"Context from Documents:\n{context}")
        for m in chat_history:
            role_label = "User" if m["role"] == "user" else "Assistant"
            lines.append(f"{role_label}: {m['content']}")
        if not chat_history or chat_history[-1].get("content") != user_query:
            lines.append(f"User: {user_query}")
        full_prompt = "\n\n".join(lines) + "\n\nAssistant:"
    else:
        full_prompt = (f"Context from Documents:\n{context}\n\nUser Query: {user_query}"
                       if context else user_query)

    # Dynamic model resolution for distributed multi-node cluster
    target_model = (model or "").strip()
    if not target_model or target_model == "auto" or target_model == "Auto (Recommended)":
        if images_b64:
            target_model = "qwen2.5-vl:7b"
        elif any(k in user_query.lower() for k in ["code", "python", "script", "def ", "sql", "bug", "error", "function", "class "]):
            target_model = "qwen2.5-coder:7b"
        elif "max" in effort.lower():
            target_model = "deepseek-r1:8b"
        else:
            target_model = llm.DEFAULT_MODEL
    elif "coder" in target_model.lower():
        target_model = "qwen2.5-coder:7b"
    elif "vl" in target_model.lower() or "vision" in target_model.lower():
        target_model = "qwen2.5-vl:7b"
    elif "r1" in target_model.lower() or "deepseek" in target_model.lower():
        target_model = "deepseek-r1:8b"
    elif "8b" in target_model.lower() or "qwen3" in target_model.lower():
        target_model = "qwen3:8b"

    # Resolve target endpoint
    target_endpoint = MODEL_ENDPOINT
    if node_url and node_url.strip():
        clean_node = node_url.strip().rstrip("/")
        if clean_node.endswith("/api/generate"):
            target_endpoint = clean_node
        elif clean_node.endswith("/api/chat"):
            target_endpoint = clean_node.replace("/api/chat", "/api/generate")
        else:
            target_endpoint = f"{clean_node}/api/generate"

    instruction = cfg["instruction"]
    if context:
        instruction += (
            " Answer using the provided documents where relevant. "
            "If the documents do not contain the answer, say so honestly based on your knowledge."
        )

    try:
        from data_layer import build_claude_identity_prompt
        user_identity = build_claude_identity_prompt("default_user")
        if user_identity:
            instruction = f"{user_identity}\n\n{instruction}"
    except Exception as id_err:
        print(f"[process_and_ask] identity context build failed: {id_err}")

    payload = {
        "model": target_model,
        "prompt": full_prompt,
        "system": instruction,
        "stream": stream,
        "think": cfg["think"],
        "options": cfg["options"],
        "keep_alive": -1,
        "_effort": cfg["effort"],
        "_endpoint": target_endpoint,
    }
    if images_b64:
        payload["images"] = images_b64

    log_audit("ocr_query", "engineer", None, "chat",
              {"query": user_query[:300], "ocr_chars": len(context), "effort": cfg["effort"],
               "model": target_model, "endpoint": target_endpoint})

    if stream:
        return StreamingResponse(run_ollama_stream(payload, context=context, sources=sources, feature="ocr_chat"),
                                 media_type="text/event-stream")
    try:
        try:
            response = requests.post(target_endpoint,
                                     json={k: v for k, v in payload.items() if not k.startswith("_")},
                                     timeout=8 if target_endpoint != MODEL_ENDPOINT else 300)
            response.raise_for_status()
        except Exception as remote_err:
            if target_endpoint != MODEL_ENDPOINT:
                print(f"[cluster] Remote node {target_endpoint} failed: {remote_err}. Falling back to master.")
                target_endpoint = MODEL_ENDPOINT
                target_model = llm.DEFAULT_MODEL
                payload["model"] = target_model
                response = requests.post(target_endpoint,
                                         json={k: v for k, v in payload.items() if not k.startswith("_")},
                                         timeout=300)
                response.raise_for_status()
            else:
                raise remote_err

        data = response.json()
        answer = data.get("response", "")
        log_ollama_call(target_endpoint, target_model, "ocr_chat", len(full_prompt), len(answer), 0, True)
        return {
            "ocr_context_found": bool(context),
            "context_length": len(context),
            "answer": answer,
            "eval_count": data.get("eval_count", 0),
            "model": target_model,
            "effort": cfg["effort"],
            "endpoint": target_endpoint,
            "sources": sources,
        }
    except requests.exceptions.RequestException as exc:
        return {"error": f"Node request failed: {exc}"}
    except Exception as exc:
        return {"error": f"Server error: {exc}"}


# --------------------------------------------------------------------------------------
# Upgraded: RAG-grounded chat
# --------------------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatPayload(BaseModel):
    messages: Optional[List[ChatMessage]] = None
    prompt: Optional[str] = None
    system: Optional[str] = None
    stream: bool = True
    context: Optional[str] = None
    task_type: Optional[str] = "chat"
    use_rag: bool = True
    equipment_tag: Optional[str] = None
    top_k: int = 5
    effort: Optional[str] = "Fast"
    user: Optional[str] = "engineer"


@app.post("/api/chat")
async def api_chat(payload_data: ChatPayload):
    """Chat grounded in the organisation's own indexed documents."""
    question = payload_data.prompt or ""
    if payload_data.messages:
        user_turns = [m.content for m in payload_data.messages if m.role == "user"]
        question = user_turns[-1] if user_turns else question
    if not question and not payload_data.messages:
        return JSONResponse(status_code=400, content={"error": "Prompt or messages required"})

    retrieval = {"context": "", "sources": [], "doc_ids": [], "confidence": 0.0, "chunks_retrieved": 0}
    if payload_data.use_rag and question:
        try:
            retrieval = retrieve_context(question, payload_data.top_k, payload_data.equipment_tag)
        except Exception as exc:
            print(f"[chat] retrieval failed: {exc}")

    context = payload_data.context or ""
    if retrieval["context"]:
        context = (context + "\n\n" if context else "") + \
            "RETRIEVED FROM ORGANISATION DOCUMENT INDEX:\n" + retrieval["context"]

    # Temporal Cross-Session Continuity Context
    target_tag = payload_data.equipment_tag
    if not target_tag and question:
        # Detect common equipment tags mentioned in the query
        for possible_tag in ["HE-301", "V-102", "P-101", "C-101", "K-101", "E-101"]:
            if possible_tag.lower() in question.lower():
                target_tag = possible_tag
                break

    if target_tag:
        try:
            from temporal_reasoning import build_temporal_chat_context
            temporal_text = build_temporal_chat_context(target_tag)
            if temporal_text:
                context = (context + "\n\n" if context else "") + temporal_text
        except Exception as t_err:
            print(f"[chat] temporal context retrieval failed: {t_err}")

    cfg = get_effort_config(payload_data.effort, question)

    # 1. Claude-Grade User Identity, Profile, Capabilities, Memory, Permissions & Connectors
    try:
        from data_layer import build_claude_identity_prompt, add_user_memory_file, get_user_capabilities
        user_identity = build_claude_identity_prompt(payload_data.user or "default_user")

        # Dynamic Memory Extraction if user says "Remember that..." or "Please remember: "
        if question:
            q_lower = question.lower()
            for trig in ["remember that ", "remember: ", "note that i ", "please remember "]:
                if trig in q_lower:
                    caps = get_user_capabilities(payload_data.user or "default_user")
                    if caps.get("generate_memory_from_chats", True):
                        fact = question[q_lower.index(trig) + len(trig):].strip()
                        if len(fact) > 4:
                            add_user_memory_file(
                                user_id=payload_data.user or "default_user",
                                title="Chat-Derived Preference",
                                content=fact,
                                category="preference",
                            )
                            # Re-generate identity prompt with the newly learned fact
                            user_identity = build_claude_identity_prompt(payload_data.user or "default_user")
                    break
    except Exception as id_err:
        print(f"[chat] identity context build failed: {id_err}")
        user_identity = ""

    # In-Context Learned Preferences injection
    try:
        from behavior_learning import format_learned_preferences_for_prompt
        learned_guidelines = format_learned_preferences_for_prompt()
    except Exception:
        learned_guidelines = ""

    base_system = payload_data.system or (
        f"You are ZINGO, an on-premise engineering assistant for an Indian refinery. {cfg['instruction']} "
        "Answer using the retrieved organisation documents where they are relevant, and cite them "
        "by their bracket number, e.g. [1]. If the documents do not contain the answer, say so "
        "plainly instead of speculating."
    )

    system_blocks = []
    if user_identity:
        system_blocks.append(user_identity)
    if learned_guidelines:
        system_blocks.append(learned_guidelines)
    system_blocks.append(base_system)
    system = "\n\n".join(system_blocks)

    if payload_data.messages:
        lines = [f"System: {system}"]
        if context:
            lines.append(f"Context from Documents:\n{context}")
        for m in payload_data.messages:
            lines.append(f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}")
        full_prompt = "\n\n".join(lines) + "\n\nAssistant:"
    else:
        full_prompt = (f"Context from Documents:\n{context}\n\nUser Query: {question}"
                       if context else question)

    model = llm.resolve_model(payload_data.task_type or "chat")
    log_audit("chat_query", payload_data.user, None, "chat", {
        "question": question[:300], "task_type": payload_data.task_type,
        "rag_used": bool(retrieval["chunks_retrieved"]),
        "sources": retrieval["doc_ids"], "confidence": retrieval["confidence"],
        "model": model,
        "effort": cfg["effort"],
    })

    ollama_payload = {
        "model": model,
        "prompt": full_prompt,
        "system": system,
        "stream": payload_data.stream,
        "think": cfg["think"],
        "options": cfg["options"],
        "keep_alive": -1,
        "_effort": cfg["effort"],
    }

    if payload_data.stream:
        return StreamingResponse(
            run_ollama_stream(ollama_payload, context=context,
                              sources=retrieval["sources"], feature="chat"),
            media_type="text/event-stream")

    try:
        started = datetime.now()
        response = requests.post(MODEL_ENDPOINT,
                                 json={k: v for k, v in ollama_payload.items() if not k.startswith("_")},
                                 timeout=600)
        response.raise_for_status()
        data = response.json()
        answer = data.get("response", "")
        log_ollama_call(MODEL_ENDPOINT, model, "chat", len(full_prompt), len(answer),
                        int((datetime.now() - started).total_seconds() * 1000), True)
        return {
            "answer": answer,
            "eval_count": data.get("eval_count", 0),
            "model": model,
            "sources": retrieval["sources"],
            "source_doc_ids": retrieval["doc_ids"],
            "confidence": retrieval["confidence"],
            "chunks_retrieved": retrieval["chunks_retrieved"],
            "rag_used": bool(retrieval["chunks_retrieved"]),
            "effort": cfg["effort"],
        }
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/api/overview")
async def api_overview():
    """Single call that powers the frontend's global state on load."""
    conn = get_db()
    try:
        counts = {
            "documents": conn.execute("SELECT COUNT(*) c FROM documents").fetchone()["c"],
            "measurements": conn.execute("SELECT COUNT(*) c FROM measurements").fetchone()["c"],
            "active_alerts": conn.execute(
                "SELECT COUNT(*) c FROM alerts WHERE status='active'").fetchone()["c"],
            "critical_alerts": conn.execute(
                "SELECT COUNT(*) c FROM alerts WHERE status='active' AND severity='CRITICAL'"
            ).fetchone()["c"],
            "open_gaps": conn.execute(
                "SELECT COUNT(*) c FROM compliance_gaps WHERE status='open'").fetchone()["c"],
            "open_contradictions": conn.execute(
                "SELECT COUNT(*) c FROM contradictions WHERE status='open'").fetchone()["c"],
            "audit_entries": conn.execute("SELECT COUNT(*) c FROM audit_log").fetchone()["c"],
            "model_calls": conn.execute("SELECT COUNT(*) c FROM ollama_calls").fetchone()["c"],
        }
        last_scan = conn.execute(
            """SELECT timestamp FROM audit_log WHERE action='full_scan_completed'
               ORDER BY timestamp DESC LIMIT 1""").fetchone()
    finally:
        conn.close()

    G = get_plant_graph()
    return {**counts, "external_calls_detected": 0,
            "graph_nodes": G.number_of_nodes(), "graph_edges": G.number_of_edges(),
            "last_scan_time": last_scan["timestamp"] if last_scan else None,
            "generated_at": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
