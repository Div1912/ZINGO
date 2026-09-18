"""
ZINGO — Persistent Conversation & Episodic Memory Router
========================================================
Mounted at /api/conversations and /api/memory

Provides true multi-tier persistent memory:
1. Long-term conversational memory across sessions and devices
2. Assistant thinking steps and telemetry persistence
3. Equipment episodic memory (operational facts, failure history, baseline overrides)

SOVEREIGNTY RULE: Zero external network calls.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from data_layer import (
    get_db,
    get_equipment_memory,
    log_audit,
    rows_to_dicts,
    save_equipment_memory,
)

router = APIRouter(tags=["conversations", "memory"])


# --------------------------------------------------------------------------------------
# Pydantic Request Models
# --------------------------------------------------------------------------------------

class CreateConversationPayload(BaseModel):
    id: Optional[str] = None
    title: str
    model: str = "qwen3:8b"
    project_id: Optional[str] = None
    pinned: bool = False
    tags: Optional[str] = None
    summary: Optional[str] = None


class UpdateConversationPayload(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    project_id: Optional[str] = None
    pinned: Optional[bool] = None
    tags: Optional[str] = None
    summary: Optional[str] = None


class SaveMessagePayload(BaseModel):
    id: Optional[str] = None
    role: str
    content: str
    timestamp: Optional[str] = None
    model_used: Optional[str] = None
    task_type: Optional[str] = None
    sources: Optional[List[Dict[str, Any]]] = None
    files: Optional[List[Dict[str, Any]]] = None
    think_steps: Optional[List[Dict[str, Any]]] = None
    raw_thinking: Optional[str] = None
    tokens_used: Optional[int] = None
    latency_ms: Optional[int] = None
    effort: Optional[str] = None
    artifact_ids: Optional[List[str]] = None
    error: Optional[str] = None


class SaveEpisodicMemoryPayload(BaseModel):
    memory_type: str = "operational_fact"
    key: str
    value: str
    confidence: float = 1.0
    source_doc_id: Optional[int] = None


# --------------------------------------------------------------------------------------
# Conversations Endpoints
# --------------------------------------------------------------------------------------

@router.get("/api/conversations")
async def list_conversations(
    project_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
):
    """Retrieve all conversations, optionally filtered by workspace project."""
    conn = get_db()
    try:
        where = " WHERE 1=1"
        params: List[Any] = []
        if project_id:
            where += " AND project_id = ?"
            params.append(project_id)

        rows = rows_to_dicts(conn.execute(
            f"""SELECT c.*,
                       (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count,
                       (SELECT content FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_message
                FROM conversations c
                {where}
                ORDER BY c.pinned DESC, c.updated_at DESC
                LIMIT ?""",
            params + [limit],
        ).fetchall())

        for r in rows:
            r["pinned"] = bool(r.get("pinned"))

        return {"total": len(rows), "conversations": rows}
    finally:
        conn.close()


@router.post("/api/conversations")
async def create_conversation(payload: CreateConversationPayload):
    """Create and persist a new conversation thread."""
    conv_id = payload.id or str(uuid4())
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO conversations
               (id, title, created_at, updated_at, model, project_id, pinned, tags, summary)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                conv_id,
                payload.title,
                now,
                now,
                payload.model,
                payload.project_id,
                1 if payload.pinned else 0,
                payload.tags,
                payload.summary,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    log_audit("conversation_created", "user", None, "chat", {"conversation_id": conv_id, "title": payload.title})
    return {
        "id": conv_id,
        "title": payload.title,
        "created_at": now,
        "updated_at": now,
        "model": payload.model,
        "project_id": payload.project_id,
        "pinned": payload.pinned,
    }


@router.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    """Retrieve conversation details and full message history."""
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"Conversation '{conv_id}' not found.")
        conv = dict(row)
        conv["pinned"] = bool(conv.get("pinned"))

        msg_rows = rows_to_dicts(conn.execute(
            """SELECT * FROM conversation_messages
               WHERE conversation_id = ?
               ORDER BY timestamp ASC""",
            (conv_id,),
        ).fetchall())

        messages = []
        for m in msg_rows:
            msg = {
                "id": m["id"],
                "role": m["role"],
                "content": m["content"],
                "timestamp": m["timestamp"],
                "modelUsed": m.get("model_used"),
                "taskType": m.get("task_type"),
                "rawThinking": m.get("raw_thinking"),
                "tokensUsed": m.get("tokens_used"),
                "latencyMs": m.get("latency_ms"),
                "effort": m.get("effort"),
                "error": m.get("error"),
            }
            # Deserialize JSON blobs
            for field, target in [
                ("sources_json", "sources"),
                ("files_json", "files"),
                ("think_steps_json", "thinkSteps"),
                ("artifact_ids_json", "artifactIds"),
            ]:
                try:
                    msg[target] = json.loads(m.get(field) or "[]")
                except json.JSONDecodeError:
                    msg[target] = []
            messages.append(msg)

        conv["messages"] = messages
        return conv
    finally:
        conn.close()


@router.post("/api/conversations/{conv_id}/messages")
async def save_conversation_message(conv_id: str, payload: SaveMessagePayload):
    """Save an incoming or assistant response message to the persistent store."""
    msg_id = payload.id or str(uuid4())
    now = payload.timestamp or datetime.now().isoformat()
    conn = get_db()
    try:
        # Verify conversation exists; if not, create it on the fly
        exists = conn.execute("SELECT id FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        if not exists:
            title = payload.content[:40].strip() or "New Conversation"
            conn.execute(
                """INSERT INTO conversations (id, title, created_at, updated_at, model)
                   VALUES (?, ?, ?, ?, 'qwen3:8b')""",
                (conv_id, title, now, now),
            )

        conn.execute(
            """INSERT INTO conversation_messages
               (id, conversation_id, role, content, timestamp, model_used, task_type,
                sources_json, files_json, think_steps_json, raw_thinking, tokens_used,
                latency_ms, effort, artifact_ids_json, error)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                msg_id,
                conv_id,
                payload.role,
                payload.content,
                now,
                payload.model_used,
                payload.task_type,
                json.dumps(payload.sources or []),
                json.dumps(payload.files or []),
                json.dumps(payload.think_steps or []),
                payload.raw_thinking,
                payload.tokens_used,
                payload.latency_ms,
                payload.effort,
                json.dumps(payload.artifact_ids or []),
                payload.error,
            ),
        )

        # Update parent conversation timestamp
        conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conv_id))
        conn.commit()
        return {"id": msg_id, "conversation_id": conv_id, "status": "saved"}
    finally:
        conn.close()


