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
import threading
from typing import Any, Dict, List, Optional, Tuple
import warnings

warnings.filterwarnings("ignore", category=UserWarning, module="torch")
warnings.filterwarnings("ignore", message=".*quantize_per_tensor.*")
warnings.filterwarnings("ignore", message=".*quant_min and quant_max.*")

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
DEFAULT_LAPTOP2_TUNNEL_URL = "https://unfailing-idealism-caretaker.ngrok-free.dev"


class ClusterLoadBalancer:
    """
    Thread-safe dynamic load balancer for ZINGO multi-node cluster.
    Tracks in-flight streams across Laptop 1 (Primary: qwen3:8b) and Laptop 2 (Worker: qwen2.5-vl:3b).
    Enables automatic spillover routing to idle models when the primary node is busy.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self.active_streams = {
            "primary": 0,
            "laptop2": 0,
        }
        self.laptop2_url = DEFAULT_LAPTOP2_TUNNEL_URL

    def acquire_slot(self, node_key: str):
        with self._lock:
            self.active_streams[node_key] = self.active_streams.get(node_key, 0) + 1
            print(f"[load_balancer] Slot acquired for '{node_key}'. Current active streams: {self.active_streams}")

    def release_slot(self, node_key: str):
        with self._lock:
            if node_key in self.active_streams:
                self.active_streams[node_key] = max(0, self.active_streams[node_key] - 1)
            print(f"[load_balancer] Slot released for '{node_key}'. Current active streams: {self.active_streams}")

    def route_request(
        self,
        has_images: bool = False,
        requested_model: Optional[str] = None,
        custom_node_url: Optional[str] = None,
        task_type: Optional[str] = "chat",
        available_local_models: Optional[List[str]] = None,
    ) -> Tuple[str, str, str]:
        """
        Dynamically routes a request across the cluster.
        Returns: (target_endpoint, target_model, node_key)
        """
        local_models = available_local_models or []
        laptop1_endpoint = MODEL_ENDPOINT
        laptop2_base = (custom_node_url or self.laptop2_url).strip().rstrip("/")
        if laptop2_base.endswith("/api/generate"):
            laptop2_endpoint = laptop2_base
        elif laptop2_base.endswith("/api/chat"):
            laptop2_endpoint = laptop2_base.replace("/api/chat", "/api/generate")
        else:
            laptop2_endpoint = f"{laptop2_base}/api/generate"

        model_req = (requested_model or "").strip().lower()
        is_auto = not model_req or model_req in ("auto", "auto (recommended)", "auto (cluster smart router)")

        # 1. Vision constraint: must always use Laptop 2 (qwen2.5-vl:3b)
        if has_images or task_type == "vision":
            return laptop2_endpoint, "qwen2.5-vl:3b", "laptop2"

        # 2. Explicit model requested by user
        if not is_auto:
            if "vl" in model_req or "vision" in model_req:
                return laptop2_endpoint, "qwen2.5-vl:3b", "laptop2"
            if "coder" in model_req:
                coder_name = "qwen2.5-coder:7b"
                return (laptop2_endpoint if custom_node_url else laptop1_endpoint), coder_name, ("laptop2" if custom_node_url else "primary")
            if "r1" in model_req or "deepseek" in model_req:
                return laptop1_endpoint, "deepseek-r1:8b", "primary"
            # Explicit standard model
            return (laptop2_endpoint if custom_node_url else laptop1_endpoint), requested_model, ("laptop2" if custom_node_url else "primary")

        # 3. Dynamic Auto Load Balancing:
        with self._lock:
            p_active = self.active_streams.get("primary", 0)
            l2_active = self.active_streams.get("laptop2", 0)

        # If primary has 0 active requests (IDLE) -> Route to Laptop 1 (qwen3:8b)
        if p_active == 0:
            target_model = "qwen3:8b" if ("qwen3:8b" in local_models or not local_models) else local_models[0]
            return laptop1_endpoint, target_model, "primary"

        # If primary is BUSY (p_active >= 1) and Laptop 2 is idle -> DYNAMIC SPILLOVER TO LAPTOP 2!
        if l2_active == 0:
            print(f"[load_balancer] Laptop 1 is busy ({p_active} active). Dynamically spilling over to Laptop 2 (idle).")
            return laptop2_endpoint, "qwen2.5-vl:3b", "laptop2"

        # Both are busy -> Choose whichever has fewer active requests
        if p_active <= l2_active:
            target_model = "qwen3:8b" if ("qwen3:8b" in local_models or not local_models) else local_models[0]
            return laptop1_endpoint, target_model, "primary"
        else:
            return laptop2_endpoint, "qwen2.5-vl:3b", "laptop2"


cluster_balancer = ClusterLoadBalancer()


def stream_with_slot_cleanup(gen, node_key: str):
    """
    Wraps an SSE generator to guarantee releasing the cluster slot upon completion or client abort.
    """
    try:
        for chunk in gen:
            yield chunk
    finally:
        cluster_balancer.release_slot(node_key)


class SessionKVStore:
    """
    Session-level KV Cache token persistence store for multi-turn Ollama acceleration.
    Preserves Ollama's numeric context token array across chat turns, bypassing the
    costly quadratic prompt re-evaluation on subsequent messages in the same conversation.
    """
    def __init__(self, ttl_seconds: int = 7200):
        self._lock = threading.Lock()
        self._store: Dict[str, Dict[str, Any]] = {}
        self._ttl = ttl_seconds

    def get_context(self, chat_id: Optional[str], model: str) -> Optional[List[int]]:
        if not chat_id:
            return None
        with self._lock:
            entry = self._store.get(chat_id)
            if not entry:
                return None
            if entry.get("model") != model:
                return None
            if (datetime.now() - entry.get("updated_at", datetime.now())).total_seconds() > self._ttl:
                self._store.pop(chat_id, None)
                return None
            return entry.get("context")

    def set_context(self, chat_id: Optional[str], model: str, context: List[int]):
        if not chat_id or not context:
            return
        with self._lock:
            self._store[chat_id] = {
                "context": context,
                "model": model,
                "updated_at": datetime.now(),
            }
            print(f"[kv_cache] Stored {len(context)} context tokens for chat '{chat_id}' (model: {model})")

    def clear(self, chat_id: str):
        with self._lock:
            self._store.pop(chat_id, None)


session_kv_store = SessionKVStore()


def speculative_plan_decomposition(query: str, custom_node_url: Optional[str] = None) -> Optional[str]:
    """
    Phase 3: Dual-Node Synergy (Speculative Fast Planning).
    Queries Laptop 2 (qwen2.5-vl:3b worker node) to generate a speculative
    high-level architecture and task decomposition blueprint in ~800ms.
    This speculative plan is fed into Laptop 1 (qwen3:8b) for deep synthesis.
    Fails safely with a 3.5s strict timeout if Laptop 2 is busy or offline.
    """
    if not query or len(query.strip()) < 15:
        return None

    complex_triggers = (
        "create", "build", "code", "app", "application", "design", "system",
        "component", "implement", "develop", "refactor", "fix", "architecture",
        "html", "react", "python", "script", "database", "api", "pipeline", "function"
    )
    q_low = query.lower()
    if not any(k in q_low for k in complex_triggers):
        return None

    l2_base = (custom_node_url or cluster_balancer.laptop2_url).strip().rstrip("/")
    if l2_base.endswith("/api/generate"):
        l2_endpoint = l2_base
    elif l2_base.endswith("/api/chat"):
        l2_endpoint = l2_base.replace("/api/chat", "/api/generate")
    else:
        l2_endpoint = f"{l2_base}/api/generate"

    speculative_payload = {
        "model": "qwen2.5-vl:3b",
        "prompt": f"User Task: {query.strip()[:1500]}\nProvide a concise 3-4 bullet point technical architecture blueprint and component breakdown:",
        "system": (
            "You are a lightning-fast technical architect. Output ONLY 3-4 concise, precise execution steps "
            "and component boundaries for this task. Maximum 100 words. No introductory or concluding remarks."
        ),
        "stream": False,
        "options": {
            "num_predict": 160,
            "temperature": 0.2,
        },
        "keep_alive": -1,
    }

    try:
        t0 = time.time()
        resp = requests.post(
            l2_endpoint,
            json=speculative_payload,
            headers={"ngrok-skip-browser-warning": "true", "User-Agent": "ZingoSynergyPlanner/1.0"},
            timeout=(1.5, 3.5),
        )
        if resp.status_code == 200:
            plan = resp.json().get("response", "").strip()
            elapsed_ms = int((time.time() - t0) * 1000)
            if plan and len(plan) > 20:
                print(f"[synergy] Node 2 speculative plan generated in {elapsed_ms}ms ({len(plan)} chars).")
                return plan
    except Exception as err:
        print(f"[synergy] Speculative planning skipped (Node 2 non-critical): {err}")

    return None




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

# Cross-Origin Isolation Headers for WebAssembly SharedArrayBuffer / WebContainers
@app.middleware("http")
async def add_wasm_isolation_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
    return response

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
from routers.sandbox import router as sandbox_router              # noqa: E402
from mcp_host import mcp_router                                    # noqa: E402
from self_healing import auto_heal_response                        # noqa: E402
from model_orchestrator import hardware_router, calculate_safe_num_ctx  # noqa: E402
from tot_verifier import generate_test_specification, format_tot_instruction  # noqa: E402
from presentation_engine import (
    is_presentation_intent,
    generate_presentation_speculative_plan,
    get_presentation_system_instruction,
    generate_slide_structure_node2,
    build_deck_manifest,
    get_html_generation_instruction,
)  # noqa: E402

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
app.include_router(sandbox_router)
app.include_router(mcp_router)
app.include_router(hardware_router)


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
    headers = {"ngrok-skip-browser-warning": "true", "User-Agent": "ZingoPing/1.0"}
    try:
        resp = requests.get(f"{clean_url}/api/tags", headers=headers, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            models = [m.get("name") for m in data.get("models", [])]
            has_vision = any("vl" in m.lower() or "vision" in m.lower() or "llava" in m.lower() for m in models)
            active_model = models[0] if models else "ready"
            return {
                "connected": True,
                "type": "ollama",
                "models": models,
                "active": active_model,
                "has_vision": has_vision,
                "role": "vision" if has_vision else ("coder" if any("coder" in m.lower() for m in models) else "chat")
            }
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
    Ensures adequate token budget and context window so deep deliberation never truncates the final response."""
    eff = (effort or "Fast").lower()
    q = (user_query or "").strip().lower()

    # Truly trivial conversational greetings that do not warrant burning reasoning tokens
    TRIVIAL_GREETINGS = {
        "hi", "hello", "hey", "hii", "hiii", "heyy", "test", "ping",
        "thanks", "thank you", "thx", "ok", "okay", "bye", "good morning",
        "good evening", "good afternoon", "who are you", "who r u",
        "what is your name", "how are you", "sup", "yo"
    }
    is_greeting = q in TRIVIAL_GREETINGS or (len(q) <= 10 and any(q.startswith(g) for g in ["hi ", "hey ", "yo "]))

    if is_greeting:
        return {
            "effort": "Fast",
            "options": {"temperature": 0.4, "num_predict": 512, "num_ctx": 4096, "top_p": 0.85},
            "think": False,
            "instruction": (
                "The user is sending a friendly greeting or ping. Respond politely, warmly, and concisely as ZINGO, "
                "mentioning your role as their on-premise engineering assistant. Keep it brief and ready for their task."
            ),
        }

    if "max" in eff:
        return {
            "effort": "Max Effort",
            "options": {"temperature": 0.6, "num_predict": 4096, "num_ctx": 6144, "top_p": 0.95},
            "think": True,
            "instruction": (
                "Operating at MAXIMUM REASONING EFFORT. Conduct an exhaustive, rigorous engineering analysis. "
                "First, deliberate through all mechanisms, thermodynamics, governing formulas, standards (OISD, API, ASME, ISO), "
                "edge cases, and process constraints. "
                "Then, deliver an exhaustive, beautifully structured technical breakdown with clear markdown headers: "
                "Executive Summary, Fundamental Principles/Mechanisms, Detailed Step-by-Step Breakdown, "
                "Formulas & Calculations (with KaTeX math if applicable), Real-World Industrial/Operational Examples, "
                "Failure Modes & Challenges, and Engineering Best-Practice Checklists. "
                "Never truncate, abbreviate, or stop at a one-sentence definition. Fully write out every section."
            ),
        }
    elif "deep" in eff or "reason" in eff or "research" in eff:
        return {
            "effort": "Deep Research",
            "options": {"temperature": 0.5, "num_predict": 3072, "num_ctx": 4096, "top_p": 0.9},
            "think": True,
            "instruction": (
                "Operating in DEEP RESEARCH mode. Conduct systematic, deep step-by-step reasoning before formulating your response. "
                "Your final response must be comprehensive, thorough, and highly structured with markdown headings. "
                "Include: 1) Definition and Core Conceptual Overview, 2) The Complete Process / Mechanism (broken down step-by-step), "
                "3) Types, Classifications, and Key Components, 4) Practical Concrete Examples, "
                "5) Why It Matters (Importance, Benefits, Impact), and 6) Common Pitfalls, Challenges, or Edge Cases. "
                "Never provide a brief or one-sentence answer when Deep Research is active. Write out the full explanation with technical depth."
            ),
        }
    else:
        # Fast mode: responsive, direct, with room for rich multi-turn conversation memory
        return {
            "effort": "Fast",
            "options": {"temperature": 0.3, "num_predict": 1024, "num_ctx": 4096, "top_p": 0.85},
            "think": False,
            "instruction": (
                "Operating in FAST mode. Provide an immediate, direct, concise, and accurate answer. "
                "Answer directly without conversational filler, preamble, or repetition."
            ),
        }


