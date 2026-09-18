"""
FEATURE 2 — Passive Incident Prevention Engine
==============================================
Mounted at /api/monitor

The most important system in ZINGO. It runs WITHOUT being asked: every ingested
document triggers a cross-document failure-pattern analysis.

Four detectors:
  A. Monotonic degradation (with acceleration + failure-window extrapolation)
  B. Threshold breach against the equipment's normal operating range
  C. Cross-equipment correlation over the plant graph  <- the key insight
  D. Historical pattern match via vector search over measurement history

Zero external network calls.
"""

from __future__ import annotations

import io
import json
import statistics
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import llm
from data_layer import (
    add_alert, get_db, get_plant_graph, log_audit, parse_tags, rows_to_dicts, vector_query,
    get_action_notes, get_action_note, sign_action_note, acknowledge_action_note, get_role_notifications, mark_notification_read,
)

router = APIRouter(prefix="/api/monitor", tags=["monitoring"])

# Parameters where a falling value means the asset is degrading.
DECREASING_IS_BAD = {
    "wall_thickness", "thickness", "efficiency", "flow_rate", "flow", "throughput",
    "remaining_life", "insulation_resistance", "yield", "capacity", "heat_transfer_coefficient",
}
# Parameters where a rising value means the asset is degrading.
INCREASING_IS_BAD = {
    "fouling_index", "fouling", "vibration", "vibration_reading", "pressure_drop", "dp",
    "delta_p", "temperature", "corrosion_rate", "leak_rate", "noise", "bearing_temperature",
}
# Engineering minimum / trip limits used when the graph carries no explicit range.
# Two anomalies count as correlated when they occur within this many days of each other.
CORRELATION_WINDOW_DAYS = 30
# How far back an asset's most recent anomaly may sit and still be considered.
CORRELATION_LOOKBACK_DAYS = 180

DEFAULT_LIMITS = {
    "wall_thickness": {"min": 8.0, "unit": "mm"},
    "thickness": {"min": 8.0, "unit": "mm"},
    "fouling_index": {"max": 0.85, "unit": ""},
    "vibration": {"max": 4.5, "unit": "mm/s"},
    "vibration_reading": {"max": 4.5, "unit": "mm/s"},
    "efficiency": {"min": 65.0, "unit": "%"},
}
SEVERITY_RANK = {"CRITICAL": 3, "WARNING": 2, "INFO": 1}


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------

def parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip()[:19]
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def direction_for(parameter: str) -> Optional[str]:
    p = (parameter or "").lower()
    if any(k in p for k in DECREASING_IS_BAD):
        return "decreasing_is_bad"
    if any(k in p for k in INCREASING_IS_BAD):
        return "increasing_is_bad"
    return None


def normal_range_for(tag: str, parameter: str, graph_node: Dict[str, Any]) -> Optional[Dict[str, float]]:
    ranges = (graph_node or {}).get("normal_range") or {}
    if parameter in ranges and isinstance(ranges[parameter], dict):
        return ranges[parameter]
    for key, limits in DEFAULT_LIMITS.items():
        if key in (parameter or "").lower():
            return limits
    return None


def linear_trend(points: List[Tuple[datetime, float]]) -> Tuple[float, float]:
    """Least-squares slope (units/day) and R^2 for a dated series."""
    if len(points) < 2:
        return 0.0, 0.0
    t0 = points[0][0]
    xs = [(d - t0).days for d, _ in points]
    ys = [v for _, v in points]
    n = len(xs)
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom == 0:
        return 0.0, 0.0
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom
    intercept = mean_y - slope * mean_x
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 1.0
    return slope, max(0.0, min(1.0, r2))


def build_series(conn, tag: str) -> Dict[str, List[Dict[str, Any]]]:
    """{parameter: [{date, value, unit, doc_id, measurement_id}, ...]} sorted by date."""
    rows = conn.execute(
        """SELECT m.*, d.filename, d.doc_type FROM measurements m
           LEFT JOIN documents d ON d.id = m.doc_id
           WHERE UPPER(m.equipment_tag) = ? ORDER BY m.measurement_date""",
        (tag.upper(),),
    ).fetchall()
    series: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        dt = parse_date(r["measurement_date"])
        if dt is None:
            continue
        series.setdefault(r["parameter"], []).append({
            "measurement_id": r["id"], "doc_id": r["doc_id"], "filename": r["filename"],
            "date": dt.date().isoformat(), "_dt": dt, "value": r["value"],
            "unit": r["unit"], "parameter": r["parameter"],
        })
    for points in series.values():
        points.sort(key=lambda p: p["_dt"])
    return series


def evidence_item(point: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "doc_id": point["doc_id"],
        "document": point.get("filename"),
        "measurement": f"{point['parameter']} = {point['value']} {point.get('unit') or ''}".strip(),
        "parameter": point["parameter"],
        "date": point["date"],
        "value": point["value"],
        "unit": point.get("unit"),
    }


# --------------------------------------------------------------------------------------
# The engine
# --------------------------------------------------------------------------------------

