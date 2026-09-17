"""
FEATURE 3 — Regulatory Drift Detection Engine
=============================================
Mounted at /api/compliance

Detects when internal SOPs quietly become non-compliant with the standards they cite.
Standards are parsed into clauses, indexed, and each 'shall' clause is checked against
the relevant SOP section by the local model.

Zero external network calls.
"""

from __future__ import annotations

import io
import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

import llm
from data_layer import chunk_text, get_collection, get_db, log_audit, rows_to_dicts, vector_query

router = APIRouter(prefix="/api/compliance", tags=["compliance"])

CLAUSE_SYSTEM = """Parse this standards document. Extract each clause as JSON array:
[{"clause_number": "4.3.1", "clause_text": "...", "normative_level": "shall|should|may"}]
Return ONLY the JSON array."""

CHECK_TEMPLATE = """Standard clause: '{clause_text}' (normative level: {normative_level})
SOP section: '{sop_chunk}'
Question: Does this SOP section comply with, partially comply with, or conflict with the standard clause?
Answer ONLY with JSON: {{"compliance": "full|partial|conflict|not_addressed", "explanation": "...", "severity": "high|medium|low"}}"""

AMENDMENT_TEMPLATE = """The following SOP clause needs to be updated to comply with standard {standard_code} clause {clause_number}.
Current SOP text: {sop_text}
Required compliance: {clause_text}
Draft a replacement SOP clause that satisfies the standard requirement.
Return only the replacement clause text."""

CLAUSE_RE = re.compile(r"^\s*(\d+(?:\.\d+){0,3})\s+(.{15,})$")


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------

def read_standard_bytes(filename: str, data: bytes) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".pdf":
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                return "\n".join((p.extract_text() or "") for p in pdf.pages).strip()
        except Exception as exc:
            raise HTTPException(400, f"Could not read PDF standard: {exc}")
    return data.decode("utf-8", errors="replace")


def regex_clauses(text: str) -> List[Dict[str, str]]:
    """Deterministic clause split as a fallback when the model is unavailable."""
    clauses = []
    for line in text.splitlines():
        m = CLAUSE_RE.match(line)
        if not m:
            continue
        body = m.group(2).strip()
        level = "shall" if " shall " in f" {body.lower()} " else (
            "should" if " should " in f" {body.lower()} " else "may")
        clauses.append({"clause_number": m.group(1), "clause_text": body, "normative_level": level})
    return clauses


def parse_clauses(text: str, standard_code: str) -> List[Dict[str, str]]:
    """LLM clause extraction, chunked so long standards don't blow the context window."""
    clauses: List[Dict[str, str]] = []
    for chunk in chunk_text(text, 900, 100)[:12]:
        parsed = None
        try:
            parsed = llm.generate_json(f"STANDARD: {standard_code}\n---\n{chunk}\n---",
                                       system=CLAUSE_SYSTEM, feature="compliance",
                                       task_type="extraction", default=None, num_predict=2500)
        except llm.ModelUnavailable as exc:
            print(f"[compliance] model unavailable during clause parse: {exc}")
        if isinstance(parsed, dict):
            parsed = parsed.get("clauses") or parsed.get("data") or []
        if isinstance(parsed, list):
            for c in parsed:
                if isinstance(c, dict) and (c.get("clause_text") or "").strip():
                    clauses.append({
                        "clause_number": str(c.get("clause_number") or "").strip() or "n/a",
                        "clause_text": str(c["clause_text"]).strip(),
                        "normative_level": (str(c.get("normative_level") or "should").lower()
                                            if str(c.get("normative_level") or "").lower()
                                            in ("shall", "should", "may") else "should"),
                    })
    if not clauses:
        clauses = regex_clauses(text)

    seen, unique = set(), []
    for c in clauses:
        key = (c["clause_number"], c["clause_text"][:80])
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


def relevant_sop_chunk(sop_text: str, clause_text: str) -> str:
    """Pick the SOP passage most likely to address a clause (token-overlap ranked)."""
    chunks = chunk_text(sop_text, 320, 60)
    if not chunks:
        return sop_text[:2000]
    def tokens(s: str) -> set:
        return {t for t in re.sub(r"[^a-z0-9 ]", " ", s.lower()).split() if len(t) > 3}
    ct = tokens(clause_text)
    best = max(chunks, key=lambda ch: len(ct & tokens(ch)))
    return best[:2500]


# --------------------------------------------------------------------------------------
# STEP 1 — Standards ingestion
# --------------------------------------------------------------------------------------