@router.put("/api/conversations/{conv_id}")
async def update_conversation(conv_id: str, payload: UpdateConversationPayload):
    """Update conversation metadata (rename, pin, switch project)."""
    conn = get_db()
    try:
        fields = []
        params = []
        if payload.title is not None:
            fields.append("title = ?"); params.append(payload.title)
        if payload.model is not None:
            fields.append("model = ?"); params.append(payload.model)
        if payload.project_id is not None:
            fields.append("project_id = ?"); params.append(payload.project_id)
        if payload.pinned is not None:
            fields.append("pinned = ?"); params.append(1 if payload.pinned else 0)
        if payload.tags is not None:
            fields.append("tags = ?"); params.append(payload.tags)
        if payload.summary is not None:
            fields.append("summary = ?"); params.append(payload.summary)

        if not fields:
            return {"id": conv_id, "status": "no_changes"}

        fields.append("updated_at = ?")
        params.append(datetime.now().isoformat())
        params.append(conv_id)

        conn.execute(f"UPDATE conversations SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
        return {"id": conv_id, "status": "updated"}
    finally:
        conn.close()


@router.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """Permanently remove conversation and associated messages."""
    conn = get_db()
    try:
        conn.execute("DELETE FROM conversation_messages WHERE conversation_id = ?", (conv_id,))
        cur = conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, f"Conversation '{conv_id}' not found.")
        return {"id": conv_id, "deleted": True}
    finally:
        conn.close()


# --------------------------------------------------------------------------------------
# Episodic Equipment Memory Endpoints
# --------------------------------------------------------------------------------------

@router.get("/api/memory/equipment/{tag}")
async def get_tag_memory(tag: str, memory_type: Optional[str] = Query(None)):
    """Retrieve persistent operational memory facts for an equipment tag."""
    facts = get_equipment_memory(tag, memory_type=memory_type)
    return {"tag": tag.upper(), "total_facts": len(facts), "facts": facts}


@router.post("/api/memory/equipment/{tag}")
async def save_tag_memory(tag: str, payload: SaveEpisodicMemoryPayload):
    """Persist an operational fact or engineering override to equipment memory."""
    mem_id = save_equipment_memory(
        tag=tag,
        memory_type=payload.memory_type,
        key=payload.key,
        value=payload.value,
        confidence=payload.confidence,
        source_doc_id=payload.source_doc_id,
    )
    return {"id": mem_id, "tag": tag.upper(), "status": "saved"}