class PassiveMonitor:
    """Cross-document failure pattern detection. Runs on ingest, never on request."""

    ACTION_NOTE_PROMPT = """You are drafting an engineering action note for a PSU refinery.
Equipment: {tag}. Finding: {description}. Evidence: {evidence}.
Draft a formal action note with sections:
1. Equipment Details
2. Observation Summary
3. Risk Assessment
4. Recommended Action
5. Authority Required
Keep it under 300 words. Use formal engineering language."""

    def analyze_document(self, doc_id: int) -> Dict[str, Any]:
        """Entry point — called automatically after every ingestion."""
        conn = get_db()
        try:
            doc = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
            if not doc:
                return {"doc_id": doc_id, "error": "document not found"}

            # STEP 1 — this document's measurements
            new_measurements = rows_to_dicts(conn.execute(
                "SELECT * FROM measurements WHERE doc_id = ?", (doc_id,)).fetchall())
            tags = parse_tags(doc["equipment_tags"]) or sorted(
                {m["equipment_tag"] for m in new_measurements if m["equipment_tag"]})

            G = get_plant_graph()
            findings: List[Dict[str, Any]] = []

            for tag in tags:
                # STEP 2 — full history for this tag
                series = build_series(conn, tag)
                if not series:
                    continue
                node = dict(G.nodes[tag]) if tag in G else {}

                # STEP 3 — detectors
                findings += self.detect_degradation(tag, series)
                findings += self.detect_threshold_breach(tag, series, node)
                findings += self.detect_correlated_anomaly(conn, G, tag, series)

            # STEP 4/5 — raise alerts with evidence, precedent, SOP clause, drafted note
            raised = []
            for finding in findings:
                finding["historical_precedent"] = self.match_historical_pattern(finding)
                finding["sop_clause"] = self.find_sop_clause(finding)
                if finding["severity"] in ("WARNING", "CRITICAL"):
                    finding["draft_action_note"] = self.draft_action_note(finding)
                alert_id = add_alert(
                    alert_type=finding["alert_type"],
                    severity=finding["severity"],
                    title=finding["title"],
                    description=finding["description"],
                    evidence=finding,
                    equipment_tags=finding["equipment_tags"],
                    # One alert per (detector, equipment, parameter) so a thinning trend and a
                    # fouling trend on the same exchanger do not overwrite each other.
                    dedupe_key="|".join([
                        finding["alert_type"],
                        ",".join(sorted(finding["equipment_tags"])),
                        finding.get("parameter") or finding.get("detector") or "",
                    ]),
                )
                raised.append({"alert_id": alert_id, "type": finding["alert_type"],
                               "severity": finding["severity"], "tags": finding["equipment_tags"]})

            log_audit("passive_analysis_completed", "zingo_monitor", doc_id, "monitoring",
                      {"tags_analyzed": tags, "alerts_raised": len(raised)})
            return {"doc_id": doc_id, "tags_analyzed": tags,
                    "alerts_raised": len(raised), "alerts": raised}
        finally:
            conn.close()

    # ---------------- Algorithm A ----------------
    def detect_degradation(self, tag: str, series: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        """Monotonic degradation with acceleration check and failure-window extrapolation."""
        out = []
        for parameter, points in series.items():
            direction = direction_for(parameter)
            if direction is None or len(points) < 3:
                continue
            values = [p["value"] for p in points]
            recent = values[-3:]
            worsening = (
                all(b < a for a, b in zip(recent, recent[1:])) if direction == "decreasing_is_bad"
                else all(b > a for a, b in zip(recent, recent[1:]))
            )
            if not worsening:
                continue

            deltas = [abs(b - a) for a, b in zip(recent, recent[1:])]
            accelerating = len(deltas) >= 2 and deltas[-1] > deltas[0] * 1.05

            baseline = values[0]
            latest = values[-1]
            pct_change = abs(latest - baseline) / abs(baseline) * 100 if baseline else 0.0
            slope, r2 = linear_trend([(p["_dt"], p["value"]) for p in points])

            if pct_change >= 15 or accelerating and pct_change >= 8:
                severity = "CRITICAL" if pct_change >= 25 else "WARNING"
            elif pct_change >= 5:
                severity = "WARNING" if accelerating else "INFO"
            else:
                continue

            limits = DEFAULT_LIMITS.get(parameter, {})
            window = self.predict_failure_window(points, slope, limits, direction)
            if window and window.get("days_remaining", 9999) < 120:
                severity = "CRITICAL"

            unit = points[-1].get("unit") or ""
            out.append({
                "alert_type": "DEGRADATION_TREND",
                "severity": severity,
                "equipment_tags": [tag],
                "title": f"{tag}: {parameter.replace('_', ' ')} degrading "
                         f"{pct_change:.1f}% from baseline"
                         + (" (accelerating)" if accelerating else ""),
                "description": (
                    f"{tag} shows a monotonic {'decline' if direction == 'decreasing_is_bad' else 'rise'} "
                    f"in {parameter.replace('_', ' ')} across {len(points)} readings: "
                    f"{baseline} {unit} -> {latest} {unit} "
                    f"({pct_change:.1f}% change from baseline, trend {slope:+.4f} {unit}/day, R²={r2:.2f})."
                    + (" Rate of change is accelerating between successive inspections."
                       if accelerating else "")
                ),
                "detector": "A_monotonic_degradation",
                "parameter": parameter,
                "baseline_value": baseline,
                "latest_value": latest,
                "percent_change": round(pct_change, 2),
                "slope_per_day": round(slope, 6),
                "r_squared": round(r2, 3),
                "accelerating": accelerating,
                "predicted_failure_window": window,
                "evidence": [evidence_item(p) for p in points],
            })
        return out

    @staticmethod
    def predict_failure_window(points, slope: float, limits: Dict[str, Any],
                               direction: str) -> Optional[Dict[str, Any]]:
        """Extrapolate the dated trend to the engineering limit."""
        if not limits or abs(slope) < 1e-9:
            return None
        latest = points[-1]["value"]
        if direction == "decreasing_is_bad" and "min" in limits and slope < 0:
            limit, gap = limits["min"], latest - limits["min"]
        elif direction == "increasing_is_bad" and "max" in limits and slope > 0:
            limit, gap = limits["max"], limits["max"] - latest
        else:
            return None
        if gap <= 0:
            return {"limit": limit, "days_remaining": 0, "breach_date": points[-1]["date"],
                    "status": "ALREADY_BREACHED"}
        days = int(abs(gap / slope))
        if days > 3650:
            return None
        breach = points[-1]["_dt"] + timedelta(days=days)
        return {
            "limit": limit, "unit": points[-1].get("unit"),
            "days_remaining": days,
            "breach_date": breach.date().isoformat(),
            "status": "PROJECTED",
            "basis": f"linear extrapolation of {len(points)} dated readings at {slope:+.4f}/day",
        }

    # ---------------- Algorithm B ----------------
    def detect_threshold_breach(self, tag: str, series, node: Dict[str, Any]) -> List[Dict[str, Any]]:
        out = []
        for parameter, points in series.items():
            limits = normal_range_for(tag, parameter, node)
            if not limits:
                continue
            latest = points[-1]
            value = latest["value"]
            deviation = None
            if "min" in limits and value < limits["min"]:
                deviation = (limits["min"] - value) / abs(limits["min"]) * 100
                boundary, kind = limits["min"], "below minimum"
            elif "max" in limits and value > limits["max"]:
                deviation = (value - limits["max"]) / abs(limits["max"]) * 100
                boundary, kind = limits["max"], "above maximum"
            if deviation is None or deviation < 20:
                continue

            critical = deviation >= 35
            out.append({
                "alert_type": "CRITICAL_THRESHOLD_BREACH" if critical else "THRESHOLD_BREACH",
                "severity": "CRITICAL" if critical else "WARNING",
                "equipment_tags": [tag],
                "title": f"{tag}: {parameter.replace('_', ' ')} {kind} by {deviation:.1f}%",
                "description": (
                    f"Latest {parameter.replace('_', ' ')} on {tag} is {value} "
                    f"{latest.get('unit') or ''} recorded {latest['date']}, which is {deviation:.1f}% "
                    f"{kind} of the normal operating boundary ({boundary} {limits.get('unit', '')})."
                ),
                "detector": "B_threshold_breach",
                "parameter": parameter,
                "latest_value": value,
                "boundary": boundary,
                "deviation_percent": round(deviation, 2),
                "evidence": [evidence_item(p) for p in points[-4:]],
            })
        return out

    # ---------------- Algorithm C ----------------
    def detect_correlated_anomaly(self, conn, G, tag: str, series) -> List[Dict[str, Any]]:
        """A single anomaly is noise. Anomalies on connected equipment are signal."""
        if tag not in G:
            return []
        try:
            neighbourhood = [n for n, d in nx_shortest_lengths(G, tag).items() if 0 < d <= 2]
        except Exception:
            neighbourhood = list(G.neighbors(tag))
        if not neighbourhood:
            return []

        # Anomalies are correlated when they co-occur with each other, not when they happen
        # to fall within 30 days of today — an asset inspected quarterly would otherwise
        # never correlate with one monitored monthly.
        lookback = datetime.now() - timedelta(days=CORRELATION_LOOKBACK_DAYS)
        anomalous: List[Dict[str, Any]] = []

        self_anomaly = self.recent_anomaly(series, lookback)
        if not self_anomaly:
            return []
        anomalous.append({"tag": tag, **self_anomaly})

        for other in neighbourhood:
            other_series = build_series(conn, other)
            if not other_series:
                continue
            found = self.recent_anomaly(other_series, lookback)
            if found:
                anomalous.append({"tag": other, **found})

        if len(anomalous) < 2:
            return []

        # Keep only the assets whose anomaly falls within the correlation window of this one.
        anchor = parse_date(self_anomaly.get("date"))
        if anchor:
            kept = [anomalous[0]]
            for a in anomalous[1:]:
                other_dt = parse_date(a.get("date"))
                if other_dt and abs((other_dt - anchor).days) <= CORRELATION_WINDOW_DAYS:
                    a["days_apart"] = abs((other_dt - anchor).days)
                    kept.append(a)
            anomalous = kept
            if len(anomalous) < 2:
                return []

        tags = [a["tag"] for a in anomalous]
        evidence: List[Dict[str, Any]] = []
        for a in anomalous:
            evidence += a["evidence"]

        severity = "CRITICAL" if len(anomalous) >= 3 else "WARNING"
        hops = {t: nx_shortest_lengths(G, tag).get(t, "?") for t in tags if t != tag}
        return [{
            "alert_type": "CORRELATED_ANOMALY",
            "severity": severity,
            "equipment_tags": tags,
            "title": f"Correlated anomaly across {len(anomalous)} connected assets: {', '.join(tags)}",
            "description": (
                f"{tag} and {len(anomalous) - 1} process-connected asset(s) "
                f"({', '.join(f'{t} at {hops.get(t)} hop(s)' for t in tags if t != tag)}) "
                f"each show anomalous readings within a 30-day window: "
                + "; ".join(f"{a['tag']} {a['parameter'].replace('_', ' ')} "
                            f"{a['value']} {a.get('unit') or ''} on {a['date']}"
                            for a in anomalous)
                + ". Isolated deviations are usually measurement noise; deviations that co-occur "
                  "on connected equipment indicate a shared root cause and warrant joint investigation."
            ),
            "detector": "C_cross_equipment_correlation",
            "correlated_assets": anomalous,
            "hop_distances": hops,
            "evidence": evidence,
        }]

    @staticmethod
    def recent_anomaly(series, cutoff: datetime) -> Optional[Dict[str, Any]]:
        """Latest reading in the window that trends the wrong way or approaches a limit."""
        best = None
        for parameter, points in series.items():
            direction = direction_for(parameter)
            latest = points[-1]
            if latest["_dt"] < cutoff or direction is None:
                continue
            limits = DEFAULT_LIMITS.get(parameter, {})
            score, reason = 0.0, None

            if "max" in limits and limits["max"]:
                usage = latest["value"] / limits["max"]
                if usage >= 0.9:
                    score, reason = usage, f"at {usage * 100:.0f}% of limit {limits['max']}"
            if "min" in limits and limits["min"]:
                margin = (latest["value"] - limits["min"]) / limits["min"]
                if margin <= 0.45:
                    score = max(score, 1.5 - margin)
                    reason = reason or f"only {margin * 100:.0f}% above minimum {limits['min']}"

            if len(points) >= 2:
                prev, curr = points[-2]["value"], latest["value"]
                worse = curr < prev if direction == "decreasing_is_bad" else curr > prev
                if worse and prev:
                    delta = abs(curr - prev) / abs(prev)
                    if delta >= 0.03:
                        score = max(score, 0.9 + delta)
                        reason = reason or f"moved {delta * 100:.1f}% adversely since {points[-2]['date']}"

            if reason and (best is None or score > best["score"]):
                best = {
                    "parameter": parameter, "value": latest["value"], "unit": latest.get("unit"),
                    "date": latest["date"], "reason": reason, "score": score,
                    "evidence": [evidence_item(p) for p in points[-3:]],
                }
        if best:
            best.pop("score", None)
            best["score"] = 1
        return best

    # ---------------- Algorithm D ----------------
    @staticmethod
    def match_historical_pattern(finding: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Vector search over measurement history for precedent (similarity > 0.85)."""
        query = f"{finding['title']} {finding.get('parameter', '')} {finding['alert_type']}"
        hits = vector_query("measurements_history", query, n_results=6)
        precedent = []
        current_docs = {e.get("doc_id") for e in finding.get("evidence", [])}
        for hit in hits:
            sim = hit.get("similarity")
            meta = hit.get("metadata") or {}
            if meta.get("doc_id") in current_docs:
                continue
            if sim is not None and sim > 0.85:
                precedent.append({
                    "doc_id": meta.get("doc_id"), "equipment_tag": meta.get("equipment_tag"),
                    "parameter": meta.get("parameter"), "value": meta.get("value"),
                    "date": meta.get("date"), "similarity": sim, "excerpt": hit["document"][:300],
                })
        return precedent[:3]

    @staticmethod
    def find_sop_clause(finding: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Which SOP / standard clause this finding triggers."""
        query = (f"{finding.get('parameter', '')} {finding['alert_type']} inspection limit "
                 f"action required {' '.join(finding.get('equipment_tags', []))}")
        hits = vector_query("sop_library", query, n_results=2)
        if not hits:
            return None
        top = hits[0]
        meta = top.get("metadata") or {}
        return {
            "standard_code": meta.get("standard_code"),
            "clause_number": meta.get("clause_number"),
            "normative_level": meta.get("normative_level"),
            "excerpt": top["document"][:400],
            "similarity": top.get("similarity"),
        }

    # ---------------- STEP 5 ----------------
    def draft_action_note(self, finding: Dict[str, Any]) -> Optional[str]:
        evidence_lines = "; ".join(
            f"{e['date']}: {e['measurement']} (doc {e['doc_id']})"
            for e in finding.get("evidence", [])[:8]
        )
        window = finding.get("predicted_failure_window")
        if window:
            evidence_lines += (f". Projected limit breach {window.get('breach_date')} "
                               f"({window.get('days_remaining')} days).")
        precedent = finding.get("historical_precedent") or []
        if precedent:
            evidence_lines += " Historical precedent: " + "; ".join(
                f"{p.get('equipment_tag')} {p.get('parameter')} {p.get('value')} on {p.get('date')}"
                for p in precedent)
        prompt = self.ACTION_NOTE_PROMPT.format(
            tag=", ".join(finding.get("equipment_tags", [])) or "UNTAGGED",
            description=finding.get("description", finding.get("title")),
            evidence=evidence_lines or "See attached measurement history.",
        )
        try:
            return llm.generate(prompt, feature="monitoring", task_type="analysis",
                                temperature=0.25, num_predict=900)
        except llm.ModelUnavailable as exc:
            print(f"[monitor] action note not drafted: {exc}")
            return None


def nx_shortest_lengths(G, source) -> Dict[str, int]:
    import networkx as nx
    return dict(nx.single_source_shortest_path_length(G, source, cutoff=2))


monitor = PassiveMonitor()


def analyze_document_task(doc_id: int) -> None:
    """BackgroundTasks entry point — must never raise into the request cycle."""
    try:
        result = monitor.analyze_document(doc_id)
        print(f"[monitor] doc {doc_id}: {result.get('alerts_raised', 0)} alert(s) raised")
    except Exception as exc:
        print(f"[monitor] analysis failed for doc {doc_id}: {exc}")
        log_audit("passive_analysis_failed", "zingo_monitor", doc_id, "monitoring", {"error": str(exc)})


# --------------------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------------------

def hydrate_alert(row) -> Dict[str, Any]:
    alert = dict(row)
    try:
        alert["evidence"] = json.loads(alert.get("evidence") or "{}")
    except json.JSONDecodeError:
        alert["evidence"] = {}
    alert["equipment_tags"] = parse_tags(alert.get("equipment_tags"))
    ev = alert["evidence"]
    alert["evidence_count"] = len(ev.get("evidence", [])) if isinstance(ev, dict) else 0
    alert["has_action_note"] = bool(isinstance(ev, dict) and ev.get("draft_action_note"))
    return alert


@router.get("/alerts")
async def list_alerts(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    equipment_tag: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(200, le=1000),
):
    sql, params = "SELECT * FROM alerts WHERE 1=1", []
    if status:
        sql += " AND status = ?"; params.append(status)
    if severity:
        sql += " AND severity = ?"; params.append(severity.upper())
    if equipment_tag:
        sql += " AND UPPER(equipment_tags) LIKE ?"; params.append(f"%{equipment_tag.upper()}%")
    if date_from:
        sql += " AND created_at >= ?"; params.append(date_from)
    if date_to:
        sql += " AND created_at <= ?"; params.append(date_to)
    sql += (" ORDER BY CASE severity WHEN 'CRITICAL' THEN 3 WHEN 'WARNING' THEN 2 ELSE 1 END DESC,"
            " created_at DESC LIMIT ?")
    params.append(limit)

    conn = get_db()
    try:
        alerts = [hydrate_alert(r) for r in conn.execute(sql, params).fetchall()]
        counts = {r["severity"]: r["c"] for r in conn.execute(
            "SELECT severity, COUNT(*) c FROM alerts WHERE status='active' GROUP BY severity"
        ).fetchall()}
        return {
            "total": len(alerts),
            "active_critical": counts.get("CRITICAL", 0),
            "active_warning": counts.get("WARNING", 0),
            "active_info": counts.get("INFO", 0),
            "alerts": alerts,
        }
    finally:
        conn.close()


@router.get("/alerts/{alert_id}")
async def get_alert(alert_id: int):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"Alert {alert_id} not found.")
        alert = hydrate_alert(row)
        ev = alert["evidence"] if isinstance(alert["evidence"], dict) else {}
        alert["draft_action_note"] = ev.get("draft_action_note")
        alert["predicted_failure_window"] = ev.get("predicted_failure_window")
        alert["sop_clause"] = ev.get("sop_clause")
        alert["detector"] = ev.get("detector")
        alert["evidence_chain"] = ev.get("evidence", [])

        precedent_ids = [p.get("doc_id") for p in (ev.get("historical_precedent") or []) if p.get("doc_id")]
        docs = []
        if precedent_ids:
            marks = ",".join("?" * len(precedent_ids))
            docs = rows_to_dicts(conn.execute(
                f"""SELECT id, filename, doc_type, document_date, equipment_tags
                    FROM documents WHERE id IN ({marks})""", precedent_ids).fetchall())
        alert["historical_precedent"] = ev.get("historical_precedent") or []
        alert["historical_precedent_documents"] = docs

        source_ids = sorted({e.get("doc_id") for e in alert["evidence_chain"] if e.get("doc_id")})
        if source_ids:
            marks = ",".join("?" * len(source_ids))
            alert["source_documents"] = rows_to_dicts(conn.execute(
                f"""SELECT id, filename, doc_type, document_date, uploaded_by
                    FROM documents WHERE id IN ({marks})""", source_ids).fetchall())
        else:
            alert["source_documents"] = []
        return alert
    finally:
        conn.close()


class AcknowledgeBody(BaseModel):
    acknowledged_by: str
    notes: Optional[str] = None


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int, body: AcknowledgeBody):
    conn = get_db()
    try:
        if not conn.execute("SELECT 1 FROM alerts WHERE id = ?", (alert_id,)).fetchone():
            raise HTTPException(404, f"Alert {alert_id} not found.")
        conn.execute(
            """UPDATE alerts SET status='acknowledged', acknowledged_by=?, acknowledged_at=?, ack_notes=?
               WHERE id = ?""",
            (body.acknowledged_by, datetime.now().isoformat(), body.notes, alert_id),
        )
        conn.commit()
    finally:
        conn.close()
    log_audit("alert_acknowledged", body.acknowledged_by, None, "monitoring",
              {"alert_id": alert_id, "notes": body.notes})
    return {"alert_id": alert_id, "status": "acknowledged", "acknowledged_by": body.acknowledged_by}


