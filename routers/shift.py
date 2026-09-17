"""
FEATURE 5 — Shift Handover Intelligence
=======================================
Mounted at /api/shift

Turns raw shift logs into a control-room handover brief, and — critically — detects
equipment that keeps reappearing across consecutive shifts (the thing humans miss).

Zero external network calls.
"""

from __future__ import annotations

import io
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import llm
from data_layer import get_db, log_audit, parse_tags, rows_to_dicts

router = APIRouter(prefix="/api/shift", tags=["shift"])

SHIFT_ORDER = ["morning", "evening", "night"]

HANDOVER_TEMPLATE = """You are generating a shift handover brief for a refinery control room.
Shift: {shift_type} on {shift_date}
Events this shift: {events_list}
Active alerts: {alerts_list}
Recurring issues (appeared in 3+ shifts): {recurring_list}
Measurements out of normal range: {anomalies_list}

Generate a handover brief with these exact sections:
CRITICAL WATCHPOINTS (must read first)
EQUIPMENT STATUS SUMMARY (table format: Tag | Status | Note)
UNRESOLVED ISSUES
RECURRING PATTERNS (if any)
RECOMMENDED FIRST CHECKS FOR INCOMING SHIFT

Be specific. Use equipment tags. No vague language."""

SEVERITY_PROMPT = """Classify this refinery shift event.
Equipment: {tag}
Event type: {event_type}
Description: {description}
Is this event: routine, notable, or critical?
Answer ONLY with JSON: {{"severity": "routine|notable|critical", "reason": "..."}}"""


def previous_shifts(shift_date: str, shift_type: str, count: int = 3) -> List[Dict[str, str]]:
    """Walk backwards through the morning/evening/night rotation."""
    date = datetime.strptime(shift_date, "%Y-%m-%d")
    idx = SHIFT_ORDER.index(shift_type) if shift_type in SHIFT_ORDER else 0
    out = []
    for _ in range(count):
        idx -= 1
        if idx < 0:
            idx = len(SHIFT_ORDER) - 1
            date -= timedelta(days=1)
        out.append({"shift_date": date.strftime("%Y-%m-%d"), "shift_type": SHIFT_ORDER[idx]})
    return out


def shift_window(shift_date: str, shift_type: str) -> tuple:
    """Approximate clock window for pulling alerts/measurements logged during a shift."""
    base = datetime.strptime(shift_date, "%Y-%m-%d")
    spans = {"morning": (6, 14), "evening": (14, 22), "night": (22, 30)}
    start_h, end_h = spans.get(shift_type, (0, 24))
    return base + timedelta(hours=start_h), base + timedelta(hours=end_h)


class LogEventBody(BaseModel):
    shift_date: str
    shift_type: str
    equipment_tag: Optional[str] = None
    event_type: str
    description: str
    raw_source: Optional[str] = None
    severity: Optional[str] = None  # operator override; otherwise classified locally
    logged_by: str = "operator"


@router.post("/log_event")
async def log_event(body: LogEventBody):
    if body.shift_type not in SHIFT_ORDER:
        raise HTTPException(400, f"shift_type must be one of {SHIFT_ORDER}")

    severity, reason = "notable", None
    override = (body.severity or "").lower()
    if override in ("routine", "notable", "critical"):
        # An operator who states the severity outranks the classifier.
        severity, reason = override, "Set explicitly by the operator."
    else:
        try:
            verdict = llm.generate_json(
                SEVERITY_PROMPT.format(tag=body.equipment_tag or "unspecified",
                                       event_type=body.event_type, description=body.description),
                feature="shift", task_type="analysis", default=None, num_predict=300)
            if isinstance(verdict, dict):
                candidate = str(verdict.get("severity") or "").lower()
                if candidate in ("routine", "notable", "critical"):
                    severity, reason = candidate, verdict.get("reason")
        except llm.ModelUnavailable as exc:
            print(f"[shift] severity classification skipped: {exc}")

    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO shift_events
               (shift_date, shift_type, equipment_tag, event_type, description, raw_source,
                severity, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (body.shift_date, body.shift_type, (body.equipment_tag or "").upper() or None,
             body.event_type, body.description, body.raw_source, severity,
             datetime.now().isoformat()))
        event_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    log_audit("shift_event_logged", body.logged_by, None, "shift",
              {"event_id": event_id, "equipment_tag": body.equipment_tag, "severity": severity})

    monitoring = None
    if severity == "critical" and body.equipment_tag:
        conn = get_db()
        try:
            row = conn.execute(
                """SELECT id FROM documents WHERE UPPER(equipment_tags) LIKE ?
                   ORDER BY COALESCE(document_date, upload_time) DESC LIMIT 1""",
                (f"%{body.equipment_tag.upper()}%",)).fetchone()
        finally:
            conn.close()
        if row:
            from routers.monitoring import monitor
            try:
                monitoring = monitor.analyze_document(row["id"])
            except Exception as exc:
                monitoring = {"error": str(exc)}

    return {"event_id": event_id, "severity": severity, "classification_reason": reason,
            "monitoring_triggered": monitoring is not None, "monitoring": monitoring}


