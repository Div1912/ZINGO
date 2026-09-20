"""
ZINGO — Native Model Context Protocol (MCP) Host
================================================
Provides a production-grade, sovereign MCP JSON-RPC 2.0 server & router
exposing filesystem, SQLite database, and dual-node cluster operations
to LLM agents and external MCP clients (Claude Desktop, Cursor, Aira).
"""

from __future__ import annotations
import os
import json
import sqlite3
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

mcp_router = APIRouter(prefix="/api/mcp", tags=["Model Context Protocol"])

WORKSPACE_ROOT = os.path.abspath(os.path.dirname(__file__))

# ---------------------------------------------------------------------------
# MCP Tool Definitions (JSON-RPC 2.0 / MCP Protocol Schema)
# ---------------------------------------------------------------------------

MCP_TOOLS = [
    {
        "name": "read_file",
        "description": "Read the text content of a file within the sovereign workspace repository.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "relative_path": {
                    "type": "string",
                    "description": "Path relative to the project root (e.g. 'cot_backend.py', 'aira/src/App.tsx')"
                }
            },
            "required": ["relative_path"]
        }
    },
    {
        "name": "list_directory",
        "description": "List files and directories in a given relative folder within the sovereign workspace.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "relative_path": {
                    "type": "string",
                    "description": "Relative directory path (e.g. '' for root, 'aira/src')"
                }
            }
        }
    },
    {
        "name": "sqlite_query",
        "description": "Execute a safe, read-only SELECT query against the ZINGO SQLite sovereign data layer.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "Read-only SELECT SQL statement (e.g. 'SELECT id, filename FROM documents LIMIT 5')"
                }
            },
            "required": ["sql"]
        }
    },
    {
        "name": "cluster_status",
        "description": "Retrieve live telemetry, active streams, and health of Laptop 1 (Primary) and Laptop 2 (Worker).",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    }
]

# ---------------------------------------------------------------------------
# Tool Executors
# ---------------------------------------------------------------------------

def _safe_resolve_path(rel_path: str) -> str:
    """Ensure path stays within workspace boundaries (path traversal defense)."""
    norm = os.path.normpath(os.path.join(WORKSPACE_ROOT, rel_path))
    if not norm.startswith(WORKSPACE_ROOT):
        raise PermissionError("Access denied: path attempts to escape sovereign workspace boundary.")
    return norm

def execute_read_file(args: Dict[str, Any]) -> Dict[str, Any]:
    rel = args.get("relative_path", "")
    target = _safe_resolve_path(rel)
    if not os.path.exists(target):
        return {"error": f"File not found: {rel}"}
    if os.path.isdir(target):
        return {"error": f"Path is a directory, not a file: {rel}"}
    try:
        with open(target, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(50000) # Max 50KB safety limit
        return {"content": content, "size_bytes": len(content)}
    except Exception as e:
        return {"error": str(e)}

def execute_list_directory(args: Dict[str, Any]) -> Dict[str, Any]:
    rel = args.get("relative_path", "") or ""
    target = _safe_resolve_path(rel)
    if not os.path.exists(target):
        return {"error": f"Directory not found: {rel}"}
    try:
        entries = []
        for name in os.listdir(target):
            if name.startswith((".", "node_modules", "dist", "__pycache__")):
                continue
            full = os.path.join(target, name)
            entries.append({
                "name": name,
                "is_dir": os.path.isdir(full),
                "size": os.path.getsize(full) if os.path.isfile(full) else None
            })
        return {"entries": entries, "count": len(entries)}
    except Exception as e:
        return {"error": str(e)}

def execute_sqlite_query(args: Dict[str, Any]) -> Dict[str, Any]:
    sql = (args.get("sql") or "").strip()
    if not sql.upper().startswith("SELECT"):
        return {"error": "Only read-only SELECT queries are permitted via MCP sqlite_query."}
    
    db_path = os.path.join(WORKSPACE_ROOT, "data_layer.db")
    if not os.path.exists(db_path):
        return {"error": "data_layer.db does not exist yet."}
    
    try:
        conn = sqlite3.connect(db_path, timeout=5.0)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(sql)
        rows = [dict(r) for r in cur.fetchmany(100)]
        conn.close()
        return {"rows": rows, "count": len(rows)}
    except Exception as e:
        return {"error": str(e)}

def execute_cluster_status(args: Dict[str, Any]) -> Dict[str, Any]:
    from server import cluster_balancer
    with cluster_balancer._lock:
        streams = dict(cluster_balancer.active_streams)
    return {
        "status": "online",
        "primary_node": {
            "role": "Synthesis & Reasoning",
            "model": "qwen3:8b",
            "active_streams": streams.get("primary", 0),
        },
        "laptop2_node": {
            "role": "Fast Speculative Planning & Multimodal Vision",
            "model": "qwen2.5-vl:3b",
            "active_streams": streams.get("laptop2", 0),
            "endpoint": cluster_balancer.laptop2_url,
        }
    }

TOOL_REGISTRY = {
    "read_file": execute_read_file,
    "list_directory": execute_list_directory,
    "sqlite_query": execute_sqlite_query,
    "cluster_status": execute_cluster_status,
}

# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

class ToolCallRequest(BaseModel):
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)

@mcp_router.get("/tools")
async def list_tools():
    """Returns available MCP tools adhering to the Model Context Protocol standard."""
    return {"tools": MCP_TOOLS}

@mcp_router.post("/call")
async def call_tool(req: ToolCallRequest):
    """Executes an MCP tool with provided arguments."""
    handler = TOOL_REGISTRY.get(req.name)
    if not handler:
        raise HTTPException(status_code=404, detail=f"MCP tool '{req.name}' not found.")
    result = handler(req.arguments)
    return {"name": req.name, "result": result}

@mcp_router.post("/jsonrpc")
async def jsonrpc_handler(request: Request):
    """
    Standard JSON-RPC 2.0 MCP Transport Endpoint.
    Handles 'initialize', 'tools/list', and 'tools/call'.
    """
    body = await request.json()
    req_id = body.get("id")
    method = body.get("method")
    params = body.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {"listChanged": False},
                },
                "serverInfo": {
                    "name": "zingo-sovereign-mcp",
                    "version": "1.0.0"
                }
            }
        }
    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": MCP_TOOLS}
        }
    elif method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})
        handler = TOOL_REGISTRY.get(tool_name)
        if not handler:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Tool not found: {tool_name}"}
            }
        res = handler(tool_args)
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "content": [{"type": "text", "text": json.dumps(res, indent=2)}]
            }
        }
    else:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not supported: {method}"}
        }