@router.post("/load_standard")
async def load_standard(
    file: UploadFile = File(...),
    standard_code: Optional[str] = Form(None),
    version: Optional[str] = Form(None),
    effective_date: Optional[str] = Form(None),
    domain: Optional[str] = Form(None),
    loaded_by: str = Form("engineer"),
):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty standard file.")
    filename = os.path.basename(file.filename or "standard.txt")
    text = read_standard_bytes(filename, data)
    if len(text.strip()) < 50:
        raise HTTPException(422, "No readable clause text found in the standard.")

    code = (standard_code or os.path.splitext(filename)[0]).upper().replace(" ", "-")
    clauses = parse_clauses(text, code)
    if not clauses:
        raise HTTPException(422, "No clauses could be extracted from this standard.")

    conn = get_db()
    try:
        conn.execute("DELETE FROM standards_library WHERE standard_code = ?", (code,))
        for c in clauses:
            conn.execute(
                """INSERT INTO standards_library
                   (standard_code, clause_number, clause_text, normative_level, version, effective_date, domain)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (code, c["clause_number"], c["clause_text"], c["normative_level"],
                 version or "current", effective_date, domain),
            )
        conn.commit()
    finally:
        conn.close()

    try:
        get_collection("sop_library").upsert(
            ids=[f"std_{code}_{i}" for i in range(len(clauses))],
            documents=[f"{code} clause {c['clause_number']} ({c['normative_level']}): {c['clause_text']}"
                       for c in clauses],
            metadatas=[{"standard_code": code, "clause_number": c["clause_number"],
                        "normative_level": c["normative_level"], "kind": "standard",
                        "domain": domain or ""} for c in clauses],
        )
    except Exception as exc:
        print(f"[compliance] standard vector upsert failed: {exc}")

    log_audit("standard_loaded", loaded_by, None, "compliance",
              {"standard_code": code, "clauses": len(clauses), "filename": filename})
    return {
        "standard_code": code,
        "clauses_extracted": len(clauses),
        "shall_clauses": sum(1 for c in clauses if c["normative_level"] == "shall"),
        "clauses": clauses[:25],
    }


class SOPRegisterBody(BaseModel):
    filename: str
    sop_code: Optional[str] = None
    raw_text: str
    standard_refs: Optional[str] = None
    version: Optional[str] = "1.0"
    effective_date: Optional[str] = None
    domain: Optional[str] = None


@router.post("/register_sop")
async def register_sop(body: SOPRegisterBody, registered_by: str = Query("engineer")):
    """Register an SOP for compliance checking (also happens automatically on ingest)."""
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO sop_documents
               (filename, sop_code, standard_refs, version, effective_date, raw_text, active, domain)
               VALUES (?, ?, ?, ?, ?, ?, 1, ?)""",
            (body.filename, body.sop_code or body.filename, body.standard_refs, body.version,
             body.effective_date, body.raw_text, body.domain),
        )
        sop_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    chunks = chunk_text(body.raw_text, 512, 128)
    if chunks:
        try:
            get_collection("sop_library").upsert(
                ids=[f"sop{sop_id}_c{i}" for i in range(len(chunks))],
                documents=chunks,
                metadatas=[{"sop_id": sop_id, "sop_code": body.sop_code or body.filename,
                            "kind": "sop", "chunk_index": i} for i in range(len(chunks))],
            )
        except Exception as exc:
            print(f"[compliance] SOP vector upsert failed: {exc}")

    log_audit("sop_registered", registered_by, None, "compliance",
              {"sop_id": sop_id, "sop_code": body.sop_code})
    return {"sop_id": sop_id, "chunks_indexed": len(chunks)}


@router.get("/sops")
async def list_sops(active_only: bool = Query(True)):
    conn = get_db()
    try:
        sql = """SELECT id, filename, sop_code, standard_refs, version, effective_date, active, domain,
                        LENGTH(raw_text) AS text_length,
                        (SELECT COUNT(*) FROM compliance_gaps g WHERE g.sop_id = sop_documents.id
                         AND g.status='open') AS open_gaps
                 FROM sop_documents"""
        if active_only:
            sql += " WHERE active = 1"
        return {"sops": rows_to_dicts(conn.execute(sql + " ORDER BY id DESC").fetchall())}
    finally:
        conn.close()