@router.post("/alerts/{alert_id}/generate_word")
async def generate_action_note_docx(alert_id: int, generated_by: str = Query("engineer")):
    """Render the auto-drafted action note as a formal .docx."""
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"Alert {alert_id} not found.")
        alert = hydrate_alert(row)
    finally:
        conn.close()

    ev = alert["evidence"] if isinstance(alert["evidence"], dict) else {}
    note = ev.get("draft_action_note")
    if not note:
        note = monitor.draft_action_note({**ev, "title": alert["title"],
                                          "description": alert["description"],
                                          "equipment_tags": alert["equipment_tags"]}) or \
               "Action note could not be drafted — the local model node was unavailable. " \
               "Evidence chain is attached below for manual assessment."

    doc = Document()

    header = doc.add_paragraph()
    header.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = header.add_run("ZINGO — SOVEREIGN AI WORKBENCH")
    run.bold = True
    run.font.size = Pt(16)
    run.font.color.rgb = RGBColor(0x0F, 0x3C, 0x6E)
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_run = sub.add_run("ENGINEERING ACTION NOTE — AUTO-GENERATED, ENGINEER REVIEW REQUIRED")
    sub_run.font.size = Pt(9)
    sub_run.bold = True

    doc.add_paragraph()
    doc.add_heading("Equipment Details", level=2)
    meta = doc.add_table(rows=0, cols=2)
    meta.style = "Light Grid Accent 1"
    for label, value in [
        ("Equipment Tag(s)", ", ".join(alert["equipment_tags"]) or "—"),
        ("Alert Reference", f"ZINGO-ALERT-{alert['id']:05d}"),
        ("Alert Type", alert["alert_type"]),
        ("Severity", alert["severity"]),
        ("Detector", ev.get("detector", "—")),
        ("Raised On", (alert["created_at"] or "")[:19].replace("T", " ")),
        ("Parameter", ev.get("parameter", "—")),
        ("Status", alert["status"]),
    ]:
        cells = meta.add_row().cells
        cells[0].paragraphs[0].add_run(label).bold = True
        cells[1].text = str(value)

    doc.add_heading("Finding", level=2)
    doc.add_paragraph(alert["title"])
    doc.add_paragraph(alert["description"] or "")

    window = ev.get("predicted_failure_window")
    if window:
        doc.add_heading("Predicted Failure Window", level=2)
        doc.add_paragraph(
            f"Engineering limit: {window.get('limit')} {window.get('unit') or ''} | "
            f"Projected breach: {window.get('breach_date')} "
            f"({window.get('days_remaining')} days remaining) | "
            f"Basis: {window.get('basis', 'trend extrapolation')}"
        )

    chain = ev.get("evidence", [])
    if chain:
        doc.add_heading("Evidence Chain", level=2)
        table = doc.add_table(rows=1, cols=4)
        table.style = "Light Grid Accent 1"
        for i, head in enumerate(["Date", "Measurement", "Source Document", "Doc ID"]):
            table.rows[0].cells[i].paragraphs[0].add_run(head).bold = True
        for e in chain:
            cells = table.add_row().cells
            cells[0].text = str(e.get("date", ""))
            cells[1].text = str(e.get("measurement", ""))
            cells[2].text = str(e.get("document") or "")
            cells[3].text = str(e.get("doc_id", ""))

    clause = ev.get("sop_clause")
    if clause and clause.get("excerpt"):
        doc.add_heading("Governing Clause", level=2)
        doc.add_paragraph(
            f"{clause.get('standard_code') or 'Reference'} "
            f"{clause.get('clause_number') or ''} "
            f"({clause.get('normative_level') or 'informative'}): {clause.get('excerpt')}"
        )

    doc.add_heading("Drafted Action Note", level=2)
    for para in [p for p in note.split("\n") if p.strip()]:
        doc.add_paragraph(para.strip())

    precedent = ev.get("historical_precedent") or []
    if precedent:
        doc.add_heading("Historical Precedent", level=2)
        for p in precedent:
            doc.add_paragraph(
                f"{p.get('equipment_tag')} — {p.get('parameter')} = {p.get('value')} "
                f"on {p.get('date')} (similarity {p.get('similarity')})", style="List Bullet")

    doc.add_paragraph()
    doc.add_heading("Approval & Signature", level=2)
    sig = doc.add_table(rows=3, cols=3)
    sig.style = "Table Grid"
    for i, head in enumerate(["Prepared By (ZINGO)", "Reviewed By", "Approved By"]):
        sig.rows[0].cells[i].paragraphs[0].add_run(head).bold = True
    sig.rows[1].cells[0].text = f"ZINGO Passive Monitor / {generated_by}"
    for i in range(3):
        sig.rows[2].cells[i].text = "Name:\n\nDesignation:\n\nDate:\n\nSignature:"

    footer = doc.add_paragraph()
    frun = footer.add_run(
        f"\nGenerated locally by ZINGO on {datetime.now().strftime('%d-%m-%Y %H:%M')} — "
        "on-premise inference, zero external data transfer. Audit reference logged."
    )
    frun.font.size = Pt(8)
    frun.italic = True

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)

    log_audit("action_note_generated", generated_by, None, "monitoring",
              {"alert_id": alert_id, "format": "docx", "equipment_tags": alert["equipment_tags"]})

    tag_part = (alert["equipment_tags"][0] if alert["equipment_tags"] else "GENERAL").replace("/", "-")
    filename = f"ZINGO_ActionNote_{tag_part}_{alert_id}.docx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/equipment/{tag}/timeline")
