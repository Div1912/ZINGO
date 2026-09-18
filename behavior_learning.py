"""
ZINGO — Behavioral Learning Engine
==================================
Learns from what engineers actually do when editing AI-generated Action Notes,
SOP amendments, and documents before signing.

Captures text diffs, extracts statutory clauses, safety margins, vendor criteria,
and phrasing preferences. When a preference is seen >= 3 times, automatically
promotes it to ACTIVE and injects it into system prompts and note drafts.

Zero external calls. Everything runs locally on-device.
"""

from __future__ import annotations

import difflib
import re
from typing import Any, Dict, List, Optional

from data_layer import (
    save_engineer_edit,
    get_engineer_edits,
    upsert_learned_preference,
    get_learned_preferences,
    toggle_learned_preference,
    log_audit,
)


def extract_diff_clauses(original: str, edited: str) -> Dict[str, Any]:
    """Compute added lines and identify structured engineering clauses."""
    orig_lines = [l.strip() for l in (original or "").splitlines() if l.strip()]
    edit_lines = [l.strip() for l in (edited or "").splitlines() if l.strip()]

    matcher = difflib.SequenceMatcher(None, orig_lines, edit_lines)
    added_blocks: List[str] = []
    removed_blocks: List[str] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "insert":
            added_blocks.extend(edit_lines[j1:j2])
        elif tag == "delete":
            removed_blocks.extend(orig_lines[i1:i2])
        elif tag == "replace":
            removed_blocks.extend(orig_lines[i1:i2])
            added_blocks.extend(edit_lines[j1:j2])

    added_text = " ".join(added_blocks)
    patterns_detected: List[Dict[str, Any]] = []

    # 1. Statutory / Standard references (e.g. OISD-STD-129, API 510, ASME Sec VIII)
    stat_matches = re.findall(r"(OISD(?:-STD)?-\d+|API\s*\d+|ASME\s*Sec(?:tion)?\s*[IVX]+|PESO|IBR|ISO\s*\d+|NACE\s*[A-Z0-9]+)", added_text, re.IGNORECASE)
    if stat_matches:
        for match in set(stat_matches):
            patterns_detected.append({
                "category": "statutory_clause",
                "title": f"Mandatory {match.upper()} Compliance Clause",
                "rule_instruction": f"Always incorporate mandatory adherence to {match.upper()} statutory specifications and clearance procedures.",
                "trigger_pattern": match.lower(),
                "example": added_text[:300],
            })

    # 2. Safety factor / multiplier adjustments
    sf_match = re.search(r"(\d+(?:\.\d+)?x|\d+%\s*margin|safety\s*factor\s*(?:of\s*)?\d+(?:\.\d+)?)", added_text, re.IGNORECASE)
    if sf_match:
        patterns_detected.append({
            "category": "safety_factor",
            "title": f"Engineering Safety Margin: {sf_match.group(0)}",
            "rule_instruction": f"Apply a conservative safety margin factor ({sf_match.group(0)}) on corrosion life and operating limits.",
            "trigger_pattern": "safety_factor",
            "example": added_text[:300],
        })

    # 3. Vendor comparison / procurement requirements
    if any(k in added_text.lower() for k in ["vendor", "bidder", "oem", "procurement", "hydro-test", "fat", "sat"]):
        patterns_detected.append({
            "category": "vendor_criteria",
            "title": "OEM Certification & Vendor Bid Requirement",
            "rule_instruction": "Ensure vendor comparisons specify OEM certified parts and minimum three competitive technical bidders.",
            "trigger_pattern": "vendor_comparison",
            "example": added_text[:300],
        })

    # 4. Inspection & NDT protocols (UTG, Radiography, DPT, MPT)
    if any(k in added_text.lower() for k in ["utg", "radiograph", "ndt", "ultrasonic", "dye penetrant", "magnetic particle"]):
        patterns_detected.append({
            "category": "inspection_protocol",
            "title": "Pre-Intervention NDT & Verification Protocol",
            "rule_instruction": "Mandate comprehensive non-destructive testing (UTG/Radiography) prior to executing hot work or mechanical interventions.",
            "trigger_pattern": "inspection_protocol",
            "example": added_text[:300],
        })

    # Fallback generic preference if additions are substantial (>40 chars) but unclassified
    if not patterns_detected and len(added_text) > 40:
        patterns_detected.append({
            "category": "phrasing_preference",
            "title": "Custom Engineering Sign-off Condition",
            "rule_instruction": f"Include engineering condition: '{added_text[:140]}...'",
            "trigger_pattern": "action_note",
            "example": added_text[:300],
        })

    return {
        "has_edits": bool(added_blocks or removed_blocks),
        "added_blocks": added_blocks,
        "removed_blocks": removed_blocks,
        "patterns_detected": patterns_detected,
    }