@router.get("/standards")
async def list_standards():
    conn = get_db()
    try:
        return {"standards": rows_to_dicts(conn.execute(
            """SELECT standard_code, COUNT(*) AS clause_count,
                      SUM(CASE WHEN normative_level='shall' THEN 1 ELSE 0 END) AS shall_clauses,
                      MAX(version) AS version, MAX(domain) AS domain
               FROM standards_library GROUP BY standard_code ORDER BY standard_code"""
        ).fetchall())}
    finally:
        conn.close()


# --------------------------------------------------------------------------------------
# STEP 2 — SOP compliance check
# --------------------------------------------------------------------------------------

STOPWORDS = {
    "shall", "should", "must", "will", "the", "and", "for", "with", "that", "this", "from",
    "into", "such", "have", "has", "been", "are", "any", "all", "not", "other", "which",
    "when", "where", "each", "these", "those", "their", "there", "than", "may", "per",
    "before", "after", "during", "under", "above", "below", "between", "including",
}


def distinctive_terms(text: str) -> List[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z\-]{4,}", (text or "").lower())
    return sorted({w for w in words if w not in STOPWORDS})


def term_coverage_verdict(clause_text: str, sop_text: str) -> Optional[Dict[str, Any]]:
    """Deterministic fallback when the local model is down.

    Only reports a clause as unaddressed when almost none of its distinctive vocabulary
    appears anywhere in the SOP. Conservative by design: it under-reports rather than
    inventing conflicts it cannot actually judge.
    """
    terms = distinctive_terms(clause_text)
    if len(terms) < 4:
        return None
    haystack = (sop_text or "").lower()
    hits = sum(1 for t in terms if t in haystack)
    coverage = hits / len(terms)
    if coverage >= 0.25:
        return {"compliance": "full", "severity": "low", "coverage": round(coverage, 2)}
    missing = [t for t in terms if t not in haystack][:8]
    return {
        "compliance": "not_addressed",
        "severity": "medium",
        "coverage": round(coverage, 2),
        "explanation": (
            f"The SOP text contains none of this clause's key requirements "
            f"({', '.join(missing)}). Flagged by term-coverage analysis because the local "
            f"reasoning model was unavailable — confirm with a full check once it is running."
        ),
    }


WORD_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "eighteen": 18, "twenty": 20,
    "twenty-four": 24, "thirty": 30, "sixty": 60, "ninety": 90,
}

INTERVAL_RE = re.compile(
    r"(?:interval[s]?\s+not\s+exceeding|at\s+intervals\s+of|every|within)\s+"
    r"([a-z\-]+|\d+(?:\.\d+)?)\s*(month|months|year|years|day|days|week|weeks)",
    re.IGNORECASE)


def to_number(token: str) -> Optional[float]:
    token = token.strip().lower()
    if re.fullmatch(r"\d+(?:\.\d+)?", token):
        return float(token)
    return float(WORD_NUMBERS[token]) if token in WORD_NUMBERS else None


def interval_months(text: str) -> Optional[float]:
    """Smallest stated inspection interval in months, if the text states one."""
    found = []
    for raw_value, unit in INTERVAL_RE.findall(text or ""):
        value = to_number(raw_value)
        if value is None:
            continue
        unit = unit.lower().rstrip("s")
        factor = {"day": 1 / 30.0, "week": 7 / 30.0, "month": 1.0, "year": 12.0}[unit]
        found.append(value * factor)
    return min(found) if found else None


def interval_verdict(clause_text: str, sop_text: str) -> Optional[Dict[str, Any]]:
    """Catch the classic gap: the SOP inspects less often than the standard demands."""
    required = interval_months(clause_text)
    if required is None:
        return None
    stated = interval_months(sop_text)
    if stated is None:
        return {
            "compliance": "not_addressed",
            "severity": "high",
            "explanation": (f"The standard sets an inspection interval of at most "
                            f"{required:g} month(s); the SOP states no interval at all."),
        }
    if stated > required + 0.01:
        return {
            "compliance": "partial",
            "severity": "high",
            "explanation": (f"The SOP allows an interval of {stated:g} month(s) where the standard "
                            f"requires at most {required:g} month(s) — the procedure is weaker than "
                            f"the standard it cites."),
        }
    return None