async def equipment_timeline(tag: str):
    """Everything ZINGO knows about one asset, shaped for the frontend timeline."""
    tag = tag.upper()
    conn = get_db()
    try:
        measurements = rows_to_dicts(conn.execute(
            """SELECT m.*, d.filename, d.doc_type FROM measurements m
               LEFT JOIN documents d ON d.id = m.doc_id
               WHERE UPPER(m.equipment_tag) = ? ORDER BY m.measurement_date""", (tag,)).fetchall())
        alerts = [hydrate_alert(r) for r in conn.execute(
            """SELECT * FROM alerts WHERE UPPER(equipment_tags) LIKE ?
               ORDER BY created_at DESC""", (f"%{tag}%",)).fetchall()]
        documents = rows_to_dicts(conn.execute(
            """SELECT id, filename, doc_type, document_date, upload_time, uploaded_by
               FROM documents WHERE UPPER(equipment_tags) LIKE ?
               ORDER BY COALESCE(document_date, upload_time) DESC""", (f"%{tag}%",)).fetchall())
        events = rows_to_dicts(conn.execute(
            """SELECT * FROM shift_events WHERE UPPER(equipment_tag) = ?
               ORDER BY shift_date DESC LIMIT 50""", (tag,)).fetchall())

        series: Dict[str, List[Dict[str, Any]]] = {}
        for m in measurements:
            series.setdefault(m["parameter"], []).append(
                {"date": m["measurement_date"], "value": m["value"],
                 "unit": m["unit"], "doc_id": m["doc_id"], "document": m["filename"]})

        G = get_plant_graph()
        node = dict(G.nodes[tag]) if tag in G else {}
        connected = sorted(G.neighbors(tag)) if tag in G else []

        return {
            "equipment_tag": tag,
            "node_attributes": node,
            "connected_equipment": connected,
            "measurement_count": len(measurements),
            "measurements": measurements,
            "series": series,
            "parameters": sorted(series.keys()),
            "alerts": alerts,
            "active_alerts": [a for a in alerts if a["status"] == "active"],
            "documents": documents,
            "shift_events": events,
        }
    finally:
        conn.close()