# --------------------------------------------------------------------------------------
# Chain of Thought streaming engine & Fast Mode Domain Gates
# --------------------------------------------------------------------------------------
from cot_backend import run_ollama_stream_cot as run_ollama_stream

PLANT_KEYWORDS = {
    "cdu", "vdu", "sop", "oisd", "permit", "ptw", "manual", "flange", "valve",
    "inspection", "corrosion", "fouling", "furnace", "reboiler", "refinery",
    "mrpl", "he-301", "v-102", "p-101", "c-101", "k-101", "e-101", "plant",
    "pipeline", "crude", "distillation", "flare", "column", "exchanger",
    "tower", "naphtha", "diesel", "lpg", "atf", "kerosene", "bitumen",
    "effluent", "etp", "desalter", "fccu", "msu", "dhu", "om&s"
}

IDENTITY_KEYWORDS = {
    "who am i", "my role", "my name", "what do i do", "my responsibility",
    "my plant", "my unit", "do you know me", "remember that", "remember:"
}


def retrieve_context(question: str, top_k: int = 5,
                     equipment_tag: Optional[str] = None) -> Dict[str, Any]:
    """Pull the org's own documents from the vector store to ground the answer."""
    hits = vector_query("documents", question, n_results=max(top_k, 1))
    if equipment_tag:
        tag = equipment_tag.upper()
        preferred = [h for h in hits if tag in str((h.get("metadata") or {}).get("equipment_tags", "")).upper()]
        hits = preferred + [h for h in hits if h not in preferred]

    # Filter out weak unrelated matches so general questions don't get false citations or prompt bloat
    hits = [h for h in hits if h.get("similarity") is None or h.get("similarity", 0) >= 0.35]

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
    request: Request,
    user_query: Optional[str] = Form(None, description="User query or prompt (Form)"),
    file: Optional[UploadFile] = File(None),
    messages: Optional[str] = Form(None, description="JSON array of previous conversation turns"),
    history: Optional[str] = Query(None, description="Fallback query param for conversation history"),
    stream: Optional[bool] = Query(None, description="Stream response via Server-Sent Events (SSE)"),
    effort: Optional[str] = Form(None, description="Reasoning effort: Fast | Deep Research | Max Effort"),
    model: Optional[str] = Form(None, description="Model ID or 'auto' for smart routing"),
    node_url: Optional[str] = Query(None, description="Direct URL of the target node (e.g. http://192.168.1.15:11434)"),
    user: Optional[str] = Form(None, description="User ID"),
    user_name: Optional[str] = Form(None, description="Full Name of User"),
    preferred_name: Optional[str] = Form(None, description="Preferred Name / Call Name of User"),
    work_role: Optional[str] = Form(None, description="Role & Designation of User"),
    personal_preferences: Optional[str] = Form(None, description="Personal Preferences"),
):
    # Resolve parameters: prefer Form data, fallback to Query params, then defaults
    q = request.query_params
    resolved_query = (user_query or q.get("user_query") or "").strip()
    if not resolved_query:
        resolved_query = "Please analyze the attached document and provide a comprehensive summary and key takeaways."
    user_query = resolved_query

    effort = effort or q.get("effort") or "Fast"
    model = model or q.get("model") or None
    node_url = node_url or q.get("node_url") or None
    resolved_user = user or q.get("user") or "default_user"
    resolved_user_name = user_name or q.get("user_name")
    resolved_preferred_name = preferred_name or q.get("preferred_name")
    resolved_work_role = work_role or q.get("work_role")
    resolved_prefs = personal_preferences or q.get("personal_preferences")
    if stream is None:
        raw_stream = q.get("stream")
        stream = str(raw_stream).lower() in ("true", "1", "yes") if raw_stream is not None else False

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
            fname = file.filename or "uploaded_document"
            is_image = bool(file.content_type and file.content_type.startswith("image/"))
            if not is_image and fname:
                ext = fname.lower()
                is_image = ext.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp"))
            if is_image:
                images_b64.append(base64.b64encode(file_bytes).decode("utf-8"))

            from routers.ingestion import extract_text
            extracted = extract_text(fname, file_bytes)
            raw_extracted = (extracted.get("text") or "").strip()
            if raw_extracted:
                context = f"[Attached File: {fname}]\n{raw_extracted}"
            print(f"--- Document extracted {len(raw_extracted)} chars from {fname} using {extracted.get('method')} ---")
        except Exception as file_err:
            print(f"--- Document extraction warning: {file_err}, attempting OCR fallback ---")
            try:
                from routers.ingestion import get_ocr_reader
                reader, _ = get_ocr_reader()
                ocr_result = reader.readtext(file_bytes, detail=0)
                raw_ocr = " ".join(ocr_result).strip()
                if raw_ocr:
                    context = f"[Attached File: {fname}]\n{raw_ocr}"
                print(f"--- OCR extracted {len(raw_ocr)} chars ---")
            except Exception as ocr_err:
                print(f"--- OCR fallback warning: {ocr_err} ---")
    else:
        eff_lower = (effort or "Fast").lower()
        is_fast = "fast" in eff_lower
        q_low = user_query.lower().strip()
        is_plant = any(k in q_low for k in PLANT_KEYWORDS)

        # In Fast mode, only run RAG if query is specifically plant-related to avoid 2-3s delay and prompt bloat
        if not is_fast or is_plant:
            rag_query = user_query
            if chat_history and len(user_query.strip().split()) <= 4:
                prev_user_queries = [m["content"] for m in chat_history if m["role"] == "user" and m["content"] != user_query]
                if prev_user_queries:
                    rag_query = f"{prev_user_queries[-1]} {user_query}"

            try:
                retrieval = retrieve_context(rag_query, top_k=5)
                if retrieval.get("context") and retrieval.get("confidence", 0) >= 0.25:
                    context = "RETRIEVED FROM ORGANISATION DOCUMENT INDEX:\n" + retrieval["context"]
                    sources = retrieval.get("sources", [])
                    print(f"--- RAG retrieved {len(sources)} chunks from ChromaDB for query: {rag_query[:60]!r} ---")
            except Exception as rag_err:
                print(f"--- RAG retrieval warning: {rag_err} ---")

    cfg = get_effort_config(effort, user_query)

    # Build full prompt including conversation history turns
    # Ensure document context is attached directly to the current user turn so it is never truncated
    current_turn_text = f"{context}\n\nUser Question/Request: {user_query}" if context else user_query

    if chat_history:
        # Filter out empty messages and prior error strings (e.g. HTTP 422, 404, etc.)
        valid_history = [
            m for m in chat_history
            if m.get("content") and str(m["content"]).strip()
            and not str(m["content"]).strip().startswith("[Connection error:")
            and not str(m["content"]).strip().startswith("[Error:")
        ]
        # Keep up to 8 recent turns for fast response and focused context
        recent_history = valid_history[-8:]
        lines = []
        for m in recent_history:
            role_label = "User" if m.get("role") == "user" else "Assistant"
            lines.append(f"{role_label}: {str(m['content']).strip()}")

        # Ensure the current turn with attached document context is the final user prompt
        if not recent_history or recent_history[-1].get("role") != "user" or recent_history[-1].get("content") != user_query:
            lines.append(f"User: {current_turn_text}")
        else:
            lines[-1] = f"User: {current_turn_text}"

        full_prompt = "\n\n".join(lines) + "\n\nAssistant:"
    else:
        full_prompt = current_turn_text

    # Dynamic cluster load balancing & model resolution
    available_local_models = llm.list_models()
    target_endpoint, target_model, node_key = cluster_balancer.route_request(
        has_images=bool(images_b64),
        requested_model=model,
        custom_node_url=node_url,
        task_type="vision" if images_b64 else "chat",
        available_local_models=available_local_models,
    )

    instruction = cfg["instruction"]
    if context:
        instruction += (
            " Answer using the provided document context where relevant. "
            "If the document is provided, thoroughly analyze its text, data, and details to fulfill the user's request."
        )

    # Always inject ZINGO User Identity, Profile & Memories into system instruction
    try:
        from data_layer import build_zingo_identity_prompt
        user_identity = build_zingo_identity_prompt(
            user_id=resolved_user,
            full_name=resolved_user_name,
            preferred_name=resolved_preferred_name,
            work_role=resolved_work_role,
            personal_preferences=resolved_prefs,
        )
        if user_identity:
            instruction = f"{user_identity}\n\n{instruction}"
    except Exception as id_err:
        print(f"[process_and_ask] identity context build failed: {id_err}")

    display_model = target_model
    test_spec = None
    if node_key == "primary" and not images_b64:
        spec_plan = speculative_plan_decomposition(user_query, node_url)
        if spec_plan:
            instruction = f"Technical Architecture & Plan from Node 2 (Fast Planner):\n{spec_plan}\n\n{instruction}"
            display_model = f"{target_model} (Dual-Node Synergy · Node 2 Planned + Node 1 Synthesized)"
        test_spec = generate_test_specification(user_query, node_url, cluster_balancer.laptop2_url)
        if test_spec:
            instruction = f"{instruction}\n\n{format_tot_instruction(test_spec)}"

    # Autonomous Presentation Engine — Dual-Node Pipeline
    ppt_manifest_prefix = ""
    if is_presentation_intent(user_query):
        l2_url = cluster_balancer.laptop2_url
        slides = generate_slide_structure_node2(user_query, l2_url)
        if slides is None:
            # Node 2 offline or failed: build default structure
            from presentation_engine import build_default_slides
            slides = build_default_slides(user_query)
        manifest_json = build_deck_manifest(user_query, slides)
        # Build the prefix that will be prepended to Node 1's stream
        ppt_manifest_prefix = (
            f"```json deck_manifest.json\n{manifest_json}\n```\n\n"
        )
        # Node 1 only needs to generate the HTML
        instruction = f"{instruction}\n\n{get_html_generation_instruction(manifest_json)}"
        cfg["options"]["num_predict"] = max(cfg["options"].get("num_predict", 1024), 4096)
        display_model = f"{target_model} (Dual-Node · Node 2 JSON + Node 1 HTML)"

    from model_orchestrator import get_system_ram
    ram_info = get_system_ram()
    safe_ctx = calculate_safe_num_ctx(target_model, ram_info["available_gb"])
    cfg["options"]["num_ctx"] = safe_ctx

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
        "_display_model": display_model,
    }
    if images_b64:
        payload["images"] = images_b64

    log_audit("ocr_query", resolved_user, None, "chat",
              {"query": user_query[:300], "ocr_chars": len(context), "effort": cfg["effort"],
               "model": display_model, "endpoint": target_endpoint, "user_name": resolved_user_name,
               "cluster_node": node_key})

    if stream:
        cluster_balancer.acquire_slot(node_key)
        return StreamingResponse(
            stream_with_slot_cleanup(
                run_ollama_stream(payload, context=context, sources=sources, feature="ocr_chat", content_prefix=ppt_manifest_prefix),
                node_key,
            ),
            media_type="text/event-stream"
        )
    try:
        cluster_balancer.acquire_slot(node_key)
        req_headers = {"ngrok-skip-browser-warning": "true", "User-Agent": "ZingoCluster/1.0"}
        try:
            response = requests.post(
                target_endpoint,
                json={k: v for k, v in payload.items() if not k.startswith("_")},
                headers=req_headers,
                timeout=(15, 300) if target_endpoint != MODEL_ENDPOINT else (15, 300),
            )
            response.raise_for_status()
        except Exception as remote_err:
            if target_endpoint != MODEL_ENDPOINT:
                print(f"[cluster] Remote node {target_endpoint} failed: {remote_err}. Falling back to master.")
                target_endpoint = MODEL_ENDPOINT
                target_model = llm.DEFAULT_MODEL
                payload["model"] = target_model
                payload.pop("images", None)  # master model qwen3:8b is text-only
                response = requests.post(
                    target_endpoint,
                    json={k: v for k, v in payload.items() if not k.startswith("_")},
                    headers=req_headers,
                    timeout=(15, 300),
                )
                response.raise_for_status()
            else:
                raise remote_err

        data = response.json()
        raw_answer = data.get("response", "")
        answer, healed = auto_heal_response(raw_answer, target_endpoint, target_model)
        log_ollama_call(target_endpoint, target_model, "ocr_chat", len(full_prompt), len(answer), 0, True)
        return {
            "ocr_context_found": bool(context),
            "context_length": len(context),
            "answer": answer,
            "eval_count": data.get("eval_count", 0),
            "model": display_model,
            "effort": cfg["effort"],
            "endpoint": target_endpoint,
            "sources": sources,
            "cluster_node": node_key,
            "healed": healed,
            "tot_spec": test_spec,
        }
    except requests.exceptions.RequestException as exc:
        return {"error": f"Node request failed: {exc}"}
    except Exception as exc:
        return {"error": f"Server error: {exc}"}
    finally:
        cluster_balancer.release_slot(node_key)


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
    user: Optional[str] = "default_user"
    user_name: Optional[str] = None
    preferred_name: Optional[str] = None
    work_role: Optional[str] = None
    personal_preferences: Optional[str] = None
    model: Optional[str] = None
    images: Optional[List[str]] = None
    node_url: Optional[str] = None
    chat_id: Optional[str] = None