def check_one_sop(sop_row, clauses: List[Dict[str, Any]]) -> Dict[str, Any]:
    sop_text = sop_row["raw_text"] or ""
    sop_id = sop_row["id"]
    gaps, checked, results = [], 0, []
    model_available = True

    conn = get_db()
    try:
        conn.execute("DELETE FROM compliance_gaps WHERE sop_id = ? AND status = 'open'", (sop_id,))
        conn.commit()
    finally:
        conn.close()

    for clause in clauses:
        chunk = relevant_sop_chunk(sop_text, clause["clause_text"])
        verdict = None
        if model_available:
            try:
                verdict = llm.generate_json(
                    CHECK_TEMPLATE.format(clause_text=clause["clause_text"][:1200],
                                          normative_level=clause["normative_level"],
                                          sop_chunk=chunk),
                    feature="compliance", task_type="analysis", default=None, num_predict=600,
                )
            except llm.ModelUnavailable as exc:
                print(f"[compliance] model unavailable — switching to term coverage: {exc}")
                model_available = False
        if not isinstance(verdict, dict):
            # Deterministic safety nets, strongest signal first.
            verdict = (interval_verdict(clause["clause_text"], sop_text)
                       or term_coverage_verdict(clause["clause_text"], sop_text))

        checked += 1
        if not isinstance(verdict, dict):
            continue
        level = str(verdict.get("compliance") or "").lower()
        if level not in ("full", "partial", "conflict", "not_addressed"):
            continue
        severity = str(verdict.get("severity") or "medium").lower()
        results.append({"standard_code": clause["standard_code"],
                        "clause_number": clause["clause_number"],
                        "compliance": level, "severity": severity})

        # Only 'shall' clauses that conflict or are unaddressed become recorded gaps.
        if clause["normative_level"] == "shall" and level in ("conflict", "not_addressed", "partial"):
            conn = get_db()
            try:
                cur = conn.execute(
                    """INSERT INTO compliance_gaps
                       (sop_id, standard_code, clause_number, gap_description, severity,
                        compliance_level, detected_at, status)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')""",
                    (sop_id, clause["standard_code"], clause["clause_number"],
                     str(verdict.get("explanation") or "")[:2000],
                     "high" if severity not in ("high", "medium", "low") else severity,
                     level, datetime.now().isoformat()),
                )
                conn.commit()
                gaps.append({"gap_id": cur.lastrowid, **results[-1]})
            finally:
                conn.close()

    return {"sop_id": sop_id, "sop_code": sop_row["sop_code"], "clauses_checked": checked,
            "gaps_found": len(gaps), "gaps": gaps, "verdicts": results}


def clauses_for_sop(conn, sop_row, shall_only: bool = True) -> List[Dict[str, Any]]:
    """Standards relevant to this SOP: those it cites, else the whole library."""
    refs = [r.strip().upper() for r in (sop_row["standard_refs"] or "").split(",") if r.strip()]
    sql = "SELECT * FROM standards_library WHERE 1=1"
    params: List[Any] = []
    if shall_only:
        sql += " AND normative_level = 'shall'"
    if refs:
        marks = ",".join("?" * len(refs))
        sql += f" AND UPPER(standard_code) IN ({marks})"
        params += refs
    rows = rows_to_dicts(conn.execute(sql + " ORDER BY standard_code, clause_number", params).fetchall())
    if not rows and refs:  # cited standards not loaded -> check against everything available
        sql = "SELECT * FROM standards_library WHERE normative_level = 'shall'" if shall_only \
            else "SELECT * FROM standards_library"
        rows = rows_to_dicts(conn.execute(sql).fetchall())
    return rows


@router.post("/check_sop/{sop_id}")
async def check_sop(sop_id: int, max_clauses: int = Query(40, le=200),
                    checked_by: str = Query("engineer")):
    conn = get_db()
    try:
        sop = conn.execute("SELECT * FROM sop_documents WHERE id = ?", (sop_id,)).fetchone()
        if not sop:
            raise HTTPException(404, f"SOP {sop_id} not found.")
        clauses = clauses_for_sop(conn, sop)[:max_clauses]
    finally:
        conn.close()

    if not clauses:
        raise HTTPException(422, "No 'shall' clauses loaded. Load a standard first via /load_standard.")

    result = check_one_sop(sop, clauses)
    log_audit("sop_compliance_checked", checked_by, None, "compliance",
              {"sop_id": sop_id, "clauses_checked": result["clauses_checked"],
               "gaps_found": result["gaps_found"]})
    return result