@router.post("/run_full_scan")
async def run_full_scan(limit: int = Query(500, le=2000)):
    """Re-run passive analysis over the whole corpus — the 'watch it think' demo moment."""
    started = datetime.now()
    conn = get_db()
    try:
        doc_ids = [r["id"] for r in conn.execute(
            "SELECT id FROM documents ORDER BY COALESCE(document_date, upload_time) LIMIT ?",
            (limit,)).fetchall()]
    finally:
        conn.close()

    results, total_alerts = [], 0
    for doc_id in doc_ids:
        try:
            res = monitor.analyze_document(doc_id)
            total_alerts += res.get("alerts_raised", 0)
            results.append({"doc_id": doc_id, "tags": res.get("tags_analyzed", []),
                            "alerts_raised": res.get("alerts_raised", 0)})
        except Exception as exc:
            results.append({"doc_id": doc_id, "error": str(exc)})

    conn = get_db()
    try:
        by_sev = {r["severity"]: r["c"] for r in conn.execute(
            "SELECT severity, COUNT(*) c FROM alerts WHERE status='active' GROUP BY severity"
        ).fetchall()}
        by_type = {r["alert_type"]: r["c"] for r in conn.execute(
            "SELECT alert_type, COUNT(*) c FROM alerts WHERE status='active' GROUP BY alert_type"
        ).fetchall()}
    finally:
        conn.close()

    elapsed = int((datetime.now() - started).total_seconds() * 1000)
    log_audit("full_scan_completed", "engineer", None, "monitoring",
              {"documents_scanned": len(doc_ids), "alerts_raised": total_alerts,
               "duration_ms": elapsed})
    return {
        "documents_scanned": len(doc_ids),
        "alerts_raised_this_scan": total_alerts,
        "active_alerts_by_severity": by_sev,
        "active_alerts_by_type": by_type,
        "duration_ms": elapsed,
        "scanned_at": started.isoformat(),
        "per_document": results,
    }


