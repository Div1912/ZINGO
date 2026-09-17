"""
FEATURE 4 — Multi-Document Contradiction Engine
===============================================
Mounted at /api/contradict

Extracts quantitative technical claims from every document, compares them pairwise per
equipment tag, and decides which document is authoritative. High-severity unresolved
contradictions act as a publish GATE.

Zero external network calls.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import llm
from data_layer import add_alert, get_db, log_audit, parse_tags, rows_to_dicts

router = APIRouter(prefix="/api/contradict", tags=["contradiction"])

CLAIMS_SYSTEM = """From this engineering document, extract ALL quantitative technical claims as JSON:
[{"parameter": "operating_pressure", "value": 15, "unit": "bar", "qualifier": "maximum|design|operating|test", "equipment_tag": "V-201"}]
Extract only explicitly stated numeric values. Return empty array if none."""

SEMANTIC_TEMPLATE = """Claim A from Document 1 (dated {date1}): '{claim_a}'
Claim B from Document 2 (dated {date2}): '{claim_b}'
Do these claims contradict each other? Answer JSON: {{"contradicts": true/false, "explanation": "...", "severity": "high|medium|low"}}"""

# Authority ranking — higher wins when dates cannot decide.
DOC_AUTHORITY = {
    "standard": 100, "specification": 90, "spec": 90, "calculation": 70,
    "drawing": 65, "sop": 60, "inspection_report": 50, "approval_note": 45,
    "maintenance_log": 40, "correspondence": 20, "unknown": 10,
}
TOLERANCE_PERCENT = 5.0


def normalise(text: Any) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "_", str(text or "").strip().lower()).strip("_")


def parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = str(value)[:19]
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def authority(doc_type: Optional[str]) -> int:
    return DOC_AUTHORITY.get((doc_type or "unknown").lower(), 10)


# Design and nameplate constants. Two documents may legitimately record different
# *readings* over time, but they must not state different *design* values for one asset.
TIME_INVARIANT_PARAMS = {
    "design_pressure", "design_temperature", "design_thickness", "test_pressure",
    "retirement_thickness", "mawp", "maximum_allowable_working_pressure", "surface_area",
    "vibration_alarm_limit", "alarm_limit", "trip_limit", "set_pressure", "rated_flow",
    "rated_capacity", "rated_speed", "design_flow", "nominal_diameter",
}


def is_time_invariant(parameter: str) -> bool:
    """True when a parameter is a design constant rather than a time-varying reading."""
    parameter = (parameter or "").lower()
    if parameter in TIME_INVARIANT_PARAMS:
        return True
    return any(parameter.startswith(prefix) for prefix in ("design_", "rated_", "nominal_")) \
        or parameter.endswith(("_limit", "_setpoint"))


class ContradictionDetector:
    """Claim extraction, pairwise comparison, and authority-based resolution."""

    # ---------------- STEP 1 — gather all claims ----------------
    def extract_claims(self, doc: Dict[str, Any], refresh: bool = False) -> List[Dict[str, Any]]:
        doc_id = doc["id"]
        conn = get_db()
        try:
            if not refresh:
                cached = rows_to_dicts(conn.execute(
                    "SELECT * FROM claims WHERE doc_id = ?", (doc_id,)).fetchall())
                if cached:
                    return cached
            conn.execute("DELETE FROM claims WHERE doc_id = ?", (doc_id,))
            conn.commit()
        finally:
            conn.close()

        claims: List[Dict[str, Any]] = []
        try:
            parsed = llm.generate_json(
                f"DOCUMENT ({doc.get('doc_type')}, dated {doc.get('document_date')}):\n---\n"
                f"{(doc.get('raw_text') or '')[:10000]}\n---",
                system=CLAIMS_SYSTEM, feature="contradiction", task_type="extraction",
                default=None, num_predict=2000)
        except llm.ModelUnavailable as exc:
            print(f"[contradict] model unavailable: {exc}")
            parsed = None

        if isinstance(parsed, dict):
            parsed = parsed.get("claims") or parsed.get("data") or []
        if isinstance(parsed, list):
            for c in parsed:
                if not isinstance(c, dict):
                    continue
                raw_value = c.get("value")
                value = self._to_float(raw_value)
                parameter = normalise(c.get("parameter"))
                if value is None or not parameter:
                    continue
                claims.append({
                    "doc_id": doc_id,
                    "equipment_tag": str(c.get("equipment_tag") or "").strip().upper()
                                     or (parse_tags(doc.get("equipment_tags")) or ["UNTAGGED"])[0],
                    "parameter": parameter,
                    "value": value,
                    "raw_value": str(raw_value),
                    "unit": str(c.get("unit") or "").strip(),
                    "qualifier": normalise(c.get("qualifier")) or "operating",
                })

        # Measurements already extracted at ingest are claims too.
        conn = get_db()
        try:
            for m in conn.execute("SELECT * FROM measurements WHERE doc_id = ?", (doc_id,)).fetchall():
                if m["value"] is None:
                    continue
                claims.append({
                    "doc_id": doc_id, "equipment_tag": (m["equipment_tag"] or "UNTAGGED").upper(),
                    "parameter": m["parameter"], "value": m["value"],
                    "raw_value": str(m["value"]), "unit": m["unit"] or "",
                    "qualifier": "measured",
                })

            seen, unique = set(), []
            for c in claims:
                key = (c["equipment_tag"], c["parameter"], c["qualifier"], round(c["value"], 6))
                if key in seen:
                    continue
                seen.add(key)
                unique.append(c)
                conn.execute(
                    """INSERT INTO claims
                       (doc_id, equipment_tag, parameter, value, raw_value, unit, qualifier, extracted_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (c["doc_id"], c["equipment_tag"], c["parameter"], c["value"],
                     c["raw_value"], c["unit"], c["qualifier"], datetime.now().isoformat()))
            conn.commit()
        finally:
            conn.close()
        return unique

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        import re
        if isinstance(value, (int, float)):
            return float(value)
        if not value:
            return None
        m = re.search(r"-?\d+(?:\.\d+)?", str(value).replace(",", ""))
        return float(m.group(0)) if m else None

    # ---------------- STEP 2 — pairwise comparison ----------------
    def compare(self, docs: List[Dict[str, Any]], refresh: bool = False) -> List[Dict[str, Any]]:
        doc_map = {d["id"]: d for d in docs}
        by_key: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = {}
        for doc in docs:
            for claim in self.extract_claims(doc, refresh=refresh):
                key = (claim["equipment_tag"], claim["parameter"], claim["qualifier"])
                by_key.setdefault(key, []).append(claim)

        found: List[Dict[str, Any]] = []
        for (tag, parameter, qualifier), claims in by_key.items():
            for i in range(len(claims)):
                for j in range(i + 1, len(claims)):
                    a, b = claims[i], claims[j]
                    if a["doc_id"] == b["doc_id"]:
                        continue
                    # Stable pair ordering so a re-scan updates the same row instead of
                    # inserting the mirror image of a contradiction already recorded.
                    if a["doc_id"] > b["doc_id"]:
                        a, b = b, a
                    base = max(abs(a["value"]), abs(b["value"]))
                    if base == 0:
                        continue
                    diff_pct = abs(a["value"] - b["value"]) / base * 100
                    if diff_pct <= TOLERANCE_PERCENT:
                        continue
                    # Measured-vs-measured over time is a trend, not a contradiction —
                    # unless the parameter is a design constant, which cannot legitimately
                    # differ between two documents describing the same equipment.
                    if a["qualifier"] == b["qualifier"] == "measured" \
                            and not is_time_invariant(parameter):
                        continue

                    doc_a, doc_b = doc_map[a["doc_id"]], doc_map[b["doc_id"]]
                    # Any disagreement on a design constant is serious regardless of size:
                    # two documents cannot both be right about one nameplate value.
                    if is_time_invariant(parameter):
                        severity = "high"
                    else:
                        severity = "high" if diff_pct >= 20 else ("medium" if diff_pct >= 10 else "low")
                    resolution = self.resolve(doc_a, doc_b)
                    found.append({
                        "equipment_tag": tag, "parameter": parameter, "qualifier": qualifier,
                        "contradiction_type": ("DESIGN_CONSTANT_CONFLICT"
                                               if is_time_invariant(parameter)
                                               else "NUMERIC_CONTRADICTION"),
                        "doc_a_id": a["doc_id"], "doc_b_id": b["doc_id"],
                        "doc_a": doc_a.get("filename"), "doc_b": doc_b.get("filename"),
                        "doc_a_type": doc_a.get("doc_type"), "doc_b_type": doc_b.get("doc_type"),
                        "doc_a_date": doc_a.get("document_date") or doc_a.get("upload_time"),
                        "doc_b_date": doc_b.get("document_date") or doc_b.get("upload_time"),
                        "value_a": a["value"], "value_b": b["value"],
                        "unit": a["unit"] or b["unit"],
                        "difference_percent": round(diff_pct, 2),
                        "severity": severity,
                        "explanation": (
                            f"{tag} {parameter.replace('_', ' ')} ({qualifier}) is stated as "
                            f"{a['value']} {a['unit']} in '{doc_a.get('filename')}' and "
                            f"{b['value']} {b['unit']} in '{doc_b.get('filename')}' — "
                            f"a {diff_pct:.1f}% discrepancy on the same parameter."
                        ),
                        **resolution,
                    })
        return found

    def semantic_compare(self, doc_a: Dict[str, Any], doc_b: Dict[str, Any],
                         claim_a: str, claim_b: str) -> Optional[Dict[str, Any]]:
        """Non-numeric contradiction check via the local model."""
        try:
            verdict = llm.generate_json(
                SEMANTIC_TEMPLATE.format(
                    date1=doc_a.get("document_date") or "unknown", claim_a=claim_a[:1200],
                    date2=doc_b.get("document_date") or "unknown", claim_b=claim_b[:1200]),
                feature="contradiction", task_type="analysis", default=None, num_predict=500)
        except llm.ModelUnavailable:
            return None
        if not isinstance(verdict, dict) or not verdict.get("contradicts"):
            return None
        severity = str(verdict.get("severity") or "low").lower()
        if severity not in ("high", "medium"):
            return None
        return {
            "contradiction_type": "SEMANTIC_CONTRADICTION",
            "severity": severity,
            "explanation": str(verdict.get("explanation") or "")[:2000],
        }

    # ---------------- STEP 3 — resolution ----------------
    @staticmethod
    def resolve(doc_a: Dict[str, Any], doc_b: Dict[str, Any]) -> Dict[str, Any]:
        date_a = parse_date(doc_a.get("document_date") or doc_a.get("upload_time"))
        date_b = parse_date(doc_b.get("document_date") or doc_b.get("upload_time"))
        superseded_a = bool(doc_a.get("superseded"))
        superseded_b = bool(doc_b.get("superseded"))

        # Rule 1 — later date wins, unless it is flagged superseded.
        if date_a and date_b and date_a != date_b:
            newer, older = (doc_a, doc_b) if date_a > date_b else (doc_b, doc_a)
            newer_superseded = superseded_a if newer is doc_a else superseded_b
            if not newer_superseded:
                return {
                    "recommended_resolution": f"accept_doc_{'a' if newer is doc_a else 'b'}",
                    "resolution_basis": (
                        f"Rule 1 (recency): '{newer.get('filename')}' dated "
                        f"{newer.get('document_date') or newer.get('upload_time')} supersedes "
                        f"'{older.get('filename')}'."),
                }

        # Rule 2 — higher document authority wins.
        auth_a, auth_b = authority(doc_a.get("doc_type")), authority(doc_b.get("doc_type"))
        if auth_a != auth_b:
            winner = doc_a if auth_a > auth_b else doc_b
            return {
                "recommended_resolution": f"accept_doc_{'a' if winner is doc_a else 'b'}",
                "resolution_basis": (
                    f"Rule 2 (authority): {winner.get('doc_type')} outranks "
                    f"{(doc_b if winner is doc_a else doc_a).get('doc_type')} in the document hierarchy."),
            }

        # Rule 3 — unresolvable.
        return {
            "recommended_resolution": "REQUIRES_ENGINEER_REVIEW",
            "resolution_basis": ("Neither recency nor document authority resolves this conflict. "
                                 "Competent authority must adjudicate."),
        }

    # ---------------- Persistence ----------------
    def persist(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        stored = []
        conn = get_db()
        try:
            for c in items:
                # A conflict between two documents is one finding, not two: match the
                # pair in either order so mirrored rows can never be created.
                existing = conn.execute(
                    """SELECT id FROM contradictions
                       WHERE equipment_tag=? AND parameter=? AND qualifier=?
                         AND ((doc_a_id=? AND doc_b_id=?) OR (doc_a_id=? AND doc_b_id=?))""",
                    (c["equipment_tag"], c["parameter"], c["qualifier"],
                     c["doc_a_id"], c["doc_b_id"], c["doc_b_id"], c["doc_a_id"])).fetchone()
                if existing:
                    conn.execute(
                        """UPDATE contradictions SET severity=?, explanation=?,
                           recommended_resolution=?, detected_at=? WHERE id=?""",
                        (c["severity"], c["explanation"], c["recommended_resolution"],
                         datetime.now().isoformat(), existing["id"]))
                    c["id"] = existing["id"]
                else:
                    cur = conn.execute(
                        """INSERT INTO contradictions
                           (equipment_tag, parameter, qualifier, doc_a_id, doc_b_id, value_a, value_b,
                            unit, contradiction_type, severity, explanation, recommended_resolution,
                            status, detected_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)""",
                        (c["equipment_tag"], c["parameter"], c["qualifier"], c["doc_a_id"],
                         c["doc_b_id"], str(c.get("value_a")), str(c.get("value_b")), c.get("unit"),
                         c["contradiction_type"], c["severity"], c["explanation"],
                         c["recommended_resolution"], datetime.now().isoformat()))
                    c["id"] = cur.lastrowid
                stored.append(c)
            conn.commit()
        finally:
            conn.close()

        for c in stored:
            if c["severity"] == "high":
                add_alert(
                    alert_type="DOCUMENT_CONTRADICTION", severity="WARNING",
                    title=f"{c['equipment_tag']}: conflicting {c['parameter'].replace('_', ' ')} "
                          f"across two documents",
                    description=c["explanation"] + " Recommended resolution: "
                                + str(c.get("resolution_basis") or c["recommended_resolution"]),
                    evidence={"detector": "contradiction_engine", "contradiction_id": c["id"],
                              "evidence": [
                                  {"doc_id": c["doc_a_id"], "document": c.get("doc_a"),
                                   "measurement": f"{c['parameter']} = {c['value_a']} {c.get('unit') or ''}",
                                   "date": str(c.get("doc_a_date") or "")[:10]},
                                  {"doc_id": c["doc_b_id"], "document": c.get("doc_b"),
                                   "measurement": f"{c['parameter']} = {c['value_b']} {c.get('unit') or ''}",
                                   "date": str(c.get("doc_b_date") or "")[:10]}]},
                    equipment_tags=[c["equipment_tag"]],
                    dedupe_key=f"DOCUMENT_CONTRADICTION|{c['equipment_tag']}|{c['parameter']}")
        return stored


detector = ContradictionDetector()


def load_docs(conn, equipment_tag: Optional[str] = None,
              doc_ids: Optional[List[int]] = None, limit: int = 60) -> List[Dict[str, Any]]:
    sql = "SELECT * FROM documents WHERE 1=1"
    params: List[Any] = []
    if doc_ids:
        marks = ",".join("?" * len(doc_ids))
        sql += f" AND id IN ({marks})"
        params += doc_ids
    if equipment_tag:
        sql += " AND UPPER(equipment_tags) LIKE ?"
        params.append(f"%{equipment_tag.upper()}%")
    sql += " ORDER BY COALESCE(document_date, upload_time) LIMIT ?"
    params.append(limit)
    return rows_to_dicts(conn.execute(sql, params).fetchall())


class ScanBody(BaseModel):
    equipment_tag: Optional[str] = None
    doc_ids: Optional[List[int]] = None
    refresh_claims: bool = False
    scanned_by: str = "engineer"


@router.post("/scan")
async def scan(body: ScanBody):
    conn = get_db()
    try:
        docs = load_docs(conn, body.equipment_tag, body.doc_ids)
    finally:
        conn.close()
    if len(docs) < 2:
        return {"documents_scanned": len(docs), "contradictions_found": 0, "contradictions": [],
                "note": "At least two documents are needed to detect a contradiction."}

    found = detector.compare(docs, refresh=body.refresh_claims)
    stored = detector.persist(found)
    by_sev: Dict[str, int] = {}
    for c in stored:
        by_sev[c["severity"]] = by_sev.get(c["severity"], 0) + 1

    log_audit("contradiction_scan", body.scanned_by, None, "contradiction",
              {"documents_scanned": len(docs), "contradictions_found": len(stored),
               "equipment_tag": body.equipment_tag})
    return {"documents_scanned": len(docs), "contradictions_found": len(stored),
            "by_severity": by_sev, "contradictions": stored}


@router.get("/contradictions")
async def list_contradictions(equipment_tag: Optional[str] = Query(None),
                              severity: Optional[str] = Query(None),
                              status: Optional[str] = Query(None)):
    sql = """SELECT c.*, da.filename AS doc_a_name, db.filename AS doc_b_name,
                    da.doc_type AS doc_a_type, db.doc_type AS doc_b_type,
                    da.document_date AS doc_a_date, db.document_date AS doc_b_date
             FROM contradictions c
             LEFT JOIN documents da ON da.id = c.doc_a_id
             LEFT JOIN documents db ON db.id = c.doc_b_id WHERE 1=1"""
    params: List[Any] = []
    if equipment_tag:
        sql += " AND UPPER(c.equipment_tag) = ?"; params.append(equipment_tag.upper())
    if severity:
        sql += " AND c.severity = ?"; params.append(severity.lower())
    if status:
        sql += " AND c.status = ?"; params.append(status)

    conn = get_db()
    try:
        rows = rows_to_dicts(conn.execute(
            sql + " ORDER BY CASE c.severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,"
                  " c.detected_at DESC", params).fetchall())
        return {
            "total": len(rows),
            "open_high": sum(1 for r in rows if r["severity"] == "high" and r["status"] == "open"),
            "contradictions": rows,
        }
    finally:
        conn.close()


class ResolveBody(BaseModel):
    resolution: str  # accept_doc_a | accept_doc_b | manual
    notes: Optional[str] = None
    resolved_by: str


@router.post("/contradictions/{contradiction_id}/resolve")
async def resolve_contradiction(contradiction_id: int, body: ResolveBody):
    if body.resolution not in ("accept_doc_a", "accept_doc_b", "manual"):
        raise HTTPException(400, "resolution must be accept_doc_a, accept_doc_b, or manual")

    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM contradictions WHERE id = ?", (contradiction_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"Contradiction {contradiction_id} not found.")
        conn.execute(
            """UPDATE contradictions SET status='resolved', resolved_by=?, resolution_notes=?,
               recommended_resolution=? WHERE id = ?""",
            (body.resolved_by, body.notes, body.resolution, contradiction_id))
        # Accepting one document marks the other as superseded for this parameter.
        if body.resolution == "accept_doc_a":
            conn.execute("UPDATE documents SET superseded = 1 WHERE id = ?", (row["doc_b_id"],))
        elif body.resolution == "accept_doc_b":
            conn.execute("UPDATE documents SET superseded = 1 WHERE id = ?", (row["doc_a_id"],))
        conn.commit()
    finally:
        conn.close()

    log_audit("contradiction_resolved", body.resolved_by, None, "contradiction",
              {"contradiction_id": contradiction_id, "resolution": body.resolution,
               "notes": body.notes})
    return {"contradiction_id": contradiction_id, "status": "resolved", "resolution": body.resolution}


class GateBody(BaseModel):
    doc_id: int
    checked_by: str = "engineer"


@router.post("/check_before_publish")
async def check_before_publish(body: GateBody):
    """THE GATE. High-severity unresolved contradictions block finalisation."""
    conn = get_db()
    try:
        doc = conn.execute("SELECT * FROM documents WHERE id = ?", (body.doc_id,)).fetchone()
        if not doc:
            raise HTTPException(404, f"Document {body.doc_id} not found.")
        doc = dict(doc)
        tags = parse_tags(doc.get("equipment_tags"))
        related: Dict[int, Dict[str, Any]] = {doc["id"]: doc}
        for tag in tags:
            for r in load_docs(conn, equipment_tag=tag, limit=40):
                related[r["id"]] = r
    finally:
        conn.close()

    docs = list(related.values())
    found = detector.compare(docs) if len(docs) >= 2 else []
    involving = [c for c in found if body.doc_id in (c["doc_a_id"], c["doc_b_id"])]
    stored = detector.persist(involving)

    conn = get_db()
    try:
        marks_params = [body.doc_id, body.doc_id]
        unresolved_high = rows_to_dicts(conn.execute(
            """SELECT * FROM contradictions
               WHERE severity='high' AND status='open' AND (doc_a_id = ? OR doc_b_id = ?)""",
            marks_params).fetchall())
    finally:
        conn.close()

    blocked = len(unresolved_high) > 0
    log_audit("publish_gate_checked", body.checked_by, body.doc_id, "contradiction",
              {"blocked": blocked, "contradictions_found": len(stored),
               "unresolved_high": len(unresolved_high)})
    return {
        "doc_id": body.doc_id,
        "filename": doc.get("filename"),
        "documents_compared": len(docs),
        "contradictions_found": len(stored),
        "unresolved_high_severity": unresolved_high,
        "publish_allowed": not blocked,
        "gate_status": "BLOCKED" if blocked else "CLEARED",
        "message": (
            f"Publication blocked: {len(unresolved_high)} high-severity contradiction(s) must be "
            "resolved by the competent authority before this document can be finalised."
            if blocked else "No high-severity contradictions outstanding. Document may be finalised."
        ),
        "contradictions": stored,
    }


@router.get("/claims/{doc_id}")
async def document_claims(doc_id: int):
    conn = get_db()
    try:
        return {"doc_id": doc_id, "claims": rows_to_dicts(conn.execute(
            "SELECT * FROM claims WHERE doc_id = ? ORDER BY equipment_tag, parameter",
            (doc_id,)).fetchall())}
    finally:
        conn.close()