@router.post("/check_all_sops")
async def check_all_sops(max_clauses: int = Query(25, le=100), checked_by: str = Query("engineer")):
    conn = get_db()
    try:
        sops = conn.execute("SELECT * FROM sop_documents WHERE active = 1").fetchall()
        clause_map = {s["id"]: clauses_for_sop(conn, s)[:max_clauses] for s in sops}
    finally:
        conn.close()

    if not sops:
        raise HTTPException(422, "No active SOPs registered.")

    per_sop, total_gaps = [], 0
    severity_breakdown = {"high": 0, "medium": 0, "low": 0}
    for sop in sops:
        clauses = clause_map.get(sop["id"]) or []
        if not clauses:
            per_sop.append({"sop_id": sop["id"], "sop_code": sop["sop_code"],
                            "clauses_checked": 0, "gaps_found": 0, "note": "no relevant clauses"})
            continue
        res = check_one_sop(sop, clauses)
        total_gaps += res["gaps_found"]
        for g in res["gaps"]:
            severity_breakdown[g.get("severity", "medium")] = \
                severity_breakdown.get(g.get("severity", "medium"), 0) + 1
        per_sop.append({k: res[k] for k in ("sop_id", "sop_code", "clauses_checked", "gaps_found")})

    log_audit("bulk_compliance_check", checked_by, None, "compliance",
              {"sops_checked": len(sops), "total_gaps": total_gaps})
    return {"sops_checked": len(sops), "total_gaps": total_gaps,
            "severity_breakdown": severity_breakdown, "per_sop": per_sop}


@router.get("/gaps")
async def list_gaps(sop_id: Optional[int] = Query(None), severity: Optional[str] = Query(None),
                    standard_code: Optional[str] = Query(None), status: Optional[str] = Query(None)):
    sql = """SELECT g.*, s.filename AS sop_filename, s.sop_code,
                    (SELECT clause_text FROM standards_library sl
                     WHERE sl.standard_code = g.standard_code AND sl.clause_number = g.clause_number
                     LIMIT 1) AS clause_text
             FROM compliance_gaps g LEFT JOIN sop_documents s ON s.id = g.sop_id WHERE 1=1"""
    params: List[Any] = []
    if sop_id:
        sql += " AND g.sop_id = ?"; params.append(sop_id)
    if severity:
        sql += " AND g.severity = ?"; params.append(severity.lower())
    if standard_code:
        sql += " AND g.standard_code = ?"; params.append(standard_code.upper())
    if status:
        sql += " AND g.status = ?"; params.append(status)

    conn = get_db()
    try:
        gaps = rows_to_dicts(conn.execute(
            sql + " ORDER BY CASE g.severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,"
                  " g.detected_at DESC", params).fetchall())
        by_sop: Dict[str, int] = {}
        by_standard: Dict[str, int] = {}
        by_severity: Dict[str, int] = {}
        matrix: Dict[str, Dict[str, str]] = {}
        rank = {"compliant": 0, "partial": 1, "conflict": 2, "not_addressed": 3}
        for g in gaps:
            key = g.get("sop_code") or f"SOP-{g['sop_id']}"
            by_sop[key] = by_sop.get(key, 0) + 1
            by_standard[g["standard_code"]] = by_standard.get(g["standard_code"], 0) + 1
            by_severity[g["severity"]] = by_severity.get(g["severity"], 0) + 1
            cell = matrix.setdefault(key, {})
            current = cell.get(g["standard_code"], "compliant")
            level = g.get("compliance_level") or "conflict"
            if rank.get(level, 2) >= rank.get(current, 0):
                cell[g["standard_code"]] = level

        # Fill unchecked cells so the frontend matrix can render grey correctly.
        checked = rows_to_dicts(conn.execute(
            """SELECT DISTINCT s.sop_code, g.standard_code FROM sop_documents s
               LEFT JOIN compliance_gaps g ON g.sop_id = s.id""").fetchall())
        all_sops = [r["sop_code"] for r in conn.execute(
            "SELECT sop_code FROM sop_documents WHERE active=1").fetchall()]
        all_standards = [r["standard_code"] for r in conn.execute(
            "SELECT DISTINCT standard_code FROM standards_library").fetchall()]
        return {
            "total": len(gaps), "gaps": gaps,
            "grouped": {"by_sop": by_sop, "by_standard": by_standard, "by_severity": by_severity},
            "matrix": matrix, "sops": all_sops, "standards": all_standards,
            "checked_pairs": checked,
        }
    finally:
        conn.close()


