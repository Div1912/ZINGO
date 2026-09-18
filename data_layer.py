"""
ZINGO — Shared Data Layer
=========================
The single foundation every feature router imports from.

Owns:
  * SQLite      -> ./zingo.db          (structured records, alerts, audit)
  * ChromaDB    -> ./chroma_db         (vector retrieval over docs / SOPs / history)
  * NetworkX    -> ./plant_graph.gpickle (plant topology)

SOVEREIGNTY RULE: this module makes ZERO external network calls.
The only network destination allowed anywhere in ZINGO is 127.0.0.1:11434 (Ollama).
"""

from __future__ import annotations

import json
import os
import pickle
import sqlite3
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional

import networkx as nx

# --------------------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "zingo.db")
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_db")
GRAPH_PATH = os.path.join(BASE_DIR, "plant_graph.gpickle")

_db_lock = threading.Lock()
_graph_lock = threading.Lock()

# --------------------------------------------------------------------------------------
# Chroma (optional dependency — degrades to a local keyword store if unavailable)
# --------------------------------------------------------------------------------------

_chroma_client = None
CHROMA_AVAILABLE = True
try:  # pragma: no cover
    import chromadb
    from chromadb.config import Settings as ChromaSettings
except Exception:  # chromadb not installed / incompatible
    CHROMA_AVAILABLE = False

COLLECTIONS = ("documents", "measurements_history", "sop_library")


class _FallbackCollection:
    """Minimal local stand-in for a Chroma collection.

    Keeps ZINGO fully functional (and fully offline) when chromadb is not installed.
    Retrieval degrades from embeddings to token-overlap scoring.
    """

    def __init__(self, name: str, store_dir: str):
        self.name = name
        self._path = os.path.join(store_dir, f"{name}.jsonl")
        os.makedirs(store_dir, exist_ok=True)
        self._rows: List[Dict[str, Any]] = []
        if os.path.exists(self._path):
            with open(self._path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        try:
                            self._rows.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue

    def _flush(self) -> None:
        with open(self._path, "w", encoding="utf-8") as fh:
            for row in self._rows:
                fh.write(json.dumps(row) + "\n")

    def upsert(self, ids, documents, metadatas=None, **_kw):
        metadatas = metadatas or [{} for _ in ids]
        existing = {r["id"]: r for r in self._rows}
        for _id, doc, meta in zip(ids, documents, metadatas):
            row = {"id": _id, "document": doc, "metadata": meta or {}}
            if _id in existing:
                existing[_id].update(row)
            else:
                self._rows.append(row)
        self._flush()

    add = upsert

    def count(self) -> int:
        return len(self._rows)

    @staticmethod
    def _tokens(text: str) -> set:
        return {t for t in "".join(c.lower() if c.isalnum() else " " for c in text).split() if len(t) > 2}

    def query(self, query_texts, n_results: int = 5, where: Optional[dict] = None, **_kw):
        ids, docs, metas, dists = [], [], [], []
        for q in query_texts:
            qt = self._tokens(q)
            scored = []
            for row in self._rows:
                if where and any(row["metadata"].get(k) != v for k, v in where.items()):
                    continue
                dt = self._tokens(row["document"])
                overlap = len(qt & dt) / max(len(qt), 1)
                scored.append((overlap, row))
            scored.sort(key=lambda x: x[0], reverse=True)
            top = scored[:n_results]
            ids.append([r["id"] for _, r in top])
            docs.append([r["document"] for _, r in top])
            metas.append([r["metadata"] for _, r in top])
            dists.append([round(1.0 - s, 4) for s, _ in top])
        return {"ids": ids, "documents": docs, "metadatas": metas, "distances": dists}

    def get(self, where: Optional[dict] = None, limit: Optional[int] = None, **_kw):
        rows = [
            r for r in self._rows
            if not where or all(r["metadata"].get(k) == v for k, v in where.items())
        ]
        if limit:
            rows = rows[:limit]
        return {
            "ids": [r["id"] for r in rows],
            "documents": [r["document"] for r in rows],
            "metadatas": [r["metadata"] for r in rows],
        }


class _FallbackChroma:
    def __init__(self, path: str):
        self._path = os.path.join(path, "fallback")
        self._cols: Dict[str, _FallbackCollection] = {}

    def get_or_create_collection(self, name: str, **_kw) -> _FallbackCollection:
        if name not in self._cols:
            self._cols[name] = _FallbackCollection(name, self._path)
        return self._cols[name]

    get_collection = get_or_create_collection

    def list_collections(self):
        return list(self._cols.values())


# --------------------------------------------------------------------------------------
# Schema
# --------------------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    filename        TEXT NOT NULL,
    upload_time     TEXT NOT NULL,
    doc_type        TEXT,
    equipment_tags  TEXT,
    standard_refs   TEXT,
    raw_text        TEXT,
    processed       INTEGER DEFAULT 0,
    document_date   TEXT,
    uploaded_by     TEXT,
    key_findings    TEXT,
    action_items    TEXT,
    engineering_drawing INTEGER DEFAULT 0,
    superseded      INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS measurements (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id           INTEGER,
    equipment_tag    TEXT,
    parameter        TEXT,
    value            REAL,
    unit             TEXT,
    measurement_date TEXT,
    source_line      TEXT,
    FOREIGN KEY (doc_id) REFERENCES documents(id)
);

CREATE TABLE IF NOT EXISTS entities (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id       INTEGER,
    entity_type  TEXT,
    entity_value TEXT,
    context      TEXT,
    position     INTEGER,
    FOREIGN KEY (doc_id) REFERENCES documents(id)
);

CREATE TABLE IF NOT EXISTS alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type      TEXT NOT NULL,
    severity        TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    evidence        TEXT,
    equipment_tags  TEXT,
    created_at      TEXT NOT NULL,
    status          TEXT DEFAULT 'active',
    acknowledged_by TEXT,
    acknowledged_at TEXT,
    ack_notes       TEXT,
    dedupe_key      TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT NOT NULL,
    user        TEXT,
    document_id INTEGER,
    feature     TEXT,
    details     TEXT,
    timestamp   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shift_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_date    TEXT NOT NULL,
    shift_type    TEXT NOT NULL,
    equipment_tag TEXT,
    event_type    TEXT,
    description   TEXT,
    raw_source    TEXT,
    severity      TEXT,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendor_records (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_name      TEXT,
    aliases          TEXT,
    item_description TEXT,
    quoted_price     REAL,
    quantity         REAL,
    unit             TEXT,
    quote_date       TEXT,
    doc_id           INTEGER
);

CREATE TABLE IF NOT EXISTS sop_documents (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    filename       TEXT NOT NULL,
    sop_code       TEXT,
    standard_refs  TEXT,
    version        TEXT,
    effective_date TEXT,
    raw_text       TEXT,
    active         INTEGER DEFAULT 1,
    domain         TEXT
);

CREATE TABLE IF NOT EXISTS standards_library (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    standard_code   TEXT NOT NULL,
    clause_number   TEXT,
    clause_text     TEXT,
    normative_level TEXT,
    version         TEXT,
    effective_date  TEXT,
    domain          TEXT
);

CREATE TABLE IF NOT EXISTS compliance_gaps (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    sop_id           INTEGER,
    standard_code    TEXT,
    clause_number    TEXT,
    gap_description  TEXT,
    severity         TEXT,
    compliance_level TEXT,
    detected_at      TEXT,
    status           TEXT DEFAULT 'open',
    draft_amendment  TEXT,
    FOREIGN KEY (sop_id) REFERENCES sop_documents(id)
);

CREATE TABLE IF NOT EXISTS contradictions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_tag   TEXT,
    parameter       TEXT,
    qualifier       TEXT,
    doc_a_id        INTEGER,
    doc_b_id        INTEGER,
    value_a         TEXT,
    value_b         TEXT,
    unit            TEXT,
    contradiction_type TEXT,
    severity        TEXT,
    explanation     TEXT,
    recommended_resolution TEXT,
    status          TEXT DEFAULT 'open',
    resolved_by     TEXT,
    resolution_notes TEXT,
    detected_at     TEXT
);

CREATE TABLE IF NOT EXISTS claims (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id        INTEGER,
    equipment_tag TEXT,
    parameter     TEXT,
    value         REAL,
    raw_value     TEXT,
    unit          TEXT,
    qualifier     TEXT,
    extracted_at  TEXT
);

