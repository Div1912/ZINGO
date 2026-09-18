"""
ZINGO — Cross-Session Temporal Reasoning & Escalation Engine
============================================================
Tracks multi-week lifecycle of plant incidents across sessions.
Maintains continuous reasoning threads:
- Evaluates elapsed time (delta t) between anomaly detection, acknowledgment, and intervention.
- Cross-references historical baselines against new document uploads.
- Automatically triggers multi-stage escalations (Level 1 -> Level 2 -> Level 3)
  when SLAs are breached or degradation accelerates.
- Synthesizes cross-session temporal narratives for LLM prompt injection.

Zero external calls. Everything runs locally on-device.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from data_layer import (
    get_db,
    get_action_notes,
    get_action_note,
    create_action_note,
    record_incident_escalation,
    get_incident_escalations,
    get_equipment_temporal_events,
    add_role_notification,
    log_audit,
    rows_to_dicts,
)


def parse_iso(ts_str: Optional[str]) -> Optional[datetime]:
    if not ts_str:
        return None
    cleaned = str(ts_str).strip()[:19].replace(" ", "T")
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    return None


def evaluate_temporal_escalations(
    equipment_tag: str,
    new_doc_id: Optional[int] = None,
    new_measurements: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Evaluate whether open incidents on equipment_tag warrant automated escalation."""
    tag_clean = equipment_tag.strip().upper()
    now = datetime.now()
    escalations_triggered: List[Dict[str, Any]] = []

    # Pull open action notes for this asset
    open_notes = get_action_notes(equipment_tag=tag_clean, status="DRAFT", limit=10)
    if not open_notes:
        return escalations_triggered

    # Check newest measurement values (e.g. wall thickness)
    new_thickness = None
    if new_measurements:
        for m in new_measurements:
            if "thickness" in m.get("parameter", "").lower():
                try:
                    new_thickness = float(m.get("value", 0))
                except (ValueError, TypeError):
                    pass

    for note in open_notes:
        note_id = note["id"]
        created_at = parse_iso(note.get("created_at"))
        if not created_at:
            continue

        days_unacted = (now - created_at).days
        current_level = int(note.get("escalation_level") or 1)
        prev_summary = note.get("anomaly_summary", "")

        # Check if condition worsened
        worsened = False
        worsened_detail = ""
        if new_thickness is not None and "4.2" in prev_summary and new_thickness < 4.2:
            worsened = True
            worsened_detail = f"New inspection confirms accelerated thinning: {new_thickness:.2f}mm vs prior 4.20mm (-{4.2 - new_thickness:.2f}mm)."
        elif new_thickness is not None and new_thickness < 5.0:
            worsened = True
            worsened_detail = f"Wall thickness at {new_thickness:.2f}mm remains below 5.00mm retirement limit."

        # Escalation Rules:
        # Rule 1: Days >= 7 unacted OR (Days >= 3 AND worsened) -> Elevate to Level 3
        if (days_unacted >= 7 or (days_unacted >= 3 and worsened)) and current_level < 3:
            target_role = "Plant Operations Head / Chief Engineer"
            reason = (
                f"SLA breach: {days_unacted} days elapsed since Level {current_level} flag without resolution. "
                + (worsened_detail if worsened else "Mandatory statutory escalation per SOP-REL-004.")
            )

            esc_id = record_incident_escalation(
                equipment_tag=tag_clean,
                from_level=current_level,
                to_level=3,
                trigger_reason=reason,
                days_unacted=days_unacted,
                escalated_to_role=target_role,
                action_note_id=note_id,
            )

            # Auto-draft formal Escalation Action Note
            esc_ref = f"AN-{now.year}-{tag_clean}-ESC{esc_id}"
            esc_note_id = create_action_note(
                ref_number=esc_ref,
                title=f"AUTOMATED ESCALATION (Level 3): {tag_clean} Unacted Critical Degradation",
                equipment_tag=tag_clean,
                severity="CRITICAL",
                target_role=target_role,
                doc_id=new_doc_id or note.get("doc_id"),
                anomaly_summary=(
                    f"AUTOMATED ESCALATION LEVEL 3\n"
                    f"Asset {tag_clean} was initially flagged for review on {note.get('created_at')[:10]} ({days_unacted} days ago).\n"
                    f"Prior status: {note.get('title')}.\n"
                    f"{reason}"
                ),
                recommended_action=(
                    f"1. Immediate emergency inspection order by {target_role}.\n"
                    f"2. De-rate maximum allowable working pressure (MAWP) per API 510.\n"
                    f"3. Convene Unit Technical Review Committee within 24 hours."
                ),
                raw_markdown=(
                    f"# EXECUTIVE ESCALATION NOTE — {esc_ref}\n"
                    f"**Target Authority**: {target_role}\n"
                    f"**Equipment**: {tag_clean}\n"
                    f"**Escalation Trigger**: {days_unacted} days unacted since Level {current_level} flag.\n\n"
                    f"### Incident Lifecycle & Timeline\n"
                    f"- Initial Flag: {note.get('created_at')[:10]}\n"
                    f"- Acknowledgment: {note.get('acknowledged_at') or 'Unacknowledged'}\n"
                    f"- Current Status: Escalated to Level 3\n\n"
                    f"### Mandatory Corrective Directives\n"
                    f"In accordance with OISD-STD-128 and SOP-REL-004, this asset is escalated to executive authority for emergency disposition."
                ),
            )

            # Dispatch high priority notification
            add_role_notification(
                recipient_role=target_role,
                title=f"URGENT ESCALATION L3: {tag_clean} ({days_unacted}d Unacted)",
                message=reason,
                severity="CRITICAL",
                action_note_id=esc_note_id,
                equipment_tag=tag_clean,
            )

            escalations_triggered.append({
                "escalation_id": esc_id,
                "from_level": current_level,
                "to_level": 3,
                "escalated_note_id": esc_note_id,
                "target_role": target_role,
                "days_unacted": days_unacted,
                "reason": reason,
            })

        # Rule 2: Days >= 3 unacted and still Level 1 -> Elevate to Level 2
        elif days_unacted >= 3 and current_level == 1:
            target_role = "Reliability Lead & Maintenance Manager"
            reason = f"Response SLA breach: {days_unacted} days elapsed with no action order logged. Escalated to Level 2."

            esc_id = record_incident_escalation(
                equipment_tag=tag_clean,
                from_level=1,
                to_level=2,
                trigger_reason=reason,
                days_unacted=days_unacted,
                escalated_to_role=target_role,
                action_note_id=note_id,
            )

            add_role_notification(
                recipient_role=target_role,
                title=f"ESCALATION L2: {tag_clean} Inaction ({days_unacted}d)",
                message=reason,
                severity="WARNING",
                action_note_id=note_id,
                equipment_tag=tag_clean,
            )

            escalations_triggered.append({
                "escalation_id": esc_id,
                "from_level": 1,
                "to_level": 2,
                "target_role": target_role,
                "days_unacted": days_unacted,
                "reason": reason,
            })

    return escalations_triggered