@router.get("/sop/{sop_id}/report")
async def sop_report(sop_id: int):
    conn = get_db()
    try:
        sop = conn.execute("SELECT * FROM sop_documents WHERE id = ?", (sop_id,)).fetchone()
        if not sop:
            raise HTTPException(404, f"SOP {sop_id} not found.")
        gaps = rows_to_dicts(conn.execute(
            """SELECT g.*, (SELECT clause_text FROM standards_library sl
                            WHERE sl.standard_code = g.standard_code
                              AND sl.clause_number = g.clause_number LIMIT 1) AS clause_text
               FROM compliance_gaps g WHERE g.sop_id = ?
               ORDER BY g.standard_code, g.clause_number""", (sop_id,)).fetchall())
        breakdown: Dict[str, int] = {}
        for g in gaps:
            breakdown[g["severity"]] = breakdown.get(g["severity"], 0) + 1
        return {
            "sop": {k: sop[k] for k in ("id", "filename", "sop_code", "standard_refs",
                                        "version", "effective_date", "active")},
            "gap_count": len(gaps),
            "severity_breakdown": breakdown,
            "open_gaps": [g for g in gaps if g["status"] == "open"],
            "gaps": gaps,
            "compliance_status": "NON_COMPLIANT" if any(
                g["severity"] == "high" and g["status"] == "open" for g in gaps)
                else ("REVIEW_REQUIRED" if gaps else "COMPLIANT"),
            "generated_at": datetime.now().isoformat(),
        }
    finally:
        conn.close()


@router.post("/gaps/{gap_id}/generate_amendment")
async def generate_amendment(gap_id: int, drafted_by: str = Query("engineer")):
    conn = get_db()
    try:
        gap = conn.execute(
            """SELECT g.*, s.raw_text AS sop_text, s.sop_code,
                      (SELECT clause_text FROM standards_library sl
                       WHERE sl.standard_code = g.standard_code
                         AND sl.clause_number = g.clause_number LIMIT 1) AS clause_text
               FROM compliance_gaps g LEFT JOIN sop_documents s ON s.id = g.sop_id
               WHERE g.id = ?""", (gap_id,)).fetchone()
        if not gap:
            raise HTTPException(404, f"Gap {gap_id} not found.")
    finally:
        conn.close()

    clause_text = gap["clause_text"] or gap["gap_description"] or ""
    sop_excerpt = relevant_sop_chunk(gap["sop_text"] or "", clause_text)
    try:
        amendment = llm.generate(
            AMENDMENT_TEMPLATE.format(standard_code=gap["standard_code"],
                                      clause_number=gap["clause_number"],
                                      sop_text=sop_excerpt, clause_text=clause_text),
            feature="compliance", task_type="analysis", temperature=0.2, num_predict=800)
    except llm.ModelUnavailable as exc:
        raise HTTPException(503, f"Local model unavailable: {exc}")

    conn = get_db()
    try:
        conn.execute("UPDATE compliance_gaps SET draft_amendment = ?, status = 'amendment_drafted' WHERE id = ?",
                     (amendment, gap_id))
        conn.commit()
    finally:
        conn.close()

    log_audit("amendment_drafted", drafted_by, None, "compliance",
              {"gap_id": gap_id, "standard": gap["standard_code"], "clause": gap["clause_number"]})
    return {
        "gap_id": gap_id, "sop_code": gap["sop_code"], "standard_code": gap["standard_code"],
        "clause_number": gap["clause_number"], "clause_text": clause_text,
        "current_sop_excerpt": sop_excerpt, "draft_amendment": amendment,
        "status": "amendment_drafted — engineer review required",
    }


class ResolveGapBody(BaseModel):
    status: str = "closed"
    resolved_by: str
    notes: Optional[str] = None


@router.post("/gaps/{gap_id}/resolve")
async def resolve_gap(gap_id: int, body: ResolveGapBody):
    conn = get_db()
    try:
        if not conn.execute("SELECT 1 FROM compliance_gaps WHERE id = ?", (gap_id,)).fetchone():
            raise HTTPException(404, f"Gap {gap_id} not found.")
        conn.execute("UPDATE compliance_gaps SET status = ? WHERE id = ?", (body.status, gap_id))
        conn.commit()
    finally:
        conn.close()
    log_audit("compliance_gap_resolved", body.resolved_by, None, "compliance",
              {"gap_id": gap_id, "status": body.status, "notes": body.notes})
    return {"gap_id": gap_id, "status": body.status}


@router.get("/search_clauses")
async def search_clauses(q: str = Query(..., min_length=3), n: int = Query(5, le=20)):
    """Semantic clause lookup — used by the monitor to attach governing clauses to alerts."""
    return {"query": q, "results": vector_query("sop_library", q, n_results=n)}