@router.get("/summary")
async def monitoring_summary():
    conn = get_db()
    try:
        return {
            "active_alerts": conn.execute(
                "SELECT COUNT(*) c FROM alerts WHERE status='active'").fetchone()["c"],
            "critical": conn.execute(
                "SELECT COUNT(*) c FROM alerts WHERE status='active' AND severity='CRITICAL'"
            ).fetchone()["c"],
            "warning": conn.execute(
                "SELECT COUNT(*) c FROM alerts WHERE status='active' AND severity='WARNING'"
            ).fetchone()["c"],
            "acknowledged": conn.execute(
                "SELECT COUNT(*) c FROM alerts WHERE status='acknowledged'").fetchone()["c"],
            "equipment_with_alerts": conn.execute(
                "SELECT COUNT(DISTINCT equipment_tags) c FROM alerts WHERE status='active'"
            ).fetchone()["c"],
        }
    finally:
        conn.close()


class SignActionNotePayload(BaseModel):
    approved_by: str
    approval_notes: Optional[str] = None
    edited_title: Optional[str] = None
    edited_anomaly_summary: Optional[str] = None
    edited_recommended_action: Optional[str] = None
    edited_raw_markdown: Optional[str] = None
    project_id: Optional[str] = None


class AcknowledgeNotePayload(BaseModel):
    engineer_id: str
    notes: Optional[str] = None