def gather_shift_context(shift_date: str, shift_type: str) -> Dict[str, Any]:
    start, end = shift_window(shift_date, shift_type)
    conn = get_db()
    try:
        events = rows_to_dicts(conn.execute(
            """SELECT * FROM shift_events WHERE shift_date = ? AND shift_type = ?
               ORDER BY created_at""", (shift_date, shift_type)).fetchall())

        alerts = rows_to_dicts(conn.execute(
            """SELECT id, alert_type, severity, title, equipment_tags, created_at, status
               FROM alerts WHERE created_at BETWEEN ? AND ?
               ORDER BY CASE severity WHEN 'CRITICAL' THEN 3 WHEN 'WARNING' THEN 2 ELSE 1 END DESC""",
            (start.isoformat(), end.isoformat())).fetchall())
        if not alerts:
            alerts = rows_to_dicts(conn.execute(
                """SELECT id, alert_type, severity, title, equipment_tags, created_at, status
                   FROM alerts WHERE status='active'
                   ORDER BY CASE severity WHEN 'CRITICAL' THEN 3 WHEN 'WARNING' THEN 2 ELSE 1 END DESC
                   LIMIT 15""").fetchall())

        measurements = rows_to_dicts(conn.execute(
            """SELECT m.*, d.filename FROM measurements m LEFT JOIN documents d ON d.id = m.doc_id
               WHERE m.measurement_date LIKE ? ORDER BY m.equipment_tag""",
            (f"{shift_date}%",)).fetchall())

        # Cross-shift recurrence
        tags_this_shift = {e["equipment_tag"] for e in events if e["equipment_tag"]}
        recurring = []
        for tag in tags_this_shift:
            streak, chain = 1, [f"{shift_date} {shift_type}"]
            for prev in previous_shifts(shift_date, shift_type, 3):
                hit = conn.execute(
                    """SELECT COUNT(*) c FROM shift_events
                       WHERE shift_date = ? AND shift_type = ? AND UPPER(equipment_tag) = ?""",
                    (prev["shift_date"], prev["shift_type"], tag)).fetchone()["c"]
                if hit:
                    streak += 1
                    chain.append(f"{prev['shift_date']} {prev['shift_type']}")
                else:
                    break
            if streak >= 3:
                recurring.append({"equipment_tag": tag, "consecutive_shifts": streak,
                                  "shift_chain": chain})
    finally:
        conn.close()

    from routers.monitoring import DEFAULT_LIMITS
    anomalies = []
    for m in measurements:
        limits = next((v for k, v in DEFAULT_LIMITS.items() if k in (m["parameter"] or "").lower()), None)
        if not limits or m["value"] is None:
            continue
        if "min" in limits and m["value"] < limits["min"]:
            anomalies.append({**m, "breach": f"below minimum {limits['min']}"})
        elif "max" in limits and m["value"] > limits["max"]:
            anomalies.append({**m, "breach": f"above maximum {limits['max']}"})

    return {"events": events, "alerts": alerts, "measurements": measurements,
            "recurring": recurring, "anomalies": anomalies,
            "window": {"start": start.isoformat(), "end": end.isoformat()}}


class HandoverBody(BaseModel):
    shift_date: str
    shift_type: str
    generated_by: str = "shift_incharge"


