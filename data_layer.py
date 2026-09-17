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

CREATE INDEX IF NOT EXISTS idx_meas_tag   ON measurements(equipment_tag);
CREATE INDEX IF NOT EXISTS idx_meas_doc   ON measurements(doc_id);
CREATE INDEX IF NOT EXISTS idx_alert_stat ON alerts(status, severity);
CREATE INDEX IF NOT EXISTS idx_shift      ON shift_events(shift_date, shift_type);
CREATE INDEX IF NOT EXISTS idx_audit_ts   ON audit_log(timestamp);
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
    """Create every table/index if it does not already exist."""
    with _db_lock:
        conn = get_db()
        try:
            conn.executescript(SCHEMA)
            # Lightweight migrations for databases created by an earlier version.
            for table, column, decl in [("alerts", "dedupe_key", "TEXT")]:
                cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
                if column not in cols:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
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