@router.get("/action_notes")
async def list_action_notes(
    equipment_tag: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
):
    """List all auto-generated and persistent engineering action notes."""
    notes = get_action_notes(equipment_tag=equipment_tag, status=status, severity=severity, limit=limit)
    return {"total": len(notes), "action_notes": notes}


@router.get("/action_notes/{note_id}")
async def get_single_action_note(note_id: int):
    note = get_action_note(note_id)
    if not note:
        raise HTTPException(404, f"Action note {note_id} not found.")
    return note


@router.post("/action_notes/{note_id}/acknowledge")
async def acknowledge_single_action_note(note_id: int, payload: AcknowledgeNotePayload):
    """Acknowledge action note receipt, logging acknowledgment time and starting response SLA clock."""
    existing = get_action_note(note_id)
    if not existing:
        raise HTTPException(404, f"Action note {note_id} not found.")
    return acknowledge_action_note(note_id, engineer_id=payload.engineer_id, notes=payload.notes)


@router.post("/action_notes/{note_id}/sign")
async def sign_single_action_note(note_id: int, payload: SignActionNotePayload):
    """Sign and approve an engineering action note with digital hash audit, learning from any diffs."""
    existing = get_action_note(note_id)
    if not existing:
        raise HTTPException(404, f"Action note {note_id} not found.")

    from behavior_learning import record_engineer_edit_and_learn

    original_text = existing.get("original_draft") or existing.get("raw_markdown") or (
        f"{existing.get('title')}\n\n{existing.get('anomaly_summary')}\n\n{existing.get('recommended_action')}"
    )
    edited_text = payload.edited_raw_markdown or (
        f"{payload.edited_title or existing.get('title')}\n\n"
        f"{payload.edited_anomaly_summary or existing.get('anomaly_summary')}\n\n"
        f"{payload.edited_recommended_action or existing.get('recommended_action')}"
    )

    if (
        payload.edited_title
        or payload.edited_anomaly_summary
        or payload.edited_recommended_action
        or payload.edited_raw_markdown
    ):
        record_engineer_edit_and_learn(
            item_type="action_note",
            item_id=note_id,
            engineer_id=payload.approved_by,
            original_text=original_text,
            edited_text=edited_text,
            project_id=payload.project_id,
        )

    return sign_action_note(
        note_id,
        approved_by=payload.approved_by,
        approval_notes=payload.approval_notes,
        edited_title=payload.edited_title,
        edited_anomaly_summary=payload.edited_anomaly_summary,
        edited_recommended_action=payload.edited_recommended_action,
        edited_raw_markdown=payload.edited_raw_markdown,
    )