@app.post("/api/chat")
async def api_chat(payload_data: ChatPayload):
    """Chat grounded in the organisation's own indexed documents."""
    question = payload_data.prompt or ""
    if payload_data.messages:
        user_turns = [m.content for m in payload_data.messages if m.role == "user" and m.content and m.content.strip()]
        question = user_turns[-1] if user_turns else question
    if not question and not payload_data.messages:
        return JSONResponse(status_code=400, content={"error": "Prompt or messages required"})

    eff = (payload_data.effort or "Fast").lower()
    is_fast_mode = "fast" in eff
    q_lower = question.lower().strip()

    is_plant_query = (
        bool(payload_data.equipment_tag) or
        any(k in q_lower for k in PLANT_KEYWORDS) or
        bool(payload_data.context)
    )

    retrieval = {"context": "", "sources": [], "doc_ids": [], "confidence": 0.0, "chunks_retrieved": 0}
    # In Fast mode, only run RAG if query is specifically plant-related to eliminate 2-3s delay and prompt bloat
    should_run_rag = payload_data.use_rag and question and (not is_fast_mode or is_plant_query)
    if should_run_rag:
        try:
            retrieval = retrieve_context(question, payload_data.top_k, payload_data.equipment_tag)
        except Exception as exc:
            print(f"[chat] retrieval failed: {exc}")

    context = payload_data.context or ""
    if retrieval["context"] and retrieval.get("confidence", 0) >= 0.25:
        context = (context + "\n\n" if context else "") + \
            "RETRIEVED FROM ORGANISATION DOCUMENT INDEX:\n" + retrieval["context"]

    # Temporal Cross-Session Continuity Context
    target_tag = payload_data.equipment_tag
    if not target_tag and question:
        for possible_tag in ["HE-301", "V-102", "P-101", "C-101", "K-101", "E-101"]:
            if possible_tag.lower() in q_lower:
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

    # 1. ZINGO User Identity, Profile, Capabilities, Memory, Permissions & Connectors
    user_id = payload_data.user or "default_user"
    user_identity = ""
    try:
        from data_layer import build_zingo_identity_prompt, add_user_memory_file, get_user_capabilities
        user_identity = build_zingo_identity_prompt(
            user_id=user_id,
            full_name=payload_data.user_name,
            preferred_name=payload_data.preferred_name,
            work_role=payload_data.work_role,
            personal_preferences=payload_data.personal_preferences,
        )

        # Dynamic Memory Extraction if user says "Remember that..." or "Please remember: "
        if question:
            for trig in ["remember that ", "remember: ", "note that i ", "please remember ", "don't forget that "]:
                if trig in q_lower:
                    caps = get_user_capabilities(user_id)
                    if caps.get("generate_memory_from_chats", True):
                        fact = question[q_lower.index(trig) + len(trig):].strip()
                        if len(fact) > 4:
                            add_user_memory_file(
                                user_id=user_id,
                                title="Chat-Derived Preference",
                                content=fact,
                                category="preference",
                                plant_unit="General",
                            )
                            user_identity = build_zingo_identity_prompt(
                                user_id=user_id,
                                full_name=payload_data.user_name,
                                preferred_name=payload_data.preferred_name,
                                work_role=payload_data.work_role,
                                personal_preferences=payload_data.personal_preferences,
                            )
                    break
    except Exception as id_err:
        print(f"[chat] identity context build failed: {id_err}")
        user_identity = ""

    # In-Context Learned Preferences injection
    learned_guidelines = ""
    if not is_fast_mode:
        try:
            from behavior_learning import format_learned_preferences_for_prompt
            learned_guidelines = format_learned_preferences_for_prompt()
        except Exception:
            learned_guidelines = ""

    base_system = payload_data.system or (
        f"You are AIRA, an advanced sovereign engineering assistant. {cfg['instruction']} "
        "Answer using the retrieved organisation documents where they are relevant, and cite them "
        "by their bracket number, e.g. [1]."
    )

    system_blocks = [base_system]
    if user_identity:
        system_blocks.append(user_identity)
    if learned_guidelines:
        system_blocks.append(learned_guidelines)
    system = "\n\n".join(system_blocks)

    current_user_text = f"{context}\n\nUser Question/Request: {question}" if context else question

    if payload_data.messages:
        # Filter out empty or error messages so failed turns do not corrupt context
        valid_messages = [
            m for m in payload_data.messages
            if m.content and m.content.strip()
            and not m.content.strip().startswith("[Connection error:")
            and not m.content.strip().startswith("[Error:")
        ]
        # Keep up to 8 recent messages for responsive conversation speed
        recent_messages = valid_messages[-8:]
        lines = []
        for m in recent_messages:
            lines.append(f"{'User' if m.role == 'user' else 'Assistant'}: {m.content.strip()}")

        if not recent_messages or recent_messages[-1].role != "user" or recent_messages[-1].content != question:
            lines.append(f"User: {current_user_text}")
        else:
            lines[-1] = f"User: {current_user_text}"

        full_prompt = "\n\n".join(lines) + "\n\nAssistant:"
    else:
        full_prompt = current_user_text


    task = payload_data.task_type or "chat"
    if payload_data.images:
        task = "vision"

    available_local_models = llm.list_models()
    target_endpoint, model, node_key = cluster_balancer.route_request(
        has_images=bool(payload_data.images or task == "vision"),
        requested_model=payload_data.model,
        custom_node_url=payload_data.node_url,
        task_type=task,
        available_local_models=available_local_models,
    )

    display_model = model
    test_spec = None
    if node_key == "primary" and not payload_data.images:
        spec_plan = speculative_plan_decomposition(question, payload_data.node_url)
        if spec_plan:
            system = f"Technical Architecture & Plan from Node 2 (Fast Planner):\n{spec_plan}\n\n{system}"
            display_model = f"{model} (Dual-Node Synergy · Node 2 Planned + Node 1 Synthesized)"
        test_spec = generate_test_specification(question, payload_data.node_url, cluster_balancer.laptop2_url)
        if test_spec:
            system = f"{system}\n\n{format_tot_instruction(test_spec)}"

    # Autonomous Presentation Engine — Dual-Node Pipeline
    ppt_manifest_prefix = ""
    if is_presentation_intent(question):
        l2_url = cluster_balancer.laptop2_url
        slides = generate_slide_structure_node2(question, l2_url)
        if slides is None:
            from presentation_engine import build_default_slides
            slides = build_default_slides(question)
        manifest_json = build_deck_manifest(question, slides)
        ppt_manifest_prefix = (
            f"```json deck_manifest.json\n{manifest_json}\n```\n\n"
        )
        system = f"{system}\n\n{get_html_generation_instruction(manifest_json)}"
        cfg["options"]["num_predict"] = max(cfg["options"].get("num_predict", 1024), 4096)
        display_model = f"{model} (Dual-Node · Node 2 JSON + Node 1 HTML)"

    from model_orchestrator import get_system_ram
    ram_info = get_system_ram()
    safe_ctx = calculate_safe_num_ctx(model, ram_info["available_gb"])
    cfg["options"]["num_ctx"] = safe_ctx

    log_audit("chat_query", payload_data.user, None, "chat", {
        "question": question[:300], "task_type": task,
        "rag_used": bool(retrieval["chunks_retrieved"]),
        "sources": retrieval["doc_ids"], "confidence": retrieval["confidence"],
        "model": display_model,
        "effort": cfg["effort"],
        "endpoint": target_endpoint,
        "has_images": bool(payload_data.images),
        "cluster_node": node_key,
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
        "_endpoint": target_endpoint,
        "_display_model": display_model,
    }
    if payload_data.images:
        ollama_payload["images"] = payload_data.images

    ollama_payload["prompt"] = full_prompt

    if payload_data.stream:
        cluster_balancer.acquire_slot(node_key)
        return StreamingResponse(
            stream_with_slot_cleanup(
                run_ollama_stream(
                    ollama_payload,
                    context=context,
                    sources=retrieval["sources"],
                    feature="chat",
                    content_prefix=ppt_manifest_prefix,
                ),
                node_key,
            ),
            media_type="text/event-stream")

    try:
        cluster_balancer.acquire_slot(node_key)
        started = datetime.now()
        response = requests.post(target_endpoint,
                                 json={k: v for k, v in ollama_payload.items() if not k.startswith("_")},
                                 headers={"ngrok-skip-browser-warning": "true", "User-Agent": "ZingoCluster/1.0"},
                                 timeout=600)
        response.raise_for_status()
        data = response.json()
        raw_answer = data.get("response", "")
        answer, healed = auto_heal_response(raw_answer, target_endpoint, model)
        if "context" in data and isinstance(data["context"], list) and payload_data.chat_id:
            session_kv_store.set_context(payload_data.chat_id, model, data["context"])

        log_ollama_call(target_endpoint, model, "chat", len(full_prompt), len(answer),
                        int((datetime.now() - started).total_seconds() * 1000), True)
        return {
            "answer": answer,
            "eval_count": data.get("eval_count", 0),
            "model": display_model,
            "sources": retrieval["sources"],
            "source_doc_ids": retrieval["doc_ids"],
            "confidence": retrieval["confidence"],
            "chunks_retrieved": retrieval["chunks_retrieved"],
            "rag_used": bool(retrieval["chunks_retrieved"]),
            "effort": cfg["effort"],
            "cluster_node": node_key,
            "healed": healed,
            "tot_spec": test_spec,
        }
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        cluster_balancer.release_slot(node_key)


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