def deterministic_brief(shift_date: str, shift_type: str, events_txt: str, alerts_txt: str,
                        recurring_txt: str, anomalies_txt: str) -> str:
    """Fallback handover brief built from facts only — no model required."""
    return (
        f"SHIFT HANDOVER — {shift_type.upper()} SHIFT, {shift_date}\n"
        f"(Assembled from logged facts; local narrative model was unavailable.)\n\n"
        f"CRITICAL WATCHPOINTS (must read first)\n{recurring_txt}\n\n"
        f"EQUIPMENT STATUS SUMMARY\n{alerts_txt}\n\n"
        f"UNRESOLVED ISSUES\n{anomalies_txt}\n\n"
        f"SHIFT LOG\n{events_txt}\n"
    )


@router.post("/generate_handover")
async def generate_handover(body: HandoverBody):
    if body.shift_type not in SHIFT_ORDER:
        raise HTTPException(400, f"shift_type must be one of {SHIFT_ORDER}")

    ctx = gather_shift_context(body.shift_date, body.shift_type)

    events_txt = "\n".join(
        f"- [{e['severity'] or 'notable'}] {e['equipment_tag'] or 'UNTAGGED'}: "
        f"{e['event_type']} — {e['description']}" for e in ctx["events"]) or "None logged."
    alerts_txt = "\n".join(
        f"- [{a['severity']}] {', '.join(parse_tags(a['equipment_tags'])) or 'UNTAGGED'}: "
        f"{a['title']} ({a['status']})" for a in ctx["alerts"]) or "None active."
    recurring_txt = "\n".join(
        f"- {r['equipment_tag']} appeared in {r['consecutive_shifts']} consecutive shifts "
        f"({' <- '.join(r['shift_chain'])})" for r in ctx["recurring"]) or "None detected."
    anomalies_txt = "\n".join(
        f"- {a['equipment_tag']} {a['parameter']} = {a['value']} {a['unit'] or ''} ({a['breach']})"
        for a in ctx["anomalies"]) or "None."

    model_used = True
    try:
        brief = llm.generate(
            HANDOVER_TEMPLATE.format(shift_type=body.shift_type.upper(), shift_date=body.shift_date,
                                     events_list=events_txt, alerts_list=alerts_txt,
                                     recurring_list=recurring_txt, anomalies_list=anomalies_txt),
            feature="shift", task_type="analysis", temperature=0.25, num_predict=1600)
    except llm.ModelUnavailable as exc:
        # A shift change does not wait for a model. Assemble the brief deterministically
        # from the same facts the prompt would have used.
        print(f"[shift] handover narrative fell back to deterministic assembly: {exc}")
        model_used = False
        brief = deterministic_brief(body.shift_date, body.shift_type, events_txt, alerts_txt,
                                    recurring_txt, anomalies_txt)

    critical_count = sum(1 for e in ctx["events"] if e["severity"] == "critical") + \
        sum(1 for a in ctx["alerts"] if a["severity"] == "CRITICAL")

    equipment_summary: Dict[str, Dict[str, Any]] = {}
    for e in ctx["events"]:
        if not e["equipment_tag"]:
            continue
        entry = equipment_summary.setdefault(
            e["equipment_tag"], {"tag": e["equipment_tag"], "status": "NORMAL", "notes": []})
        entry["notes"].append(f"{e['event_type']}: {e['description']}")
        if e["severity"] == "critical":
            entry["status"] = "CRITICAL"
        elif e["severity"] == "notable" and entry["status"] != "CRITICAL":
            entry["status"] = "WATCH"
    for a in ctx["alerts"]:
        for tag in parse_tags(a["equipment_tags"]):
            entry = equipment_summary.setdefault(tag, {"tag": tag, "status": "NORMAL", "notes": []})
            entry["notes"].append(f"Alert: {a['title']}")
            if a["severity"] == "CRITICAL":
                entry["status"] = "CRITICAL"
            elif entry["status"] == "NORMAL":
                entry["status"] = "WATCH"
    for r in ctx["recurring"]:
        entry = equipment_summary.setdefault(
            r["equipment_tag"], {"tag": r["equipment_tag"], "status": "WATCH", "notes": []})
        entry["notes"].append(f"RECURRING across {r['consecutive_shifts']} shifts")

    payload = {
        "events": ctx["events"], "alerts": ctx["alerts"], "recurring": ctx["recurring"],
        "anomalies": ctx["anomalies"], "equipment_summary": list(equipment_summary.values()),
    }

    conn = get_db()
    try:
        conn.execute("DELETE FROM handovers WHERE shift_date = ? AND shift_type = ?",
                     (body.shift_date, body.shift_type))
        cur = conn.execute(
            """INSERT INTO handovers (shift_date, shift_type, brief, critical_count, payload, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (body.shift_date, body.shift_type, brief, critical_count,
             json.dumps(payload, default=str), datetime.now().isoformat()))
        handover_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    log_audit("handover_generated", body.generated_by, None, "shift",
              {"handover_id": handover_id, "shift_date": body.shift_date,
               "shift_type": body.shift_type, "critical_count": critical_count,
               "recurring_issues": len(ctx["recurring"])})

    return {
        "handover_id": handover_id, "shift_date": body.shift_date, "shift_type": body.shift_type,
        "handover_brief": brief, "critical_count": critical_count,
        "recurring_issues": ctx["recurring"], "equipment_summary": list(equipment_summary.values()),
        "event_count": len(ctx["events"]), "alert_count": len(ctx["alerts"]),
        "anomalies": ctx["anomalies"], "narrative_model_used": model_used,
        "generated_at": datetime.now().isoformat(),
    }


@router.get("/handover/{shift_date}/{shift_type}")
async def get_handover(shift_date: str, shift_type: str):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM handovers WHERE shift_date = ? AND shift_type = ? ORDER BY id DESC LIMIT 1",
            (shift_date, shift_type)).fetchone()
        if not row:
            raise HTTPException(404, f"No handover stored for {shift_type} shift on {shift_date}.")
        handover = dict(row)
        try:
            handover["payload"] = json.loads(handover.get("payload") or "{}")
        except json.JSONDecodeError:
            handover["payload"] = {}
        handover["handover_brief"] = handover.pop("brief", "")
        return handover
    finally:
        conn.close()


@router.get("/handovers")
async def list_handovers(limit: int = Query(30, le=200)):
    conn = get_db()
    try:
        return {"handovers": rows_to_dicts(conn.execute(
            """SELECT id, shift_date, shift_type, critical_count, created_at
               FROM handovers ORDER BY shift_date DESC, id DESC LIMIT ?""", (limit,)).fetchall())}
    finally:
        conn.close()


@router.get("/events")
async def list_events(shift_date: Optional[str] = Query(None), shift_type: Optional[str] = Query(None),
                      equipment_tag: Optional[str] = Query(None), limit: int = Query(200, le=1000)):
    sql, params = "SELECT * FROM shift_events WHERE 1=1", []
    if shift_date:
        sql += " AND shift_date = ?"; params.append(shift_date)
    if shift_type:
        sql += " AND shift_type = ?"; params.append(shift_type)
    if equipment_tag:
        sql += " AND UPPER(equipment_tag) = ?"; params.append(equipment_tag.upper())
    sql += " ORDER BY shift_date DESC, created_at DESC LIMIT ?"
    params.append(limit)
    conn = get_db()
    try:
        return {"events": rows_to_dicts(conn.execute(sql, params).fetchall())}
    finally:
        conn.close()


@router.get("/equipment/{tag}/shift_history")
async def equipment_shift_history(tag: str, days: int = Query(30, le=365)):
    tag = tag.upper()
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    conn = get_db()
    try:
        events = rows_to_dicts(conn.execute(
            """SELECT * FROM shift_events WHERE UPPER(equipment_tag) = ? AND shift_date >= ?
               ORDER BY shift_date DESC, shift_type""", (tag, cutoff)).fetchall())
    finally:
        conn.close()

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for e in events:
        grouped.setdefault(f"{e['shift_date']} {e['shift_type']}", []).append(e)

    # Longest run of consecutive shifts mentioning this asset.
    keys = sorted(grouped.keys(), reverse=True)
    longest, current = 0, 0
    if keys:
        latest_date, latest_type = keys[0].split(" ")
        cursor = {"shift_date": latest_date, "shift_type": latest_type}
        while True:
            if f"{cursor['shift_date']} {cursor['shift_type']}" in grouped:
                current += 1
                longest = max(longest, current)
                cursor = previous_shifts(cursor["shift_date"], cursor["shift_type"], 1)[0]
            else:
                break

    return {
        "equipment_tag": tag, "window_days": days, "total_events": len(events),
        "by_shift": [{"shift": k, "events": v} for k, v in grouped.items()],
        "consecutive_shift_streak": longest,
        "recurring": longest >= 3,
        "recurring_note": (f"{tag} has appeared in {longest} consecutive shifts — "
                           "this is a recurring issue, not an isolated event."
                           if longest >= 3 else None),
        "critical_events": [e for e in events if e["severity"] == "critical"],
    }


@router.post("/generate_word")
async def generate_handover_docx(body: HandoverBody):
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM handovers WHERE shift_date = ? AND shift_type = ? ORDER BY id DESC LIMIT 1",
            (body.shift_date, body.shift_type)).fetchone()
    finally:
        conn.close()

    if row:
        brief = row["brief"]
        payload = json.loads(row["payload"] or "{}")
        critical_count = row["critical_count"]
    else:
        generated = await generate_handover(body)
        brief = generated["handover_brief"]
        payload = {"equipment_summary": generated["equipment_summary"],
                   "recurring": generated["recurring_issues"],
                   "alerts": [], "events": [], "anomalies": generated["anomalies"]}
        critical_count = generated["critical_count"]

    doc = Document()
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("ZINGO — SHIFT HANDOVER BRIEF")
    run.bold = True
    run.font.size = Pt(16)
    run.font.color.rgb = RGBColor(0x0F, 0x3C, 0x6E)

    meta = doc.add_table(rows=0, cols=2)
    meta.style = "Light Grid Accent 1"
    for label, value in [
        ("Shift Date", body.shift_date),
        ("Shift", body.shift_type.upper()),
        ("Critical Items", str(critical_count)),
        ("Recurring Issues", str(len(payload.get("recurring") or []))),
        ("Generated", datetime.now().strftime("%d-%m-%Y %H:%M")),
        ("Generated By", body.generated_by),
    ]:
        cells = meta.add_row().cells
        cells[0].paragraphs[0].add_run(label).bold = True
        cells[1].text = value

    doc.add_paragraph()
    for line in (brief or "").split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        upper = stripped.rstrip(":").upper()
        if upper in ("CRITICAL WATCHPOINTS", "CRITICAL WATCHPOINTS (MUST READ FIRST)",
                     "EQUIPMENT STATUS SUMMARY", "UNRESOLVED ISSUES", "RECURRING PATTERNS",
                     "RECOMMENDED FIRST CHECKS FOR INCOMING SHIFT") or (
                stripped.isupper() and len(stripped) < 70):
            heading = doc.add_heading(stripped.rstrip(":").title(), level=2)
            if "CRITICAL" in upper:
                for r in heading.runs:
                    r.font.color.rgb = RGBColor(0xB0, 0x1C, 0x1C)
        else:
            doc.add_paragraph(stripped)

    summary = payload.get("equipment_summary") or []
    if summary:
        doc.add_heading("Equipment Status Table", level=2)
        table = doc.add_table(rows=1, cols=3)
        table.style = "Light Grid Accent 1"
        for i, head in enumerate(["Tag", "Status", "Note"]):
            table.rows[0].cells[i].paragraphs[0].add_run(head).bold = True
        for item in summary:
            cells = table.add_row().cells
            cells[0].text = str(item.get("tag", ""))
            cells[1].text = str(item.get("status", ""))
            cells[2].text = "; ".join(item.get("notes") or [])[:400]

    recurring = payload.get("recurring") or []
    if recurring:
        doc.add_heading("Recurring Patterns", level=2)
        for r in recurring:
            doc.add_paragraph(
                f"{r.get('equipment_tag')} — {r.get('consecutive_shifts')} consecutive shifts "
                f"({' <- '.join(r.get('shift_chain') or [])})", style="List Bullet")

    doc.add_paragraph()
    sig = doc.add_table(rows=3, cols=2)
    sig.style = "Table Grid"
    sig.rows[0].cells[0].paragraphs[0].add_run("Outgoing Shift In-charge").bold = True
    sig.rows[0].cells[1].paragraphs[0].add_run("Incoming Shift In-charge").bold = True
    for i in range(2):
        sig.rows[1].cells[i].text = "Name:\n\nSignature:"
        sig.rows[2].cells[i].text = "Time:"

    footer = doc.add_paragraph()
    frun = footer.add_run(
        "\nGenerated locally by ZINGO — on-premise inference, zero external data transfer.")
    frun.font.size = Pt(8)
    frun.italic = True

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)

    log_audit("handover_word_generated", body.generated_by, None, "shift",
              {"shift_date": body.shift_date, "shift_type": body.shift_type, "format": "docx"})
    filename = f"ZINGO_Handover_{body.shift_date}_{body.shift_type}.docx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