@router.get("/action_notes/{note_id}/docx")
async def export_action_note_docx(note_id: int):
    """Export action note as a formal .docx document."""
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    note = get_action_note(note_id)
    if not note:
        raise HTTPException(404, f"Action note {note_id} not found.")

    doc = Document()
    header = doc.add_paragraph()
    header.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = header.add_run("ZINGO — SOVEREIGN AI WORKBENCH")
    run.bold = True
    run.font.size = Pt(16)
    run.font.color.rgb = RGBColor(0x0F, 0x3C, 0x6E)

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_run = sub.add_run(f"ENGINEERING ACTION NOTE — {note['ref_number']}")
    sub_run.font.size = Pt(10)
    sub_run.bold = True

    doc.add_heading("1. Equipment Details", level=2)
    meta = doc.add_table(rows=0, cols=2)
    meta.style = "Light Grid Accent 1"
    for label, value in [
        ("Reference Number", note["ref_number"]),
        ("Equipment Tag", note["equipment_tag"]),
        ("Severity", note["severity"]),
        ("Target Authority", note["target_role"]),
        ("Status", note["status"]),
        ("Created On", str(note["created_at"])[:19].replace("T", " ")),
        ("Approved By", note.get("approved_by") or "PENDING REVIEW"),
        ("Approved On", str(note.get("approved_at") or "—")[:19].replace("T", " ")),
        ("Signature Hash", note.get("signature_hash") or "UNSIGNED"),
    ]:
        cells = meta.add_row().cells
        cells[0].paragraphs[0].add_run(label).bold = True
        cells[1].text = str(value)

    doc.add_heading("2. Observation & Failure Analysis", level=2)
    doc.add_paragraph(note.get("anomaly_summary") or "")

    doc.add_heading("3. Recommended Engineering Action", level=2)
    doc.add_paragraph(note.get("recommended_action") or "")

    if note.get("raw_markdown"):
        doc.add_heading("4. Action Note Content", level=2)
        doc.add_paragraph(note["raw_markdown"])

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)

    filename = f"{note['ref_number']}_{note['equipment_tag']}.docx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/notifications")
async def list_role_notifications(
    role: Optional[str] = Query(None),
    unread_only: bool = Query(False),
    limit: int = Query(50, le=200),
):
    """Retrieve notifications dispatched to engineering roles."""
    notifs = get_role_notifications(role=role, unread_only=unread_only, limit=limit)
    unread_count = len([n for n in notifs if n.get("status") == "UNREAD"])
    return {"total": len(notifs), "unread": unread_count, "notifications": notifs}


@router.post("/notifications/{notif_id}/read")
async def mark_single_notification_read(notif_id: int):
    success = mark_notification_read(notif_id)
    return {"id": notif_id, "read": success}


@router.post("/notifications/mark_all_read")
async def mark_all_notifications_read(role: Optional[str] = Query(None)):
    conn = get_db()
    try:
        where = " WHERE status = 'UNREAD'"
        params = [datetime.now().isoformat()]
        if role:
            where += " AND UPPER(recipient_role) = ?"
            params.append(role.upper())
        conn.execute(f"UPDATE role_notifications SET status = 'READ', read_at = ?{where}", params)
        conn.commit()
        return {"status": "all_read"}
    finally:
        conn.close()

