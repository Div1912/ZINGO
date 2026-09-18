"""
ZINGO — Autonomous Agent Pipeline Coordinator
==============================================
The heart of true agent autonomy in ZINGO.

Trigger: Document uploaded to /api/ingest
Execution: Autonomous, event-driven 10-step sequence:
  Step 1: Ingest document
  Step 2: Automatically check — does this mention any equipment tag already in the knowledge graph?
  Step 3: If yes — pull full history of that equipment
  Step 4: Run pattern analysis without being asked
  Step 5: If anomaly detected — draft action note automatically
  Step 6: Check if any SOP is now triggered
  Step 7: Check if this contradicts any existing document
  Step 8: Send alert to the relevant engineer role
  Step 9: Log everything to audit trail
  Step 10: Update plant health map

SOVEREIGNTY RULE: Zero external network calls.
"""

from __future__ import annotations

import json
import re
import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx

import llm
from data_layer import (
    add_alert,
    add_role_notification,
    create_action_note,
    get_db,
    get_equipment_memory,
    get_plant_graph,
    log_audit,
    parse_tags,
    rows_to_dicts,
    save_equipment_memory,
    save_plant_graph,
    upsert_equipment_health,
    upsert_equipment_node,
    vector_query,
)

# Role mapping dictionary based on equipment types and parameters
ROLE_MAPPING = {
    "heat_exchanger": "Static Equipment Engineer",
    "vessel": "Static Equipment Engineer",
    "drum": "Static Equipment Engineer",
    "column": "Static Equipment Engineer",
    "piping": "Static Equipment Engineer",
    "pump": "Rotating Equipment Specialist",
    "compressor": "Rotating Equipment Specialist",
    "turbine": "Rotating Equipment Specialist",
    "instrument": "Instrumentation & Control Engineer",
    "control_valve": "Instrumentation & Control Engineer",
    "safety_valve": "Process Safety Lead",
    "psv": "Process Safety Lead",
}

# In-memory registry of pipeline runs for real-time telemetry polling
_pipeline_runs: Dict[str, Dict[str, Any]] = {}
_runs_lock = threading.Lock()


def register_pipeline_run(pipeline_id: str, doc_id: int) -> None:
    with _runs_lock:
        _pipeline_runs[pipeline_id] = {
            "pipeline_id": pipeline_id,
            "doc_id": doc_id,
            "status": "RUNNING",
            "current_step": 1,
            "steps_completed": [],
            "findings": [],
            "action_notes": [],
            "contradictions": [],
            "alerts": [],
            "notifications": [],
            "started_at": datetime.now().isoformat(),
            "completed_at": None,
            "error": None,
        }


def update_pipeline_step(pipeline_id: str, step_num: int, step_name: str, step_data: Any) -> None:
    with _runs_lock:
        run = _pipeline_runs.get(pipeline_id)
        if not run:
            return
        run["current_step"] = step_num
        run["steps_completed"].append({
            "step": step_num,
            "name": step_name,
            "timestamp": datetime.now().isoformat(),
            "data": step_data,
        })


def complete_pipeline_run(pipeline_id: str, summary: Dict[str, Any], error: Optional[str] = None) -> None:
    with _runs_lock:
        run = _pipeline_runs.get(pipeline_id)
        if not run:
            return
        run["status"] = "ERROR" if error else "COMPLETED"
        run["completed_at"] = datetime.now().isoformat()
        run["error"] = error
        run.update(summary)


def get_pipeline_run(pipeline_id: str) -> Optional[Dict[str, Any]]:
    with _runs_lock:
        return dict(_pipeline_runs.get(pipeline_id, {})) or None