def build_temporal_chat_context(equipment_tag: str) -> str:
    """Construct multi-week cross-session timeline for LLM prompt injection."""
    clean_tag = equipment_tag.strip().upper()
    events = get_equipment_temporal_events(clean_tag)
    if not events:
        return ""

    lines = [
        f"### CROSS-SESSION TEMPORAL CONTINUITY DOSSIER FOR ASSET {clean_tag}:",
        f"The following chronological timeline traces the multi-week progression and engineering actions for {clean_tag}:",
    ]

    for ev in events[-8:]:  # Include last 8 key historical milestones
        dt_label = ev.get("date") or str(ev.get("timestamp") or "")[:10]
        ev_title = ev.get("title", "")
        ev_desc = ev.get("description", "")
        lines.append(f"- [{dt_label}] {ev_title}: {ev_desc}")

    # Check for active unacted periods
    open_notes = get_action_notes(equipment_tag=clean_tag, status="DRAFT")
    if open_notes:
        earliest = open_notes[-1]
        created = parse_iso(earliest.get("created_at"))
        if created:
            days = (datetime.now() - created).days
            lines.append(
                f"\n[CURRENT TEMPORAL STATUS]: Level {earliest.get('escalation_level', 1)} Action Note has been pending for {days} days. "
                + ("Engineer acknowledged but did not log work order." if earliest.get("acknowledged_at") else "Pending engineering review.")
            )

    return "\n".join(lines)
