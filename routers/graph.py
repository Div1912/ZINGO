"""
FEATURE 6 — Knowledge Graph Visualiser & Query Engine
=====================================================
Mounted at /api/graph

Exposes the plant topology for visualisation, computes a health score per asset, and
translates natural-language questions into graph traversals via the local model.

Zero external network calls.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import networkx as nx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import llm
from data_layer import (
    get_db, get_plant_graph, log_audit, parse_tags, rows_to_dicts,
    save_plant_graph, upsert_equipment_node,
)

router = APIRouter(prefix="/api/graph", tags=["graph"])

NL_QUERY_SYSTEM = """Convert this question about plant equipment into a structured query:
Return JSON: {"query_type": "find_equipment|find_path|find_connected|find_anomalies", "tags": [], "hops": 1, "filters": {}}
Return ONLY the JSON object."""


# --------------------------------------------------------------------------------------
# Health scoring
# --------------------------------------------------------------------------------------

def compute_health_scores() -> Dict[str, Dict[str, Any]]:
    """
    Start at 100.
      -30 per unclosed CRITICAL alert
      -15 per unclosed WARNING alert
      -10 if no inspection in 180+ days
      -5  per unresolved contradiction
    """
    G = get_plant_graph()
    conn = get_db()
    try:
        alerts = rows_to_dicts(conn.execute(
            "SELECT severity, equipment_tags FROM alerts WHERE status = 'active'").fetchall())
        contradictions = rows_to_dicts(conn.execute(
            "SELECT equipment_tag FROM contradictions WHERE status = 'open'").fetchall())
        last_meas = {r["equipment_tag"]: r["last_date"] for r in conn.execute(
            """SELECT UPPER(equipment_tag) AS equipment_tag, MAX(measurement_date) AS last_date
               FROM measurements GROUP BY UPPER(equipment_tag)""").fetchall()}
        doc_counts = {r["tag"]: r["c"] for r in conn.execute(
            "SELECT UPPER(equipment_tags) AS tag, COUNT(*) c FROM documents GROUP BY UPPER(equipment_tags)"
        ).fetchall()}
    finally:
        conn.close()

    tags = set(G.nodes())
    tags.update(last_meas.keys())
    for a in alerts:
        tags.update(parse_tags(a["equipment_tags"]))

    scores: Dict[str, Dict[str, Any]] = {}
    now = datetime.now()
    for tag in sorted(t for t in tags if t):
        node = dict(G.nodes[tag]) if tag in G else {}
        score, deductions = 100, []

        crit = sum(1 for a in alerts if tag in parse_tags(a["equipment_tags"]) and a["severity"] == "CRITICAL")
        warn = sum(1 for a in alerts if tag in parse_tags(a["equipment_tags"]) and a["severity"] == "WARNING")
        if crit:
            score -= 30 * crit
            deductions.append(f"-{30 * crit} for {crit} critical alert(s)")
        if warn:
            score -= 15 * warn
            deductions.append(f"-{15 * warn} for {warn} warning alert(s)")

        last_seen = last_meas.get(tag) or node.get("last_inspection_date")
        stale = True
        if last_seen:
            try:
                stale = (now - datetime.fromisoformat(str(last_seen)[:19])).days > 180
            except ValueError:
                stale = True
        if stale:
            score -= 10
            deductions.append("-10 for no inspection in 180+ days")

        contras = sum(1 for c in contradictions if (c["equipment_tag"] or "").upper() == tag)
        if contras:
            score -= 5 * contras
            deductions.append(f"-{5 * contras} for {contras} unresolved contradiction(s)")

        score = max(0, min(100, score))
        scores[tag] = {
            "tag": tag,
            "health_score": score,
            "equipment_type": node.get("equipment_type", "unknown"),
            "critical_alerts": crit,
            "warning_alerts": warn,
            "open_contradictions": contras,
            "last_measurement_date": last_seen,
            "inspection_stale": stale,
            "document_count": sum(v for k, v in doc_counts.items() if tag in (k or "")),
            "deductions": deductions,
            "band": ("critical" if score < 40 else "poor" if score < 60
                     else "fair" if score < 80 else "good"),
        }
    return scores


@router.get("/topology")
async def topology():
    """Nodes + edges annotated with alert counts and health scores, ready for force-graph."""
    G = get_plant_graph()
    scores = compute_health_scores()

    conn = get_db()
    try:
        alert_rows = rows_to_dicts(conn.execute(
            "SELECT severity, equipment_tags FROM alerts WHERE status='active'").fetchall())
    finally:
        conn.close()

    # Include alert-only tags so nothing is invisible on the map.
    for tag in scores:
        if tag not in G:
            upsert_equipment_node(G, tag)
    save_plant_graph(G)

    nodes = []
    for tag, attrs in G.nodes(data=True):
        info = scores.get(tag, {})
        nodes.append({
            "id": tag,
            "label": tag,
            "type": attrs.get("equipment_type") or "unknown",
            "service": attrs.get("service"),
            "line_number": attrs.get("line_number"),
            "alert_count": info.get("critical_alerts", 0) + info.get("warning_alerts", 0),
            "critical_alerts": info.get("critical_alerts", 0),
            "warning_alerts": info.get("warning_alerts", 0),
            "last_inspection": attrs.get("last_inspection_date") or info.get("last_measurement_date"),
            "last_measurement_date": info.get("last_measurement_date"),
            "health_score": info.get("health_score", 100),
            "band": info.get("band", "good"),
            "degree": G.degree(tag),
        })

    edges = [{
        "source": u, "target": v,
        "line_number": d.get("line_number"),
        "connection_type": d.get("connection_type", "process"),
        "inferred": bool(d.get("inferred")),
    } for u, v, d in G.edges(data=True)]

    return {
        "node_count": len(nodes), "edge_count": len(edges),
        "nodes": nodes, "edges": edges,
        "generated_at": datetime.now().isoformat(),
    }


@router.get("/equipment/{tag}")
async def equipment_detail(tag: str, hops: int = Query(2, ge=1, le=4)):
    """Click any equipment and see everything ZINGO knows about it."""
    tag = tag.upper()
    G = get_plant_graph()
    if tag not in G:
        conn = get_db()
        try:
            exists = conn.execute(
                "SELECT 1 FROM measurements WHERE UPPER(equipment_tag) = ? LIMIT 1", (tag,)).fetchone()
        finally:
            conn.close()
        if not exists:
            raise HTTPException(404, f"Equipment {tag} is not known to ZINGO.")
        upsert_equipment_node(G, tag)
        save_plant_graph(G)

    lengths = nx.single_source_shortest_path_length(G, tag, cutoff=hops)
    sub = G.subgraph(lengths.keys())

    conn = get_db()
    try:
        measurements = rows_to_dicts(conn.execute(
            """SELECT m.*, d.filename FROM measurements m LEFT JOIN documents d ON d.id = m.doc_id
               WHERE UPPER(m.equipment_tag) = ? ORDER BY m.measurement_date""", (tag,)).fetchall())
        alerts = rows_to_dicts(conn.execute(
            """SELECT id, alert_type, severity, title, status, created_at
               FROM alerts WHERE UPPER(equipment_tags) LIKE ? ORDER BY created_at DESC""",
            (f"%{tag}%",)).fetchall())
        documents = rows_to_dicts(conn.execute(
            """SELECT id, filename, doc_type, document_date, upload_time
               FROM documents WHERE UPPER(equipment_tags) LIKE ?
               ORDER BY COALESCE(document_date, upload_time) DESC""", (f"%{tag}%",)).fetchall())
        contradictions = rows_to_dicts(conn.execute(
            "SELECT * FROM contradictions WHERE UPPER(equipment_tag) = ?", (tag,)).fetchall())
    finally:
        conn.close()

    series: Dict[str, List[Dict[str, Any]]] = {}
    for m in measurements:
        series.setdefault(m["parameter"], []).append(
            {"date": m["measurement_date"], "value": m["value"], "unit": m["unit"],
             "doc_id": m["doc_id"], "document": m["filename"]})

    scores = compute_health_scores()
    return {
        "equipment_tag": tag,
        "attributes": dict(G.nodes[tag]),
        "health": scores.get(tag, {}),
        "hops": hops,
        "subgraph": {
            "nodes": [{"id": n, "hops": lengths[n], "type": G.nodes[n].get("equipment_type"),
                       "health_score": scores.get(n, {}).get("health_score", 100)}
                      for n in sub.nodes()],
            "edges": [{"source": u, "target": v, "line_number": d.get("line_number"),
                       "connection_type": d.get("connection_type")} for u, v, d in sub.edges(data=True)],
        },
        "connected_equipment": [{"tag": n, "hops": lengths[n]} for n in lengths if n != tag],
        "measurements": measurements,
        "series": series,
        "alerts": alerts,
        "active_alerts": [a for a in alerts if a["status"] == "active"],
        "documents": documents,
        "contradictions": contradictions,
    }


class ConnectionBody(BaseModel):
    tag_a: str
    tag_b: str
    connection_type: str = "process"
    line_number: Optional[str] = None
    added_by: str = "engineer"


@router.post("/add_connection")
async def add_connection(body: ConnectionBody):
    a, b = body.tag_a.strip().upper(), body.tag_b.strip().upper()
    if not a or not b or a == b:
        raise HTTPException(400, "Two distinct equipment tags are required.")
    G = get_plant_graph()
    upsert_equipment_node(G, a)
    upsert_equipment_node(G, b)
    G.add_edge(a, b, connection_type=body.connection_type, line_number=body.line_number,
               inferred=False, added_at=datetime.now().isoformat())
    save_plant_graph(G)
    log_audit("graph_connection_added", body.added_by, None, "graph",
              {"tag_a": a, "tag_b": b, "connection_type": body.connection_type,
               "line_number": body.line_number})
    return {"edge": [a, b], "connection_type": body.connection_type,
            "node_count": G.number_of_nodes(), "edge_count": G.number_of_edges()}


class NodeAttrBody(BaseModel):
    tag: str
    equipment_type: Optional[str] = None
    service: Optional[str] = None
    line_number: Optional[str] = None
    last_inspection_date: Optional[str] = None
    # Values are {"min": float, "max": float, "unit": str} — unit is a label, not a number.
    normal_range: Optional[Dict[str, Dict[str, Any]]] = None
    updated_by: str = "engineer"


@router.post("/set_node_attributes")
async def set_node_attributes(body: NodeAttrBody):
    """Set the normal operating range used by the threshold-breach detector."""
    G = get_plant_graph()
    upsert_equipment_node(
        G, body.tag, equipment_type=body.equipment_type, service=body.service,
        line_number=body.line_number, last_inspection_date=body.last_inspection_date,
        normal_range=body.normal_range or {})
    save_plant_graph(G)
    log_audit("graph_node_updated", body.updated_by, None, "graph",
              {"tag": body.tag.upper(), "normal_range": body.normal_range})
    return {"tag": body.tag.upper(), "attributes": dict(G.nodes[body.tag.upper()])}


class NLQueryBody(BaseModel):
    natural_language_query: str
    queried_by: str = "engineer"


@router.post("/query")
async def nl_query(body: NLQueryBody):
    G = get_plant_graph()
    scores = compute_health_scores()
    known = list(G.nodes())

    structured = None
    try:
        structured = llm.generate_json(
            f"Question: '{body.natural_language_query}'\n"
            f"Known equipment tags: {', '.join(known[:120]) or 'none'}",
            system=NL_QUERY_SYSTEM, feature="graph", task_type="extraction",
            default=None, num_predict=400)
    except llm.ModelUnavailable as exc:
        print(f"[graph] NL parse unavailable: {exc}")

    if not isinstance(structured, dict):
        structured = {}
    query_type = str(structured.get("query_type") or "").lower()
    tags = [str(t).strip().upper() for t in (structured.get("tags") or []) if t]
    # Safety net: pull any known tag mentioned literally in the question.
    if not tags:
        upper_q = body.natural_language_query.upper()
        tags = [n for n in known if n in upper_q]
    hops = int(structured.get("hops") or 1)
    hops = max(1, min(hops, 4))
    if query_type not in ("find_equipment", "find_path", "find_connected", "find_anomalies"):
        query_type = "find_connected" if tags else "find_anomalies"

    results: Dict[str, Any] = {"query_type": query_type, "tags": tags, "hops": hops}
    highlight: List[str] = list(tags)

    if query_type == "find_connected" and tags:
        connected = {}
        for tag in tags:
            if tag not in G:
                continue
            lengths = nx.single_source_shortest_path_length(G, tag, cutoff=hops)
            connected[tag] = [
                {"tag": n, "hops": d, "type": G.nodes[n].get("equipment_type"),
                 "health_score": scores.get(n, {}).get("health_score", 100),
                 "line_number": (G.get_edge_data(tag, n) or {}).get("line_number")}
                for n, d in sorted(lengths.items(), key=lambda kv: kv[1]) if n != tag]
            highlight += [c["tag"] for c in connected[tag]]
        results["connected"] = connected

    elif query_type == "find_path" and len(tags) >= 2:
        try:
            path = nx.shortest_path(G, tags[0], tags[1])
            results["path"] = path
            results["path_length"] = len(path) - 1
            highlight += path
        except (nx.NetworkXNoPath, nx.NodeNotFound) as exc:
            results["path"] = None
            results["note"] = f"No process path found: {exc}"

    elif query_type == "find_equipment":
        filters = structured.get("filters") or {}
        wanted_type = str(filters.get("equipment_type") or "").lower()
        matches = [
            {"tag": n, "type": d.get("equipment_type"),
             "health_score": scores.get(n, {}).get("health_score", 100)}
            for n, d in G.nodes(data=True)
            if not wanted_type or wanted_type in str(d.get("equipment_type") or "").lower()]
        if tags:
            matches = [m for m in matches if m["tag"] in tags] or matches
        results["equipment"] = matches
        highlight += [m["tag"] for m in matches]

    else:  # find_anomalies
        anomalous = sorted(
            [s for s in scores.values() if s["health_score"] < 80],
            key=lambda s: s["health_score"])
        if tags:
            anomalous = [s for s in anomalous if s["tag"] in tags] or anomalous
        results["anomalies"] = anomalous
        highlight += [s["tag"] for s in anomalous]

    explanation = None
    try:
        explanation = llm.generate(
            f"Question from a refinery engineer: '{body.natural_language_query}'\n"
            f"Plant graph query result (JSON): {json.dumps(results, default=str)[:3500]}\n\n"
            "Answer the question in 2-4 sentences using the equipment tags in the result. "
            "State only what the data shows. No preamble.",
            feature="graph", task_type="analysis", temperature=0.2, num_predict=400)
    except llm.ModelUnavailable as exc:
        explanation = f"(Local model unavailable — showing raw graph result. {exc})"

    log_audit("graph_query", body.queried_by, None, "graph",
              {"question": body.natural_language_query, "query_type": query_type, "tags": tags})
    return {
        "question": body.natural_language_query,
        "structured_query": {"query_type": query_type, "tags": tags, "hops": hops,
                             "filters": structured.get("filters") or {}},
        "results": results,
        "highlight_nodes": sorted(set(highlight)),
        "explanation": explanation,
    }


@router.get("/health_map")
async def health_map(as_dict: bool = Query(False)):
    """{tag: health_score} for the frontend heatmap, plus the detail behind each score."""
    scores = compute_health_scores()
    if as_dict:
        return {tag: info["health_score"] for tag, info in scores.items()}
    bands = {"good": 0, "fair": 0, "poor": 0, "critical": 0}
    for info in scores.values():
        bands[info["band"]] += 1
    ranked = sorted(scores.values(), key=lambda s: s["health_score"])
    return {
        "equipment_count": len(scores),
        "bands": bands,
        "average_health": round(sum(s["health_score"] for s in scores.values()) / len(scores), 1)
                          if scores else 100,
        "worst_offenders": ranked[:10],
        "health_scores": {tag: info["health_score"] for tag, info in scores.items()},
        "equipment": ranked,
        "algorithm": ["start at 100", "-30 per unclosed CRITICAL alert",
                      "-15 per unclosed WARNING alert", "-10 if no inspection in 180+ days",
                      "-5 per unresolved contradiction"],
        "generated_at": datetime.now().isoformat(),
    }


@router.get("/stats")
async def graph_stats():
    G = get_plant_graph()
    types: Dict[str, int] = {}
    for _, d in G.nodes(data=True):
        key = d.get("equipment_type") or "unknown"
        types[key] = types.get(key, 0) + 1
    components = list(nx.connected_components(G)) if G.number_of_nodes() else []
    return {
        "node_count": G.number_of_nodes(), "edge_count": G.number_of_edges(),
        "by_equipment_type": types,
        "connected_components": len(components),
        "largest_component": max((len(c) for c in components), default=0),
        "isolated_nodes": [n for n in G.nodes() if G.degree(n) == 0],
    }