class AutonomousPipelineCoordinator:
    """Executes the full 10-step autonomous sequence for an ingested document."""

    def __init__(self, doc_id: int, pipeline_id: Optional[str] = None):
        self.doc_id = doc_id
        self.pipeline_id = pipeline_id or f"pipe-{int(time.time()*1000)}-{doc_id}"
        register_pipeline_run(self.pipeline_id, self.doc_id)

    def run(self) -> Dict[str, Any]:
        """Execute all 10 steps sequentially with comprehensive error boundaries."""
        started_perf = time.perf_counter()
        summary: Dict[str, Any] = {
            "doc_id": self.doc_id,
            "pipeline_id": self.pipeline_id,
            "equipment_tags": [],
            "graph_matches": [],
            "history_summary": {},
            "anomalies_detected": [],
            "action_notes": [],
            "sop_triggers": [],
            "contradictions": [],
            "notifications_dispatched": [],
            "plant_health_updates": [],
        }

        try:
            # ── STEP 1: Ingest document verification ──────────────────────────────
            doc, measurements = self._step_1_verify_ingest()
            tags = parse_tags(doc.get("equipment_tags"))
            summary["equipment_tags"] = tags
            update_pipeline_step(self.pipeline_id, 1, "Ingest Document", {
                "filename": doc["filename"],
                "doc_type": doc["doc_type"],
                "measurements_count": len(measurements),
                "equipment_tags": tags,
            })

            # ── STEP 2: Knowledge graph correlation ──────────────────────────────
            G = get_plant_graph()
            matched_nodes, new_nodes = self._step_2_graph_check(G, tags, doc)
            summary["graph_matches"] = matched_nodes
            update_pipeline_step(self.pipeline_id, 2, "Knowledge Graph Match", {
                "matched_nodes": matched_nodes,
                "new_nodes_created": new_nodes,
            })

            # ── STEP 3: Multi-source history retrieval ───────────────────────────
            equipment_histories = self._step_3_pull_equipment_history(tags, G)
            summary["history_summary"] = {
                t: {
                    "measurement_points": len(h["series"]),
                    "prior_docs": len(h["prior_docs"]),
                    "prior_events": len(h["events"]),
                    "episodic_facts": len(h["facts"]),
                }
                for t, h in equipment_histories.items()
            }
            update_pipeline_step(self.pipeline_id, 3, "Pull Equipment History", summary["history_summary"])

            # ── STEP 4: Run pattern analysis without being asked ─────────────────
            anomalies = self._step_4_pattern_analysis(tags, equipment_histories, G)
            summary["anomalies_detected"] = anomalies
            update_pipeline_step(self.pipeline_id, 4, "Run Pattern Analysis", {
                "anomalies_count": len(anomalies),
                "anomalies": [
                    {"tag": a["equipment_tags"], "severity": a["severity"], "title": a["title"]}
                    for a in anomalies
                ],
            })

            # ── STEP 5: Draft action note automatically if anomaly detected ──────
            drafted_notes = []
            if anomalies:
                drafted_notes = self._step_5_draft_action_notes(doc, anomalies, equipment_histories)
            summary["action_notes"] = drafted_notes
            update_pipeline_step(self.pipeline_id, 5, "Draft Action Note", {
                "notes_drafted": len(drafted_notes),
                "notes": drafted_notes,
            })

            # ── STEP 6: Check if any SOP is now triggered ─────────────────────────
            sop_triggers = self._step_6_check_sop_triggers(doc, tags, anomalies)
            summary["sop_triggers"] = sop_triggers
            update_pipeline_step(self.pipeline_id, 6, "Check SOP Triggers", {
                "sop_triggers_count": len(sop_triggers),
                "triggered_clauses": sop_triggers,
            })

            # ── STEP 7: Check if this contradicts any existing document ──────────
            contradictions = self._step_7_check_contradictions(doc, tags)
            summary["contradictions"] = contradictions
            update_pipeline_step(self.pipeline_id, 7, "Check Document Contradictions", {
                "contradictions_found": len(contradictions),
                "details": contradictions,
            })

            # ── STEP 8: Send alert to the relevant engineer role ─────────────────
            dispatches, alerts = self._step_8_dispatch_alerts(
                doc, tags, anomalies, drafted_notes, contradictions, G
            )
            summary["notifications_dispatched"] = dispatches
            summary["alerts"] = alerts
            update_pipeline_step(self.pipeline_id, 8, "Send Alert to Engineer Role", {
                "alerts_created": len(alerts),
                "dispatches": dispatches,
            })

            # ── STEP 9: Log everything to audit trail ─────────────────────────────
            self._step_9_log_audit(doc, summary, started_perf)
            update_pipeline_step(self.pipeline_id, 9, "Log to Audit Trail", {
                "logged": True,
                "timestamp": datetime.now().isoformat(),
            })

            # ── STEP 10: Update plant health map ──────────────────────────────────
            health_updates = self._step_10_update_plant_health(G, tags)
            summary["plant_health_updates"] = health_updates
            update_pipeline_step(self.pipeline_id, 10, "Update Plant Health Map", {
                "updated_tags": health_updates,
            })

            elapsed_ms = int((time.perf_counter() - started_perf) * 1000)
            summary["execution_time_ms"] = elapsed_ms
            complete_pipeline_run(self.pipeline_id, summary)
            return summary

        except Exception as exc:
            import traceback
            tb = traceback.format_exc()
            print(f"[autonomous_pipeline] Error on doc {self.doc_id}: {exc}\n{tb}")
            complete_pipeline_run(self.pipeline_id, summary, error=str(exc))
            raise

    # ----------------------------------------------------------------------------------
    # Step Implementations
    # ----------------------------------------------------------------------------------

    def _step_1_verify_ingest(self) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        conn = get_db()
        try:
            doc = conn.execute("SELECT * FROM documents WHERE id = ?", (self.doc_id,)).fetchone()
            if not doc:
                raise ValueError(f"Document id {self.doc_id} not found in database.")
            meas = rows_to_dicts(conn.execute(
                "SELECT * FROM measurements WHERE doc_id = ?", (self.doc_id,)).fetchall())
            return dict(doc), meas
        finally:
            conn.close()

    def _step_2_graph_check(
        self, G: nx.Graph, tags: List[str], doc: Dict[str, Any]
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        matched = []
        new_nodes = []
        for tag in tags:
            tag_clean = tag.strip().upper()
            if tag_clean in G:
                node_data = dict(G.nodes[tag_clean])
                neighbors = list(G.neighbors(tag_clean))
                matched.append({
                    "tag": tag_clean,
                    "equipment_type": node_data.get("equipment_type", "unknown"),
                    "service": node_data.get("service"),
                    "connected_neighbors": neighbors,
                    "first_seen": node_data.get("first_seen_date"),
                })
            else:
                upsert_equipment_node(G, tag_clean, last_inspection_date=doc.get("document_date"))
                new_nodes.append(tag_clean)

        if new_nodes:
            save_plant_graph(G)
        return matched, new_nodes

    def _step_3_pull_equipment_history(
        self, tags: List[str], G: nx.Graph
    ) -> Dict[str, Dict[str, Any]]:
        conn = get_db()
        histories: Dict[str, Dict[str, Any]] = {}
        try:
            for tag in tags:
                tag_clean = tag.strip().upper()

                # Measurements
                rows = conn.execute(
                    """SELECT m.*, d.filename, d.doc_type FROM measurements m
                       LEFT JOIN documents d ON d.id = m.doc_id
                       WHERE UPPER(m.equipment_tag) = ?
                       ORDER BY m.measurement_date ASC""",
                    (tag_clean,),
                ).fetchall()
                series = rows_to_dicts(rows)

                # Prior documents mentioning this tag
                doc_rows = conn.execute(
                    """SELECT id, filename, doc_type, document_date, upload_time, key_findings
                       FROM documents WHERE UPPER(equipment_tags) LIKE ? AND id != ?
                       ORDER BY COALESCE(document_date, upload_time) DESC LIMIT 10""",
                    (f"%{tag_clean}%", self.doc_id),
                ).fetchall()
                prior_docs = rows_to_dicts(doc_rows)

                # Shift events / past incidents
                event_rows = conn.execute(
                    """SELECT * FROM shift_events WHERE UPPER(equipment_tag) = ?
                       ORDER BY shift_date DESC LIMIT 10""",
                    (tag_clean,),
                ).fetchall()
                events = rows_to_dicts(event_rows)

                # Episodic facts
                facts = get_equipment_memory(tag_clean)

                # Topology neighbors
                neighbors = list(G.neighbors(tag_clean)) if tag_clean in G else []

                histories[tag_clean] = {
                    "tag": tag_clean,
                    "series": series,
                    "prior_docs": prior_docs,
                    "events": events,
                    "facts": facts,
                    "neighbors": neighbors,
                }
            return histories
        finally:
            conn.close()

    def _step_4_pattern_analysis(
        self,
        tags: List[str],
        histories: Dict[str, Dict[str, Any]],
        G: nx.Graph,
    ) -> List[Dict[str, Any]]:
        from routers.monitoring import PassiveMonitor, build_series
        from temporal_reasoning import evaluate_temporal_escalations
        monitor = PassiveMonitor()
        conn = get_db()
        findings: List[Dict[str, Any]] = []
        try:
            for tag in tags:
                tag_clean = tag.strip().upper()
                series = build_series(conn, tag_clean)
                node = dict(G.nodes[tag_clean]) if tag_clean in G else {}

                # Cross-Session Temporal Continuity & SLA Escalation check
                measurements_list = [{"parameter": s.get("parameter"), "value": s.get("value")} for s in series] if series else []
                escalations = evaluate_temporal_escalations(tag_clean, new_doc_id=self.doc_id, new_measurements=measurements_list)
                for esc in escalations:
                    findings.append({
                        "equipment_tags": [tag_clean],
                        "parameter": "cross_session_sla_escalation",
                        "severity": "CRITICAL",
                        "title": f"Temporal Escalation: {tag_clean} Level {esc['to_level']}",
                        "description": esc["reason"],
                        "evidence": f"Automated cross-session escalation #{esc['escalation_id']} ({esc['days_unacted']}d unacted).",
                        "is_escalation": True,
                    })

                if not series:
                    continue

                # Detector A: Monotonic degradation with acceleration & RUL
                findings += monitor.detect_degradation(tag_clean, series)
                # Detector B: Operating limit threshold breach
                findings += monitor.detect_threshold_breach(tag_clean, series, node)
                # Detector C: Cross-equipment topological correlation
                findings += monitor.detect_correlated_anomaly(conn, G, tag_clean, series)

            for f in findings:
                if not f.get("is_escalation"):
                    f["historical_precedent"] = monitor.match_historical_pattern(f)
                    f["sop_clause"] = monitor.find_sop_clause(f)
            return findings
        finally:
            conn.close()

    def _step_5_draft_action_notes(
        self,
        doc: Dict[str, Any],
        anomalies: List[Dict[str, Any]],
        histories: Dict[str, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        from behavior_learning import format_learned_preferences_for_prompt
        learned_prefs = format_learned_preferences_for_prompt()
        notes: List[Dict[str, Any]] = []
        for a in anomalies:
            if a.get("is_escalation"):
                continue  # Escalations generate formal escalation notes directly
            if a.get("severity") not in ("WARNING", "CRITICAL"):
                continue

            tag = (a.get("equipment_tags") or ["UNKNOWN"])[0]
            ref_number = f"ACT-{datetime.now().strftime('%Y%m%d')}-{self.doc_id:03d}-{len(notes)+1:02d}"
            role = self._resolve_engineer_role(tag, a.get("parameter"))

            window = a.get("predicted_failure_window") or {}
            window_text = (
                f"RUL Remaining: {window.get('days_remaining')} days (~{window.get('predicted_date')})."
                if window.get("days_remaining") else "Immediate engineering assessment required."
            )

            learned_section = ""
            if learned_prefs:
                learned_section = f"\n### 6. Learned Engineering Requirements (Derived from Sign-off Edits)\n{learned_prefs}\n"

            # Build markdown action note
            md = f"""# ENGINEERING ACTION NOTE
**Ref:** {ref_number}  
**Date:** {datetime.now().strftime('%d %B %Y')}  
**Originating Document:** {doc.get('filename')} (Doc ID: {self.doc_id})  
**Asset Tag:** {tag}  
**Severity:** {a.get('severity')}  
**Assigned Authority:** {role}  

---

### 1. Equipment Details & Service
- **Tag:** `{tag}`
- **Parameter under investigation:** `{a.get('parameter', 'Process Parameter')}`
- **Baseline Value:** {a.get('baseline_value', 'N/A')}
- **Latest Measured Value:** {a.get('latest_value', 'N/A')}
- **Calculated Drift:** {a.get('percent_change', 0)}%

### 2. Observation Summary & Physics of Failure
{a.get('description')}

### 3. Risk Assessment & Failure Window
{window_text}
Failure to intervene threatens mechanical containment, compliance with OISD-105 / API-510, and unit reliability.

### 4. Immediate Recommended Action
1. Schedule urgent Ultrasonic Thickness (UT) or NDT vibration measurement within 48 hours.
2. Verify process operating conditions against nominal crude feed parameters.
3. Review bypass or load redistribution to standby auxiliary circuit if available.
4. Prepare formal MOC (Management of Change) if operational limits are altered.

### 5. Sign-off & Regulatory Clearance Required
- **Responsible Engineer:** {role}
- **Status:** PENDING REVIEW & SIGNATURE
{learned_section}"""

            note_id = create_action_note(
                ref_number=ref_number,
                title=f"Action Note: {a.get('title')}",
                equipment_tag=tag,
                severity=a.get("severity", "WARNING"),
                target_role=role,
                doc_id=self.doc_id,
                anomaly_summary=a.get("description"),
                technical_findings=a.get("evidence"),
                regulatory_clauses=a.get("sop_clause"),
                recommended_action=f"Urgent inspection and NDT review per {role} protocol.",
                raw_markdown=md,
            )

            # Also persist an episodic memory fact for this equipment
            save_equipment_memory(
                tag=tag,
                memory_type="anomaly_action_note",
                key=f"action_note_{ref_number}",
                value=f"Drafted action note {ref_number} for {a.get('parameter')}: {a.get('percent_change')}% change",
                source_doc_id=self.doc_id,
            )

            notes.append({
                "note_id": note_id,
                "ref_number": ref_number,
                "equipment_tag": tag,
                "severity": a.get("severity"),
                "target_role": role,
                "title": f"Action Note: {a.get('title')}",
                "status": "DRAFT",
            })
        return notes

    def _step_6_check_sop_triggers(
        self, doc: Dict[str, Any], tags: List[str], anomalies: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        conn = get_db()
        triggered = []
        try:
            # Check SOP documents in library
            sop_rows = rows_to_dicts(conn.execute(
                "SELECT id, filename, sop_code, standard_refs, domain FROM sop_documents WHERE active = 1"
            ).fetchall())

            for a in anomalies:
                tag = (a.get("equipment_tags") or [""])[0]
                param = a.get("parameter", "").lower()
                for sop in sop_rows:
                    code = sop.get("sop_code", "")
                    refs = sop.get("standard_refs", "")
                    # Match by equipment tag or standard
                    if tag in code or "105" in refs or "118" in refs or "510" in refs:
                        triggered.append({
                            "sop_id": sop["id"],
                            "sop_code": code,
                            "filename": sop["filename"],
                            "equipment_tag": tag,
                            "trigger_reason": f"Anomaly on {param} triggers mandatory verification protocol per {refs}",
                            "standards": refs,
                        })
            return triggered
        finally:
            conn.close()

    def _step_7_check_contradictions(
        self, doc: Dict[str, Any], tags: List[str]
    ) -> List[Dict[str, Any]]:
        from routers.contradiction import ContradictionDetector
        detector = ContradictionDetector()
        detected_contradictions = []

        try:
            new_claims = detector.extract_claims(doc)
            if not new_claims:
                return []

            conn = get_db()
            try:
                for tag in tags:
                    tag_clean = tag.strip().upper()
                    # Get prior claims for the same equipment tag
                    prior_claims = rows_to_dicts(conn.execute(
                        """SELECT c.*, d.filename AS doc_name, d.doc_type, d.document_date
                           FROM claims c
                           LEFT JOIN documents d ON d.id = c.doc_id
                           WHERE UPPER(c.equipment_tag) = ? AND c.doc_id != ?""",
                        (tag_clean, self.doc_id),
                    ).fetchall())

                    for nc in new_claims:
                        if (nc.get("equipment_tag") or "").upper() != tag_clean:
                            continue
                        for pc in prior_claims:
                            if nc["parameter"] == pc["parameter"]:
                                # Check numeric mismatch
                                val_a = nc.get("value")
                                val_b = pc.get("value")
                                if val_a is not None and val_b is not None and val_a != val_b:
                                    pct = abs(val_a - val_b) / max(abs(val_a), 1e-6) * 100
                                    if pct > 5.0:
                                        explanation = (
                                            f"Parameter '{nc['parameter']}' mismatch on {tag_clean}: "
                                            f"new document {doc.get('filename')} states {val_a} {nc.get('unit','')}, "
                                            f"while prior document {pc.get('doc_name')} states {val_b} {pc.get('unit','')} "
                                            f"({pct:.1f}% discrepancy)."
                                        )
                                        severity = "high" if pct > 20 else "medium"
                                        # Record contradiction in db
                                        cur = conn.execute(
                                            """INSERT INTO contradictions
                                               (equipment_tag, parameter, qualifier, doc_a_id, doc_b_id,
                                                value_a, value_b, unit, contradiction_type, severity,
                                                explanation, recommended_resolution, status, detected_at)
                                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'numeric_mismatch', ?, ?, ?, 'open', ?)""",
                                            (
                                                tag_clean,
                                                nc["parameter"],
                                                nc.get("qualifier"),
                                                self.doc_id,
                                                pc["doc_id"],
                                                str(val_a),
                                                str(val_b),
                                                nc.get("unit"),
                                                severity,
                                                explanation,
                                                f"Verify latest certified inspection or calibration certificate for {tag_clean}.",
                                                datetime.now().isoformat(),
                                            ),
                                        )
                                        conn.commit()
                                        contra_id = cur.lastrowid
                                        detected_contradictions.append({
                                            "id": contra_id,
                                            "equipment_tag": tag_clean,
                                            "parameter": nc["parameter"],
                                            "value_new": val_a,
                                            "value_prior": val_b,
                                            "prior_document": pc.get("doc_name"),
                                            "severity": severity,
                                            "explanation": explanation,
                                        })
            finally:
                conn.close()

            return detected_contradictions
        except Exception as exc:
            print(f"[autonomous_pipeline] Contradiction check non-fatal error: {exc}")
            return []

    def _step_8_dispatch_alerts(
        self,
        doc: Dict[str, Any],
        tags: List[str],
        anomalies: List[Dict[str, Any]],
        drafted_notes: List[Dict[str, Any]],
        contradictions: List[Dict[str, Any]],
        G: nx.Graph,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        dispatches = []
        alerts_raised = []

        note_map = {n["equipment_tag"]: n for n in drafted_notes}

        for a in anomalies:
            tag = (a.get("equipment_tags") or ["UNKNOWN"])[0]
            role = self._resolve_engineer_role(tag, a.get("parameter"))
            note = note_map.get(tag)

            # Insert alert
            alert_id = add_alert(
                alert_type=a["alert_type"],
                severity=a["severity"],
                title=a["title"],
                description=a["description"],
                evidence=a,
                equipment_tags=a["equipment_tags"],
                dedupe_key="|".join([
                    a["alert_type"],
                    ",".join(sorted(a["equipment_tags"])),
                    a.get("parameter") or "",
                ]),
            )
            alerts_raised.append({"alert_id": alert_id, "title": a["title"], "severity": a["severity"]})

            # Dispatch notification
            notif_id = add_role_notification(
                recipient_role=role,
                title=f"Autonomous Alert: {tag} ({a['severity']})",
                message=f"{a['title']}. Draft Action Note {note['ref_number'] if note else 'generated'} is ready for review.",
                severity=a["severity"],
                alert_id=alert_id,
                action_note_id=note.get("note_id") if note else None,
                equipment_tag=tag,
            )
            dispatches.append({
                "notification_id": notif_id,
                "role": role,
                "equipment_tag": tag,
                "severity": a["severity"],
                "alert_id": alert_id,
                "action_note_ref": note.get("ref_number") if note else None,
            })

            # If Critical, also alert Shift Operations Superintendent
            if a["severity"] == "CRITICAL":
                super_id = add_role_notification(
                    recipient_role="Shift Operations Superintendent",
                    title=f"CRITICAL DISPATCH: {tag} High Risk Anomaly",
                    message=f"Critical operational degradation detected on {tag}. Immediate intervention required.",
                    severity="CRITICAL",
                    alert_id=alert_id,
                    action_note_id=note.get("note_id") if note else None,
                    equipment_tag=tag,
                )
                dispatches.append({
                    "notification_id": super_id,
                    "role": "Shift Operations Superintendent",
                    "equipment_tag": tag,
                    "severity": "CRITICAL",
                    "alert_id": alert_id,
                })

        # Also dispatch notifications for high-severity contradictions
        for c in contradictions:
            if c.get("severity") == "high":
                tag = c["equipment_tag"]
                role = self._resolve_engineer_role(tag, c.get("parameter"))
                c_notif_id = add_role_notification(
                    recipient_role=role,
                    title=f"Technical Contradiction: {tag}",
                    message=f"Document mismatch detected on {tag} for {c['parameter']}: {c['explanation']}",
                    severity="WARNING",
                    equipment_tag=tag,
                )
                dispatches.append({
                    "notification_id": c_notif_id,
                    "role": role,
                    "equipment_tag": tag,
                    "severity": "WARNING",
                    "type": "CONTRADICTION",
                })

        return dispatches, alerts_raised

    def _step_9_log_audit(
        self, doc: Dict[str, Any], summary: Dict[str, Any], started_perf: float
    ) -> None:
        elapsed = int((time.perf_counter() - started_perf) * 1000)
        log_audit(
            action="autonomous_ingest_pipeline_complete",
            user="autonomous_agent",
            doc_id=self.doc_id,
            feature="autonomy",
            details={
                "pipeline_id": self.pipeline_id,
                "filename": doc.get("filename"),
                "equipment_tags": summary.get("equipment_tags"),
                "graph_matches": len(summary.get("graph_matches", [])),
                "anomalies_detected": len(summary.get("anomalies_detected", [])),
                "action_notes_drafted": len(summary.get("action_notes", [])),
                "sop_triggers": len(summary.get("sop_triggers", [])),
                "contradictions_found": len(summary.get("contradictions", [])),
                "notifications_dispatched": len(summary.get("notifications_dispatched", [])),
                "processing_ms": elapsed,
            },
        )

    def _step_10_update_plant_health(
        self, G: nx.Graph, tags: List[str]
    ) -> List[Dict[str, Any]]:
        from routers.graph import compute_health_scores
        scores = compute_health_scores()
        health_updates = []

        conn = get_db()
        try:
            alerts = rows_to_dicts(conn.execute(
                "SELECT severity, equipment_tags FROM alerts WHERE status = 'active'"
            ).fetchall())
            contras = rows_to_dicts(conn.execute(
                "SELECT equipment_tag FROM contradictions WHERE status = 'open'"
            ).fetchall())
        finally:
            conn.close()

        for tag, data in scores.items():
            score = data.get("health_score", 100)
            status = data.get("status", "HEALTHY")
            crit = sum(1 for a in alerts if tag in parse_tags(a["equipment_tags"]) and a["severity"] == "CRITICAL")
            warn = sum(1 for a in alerts if tag in parse_tags(a["equipment_tags"]) and a["severity"] == "WARNING")
            open_c = sum(1 for c in contras if (c.get("equipment_tag") or "").upper() == tag)

            upsert_equipment_health(
                tag=tag,
                health_score=score,
                status=status,
                active_critical_alerts=crit,
                active_warning_alerts=warn,
                open_contradictions=open_c,
                last_inspection_date=data.get("last_inspection"),
                days_since_inspection=data.get("days_since_inspection", 0),
                deductions=data.get("deductions", []),
            )

            if tag in G:
                G.nodes[tag]["health_score"] = score
                G.nodes[tag]["status"] = status

            if tag in tags:
                health_updates.append({
                    "tag": tag,
                    "health_score": score,
                    "status": status,
                    "critical_alerts": crit,
                    "warning_alerts": warn,
                })

        save_plant_graph(G)
        return health_updates

    @staticmethod
    def _resolve_engineer_role(tag: str, parameter: Optional[str] = None) -> str:
        prefix = tag.split("-")[0].upper() if "-" in tag else tag[:2].upper()
        # Direct prefix check
        if prefix in ("HE", "E", "V", "D", "T", "C", "TK"):
            return "Static Equipment Engineer"
        if prefix in ("P", "K", "F", "H", "R"):
            return "Rotating Equipment Specialist"
        if prefix in ("FT", "PT", "TT", "LT", "PI", "TI", "FI", "LI", "CV"):
            return "Instrumentation & Control Engineer"
        if prefix in ("PSV", "PRV", "RV"):
            return "Process Safety Lead"

        # Parameter based fallback
        p = (parameter or "").lower()
        if any(w in p for w in ("vibration", "bearing", "rpm", "lubrication")):
            return "Rotating Equipment Specialist"
        if any(w in p for w in ("thickness", "corrosion", "shell", "fouling")):
            return "Static Equipment Engineer"
        if any(w in p for w in ("pressure", "flow", "temperature", "signal", "level", "transmitter")):
            return "Instrumentation & Control Engineer"
        return "Static Equipment Engineer"


def run_autonomous_pipeline(doc_id: int, pipeline_id: Optional[str] = None) -> Dict[str, Any]:
    """Top-level invocation helper for background worker / API."""
    coordinator = AutonomousPipelineCoordinator(doc_id, pipeline_id=pipeline_id)
    return coordinator.run()