CREATE TABLE IF NOT EXISTS handovers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_date     TEXT NOT NULL,
    shift_type     TEXT NOT NULL,
    brief          TEXT,
    critical_count INTEGER,
    payload        TEXT,
    created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ollama_calls (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint        TEXT,
    model           TEXT,
    feature         TEXT,
    prompt_length   INTEGER,
    response_length INTEGER,
    duration_ms     INTEGER,
    success         INTEGER DEFAULT 1,
    timestamp       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    model           TEXT NOT NULL,
    project_id      TEXT,
    pinned          INTEGER DEFAULT 0,
    tags            TEXT,
    summary         TEXT
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id                 TEXT PRIMARY KEY,
    conversation_id    TEXT NOT NULL,
    role               TEXT NOT NULL,
    content            TEXT NOT NULL,
    timestamp          TEXT NOT NULL,
    model_used         TEXT,
    task_type          TEXT,
    sources_json       TEXT,
    files_json         TEXT,
    think_steps_json   TEXT,
    raw_thinking       TEXT,
    tokens_used        INTEGER,
    latency_ms         INTEGER,
    effort             TEXT,
    artifact_ids_json  TEXT,
    error              TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_notes (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_number              TEXT UNIQUE NOT NULL,
    title                   TEXT NOT NULL,
    doc_id                  INTEGER,
    alert_id                INTEGER,
    equipment_tag           TEXT NOT NULL,
    severity                TEXT NOT NULL,
    status                  TEXT DEFAULT 'DRAFT',
    target_role             TEXT NOT NULL,
    anomaly_summary         TEXT,
    technical_findings      TEXT,
    regulatory_clauses      TEXT,
    contradictions_detected TEXT,
    recommended_action      TEXT,
    raw_markdown            TEXT,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    approved_by             TEXT,
    approved_at             TEXT,
    approval_notes          TEXT,
    signature_hash          TEXT,
    FOREIGN KEY (doc_id) REFERENCES documents(id),
    FOREIGN KEY (alert_id) REFERENCES alerts(id)
);

CREATE TABLE IF NOT EXISTS equipment_memory (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tag           TEXT NOT NULL,
    memory_type   TEXT NOT NULL,
    key           TEXT NOT NULL,
    value         TEXT NOT NULL,
    confidence    REAL DEFAULT 1.0,
    source_doc_id INTEGER,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_role  TEXT NOT NULL,
    alert_id        INTEGER,
    action_note_id  INTEGER,
    equipment_tag   TEXT,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    severity        TEXT NOT NULL,
    status          TEXT DEFAULT 'UNREAD',
    dispatched_at   TEXT NOT NULL,
    read_at         TEXT,
    FOREIGN KEY (alert_id) REFERENCES alerts(id),
    FOREIGN KEY (action_note_id) REFERENCES action_notes(id)
);

CREATE TABLE IF NOT EXISTS equipment_health (
    tag                     TEXT PRIMARY KEY,
    health_score            INTEGER NOT NULL,
    status                  TEXT NOT NULL,
    active_critical_alerts  INTEGER DEFAULT 0,
    active_warning_alerts   INTEGER DEFAULT 0,
    open_contradictions     INTEGER DEFAULT 0,
    last_inspection_date    TEXT,
    days_since_inspection   INTEGER DEFAULT 0,
    deductions_json         TEXT,
    updated_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS engineer_edit_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type       TEXT NOT NULL,
    item_id         INTEGER NOT NULL,
    engineer_id     TEXT NOT NULL,
    project_id      TEXT,
    original_text   TEXT NOT NULL,
    edited_text     TEXT NOT NULL,
    diff_summary    TEXT,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learned_preferences (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id       TEXT,
    category         TEXT NOT NULL,
    title            TEXT NOT NULL,
    rule_instruction TEXT NOT NULL,
    trigger_pattern  TEXT,
    evidence_count   INTEGER DEFAULT 1,
    confidence       REAL DEFAULT 0.5,
    status           TEXT DEFAULT 'PROVISIONAL',
    examples_json    TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifact_states (
    id              TEXT PRIMARY KEY,
    artifact_id     TEXT NOT NULL,
    equipment_tag   TEXT,
    project_id      TEXT,
    title           TEXT NOT NULL,
    state_json      TEXT NOT NULL,
    saved_by        TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incident_escalations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_tag     TEXT NOT NULL,
    action_note_id    INTEGER,
    alert_id          INTEGER,
    from_level        INTEGER NOT NULL,
    to_level          INTEGER NOT NULL,
    trigger_reason    TEXT NOT NULL,
    days_unacted      INTEGER NOT NULL,
    escalated_to_role TEXT NOT NULL,
    escalated_at      TEXT NOT NULL,
    status            TEXT DEFAULT 'OPEN',
    resolution_notes  TEXT,
    FOREIGN KEY (action_note_id) REFERENCES action_notes(id),
    FOREIGN KEY (alert_id) REFERENCES alerts(id)
);

CREATE INDEX IF NOT EXISTS idx_meas_tag    ON measurements(equipment_tag);
CREATE INDEX IF NOT EXISTS idx_meas_doc    ON measurements(doc_id);
CREATE INDEX IF NOT EXISTS idx_alert_stat  ON alerts(status, severity);
CREATE INDEX IF NOT EXISTS idx_shift       ON shift_events(shift_date, shift_type);
CREATE INDEX IF NOT EXISTS idx_audit_ts    ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_conv_proj   ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_msg_conv    ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_act_tag     ON action_notes(equipment_tag);
CREATE INDEX IF NOT EXISTS idx_act_stat    ON action_notes(status);
CREATE INDEX IF NOT EXISTS idx_notif_role  ON role_notifications(recipient_role, status);
CREATE INDEX IF NOT EXISTS idx_eq_mem      ON equipment_memory(tag, memory_type);
CREATE INDEX IF NOT EXISTS idx_eng_edit    ON engineer_edit_history(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_learn_pref  ON learned_preferences(project_id, status);
CREATE INDEX IF NOT EXISTS idx_art_state   ON artifact_states(artifact_id, equipment_tag);
CREATE INDEX IF NOT EXISTS idx_inc_esc     ON incident_escalations(equipment_tag, status);

CREATE TABLE IF NOT EXISTS user_profile (
    user_id              TEXT PRIMARY KEY,
    full_name            TEXT NOT NULL,
    preferred_name       TEXT NOT NULL,
    work_role            TEXT,
    personal_preferences TEXT,
    updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_capabilities (
    user_id                    TEXT PRIMARY KEY,
    artifacts_enabled          BOOLEAN DEFAULT 1,
    inline_visualizations      BOOLEAN DEFAULT 1,
    code_execution             BOOLEAN DEFAULT 1,
    switch_models_on_flagged   BOOLEAN DEFAULT 1,
    generate_memory_from_chats  BOOLEAN DEFAULT 1,
    include_sensitive_topics   BOOLEAN DEFAULT 0,
    tool_access_mode           TEXT DEFAULT 'auto',
    updated_at                 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_memory_files (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT NOT NULL,
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    category     TEXT DEFAULT 'general',
    is_sensitive BOOLEAN DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id            TEXT PRIMARY KEY,
    location_permitted BOOLEAN DEFAULT 1,
    location_label     TEXT,
    location_coords    TEXT,
    calendar_permitted BOOLEAN DEFAULT 1,
    calendar_account   TEXT,
    updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_connectors (
    connector_key TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    status        TEXT NOT NULL,
    account_email TEXT,
    config_json   TEXT,
    updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usr_mem_cat ON user_memory_files(user_id, category);
CREATE INDEX IF NOT EXISTS idx_usr_conn_st ON user_connectors(user_id, status);
"""


# --------------------------------------------------------------------------------------
# SQLite
# --------------------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    """Return a fresh SQLite connection with row access by name."""
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    """Create every table/index if it does not already exist and seed defaults."""
    with _db_lock:
        conn = get_db()
        try:
            conn.executescript(SCHEMA)
            # Lightweight migrations for databases created by an earlier version.
            for table, column, decl in [
                ("alerts", "dedupe_key", "TEXT"),
                ("action_notes", "escalation_level", "INTEGER DEFAULT 1"),
                ("action_notes", "escalation_history", "TEXT"),
                ("action_notes", "due_date", "TEXT"),
                ("action_notes", "acknowledged_at", "TEXT"),
                ("action_notes", "acknowledged_by", "TEXT"),
                ("action_notes", "original_draft", "TEXT"),
            ]:
                cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
                if column not in cols:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")

            # Seed default user profile if empty
            now = datetime.now().isoformat()
            has_profile = conn.execute("SELECT 1 FROM user_profile WHERE user_id = 'default_user'").fetchone()
            if not has_profile:
                conn.execute(
                    """INSERT INTO user_profile
                       (user_id, full_name, preferred_name, work_role, personal_preferences, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    ("default_user", "Div", "Div", "Refinery Process Engineer (CDU/VDU)",
                     "Provide direct, precise, knowledgeable answers. When asked about identity or responsibilities, answer specifically using the profile and memory context.", now)
                )

            # Seed default user capabilities if empty
            has_caps = conn.execute("SELECT 1 FROM user_capabilities WHERE user_id = 'default_user'").fetchone()
            if not has_caps:
                conn.execute(
                    """INSERT INTO user_capabilities
                       (user_id, artifacts_enabled, inline_visualizations, code_execution, switch_models_on_flagged,
                        generate_memory_from_chats, include_sensitive_topics, tool_access_mode, updated_at)
                       VALUES (?, 1, 1, 1, 1, 1, 0, 'auto', ?)""",
                    ("default_user", now)
                )

            # Seed initial user memory files if empty
            mem_count = conn.execute("SELECT count(*) as c FROM user_memory_files WHERE user_id = 'default_user'").fetchone()
            if mem_count and mem_count["c"] == 0:
                conn.executemany(
                    """INSERT INTO user_memory_files
                       (user_id, title, content, category, is_sensitive, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    [
                        ("default_user", "Assigned Refinery Units",
                         "Lead Process Engineer responsible for Crude Distillation Unit CDU-2, Vacuum Distillation Unit VDU-1, and associated Preheat Train.",
                         "project", 0, now, now),
                        ("default_user", "Critical Asset Responsibility",
                         "Primary engineer overseeing fouling mitigation, ultrasonic thickness monitoring, and API 510 derating on Heat Exchanger HE-301.",
                         "project", 0, now, now),
                        ("default_user", "Units and Calculation Standards",
                         "Prefers calculations presented in SI metric units (bar, °C, kg/h, m³/h) and grounded in OISD safety standards.",
                         "preference", 0, now, now),
                    ]
                )

            # Seed default permissions if empty
            has_perms = conn.execute("SELECT 1 FROM user_permissions WHERE user_id = 'default_user'").fetchone()
            if not has_perms:
                conn.execute(
                    """INSERT INTO user_permissions
                       (user_id, location_permitted, location_label, location_coords, calendar_permitted, calendar_account, updated_at)
                       VALUES (?, 1, 'Mangaluru, Karnataka, India (Refinery Complex)', '12.9141° N, 74.8560° E', 1, 'div.engineer@mrpl.co.in', ?)""",
                    ("default_user", now)
                )

            # Seed default connectors if empty
            conn_count = conn.execute("SELECT count(*) as c FROM user_connectors WHERE user_id = 'default_user'").fetchone()
            if conn_count and conn_count["c"] == 0:
                conn.executemany(
                    """INSERT INTO user_connectors
                       (connector_key, user_id, name, description, status, account_email, config_json, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    [
                        # Built-in connectors — always active, not user-togglable
                        ("document_library", "default_user", "Document Library",
                         "Core ZINGO knowledge base. Ingest PDFs, reports, SOPs and P&IDs via the Upload interface. All ingested documents are auto-indexed for RAG.",
                         "active", None, json.dumps({"builtin": True, "endpoint": "/api/ingest"}), now),
                        ("local_file_upload", "default_user", "Local File Upload",
                         "Upload raw files (PDF, DOCX, XLSX, images) directly into ZINGO's secure local indexing pipeline. Files never leave the local network.",
                         "active", None, json.dumps({"builtin": True, "endpoint": "/api/ingest"}), now),
                        # Industrial connectors — require configuration to connect
                        ("aspen_ip21", "default_user", "Aspen InfoPlus.21 Historian",
                         "Connect ZINGO to your process historian for real-time and historical trend data. Requires REST API endpoint URL and API key.",
                         "disconnected", None, json.dumps({"endpoint": "", "api_key": "", "port": 8080}), now),
                        ("honeywell_dcs", "default_user", "Honeywell Experion PKS DCS",
                         "Connect ZINGO to your DCS via OPC UA gateway for live telemetry. Requires OPC UA server endpoint (opc.tcp://...) on your plant LAN.",
                         "disconnected", None, json.dumps({"endpoint": "", "port": 4840, "protocol": "opc.tcp", "security_mode": "None"}), now),
                        ("sap_pm", "default_user", "SAP Plant Maintenance (PM)",
                         "Connect to SAP PM module for equipment maintenance orders, inspection lots, and functional location hierarchy. Requires SAP OData service URL.",
                         "disconnected", None, json.dumps({"endpoint": "", "client": "", "api_key": ""}), now),
                    ]
                )

            conn.commit()
        finally:
            conn.close()


def rows_to_dicts(rows) -> List[Dict[str, Any]]:
    return [dict(r) for r in rows]


# --------------------------------------------------------------------------------------
# ChromaDB
# --------------------------------------------------------------------------------------

def get_chroma():
    """Return the persistent Chroma client (or the offline fallback store)."""
    global _chroma_client
    if _chroma_client is not None:
        return _chroma_client

    if CHROMA_AVAILABLE:
        try:
            _chroma_client = chromadb.PersistentClient(
                path=CHROMA_PATH,
                settings=ChromaSettings(anonymized_telemetry=False, allow_reset=True),
            )
            for name in COLLECTIONS:
                _chroma_client.get_or_create_collection(name)
            return _chroma_client
        except Exception as exc:  # pragma: no cover
            print(f"[ZINGO] Chroma unavailable ({exc}); using offline fallback store.")

    _chroma_client = _FallbackChroma(CHROMA_PATH)
    for name in COLLECTIONS:
        _chroma_client.get_or_create_collection(name)
    return _chroma_client


def get_collection(name: str):
    return get_chroma().get_or_create_collection(name)


def chunk_text(text: str, chunk_tokens: int = 512, overlap_tokens: int = 128) -> List[str]:
    """Word-approximated token chunking: 512-token chunks with 128 overlap."""
    words = (text or "").split()
    if not words:
        return []
    step = max(chunk_tokens - overlap_tokens, 1)
    chunks = []
    for start in range(0, len(words), step):
        piece = words[start:start + chunk_tokens]
        if piece:
            chunks.append(" ".join(piece))
        if start + chunk_tokens >= len(words):
            break
    return chunks


def vector_query(collection: str, query: str, n_results: int = 5,
                 where: Optional[dict] = None) -> List[Dict[str, Any]]:
    """Uniform retrieval helper: returns [{id, document, metadata, distance, similarity}]."""
    try:
        col = get_collection(collection)
        if col.count() == 0:
            return []
        res = col.query(query_texts=[query], n_results=n_results, where=where or None)
    except Exception as exc:
        print(f"[ZINGO] vector_query failed on '{collection}': {exc}")
        return []

    out = []
    ids = (res.get("ids") or [[]])[0]
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0] or [None] * len(ids)
    for i, _id in enumerate(ids):
        dist = dists[i] if i < len(dists) else None
        out.append({
            "id": _id,
            "document": docs[i] if i < len(docs) else "",
            "metadata": metas[i] if i < len(metas) else {},
            "distance": dist,
            "similarity": round(max(0.0, 1.0 - dist), 4) if isinstance(dist, (int, float)) else None,
        })
    return out


# --------------------------------------------------------------------------------------
# Plant topology graph
# --------------------------------------------------------------------------------------

EQUIPMENT_TYPE_MAP = {
    "V": "vessel", "D": "drum", "T": "column", "C": "column",
    "HE": "heat_exchanger", "E": "heat_exchanger", "P": "pump",
    "K": "compressor", "F": "furnace", "H": "furnace",
    "FT": "instrument", "PT": "instrument", "TT": "instrument",
    "LT": "instrument", "PI": "instrument", "TI": "instrument",
    "PSV": "safety_valve", "CV": "control_valve", "R": "reactor",
}


def infer_equipment_type(tag: str) -> str:
    prefix = (tag or "").split("-")[0].upper()
    return EQUIPMENT_TYPE_MAP.get(prefix, EQUIPMENT_TYPE_MAP.get(prefix[:1], "unknown"))


def get_plant_graph() -> nx.Graph:
    """Load the persisted topology graph, or create an empty one."""
    with _graph_lock:
        if os.path.exists(GRAPH_PATH):
            try:
                with open(GRAPH_PATH, "rb") as fh:
                    G = pickle.load(fh)
                if isinstance(G, nx.Graph):
                    return G
            except Exception as exc:
                print(f"[ZINGO] plant graph unreadable ({exc}); starting fresh.")
        G = nx.Graph()
        G.graph["created_at"] = datetime.now().isoformat()
        return G


def save_plant_graph(G: nx.Graph) -> None:
    with _graph_lock:
        G.graph["updated_at"] = datetime.now().isoformat()
        tmp = GRAPH_PATH + ".tmp"
        with open(tmp, "wb") as fh:
            pickle.dump(G, fh, protocol=pickle.HIGHEST_PROTOCOL)
        os.replace(tmp, GRAPH_PATH)


def upsert_equipment_node(G: nx.Graph, tag: str, **attrs) -> bool:
    """Add or refresh an equipment node. Returns True when a new node was created."""
    tag = (tag or "").strip().upper()
    if not tag:
        return False
    created = tag not in G
    if created:
        G.add_node(
            tag,
            equipment_type=attrs.get("equipment_type") or infer_equipment_type(tag),
            line_number=attrs.get("line_number"),
            service=attrs.get("service"),
            last_inspection_date=attrs.get("last_inspection_date"),
            first_seen_date=datetime.now().isoformat(),
            normal_range=attrs.get("normal_range", {}),
        )
    node = G.nodes[tag]
    node["last_seen_date"] = datetime.now().isoformat()
    for key in ("line_number", "service", "last_inspection_date", "equipment_type"):
        if attrs.get(key):
            node[key] = attrs[key]
    if attrs.get("normal_range"):
        merged = dict(node.get("normal_range") or {})
        merged.update(attrs["normal_range"])
        node["normal_range"] = merged
    return created


# --------------------------------------------------------------------------------------
# Audit + alerts
# --------------------------------------------------------------------------------------

def log_audit(action: str, user: Optional[str] = "system", doc_id: Optional[int] = None,
              feature: Optional[str] = None, details: Any = None) -> int:
    """Append an entry to the immutable audit trail."""
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO audit_log (action, user, document_id, feature, details, timestamp)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (action, user or "system", doc_id, feature,
             json.dumps(details, default=str) if details is not None else None,
             datetime.now().isoformat()),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def log_ollama_call(endpoint: str, model: str, feature: str, prompt_length: int,
                    response_length: int, duration_ms: int, success: bool = True) -> None:
    """Record every local model invocation — the basis of the network-proof panel."""
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO ollama_calls
               (endpoint, model, feature, prompt_length, response_length, duration_ms, success, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (endpoint, model, feature, prompt_length, response_length,
             duration_ms, 1 if success else 0, datetime.now().isoformat()),
        )
        conn.commit()
    finally:
        conn.close()


def add_alert(alert_type: str, severity: str, title: str, description: str,
              evidence: Any = None, equipment_tags: Any = None,
              dedupe: bool = True, dedupe_key: Optional[str] = None) -> Optional[int]:
    """Create an alert. When dedupe is on, an identical active alert is refreshed instead."""
    if isinstance(equipment_tags, (list, tuple, set)):
        equipment_tags = ",".join(sorted({str(t).upper() for t in equipment_tags if t}))
    severity = (severity or "INFO").upper()
    now = datetime.now().isoformat()

    conn = get_db()
    try:
        if dedupe:
            # dedupe_key keeps distinct findings (e.g. per parameter) as separate alerts,
            # while still refreshing rather than duplicating the same finding on re-scan.
            key = dedupe_key or f"{alert_type}|{equipment_tags or ''}"
            existing = conn.execute(
                """SELECT id FROM alerts
                   WHERE alert_type = ? AND equipment_tags = ? AND status = 'active'
                     AND COALESCE(dedupe_key, '') = ?""",
                (alert_type, equipment_tags or "", key),
            ).fetchone()
            if existing:
                conn.execute(
                    """UPDATE alerts SET severity = ?, title = ?, description = ?,
                       evidence = ?, created_at = ? WHERE id = ?""",
                    (severity, title, description,
                     json.dumps(evidence, default=str) if evidence is not None else None,
                     now, existing["id"]),
                )
                conn.commit()
                return existing["id"]

        cur = conn.execute(
            """INSERT INTO alerts
               (alert_type, severity, title, description, evidence, equipment_tags,
                created_at, status, dedupe_key)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)""",
            (alert_type, severity, title, description,
             json.dumps(evidence, default=str) if evidence is not None else None,
             equipment_tags or "", now,
             dedupe_key or f"{alert_type}|{equipment_tags or ''}"),
        )
        conn.commit()
        alert_id = cur.lastrowid
    finally:
        conn.close()

    log_audit("alert_created", "zingo_monitor", None, "monitoring",
              {"alert_id": alert_id, "type": alert_type, "severity": severity, "tags": equipment_tags})
    return alert_id


def parse_tags(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [t.strip().upper() for t in str(value).split(",") if t.strip()]


# --------------------------------------------------------------------------------------
# Action notes persistence
# --------------------------------------------------------------------------------------

def create_action_note(
    ref_number: str,
    title: str,
    equipment_tag: str,
    severity: str,
    target_role: str,
    doc_id: Optional[int] = None,
    alert_id: Optional[int] = None,
    anomaly_summary: Optional[str] = None,
    technical_findings: Any = None,
    regulatory_clauses: Any = None,
    contradictions_detected: Any = None,
    recommended_action: Optional[str] = None,
    raw_markdown: Optional[str] = None,
) -> int:
    """Persist an auto-drafted or engineered action note."""
    now = datetime.now().isoformat()
    original = raw_markdown or f"{title}\n\nObservation:\n{anomaly_summary or ''}\n\nAction:\n{recommended_action or ''}"
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO action_notes
               (ref_number, title, doc_id, alert_id, equipment_tag, severity, status,
                target_role, anomaly_summary, technical_findings, regulatory_clauses,
                contradictions_detected, recommended_action, raw_markdown, original_draft,
                escalation_level, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
            (
                ref_number,
                title,
                doc_id,
                alert_id,
                equipment_tag.upper(),
                severity.upper(),
                target_role,
                anomaly_summary,
                json.dumps(technical_findings, default=str) if technical_findings is not None else None,
                json.dumps(regulatory_clauses, default=str) if regulatory_clauses is not None else None,
                json.dumps(contradictions_detected, default=str) if contradictions_detected is not None else None,
                recommended_action,
                raw_markdown,
                original,
                now,
                now,
            ),
        )
        conn.commit()
        note_id = cur.lastrowid
    finally:
        conn.close()

    log_audit("action_note_created", "autonomous_agent", doc_id, "monitoring",
              {"note_id": note_id, "ref": ref_number, "tag": equipment_tag, "role": target_role})
    return note_id


def get_action_notes(
    equipment_tag: Optional[str] = None,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    where, params = " WHERE 1=1", []
    if equipment_tag:
        where += " AND UPPER(equipment_tag) = ?"; params.append(equipment_tag.upper())
    if status:
        where += " AND status = ?"; params.append(status.upper())
    if severity:
        where += " AND severity = ?"; params.append(severity.upper())

    conn = get_db()
    try:
        rows = rows_to_dicts(conn.execute(
            f"SELECT * FROM action_notes {where} ORDER BY created_at DESC LIMIT ?",
            params + [limit]
        ).fetchall())
        for r in rows:
            for k in ("technical_findings", "regulatory_clauses", "contradictions_detected"):
                try:
                    r[k] = json.loads(r.get(k) or "null")
                except json.JSONDecodeError:
                    pass
        return rows
    finally:
        conn.close()


def get_action_note(note_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM action_notes WHERE id = ?", (note_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        for k in ("technical_findings", "regulatory_clauses", "contradictions_detected"):
            try:
                d[k] = json.loads(d.get(k) or "null")
            except json.JSONDecodeError:
                pass
        return d
    finally:
        conn.close()


def acknowledge_action_note(note_id: int, engineer_id: str, notes: Optional[str] = None) -> Dict[str, Any]:
    """Acknowledge an action note without final sign-off (starts response clock)."""
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        conn.execute(
            """UPDATE action_notes
               SET acknowledged_at = ?, acknowledged_by = ?, updated_at = ?
               WHERE id = ?""",
            (now, engineer_id, now, note_id)
        )
        conn.commit()
    finally:
        conn.close()
    log_audit("action_note_acknowledged", engineer_id, None, "monitoring",
              {"note_id": note_id, "notes": notes})
    return get_action_note(note_id) or {"id": note_id, "acknowledged_by": engineer_id}


def sign_action_note(
    note_id: int,
    approved_by: str,
    approval_notes: Optional[str] = None,
    edited_title: Optional[str] = None,
    edited_anomaly_summary: Optional[str] = None,
    edited_recommended_action: Optional[str] = None,
    edited_raw_markdown: Optional[str] = None,
) -> Dict[str, Any]:
    """Electronically sign and approve an action note, applying any pre-sign edits and recording diffs."""
    import hashlib
    now = datetime.now().isoformat()

    existing = get_action_note(note_id)
    if not existing:
        return {"id": note_id, "error": "Not found"}

    title = edited_title if edited_title is not None else existing.get("title", "")
    summary = edited_anomaly_summary if edited_anomaly_summary is not None else existing.get("anomaly_summary", "")
    action = edited_recommended_action if edited_recommended_action is not None else existing.get("recommended_action", "")
    markdown = edited_raw_markdown if edited_raw_markdown is not None else existing.get("raw_markdown", "")

    sig_payload = f"{note_id}|{approved_by}|{now}|{title}|{approval_notes or ''}"
    sig_hash = hashlib.sha256(sig_payload.encode("utf-8")).hexdigest()[:24].upper()

    conn = get_db()
    try:
        conn.execute(
            """UPDATE action_notes
               SET status = 'APPROVED', approved_by = ?, approved_at = ?, approval_notes = ?,
                   signature_hash = ?, title = ?, anomaly_summary = ?, recommended_action = ?,
                   raw_markdown = ?, updated_at = ?
               WHERE id = ?""",
            (approved_by, now, approval_notes, sig_hash, title, summary, action, markdown, now, note_id),
        )
        conn.commit()
    finally:
        conn.close()

    log_audit("action_note_signed", approved_by, None, "monitoring",
              {"note_id": note_id, "signature_hash": sig_hash, "notes": approval_notes})

    updated = get_action_note(note_id)
    return updated or {"id": note_id, "status": "APPROVED", "signature_hash": sig_hash}


# --------------------------------------------------------------------------------------
# Role notifications & dispatch
# --------------------------------------------------------------------------------------

def add_role_notification(
    recipient_role: str,
    title: str,
    message: str,
    severity: str,
    alert_id: Optional[int] = None,
    action_note_id: Optional[int] = None,
    equipment_tag: Optional[str] = None,
) -> int:
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO role_notifications
               (recipient_role, alert_id, action_note_id, equipment_tag, title, message,
                severity, status, dispatched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'UNREAD', ?)""",
            (recipient_role, alert_id, action_note_id, equipment_tag, title, message,
             severity.upper(), now),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def get_role_notifications(
    role: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    where, params = " WHERE 1=1", []
    if role:
        norm = role.strip().upper()
        where += " AND (UPPER(recipient_role) = ? OR UPPER(recipient_role) LIKE ? OR ? LIKE '%' || UPPER(recipient_role) || '%')"
        params.extend([norm, f"%{norm}%", norm])
    if unread_only:
        where += " AND status = 'UNREAD'"

    conn = get_db()
    try:
        return rows_to_dicts(conn.execute(
            f"SELECT * FROM role_notifications {where} ORDER BY dispatched_at DESC LIMIT ?",
            params + [limit]
        ).fetchall())
    finally:
        conn.close()


def mark_notification_read(notif_id: int) -> bool:
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        cur = conn.execute(
            "UPDATE role_notifications SET status = 'READ', read_at = ? WHERE id = ?",
            (now, notif_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# --------------------------------------------------------------------------------------
# Episodic equipment memory
# --------------------------------------------------------------------------------------

def save_equipment_memory(
    tag: str,
    memory_type: str,
    key: str,
    value: str,
    confidence: float = 1.0,
    source_doc_id: Optional[int] = None,
) -> int:
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO equipment_memory
               (tag, memory_type, key, value, confidence, source_doc_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (tag.upper(), memory_type, key, value, confidence, source_doc_id, now, now),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def get_equipment_memory(tag: str, memory_type: Optional[str] = None) -> List[Dict[str, Any]]:
    where, params = " WHERE UPPER(tag) = ?", [tag.upper()]
    if memory_type:
        where += " AND memory_type = ?"; params.append(memory_type)

    conn = get_db()
    try:
        return rows_to_dicts(conn.execute(
            f"SELECT * FROM equipment_memory {where} ORDER BY updated_at DESC", params
        ).fetchall())
    finally:
        conn.close()


# --------------------------------------------------------------------------------------
# Plant health cache
# --------------------------------------------------------------------------------------

def upsert_equipment_health(
    tag: str,
    health_score: int,
    status: str,
    active_critical_alerts: int = 0,
    active_warning_alerts: int = 0,
    open_contradictions: int = 0,
    last_inspection_date: Optional[str] = None,
    days_since_inspection: int = 0,
    deductions: Any = None,
) -> None:
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO equipment_health
               (tag, health_score, status, active_critical_alerts, active_warning_alerts,
                open_contradictions, last_inspection_date, days_since_inspection,
                deductions_json, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(tag) DO UPDATE SET
                   health_score = excluded.health_score,
                   status = excluded.status,
                   active_critical_alerts = excluded.active_critical_alerts,
                   active_warning_alerts = excluded.active_warning_alerts,
                   open_contradictions = excluded.open_contradictions,
                   last_inspection_date = excluded.last_inspection_date,
                   days_since_inspection = excluded.days_since_inspection,
                   deductions_json = excluded.deductions_json,
                   updated_at = excluded.updated_at""",
            (tag.upper(), health_score, status, active_critical_alerts, active_warning_alerts,
             open_contradictions, last_inspection_date, days_since_inspection,
             json.dumps(deductions, default=str) if deductions is not None else None, now),
        )
        conn.commit()
    finally:
        conn.close()


def get_equipment_health(tag: Optional[str] = None) -> List[Dict[str, Any]]:
    where, params = " WHERE 1=1", []
    if tag:
        where += " AND UPPER(tag) = ?"; params.append(tag.upper())

    conn = get_db()
    try:
        rows = rows_to_dicts(conn.execute(
            f"SELECT * FROM equipment_health {where} ORDER BY health_score ASC", params
        ).fetchall())
        for r in rows:
            try:
                r["deductions"] = json.loads(r.get("deductions_json") or "[]")
            except json.JSONDecodeError:
                r["deductions"] = []
        return rows
    finally:
        conn.close()


# --------------------------------------------------------------------------------------
# Behavioral Learning: Engineer Diffs & Learned Preferences
# --------------------------------------------------------------------------------------

def save_engineer_edit(
    item_type: str,
    item_id: int,
    engineer_id: str,
    original_text: str,
    edited_text: str,
    diff_summary: Any = None,
    project_id: Optional[str] = None,
) -> int:
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO engineer_edit_history
               (item_type, item_id, engineer_id, project_id, original_text, edited_text, diff_summary, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (item_type, item_id, engineer_id, project_id, original_text, edited_text,
             json.dumps(diff_summary, default=str) if diff_summary is not None else None, now)
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def get_engineer_edits(item_type: Optional[str] = None, item_id: Optional[int] = None, limit: int = 50) -> List[Dict[str, Any]]:
    where, params = " WHERE 1=1", []
    if item_type:
        where += " AND item_type = ?"; params.append(item_type)
    if item_id is not None:
        where += " AND item_id = ?"; params.append(item_id)
    conn = get_db()
    try:
        rows = rows_to_dicts(conn.execute(
            f"SELECT * FROM engineer_edit_history {where} ORDER BY created_at DESC LIMIT ?",
            params + [limit]
        ).fetchall())
        for r in rows:
            try:
                r["diff_summary"] = json.loads(r.get("diff_summary") or "{}")
            except json.JSONDecodeError:
                r["diff_summary"] = {}
        return rows
    finally:
        conn.close()


def upsert_learned_preference(
    category: str,
    title: str,
    rule_instruction: str,
    trigger_pattern: Optional[str] = None,
    example: Optional[str] = None,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        # Check if existing matching rule exists
        existing = conn.execute(
            """SELECT * FROM learned_preferences
               WHERE category = ? AND (title = ? OR rule_instruction = ?)
               AND (project_id = ? OR (project_id IS NULL AND ? IS NULL))""",
            (category, title, rule_instruction, project_id, project_id)
        ).fetchone()

        if existing:
            row_id = existing["id"]
            new_count = existing["evidence_count"] + 1
            new_conf = min(0.99, 0.5 + (new_count * 0.15))
            new_status = "ACTIVE" if new_count >= 3 else existing["status"]
            examples = []
            try:
                examples = json.loads(existing["examples_json"] or "[]")
            except Exception:
                pass
            if example and example not in examples:
                examples.append(example)

            conn.execute(
                """UPDATE learned_preferences
                   SET evidence_count = ?, confidence = ?, status = ?, examples_json = ?, updated_at = ?
                   WHERE id = ?""",
                (new_count, new_conf, new_status, json.dumps(examples[:5]), now, row_id)
            )
            conn.commit()
            return {"id": row_id, "status": new_status, "evidence_count": new_count, "confidence": new_conf}
        else:
            examples = [example] if example else []
            cur = conn.execute(
                """INSERT INTO learned_preferences
                   (project_id, category, title, rule_instruction, trigger_pattern,
                    evidence_count, confidence, status, examples_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 1, 0.55, 'PROVISIONAL', ?, ?, ?)""",
                (project_id, category, title, rule_instruction, trigger_pattern, json.dumps(examples), now, now)
            )
            conn.commit()
            return {"id": cur.lastrowid, "status": "PROVISIONAL", "evidence_count": 1, "confidence": 0.55}
    finally:
        conn.close()


def get_learned_preferences(project_id: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
    where, params = " WHERE 1=1", []
    if project_id:
        where += " AND (project_id = ? OR project_id IS NULL)"; params.append(project_id)
    if status:
        where += " AND status = ?"; params.append(status.upper())
    conn = get_db()
    try:
        rows = rows_to_dicts(conn.execute(
            f"SELECT * FROM learned_preferences {where} ORDER BY evidence_count DESC, updated_at DESC", params
        ).fetchall())
        for r in rows:
            try:
                r["examples"] = json.loads(r.get("examples_json") or "[]")
            except json.JSONDecodeError:
                r["examples"] = []
        return rows
    finally:
        conn.close()


def toggle_learned_preference(pref_id: int, status: str) -> bool:
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        conn.execute("UPDATE learned_preferences SET status = ?, updated_at = ? WHERE id = ?", (status.upper(), now, pref_id))
        conn.commit()
        return True
    finally:
        conn.close()


# --------------------------------------------------------------------------------------
# Plant-Aware Artifact State Persistence
# --------------------------------------------------------------------------------------

def save_artifact_state(
    artifact_id: str,
    tag: Optional[str] = None,
    title: str = "Artifact Calculation",
    state: Any = None,
    saved_by: Optional[str] = None,
    project_id: Optional[str] = None,
    equipment_tag: Optional[str] = None,
    update_equipment_memory: bool = False,
) -> Dict[str, Any]:
    effective_tag = equipment_tag or tag
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        state_str = json.dumps(state, default=str) if not isinstance(state, str) else state
        conn.execute(
            """INSERT INTO artifact_states
               (id, artifact_id, equipment_tag, project_id, title, state_json, saved_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   equipment_tag = excluded.equipment_tag,
                   project_id = excluded.project_id,
                   title = excluded.title,
                   state_json = excluded.state_json,
                   saved_by = excluded.saved_by,
                   updated_at = excluded.updated_at""",
            (artifact_id, artifact_id, effective_tag.upper() if effective_tag else None, project_id, title, state_str, saved_by, now, now)
        )
        conn.commit()
    finally:
        conn.close()

    if update_equipment_memory and effective_tag and isinstance(state, dict):
        clean_tag = effective_tag.upper()
        target_dict = state.get("outputs", state) if isinstance(state.get("outputs"), dict) else state
        for key, val in target_dict.items():
            if key not in ("inputs", "timestamp") and isinstance(val, (str, int, float, bool)):
                save_equipment_memory(
                    tag=clean_tag,
                    memory_type="calculated_parameter",
                    key=str(key),
                    value=str(val),
                )

    log_audit("artifact_state_saved", saved_by or "engineer", None, "artifacts",
              {"artifact_id": artifact_id, "tag": effective_tag, "title": title})
    return {"id": artifact_id, "saved_at": now}


def get_artifact_state(artifact_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM artifact_states WHERE id = ? OR artifact_id = ?", (artifact_id, artifact_id)).fetchone()
        if not row:
            return None
        d = dict(row)
        try:
            d["state"] = json.loads(d.get("state_json") or "{}")
        except json.JSONDecodeError:
            d["state"] = {}
        return d
    finally:
        conn.close()


# --------------------------------------------------------------------------------------
# Cross-Session Temporal Reasoning & Escalation Tracking
# --------------------------------------------------------------------------------------

def record_incident_escalation(
    equipment_tag: str,
    from_level: int,
    to_level: int,
    trigger_reason: str,
    days_unacted: int,
    escalated_to_role: str,
    action_note_id: Optional[int] = None,
    alert_id: Optional[int] = None,
) -> int:
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO incident_escalations
               (equipment_tag, action_note_id, alert_id, from_level, to_level,
                trigger_reason, days_unacted, escalated_to_role, escalated_at, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')""",
            (equipment_tag.upper(), action_note_id, alert_id, from_level, to_level,
             trigger_reason, days_unacted, escalated_to_role, now)
        )
        if action_note_id:
            conn.execute(
                """UPDATE action_notes
                   SET escalation_level = ?, severity = 'CRITICAL', updated_at = ?
                   WHERE id = ?""",
                (to_level, now, action_note_id)
            )
        conn.commit()
        esc_id = cur.lastrowid
    finally:
        conn.close()

    log_audit("incident_escalated", "temporal_reasoning_engine", None, "monitoring",
              {"escalation_id": esc_id, "tag": equipment_tag, "from": from_level, "to": to_level,
               "reason": trigger_reason, "days": days_unacted, "target_role": escalated_to_role})
    return esc_id


def get_incident_escalations(equipment_tag: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
    where, params = " WHERE 1=1", []
    if equipment_tag:
        where += " AND UPPER(equipment_tag) = ?"; params.append(equipment_tag.upper())
    if status:
        where += " AND status = ?"; params.append(status.upper())
    conn = get_db()
    try:
        return rows_to_dicts(conn.execute(
            f"SELECT * FROM incident_escalations {where} ORDER BY escalated_at DESC", params
        ).fetchall())
    finally:
        conn.close()


def get_equipment_temporal_events(tag: str) -> List[Dict[str, Any]]:
    """Synthesize complete multi-week chronological history for an equipment tag."""
    events: List[Dict[str, Any]] = []
    conn = get_db()
    try:
        tag_clean = tag.strip().upper()
        # 1. Documents referencing tag
        doc_rows = conn.execute(
            """SELECT id, filename, upload_time, doc_type, document_date
               FROM documents WHERE UPPER(equipment_tags) LIKE ? ORDER BY upload_time ASC""",
            (f"%{tag_clean}%",)
        ).fetchall()
        for r in doc_rows:
            events.append({
                "type": "document_ingested",
                "timestamp": r["upload_time"],
                "date": r["document_date"] or str(r["upload_time"])[:10],
                "title": f"Document Ingested: {r['filename']}",
                "description": f"Processed {r['doc_type'] or 'report'}.",
                "ref_id": r["id"],
                "severity": "INFO",
            })

        # 2. Key measurements
        meas_rows = conn.execute(
            """SELECT parameter, value, unit, measurement_date, source_line
               FROM measurements WHERE UPPER(equipment_tag) = ? ORDER BY measurement_date ASC""",
            (tag_clean,)
        ).fetchall()
        for m in meas_rows:
            events.append({
                "type": "measurement_recorded",
                "timestamp": m["measurement_date"],
                "date": str(m["measurement_date"])[:10],
                "title": f"Measurement: {m['parameter']} = {m['value']} {m['unit'] or ''}",
                "description": m["source_line"] or "",
                "severity": "INFO",
            })

        # 3. Alerts
        alert_rows = conn.execute(
            """SELECT id, alert_type, severity, title, created_at, status, acknowledged_by, acknowledged_at
               FROM alerts WHERE UPPER(equipment_tags) LIKE ? ORDER BY created_at ASC""",
            (f"%{tag_clean}%",)
        ).fetchall()
        for a in alert_rows:
            events.append({
                "type": "alert_triggered",
                "timestamp": a["created_at"],
                "date": str(a["created_at"])[:10],
                "title": f"Alert [{a['severity']}]: {a['title']}",
                "description": f"Status: {a['status']}. " + (f"Acknowledged by {a['acknowledged_by']} at {a['acknowledged_at']}" if a['acknowledged_at'] else "Unacknowledged"),
                "ref_id": a["id"],
                "severity": a["severity"],
            })

        # 4. Action Notes
        note_rows = conn.execute(
            """SELECT id, ref_number, title, severity, status, created_at, approved_by, approved_at,
                      acknowledged_by, acknowledged_at, escalation_level
               FROM action_notes WHERE UPPER(equipment_tag) = ? ORDER BY created_at ASC""",
            (tag_clean,)
        ).fetchall()
        for n in note_rows:
            events.append({
                "type": "action_note_drafted",
                "timestamp": n["created_at"],
                "date": str(n["created_at"])[:10],
                "title": f"Action Note {n['ref_number']} [L{n['escalation_level'] or 1}]",
                "description": f"Title: {n['title']} (Status: {n['status']}). " + (f"Approved by {n['approved_by']}" if n['approved_by'] else "Pending review"),
                "ref_id": n["id"],
                "severity": n["severity"],
            })

        # 5. Escalations
        esc_rows = conn.execute(
            """SELECT id, from_level, to_level, trigger_reason, days_unacted, escalated_to_role, escalated_at
               FROM incident_escalations WHERE UPPER(equipment_tag) = ? ORDER BY escalated_at ASC""",
            (tag_clean,)
        ).fetchall()
        for e in esc_rows:
            events.append({
                "type": "incident_escalated",
                "timestamp": e["escalated_at"],
                "date": str(e["escalated_at"])[:10],
                "title": f"Automated Escalation: Level {e['from_level']} -> Level {e['to_level']}",
                "description": f"{e['trigger_reason']} ({e['days_unacted']} days unacted). Dispatched to {e['escalated_to_role']}.",
                "ref_id": e["id"],
                "severity": "CRITICAL",
            })
    finally:
        conn.close()

    events.sort(key=lambda x: str(x.get("timestamp") or ""))
    return events


# --------------------------------------------------------------------------------------
# ZINGO User Identity, Profile, Capabilities, Memory, Permissions & Connectors
# --------------------------------------------------------------------------------------

def get_user_profile(user_id: str = "default_user") -> Dict[str, Any]:
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM user_profile WHERE user_id = ?", (user_id,)).fetchone()
        if row:
            return dict(row)
        # Default fallback
        return {
            "user_id": user_id,
            "full_name": "Div",
            "preferred_name": "Div",
            "work_role": "Refinery Process Engineer (CDU/VDU)",
            "personal_preferences": "Ask clarifying questions before giving detailed answers. Keep technical explanations rigorous and precise.",
            "updated_at": datetime.now().isoformat(),
        }
    finally:
        conn.close()


def upsert_user_profile(
    user_id: str = "default_user",
    full_name: Optional[str] = None,
    preferred_name: Optional[str] = None,
    work_role: Optional[str] = None,
    personal_preferences: Optional[str] = None,
) -> Dict[str, Any]:
    curr = get_user_profile(user_id)
    new_full = full_name if full_name is not None else curr.get("full_name", "Div")
    new_pref = preferred_name if preferred_name is not None else curr.get("preferred_name", "Div")
    new_role = work_role if work_role is not None else curr.get("work_role", "")
    new_prefs = personal_preferences if personal_preferences is not None else curr.get("personal_preferences", "")
    now = datetime.now().isoformat()

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO user_profile (user_id, full_name, preferred_name, work_role, personal_preferences, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET
                   full_name = excluded.full_name,
                   preferred_name = excluded.preferred_name,
                   work_role = excluded.work_role,
                   personal_preferences = excluded.personal_preferences,
                   updated_at = excluded.updated_at""",
            (user_id, new_full, new_pref, new_role, new_prefs, now)
        )
        conn.commit()
    finally:
        conn.close()
    log_audit("user_profile_updated", user_id, None, "settings", {"full_name": new_full, "preferred_name": new_pref})
    return get_user_profile(user_id)


def get_user_capabilities(user_id: str = "default_user") -> Dict[str, Any]:
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM user_capabilities WHERE user_id = ?", (user_id,)).fetchone()
        if row:
            d = dict(row)
            for k in ("artifacts_enabled", "inline_visualizations", "code_execution",
                      "switch_models_on_flagged", "generate_memory_from_chats", "include_sensitive_topics"):
                d[k] = bool(d.get(k, 1))
            return d
        return {
            "user_id": user_id,
            "artifacts_enabled": True,
            "inline_visualizations": True,
            "code_execution": True,
            "switch_models_on_flagged": True,
            "generate_memory_from_chats": True,
            "include_sensitive_topics": False,
            "tool_access_mode": "auto",
            "updated_at": datetime.now().isoformat(),
        }
    finally:
        conn.close()


def update_user_capabilities(user_id: str = "default_user", updates: Optional[Dict[str, Any]] = None, **kwargs) -> Dict[str, Any]:
    all_updates = {}
    if updates:
        all_updates.update(updates)
    all_updates.update(kwargs)
    curr = get_user_capabilities(user_id)
    curr.update(all_updates)
    now = datetime.now().isoformat()

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO user_capabilities
               (user_id, artifacts_enabled, inline_visualizations, code_execution, switch_models_on_flagged,
                generate_memory_from_chats, include_sensitive_topics, tool_access_mode, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET
                   artifacts_enabled = excluded.artifacts_enabled,
                   inline_visualizations = excluded.inline_visualizations,
                   code_execution = excluded.code_execution,
                   switch_models_on_flagged = excluded.switch_models_on_flagged,
                   generate_memory_from_chats = excluded.generate_memory_from_chats,
                   include_sensitive_topics = excluded.include_sensitive_topics,
                   tool_access_mode = excluded.tool_access_mode,
                   updated_at = excluded.updated_at""",
            (user_id, int(curr["artifacts_enabled"]), int(curr["inline_visualizations"]),
             int(curr["code_execution"]), int(curr["switch_models_on_flagged"]),
             int(curr["generate_memory_from_chats"]), int(curr["include_sensitive_topics"]),
             curr.get("tool_access_mode", "auto"), now)
        )
        conn.commit()
    finally:
        conn.close()
    log_audit("user_capabilities_updated", user_id, None, "settings", updates)
    return get_user_capabilities(user_id)


def get_user_memory_files(user_id: str = "default_user", category: Optional[str] = None) -> List[Dict[str, Any]]:
    where, params = " WHERE user_id = ?", [user_id]
    if category:
        where += " AND category = ?"; params.append(category)

    conn = get_db()
    try:
        rows = conn.execute(f"SELECT * FROM user_memory_files {where} ORDER BY updated_at DESC", params).fetchall()
        results = []
        for r in rows:
            d = dict(r)
            d["is_sensitive"] = bool(d.get("is_sensitive", 0))
            results.append(d)
        return results
    finally:
        conn.close()


def add_user_memory_file(
    user_id: str = "default_user",
    title: str = "",
    content: str = "",
    category: str = "general",
    is_sensitive: bool = False,
) -> Dict[str, Any]:
    now = datetime.now().isoformat()
    clean_title = title.strip() or "Observed Note"
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO user_memory_files
               (user_id, title, content, category, is_sensitive, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (user_id, clean_title, content.strip(), category, int(is_sensitive), now, now)
        )
        conn.commit()
        mem_id = cur.lastrowid
    finally:
        conn.close()
    log_audit("user_memory_added", user_id, None, "memory", {"id": mem_id, "title": clean_title, "category": category})
    return {"id": mem_id, "title": clean_title, "content": content, "category": category, "is_sensitive": is_sensitive, "updated_at": now}


def update_user_memory_file(
    memory_id: int,
    title: Optional[str] = None,
    content: Optional[str] = None,
    category: Optional[str] = None,
    is_sensitive: Optional[bool] = None,
) -> Optional[Dict[str, Any]]:
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM user_memory_files WHERE id = ?", (memory_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        new_title = title if title is not None else d["title"]
        new_content = content if content is not None else d["content"]
        new_cat = category if category is not None else d["category"]
        new_sens = int(is_sensitive) if is_sensitive is not None else d["is_sensitive"]
        now = datetime.now().isoformat()

        conn.execute(
            """UPDATE user_memory_files
               SET title = ?, content = ?, category = ?, is_sensitive = ?, updated_at = ?
               WHERE id = ?""",
            (new_title, new_content, new_cat, new_sens, now, memory_id)
        )
        conn.commit()
        return {"id": memory_id, "title": new_title, "content": new_content, "category": new_cat, "is_sensitive": bool(new_sens), "updated_at": now}
    finally:
        conn.close()


def delete_user_memory_file(memory_id: int) -> bool:
    conn = get_db()
    try:
        cur = conn.execute("DELETE FROM user_memory_files WHERE id = ?", (memory_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def clear_user_memory_files(user_id: str = "default_user") -> bool:
    conn = get_db()
    try:
        conn.execute("DELETE FROM user_memory_files WHERE user_id = ?", (user_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def get_user_permissions(user_id: str = "default_user") -> Dict[str, Any]:
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM user_permissions WHERE user_id = ?", (user_id,)).fetchone()
        if row:
            d = dict(row)
            d["location_permitted"] = bool(d.get("location_permitted", 1))
            d["calendar_permitted"] = bool(d.get("calendar_permitted", 1))
            return d
        return {
            "user_id": user_id,
            "location_permitted": True,
            "location_label": "Mangaluru, Karnataka, India (Refinery Complex)",
            "location_coords": "12.9141° N, 74.8560° E",
            "calendar_permitted": True,
            "calendar_account": "div.engineer@mrpl.co.in",
            "updated_at": datetime.now().isoformat(),
        }
    finally:
        conn.close()


def update_user_permissions(user_id: str = "default_user", updates: Optional[Dict[str, Any]] = None, **kwargs) -> Dict[str, Any]:
    all_updates = {}
    if updates:
        all_updates.update(updates)
    all_updates.update(kwargs)
    curr = get_user_permissions(user_id)
    curr.update(all_updates)
    now = datetime.now().isoformat()

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO user_permissions
               (user_id, location_permitted, location_label, location_coords, calendar_permitted, calendar_account, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET
                   location_permitted = excluded.location_permitted,
                   location_label = excluded.location_label,
                   location_coords = excluded.location_coords,
                   calendar_permitted = excluded.calendar_permitted,
                   calendar_account = excluded.calendar_account,
                   updated_at = excluded.updated_at""",
            (user_id, int(curr["location_permitted"]), curr.get("location_label", ""),
             curr.get("location_coords", ""), int(curr["calendar_permitted"]),
             curr.get("calendar_account", ""), now)
        )
        conn.commit()
    finally:
        conn.close()
    log_audit("user_permissions_updated", user_id, None, "settings", updates)
    return get_user_permissions(user_id)


def get_user_connectors(user_id: str = "default_user") -> List[Dict[str, Any]]:
    conn = get_db()
    try:
        defaults = {dict(r)["connector_key"]: dict(r) for r in conn.execute("SELECT * FROM user_connectors WHERE user_id = 'default_user'").fetchall()}
        user_rows = {dict(r)["connector_key"]: dict(r) for r in conn.execute("SELECT * FROM user_connectors WHERE user_id = ?", (user_id,)).fetchall()}
        merged = {**defaults, **user_rows}
        results = []
        for key in sorted(merged.keys()):
            d = dict(merged[key])
            try:
                d["config"] = json.loads(d.get("config_json") or "{}")
            except Exception:
                d["config"] = {}
            results.append(d)
        return results
    finally:
        conn.close()


def toggle_user_connector(
    connector_key: str,
    status: Optional[str] = None,
    user_id: str = "default_user",
    account_email: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM user_connectors WHERE connector_key = ? AND user_id = ?", (connector_key, user_id)).fetchone()
        now = datetime.now().isoformat()
        if row:
            curr_status = row["status"]
            new_status = status if status is not None else ("disconnected" if curr_status == "connected" else "connected")
            new_email = account_email if account_email is not None else row["account_email"]
            new_cfg = json.dumps(config) if config is not None else row["config_json"]
            conn.execute(
                """UPDATE user_connectors
                   SET status = ?, account_email = ?, config_json = ?, updated_at = ?
                   WHERE connector_key = ? AND user_id = ?""",
                (new_status, new_email, new_cfg, now, connector_key, user_id)
            )
        else:
            new_status = status or "connected"
            conn.execute(
                """INSERT INTO user_connectors
                   (connector_key, user_id, name, description, status, account_email, config_json, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (connector_key, user_id, connector_key.replace("_", " ").title(),
                 f"Connected integration for {connector_key}", new_status, account_email,
                 json.dumps(config or {}), now)
            )
        conn.commit()
    finally:
        conn.close()
    log_audit("connector_toggled", user_id, None, "connectors", {"connector_key": connector_key, "status": new_status})
    return {"connector_key": connector_key, "status": new_status, "updated_at": now}


def delete_user_account(user_id: str = "default_user") -> bool:
    """Wipe user profile, custom memories, conversations, and reset to clean slate."""
    conn = get_db()
    try:
        conn.execute("DELETE FROM user_memory_files WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM conversations WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM conversation_messages WHERE user_id = ?", (user_id,))
        # Reset profile and capabilities to defaults
        now = datetime.now().isoformat()
        conn.execute(
            """UPDATE user_profile
               SET full_name = 'Div', preferred_name = 'Div', work_role = 'Refinery Process Engineer (CDU/VDU)',
                   personal_preferences = 'Provide direct, precise, knowledgeable answers. When asked about identity or responsibilities, answer specifically using the profile and memory context.', updated_at = ?
               WHERE user_id = ?""",
            (now, user_id)
        )
        conn.execute(
            """UPDATE user_capabilities
               SET artifacts_enabled = 1, inline_visualizations = 1, code_execution = 1,
                   switch_models_on_flagged = 1, generate_memory_from_chats = 1, include_sensitive_topics = 0,
                   tool_access_mode = 'auto', updated_at = ?
               WHERE user_id = ?""",
            (now, user_id)
        )
        conn.commit()
        log_audit("user_account_reset", user_id, None, "account", {"action": "account_reset_to_defaults"})
        return True
    finally:
        conn.close()


def build_zingo_identity_prompt(user_id: str = "default_user") -> str:
    """Builds ZINGO system prompt injection from user profile, capabilities, memory, permissions, and connectors."""
    profile = get_user_profile(user_id)
    caps = get_user_capabilities(user_id)
    perms = get_user_permissions(user_id)
    mems = get_user_memory_files(user_id)
    connectors = get_user_connectors(user_id)

    sections = []

    # 0. Identity Instructions (prepended first -- highest priority)
    sections.append(
        "<identity_instructions>\n"
        "You know who the user is. You have their full profile, role, and memory files available.\n"
        "When the user asks 'Who am I?', 'What's my responsibility?', 'Do you know me?', "
        "'What do I do?', or any variant about their identity, role, plant, equipment, or background:\n"
        "- Answer directly and specifically using the <user_profile> and <user_memory> below.\n"
        "- Mention their name, role, plant unit (CDU-2, VDU-1), and key responsibilities.\n"
        "- NEVER respond with generic deflections like 'How can I assist you today?' or 'I'm not sure'.\n"
        "- NEVER ask them who they are -- you already know.\n"
        "For math, chemical equations, and scientific notation, use proper LaTeX:\n"
        "- Inline: $...$ or \\(...\\)  |  Display block: $$...$$ or \\[...\\]\n"
        "- Use \\text{} for chemical element names in subscripts, e.g.: $\\text{CO}_2$\n"
        "- Use \\mathrm{} for molecular formulae, e.g.: $\\mathrm{C_6H_{12}O_6}$\n"
        "</identity_instructions>"
    )

    # 1. User Profile & Personal Preferences
    full_name = profile.get("full_name") or "Div"
    preferred_name = profile.get("preferred_name") or full_name
    work_role = profile.get("work_role") or "Refinery Process Engineer (CDU/VDU)"
    prefs = profile.get("personal_preferences") or "Provide direct, precise, knowledgeable answers."

    sections.append(
        f"<user_profile>\n"
        f"Full Name: {full_name}\n"
        f"What to call the user (Preferred Name): {preferred_name}\n"
        f"Professional Role & Designation: {work_role}\n"
        f"Personal Preferences for Model Responses:\n{prefs}\n"
        f"Note: Always respect these personal preferences in every response.\n"
        f"</user_profile>"
    )

    # 2. User Memory Files
    if mems and caps.get("generate_memory_from_chats", True):
        # Filter sensitive topics if disallowed
        include_sens = caps.get("include_sensitive_topics", False)
        filtered_mems = [m for m in mems if include_sens or not m.get("is_sensitive", False)]
        if filtered_mems:
            mem_bullets = "\n".join([f"- [{m.get('category', 'general').upper()} - {m.get('title')}]: {m.get('content')}" for m in filtered_mems[:8]])
            sections.append(
                f"<user_memory>\n"
                f"What you remember about this user across past conversations:\n"
                f"{mem_bullets}\n"
                f"</user_memory>"
            )

    # 3. Capabilities & Active Features
    cap_lines = []
    if caps.get("artifacts_enabled", True):
        cap_lines.append("- Artifacts: Enabled. When generating substantial code, self-contained interactive sheets, HTML/SVG dashboards, or formal documents, package them cleanly as artifacts.")
    else:
        cap_lines.append("- Artifacts: Disabled by user. Present output as standard inline markdown.")

    if caps.get("inline_visualizations", True):
        cap_lines.append("- Inline Visualizations: Enabled. Generate interactive charts, SVG diagrams, and KaTeX equations directly in chat.")
    else:
        cap_lines.append("- Inline Visualizations: Disabled by user. Do not render inline SVG diagrams; use formatted text or markdown tables.")

    if caps.get("code_execution", True):
        cap_lines.append("- Code Execution: Enabled. You have access to the local sandboxed Python scientific execution runtime.")
    else:
        cap_lines.append("- Code Execution: Disabled by user. Do not attempt to run code.")

    cap_lines.append(f"- Tool Access Mode: {caps.get('tool_access_mode', 'auto').title()} (The model chooses relevant tools automatically).")

    sections.append(
        f"<capabilities_and_tools>\n"
        + "\n".join(cap_lines) + "\n"
        f"</capabilities_and_tools>"
    )

    # 4. Environment & Permissions
    now_str = datetime.now().strftime("%A, %B %d, %Y %I:%M %p")
    env_lines = [f"- Current Date & Time: {now_str}"]
    if perms.get("location_permitted", True):
        lbl = perms.get("location_label") or "Mangaluru, Karnataka, India"
        coords = perms.get("location_coords") or ""
        env_lines.append(f"- User Location: {lbl}" + (f" ({coords})" if coords else ""))
    if perms.get("calendar_permitted", True):
        cal = perms.get("calendar_account") or "Synchronized"
        env_lines.append(f"- Calendar Access: Active ({cal})")

    sections.append(
        f"<environment_permissions>\n"
        + "\n".join(env_lines) + "\n"
        f"</environment_permissions>"
    )

    # 5. Connected Services & Integrations
    active_conns = [c for c in connectors if c.get("status") in ("connected", "active")]
    if active_conns:
        conn_lines = []
        for c in active_conns:
            acc_str = f" [Account: {c['account_email']}]" if c.get("account_email") else ""
            status_str = " (Built-in Active)" if c.get("status") == "active" else " (Connected)"
            conn_lines.append(f"- {c['name']}{status_str}{acc_str}: {c.get('description', 'Connected')}")
        sections.append(
            f"<connected_services>\n"
            f"The user has actively authorized the following connectors and services:\n"
            + "\n".join(conn_lines) + "\n"
            f"You may search, reference, and synthesize information from these connected services.\n"
            f"</connected_services>"
        )

    return "\n\n".join(sections)


def bootstrap() -> Dict[str, Any]:
    """Called once at server startup."""
    init_db()
    get_chroma()
    G = get_plant_graph()
    save_plant_graph(G)
    log_audit("system_startup", "system", None, "core",
              {"chroma": "native" if CHROMA_AVAILABLE else "fallback",
               "graph_nodes": G.number_of_nodes()})
    return {
        "db": DB_PATH,
        "chroma": "native" if CHROMA_AVAILABLE else "fallback",
        "graph_nodes": G.number_of_nodes(),
        "graph_edges": G.number_of_edges(),
    }