def record_engineer_edit_and_learn(
    item_type: str,
    item_id: int,
    engineer_id: str,
    original_text: str,
    edited_text: str,
    project_id: Optional[str] = None,
    equipment_tag: Optional[str] = None,
    field_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Capture edit diff, log history, and update learned preferences."""
    if not original_text or not edited_text or original_text.strip() == edited_text.strip():
        return {"edited": False, "learned_rules_count": 0, "clauses_detected": [], "promoted_rules": []}

    analysis = extract_diff_clauses(original_text, edited_text)
    if not analysis["has_edits"]:
        return {"edited": False, "learned_rules_count": 0, "clauses_detected": [], "promoted_rules": []}

    # Save edit history
    diff_summary = {
        "added_count": len(analysis["added_blocks"]),
        "removed_count": len(analysis["removed_blocks"]),
        "patterns_count": len(analysis["patterns_detected"]),
        "equipment_tag": equipment_tag,
        "field_name": field_name,
    }
    history_id = save_engineer_edit(
        item_type=item_type,
        item_id=item_id,
        engineer_id=engineer_id,
        original_text=original_text,
        edited_text=edited_text,
        diff_summary=diff_summary,
        project_id=project_id,
    )

    learned_results = []
    for pat in analysis["patterns_detected"]:
        res = upsert_learned_preference(
            category=pat["category"],
            title=pat["title"],
            rule_instruction=pat["rule_instruction"],
            trigger_pattern=equipment_tag or pat.get("trigger_pattern"),
            example=pat.get("example"),
            project_id=project_id,
        )
        learned_results.append(res)

    log_audit("behavior_learned", engineer_id, None, "learning",
              {"history_id": history_id, "patterns": len(learned_results), "equipment_tag": equipment_tag})

    promoted = [p for p in learned_results if p.get("status") == "ACTIVE"]
    return {
        "edited": True,
        "history_id": history_id,
        "patterns_detected": len(analysis["patterns_detected"]),
        "clauses_detected": analysis["patterns_detected"],
        "learned_preferences": learned_results,
        "promoted_rules": promoted,
    }


def format_learned_preferences_for_prompt(project_id: Optional[str] = None) -> str:
    """Format active learned engineering preferences for system prompt injection."""
    active_prefs = get_learned_preferences(project_id=project_id, status="ACTIVE")
    if not active_prefs:
        # Check if provisional preferences exist with >=2 evidence to show near-active rules
        prov = get_learned_preferences(project_id=project_id, status="PROVISIONAL")
        active_prefs = [p for p in prov if p.get("evidence_count", 0) >= 2]

    if not active_prefs:
        return ""

    lines = [
        "### LEARNED REFINERY ENGINEERING PREFERENCES (Derived from Engineer Sign-Off Edits):",
        "The following engineering preferences and statutory clauses have been learned from prior sign-off edits by plant engineers. Always adhere to them:",
    ]
    for p in active_prefs[:6]:
        cat_label = p.get("category", "rule").replace("_", " ").title()
        lines.append(f"- [{cat_label}]: {p['rule_instruction']} (Validated {p.get('evidence_count', 1)}x)")

    return "\n".join(lines)
