"""
ZINGO — Demo Sample Data Generator
==================================
Creates realistic refinery documents that deterministically trigger the passive monitor,
then (optionally) pushes them through the live API.

Usage:
    python sample_data.py                 # write files into ./sample_docs
    python sample_data.py --upload        # write + ingest via the running backend
    python sample_data.py --upload --demo # full demo seed: docs, SOP, standard, shift events

The generated set triggers:
  * DEGRADATION_TREND on HE-301   (wall thickness 12.8 -> 12.1 -> 11.3 mm, accelerating)
  * CORRELATED_ANOMALY HE-301 + P-301 (both anomalous within 30 days, connected in graph)
  * Predicted failure window (extrapolation to the 8.0 mm retirement limit)
  * NUMERIC_CONTRADICTION on HE-301 design pressure (spec sheet vs inspection report)
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta

import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE_DIR, "sample_docs")
API = os.environ.get("ZINGO_API", "http://127.0.0.1:8000")

TODAY = datetime.now()


def d(days_ago: int) -> str:
    return (TODAY - timedelta(days=days_ago)).strftime("%Y-%m-%d")


# --------------------------------------------------------------------------------------
# Document bodies
# --------------------------------------------------------------------------------------

DOC1 = f"""MANGALORE REFINERY — MECHANICAL INTEGRITY DEPARTMENT
THICKNESS SURVEY & INSPECTION REPORT

Report No: MI/INSP/HE-301/{(TODAY - timedelta(days=365)).year}-014
Date: {d(365)}
Equipment Tag: HE-301
Equipment: Crude Preheat Exchanger, CDU-2 Train B
Service: Crude / Atmospheric Residue
Line Number: 24-CR-3012
Governing Standard: OISD-130, IS 2825, ASME SEC VIII DIV 1
Inspection Method: Ultrasonic Thickness (UT), 48 grid points

MEASURED PARAMETERS
Wall thickness: 12.8 mm
Design thickness: 14.0 mm
Retirement thickness: 8.0 mm
Fouling index: 0.42
Heat transfer coefficient: 412 kW
Shell side pressure drop: 0.85 bar
Tube side outlet temperature: 218 deg C
Design pressure: 18.5 bar
Operating pressure: 14.2 bar

OBSERVATIONS
Baseline UT survey completed after turnaround. Shell course thickness uniform across all
grid points, no localised thinning detected. Tube bundle cleaned and hydrotested at
27.8 bar for 30 minutes, no leakage. Gasket faces within flatness tolerance.
Corrosion rate: 0.00 mm/yr (baseline established).

STATUS: NORMAL
Next inspection due: {d(185)}
Inspected By: R. Kulkarni, Inspection Engineer
Reviewed By: S. Nayak, Dy. Manager (Mechanical)
"""

DOC2 = f"""MANGALORE REFINERY — MECHANICAL INTEGRITY DEPARTMENT
THICKNESS SURVEY & INSPECTION REPORT

Report No: MI/INSP/HE-301/{(TODAY - timedelta(days=182)).year}-088
Date: {d(182)}
Equipment Tag: HE-301
Equipment: Crude Preheat Exchanger, CDU-2 Train B
Service: Crude / Atmospheric Residue
Line Number: 24-CR-3012
Governing Standard: OISD-130, IS 2825
Inspection Method: Ultrasonic Thickness (UT), 48 grid points

MEASURED PARAMETERS
Wall thickness: 12.1 mm
Retirement thickness: 8.0 mm
Fouling index: 0.61
Heat transfer coefficient: 371 kW
Shell side pressure drop: 1.24 bar
Tube side outlet temperature: 226 deg C
Operating pressure: 14.6 bar
Corrosion rate: 0.38 mm/yr

OBSERVATIONS
Six-monthly survey shows measurable thinning concentrated on the bottom shell course
between grid points 18 and 26, consistent with under-deposit corrosion. Fouling index has
risen materially since baseline and shell side pressure drop has increased by 46%.
Cleaning frequency review recommended. No through-wall defects observed.

STATUS: MONITOR
Next inspection due: {d(30)}
Inspected By: R. Kulkarni, Inspection Engineer
Reviewed By: S. Nayak, Dy. Manager (Mechanical)
"""

DOC3 = f"""MANGALORE REFINERY — MECHANICAL INTEGRITY DEPARTMENT
THICKNESS SURVEY & INSPECTION REPORT

Report No: MI/INSP/HE-301/{TODAY.year}-141
Date: {d(30)}
Equipment Tag: HE-301
Equipment: Crude Preheat Exchanger, CDU-2 Train B
Service: Crude / Atmospheric Residue
Line Number: 24-CR-3012
Governing Standard: OISD-130, IS 2825, ASME SEC VIII DIV 1
Inspection Method: Ultrasonic Thickness (UT), 48 grid points + visual

MEASURED PARAMETERS
Wall thickness: 11.3 mm
Retirement thickness: 8.0 mm
Fouling index: 0.78
Heat transfer coefficient: 322 kW
Shell side pressure drop: 1.71 bar
Tube side outlet temperature: 234 deg C
Operating pressure: 15.1 bar
Corrosion rate: 0.52 mm/yr

OBSERVATIONS
Thinning has progressed at an increased rate relative to the previous interval. Bottom
shell course now at 11.3 mm against a retirement limit of 8.0 mm. Fouling index continues
to climb and thermal performance has degraded 22% from baseline.
Slight vibration observed in adjacent pump P-301 during walkdown, audible at the suction
line. Vibration was not present at the previous survey.

ACTION ITEMS
1. Advance next UT survey to a three-monthly interval.
2. Raise work request for shell side chemical cleaning at the next opportunity.
3. Refer adjacent pump P-301 to the rotating equipment group for vibration analysis.

STATUS: REVIEW RECOMMENDED
Next inspection due: {d(-60)}
Inspected By: R. Kulkarni, Inspection Engineer
Reviewed By: S. Nayak, Dy. Manager (Mechanical)
"""

DOC4 = f"""MANGALORE REFINERY — ROTATING EQUIPMENT SECTION
PREDICTIVE MAINTENANCE LOG

Log Reference: RE/PDM/P-301/{TODAY.year}-0472
Date: {d(21)}
Equipment Tag: P-301
Equipment: Crude Charge Pump, CDU-2 Train B
Service: Crude transfer to HE-301
Line Number: 24-CR-3012
Governing Standard: OISD-118, API 610

MEASURED PARAMETERS
Vibration reading: 4.2 mm/s
Vibration alarm limit: 4.5 mm/s
Bearing temperature: 74 deg C
Discharge pressure: 15.3 bar
Suction pressure: 3.1 bar
Flow rate: 268 m3/hr
Motor current: 96 A

OBSERVATIONS
Overall vibration velocity has risen to 4.2 mm/s against an alarm limit of 4.5 mm/s.
Spectrum shows a 1x running speed dominant component with a minor 2x sideband.
Bearings checked, lubrication topped up, both drive end and non-drive end within
tolerance on temperature. No visible coupling misalignment.
Discharge pressure trending slightly high against the historical mean.

STATUS: WITHIN TOLERANCE — CONTINUE MONITORING
Next reading due: {d(7)}
Logged By: A. Fernandes, Condition Monitoring Technician
Reviewed By: P. Shetty, Manager (Rotating Equipment)
"""

# Contradicts DOC1's design pressure (18.5 bar vs 22.0 bar) -> NUMERIC_CONTRADICTION gate demo.
DOC5 = f"""MANGALORE REFINERY — PROCESS ENGINEERING
EQUIPMENT DATA SHEET (REVISED)

Document No: PE/DS/HE-301/REV-3
Date: {d(5)}
Equipment Tag: HE-301
Equipment: Crude Preheat Exchanger, CDU-2 Train B
Line Number: 24-CR-3012
Governing Standard: ASME SEC VIII DIV 1, IS 2825, OISD-130

DESIGN PARAMETERS
Design pressure: 22.0 bar
Test pressure: 33.0 bar
Design temperature: 320 deg C
Shell material: SA-516 Gr 70
Design thickness: 14.0 mm
Retirement thickness: 8.0 mm
Surface area: 486 m3/hr
Operating pressure: 15.1 bar

REMARKS
Data sheet revised following the re-rating study of CDU-2 Train B. Design pressure uprated
from the original nameplate value on the basis of the revised hydraulic study and shell
thickness verification. Supersedes REV-2 in respect of design and test pressure only.
All other parameters remain unchanged.

Prepared By: N. Iyer, Process Engineer
Approved By: V. Rao, Chief Manager (Process)
"""

SOP_TEXT = f"""MANGALORE REFINERY — STANDARD OPERATING PROCEDURE
SOP-MI-014: THICKNESS MONITORING OF HEAT EXCHANGERS IN CRUDE SERVICE

Document No: SOP-MI-014
Version: 2.1
Effective Date: {d(700)}
Governing Standards: OISD-130, IS 2825
Equipment Covered: HE-301, HE-302, HE-305

1. PURPOSE
1.1 This procedure establishes the thickness monitoring regime for shell and tube heat
exchangers in crude and residue service in CDU-2.

2. INSPECTION FREQUENCY
2.1 Ultrasonic thickness surveys shall be carried out at intervals not exceeding twelve months.
2.2 Where the measured corrosion rate exceeds 0.30 mm/yr, the inspection interval may be
reviewed by the Inspection Engineer.
2.3 Records of each survey shall be retained for a period of five years.

3. ACCEPTANCE CRITERIA
3.1 Remaining wall thickness shall not fall below the retirement thickness stated in the
equipment data sheet.
3.2 Where remaining thickness falls within 15% of the retirement limit, the equipment shall
be referred for fitness for service assessment.

4. REPORTING
4.1 The inspection report shall be issued within fifteen working days of the survey.
4.2 Adverse findings should be communicated to the Unit Head.
"""

STANDARD_TEXT = """OISD-130
INSPECTION OF UNFIRED PRESSURE VESSELS AND HEAT EXCHANGERS

4.1 Thickness surveys shall be carried out at intervals not exceeding six months for
equipment in corrosive hydrocarbon service where the established corrosion rate exceeds
0.25 mm per year.

4.2 Where the measured corrosion rate exceeds 0.25 mm per year, a remaining life
calculation shall be performed and documented after every survey.

4.3 The inspection interval shall be reduced to one half of the computed remaining life or
six months, whichever is lower, once remaining thickness falls within 25 percent of the
retirement thickness.

4.4 Adverse inspection findings shall be reported to the competent authority within
seven working days of the survey.

4.5 A fitness for service assessment shall be carried out in accordance with API 579
before continued operation of any equipment whose remaining thickness is within 20 percent
of the retirement thickness.

5.1 Inspection records shall be retained for the entire operating life of the equipment.

5.2 Personnel carrying out ultrasonic thickness measurement shall hold a valid ASNT
Level II certification in the relevant method.

6.1 Vibration monitoring of associated rotating equipment should be reviewed whenever an
adverse trend is recorded on the connected static equipment.
"""

def pump_log(days_ago: int, ref: str, vibration: float, bearing_temp: float,
             discharge: float, current: float, observations: str, status: str) -> str:
    return f"""MANGALORE REFINERY — ROTATING EQUIPMENT SECTION
PREDICTIVE MAINTENANCE LOG

Log Reference: RE/PDM/P-301/{ref}
Date: {d(days_ago)}
Equipment Tag: P-301
Equipment: Crude Charge Pump, CDU-2 Train B
Service: Crude transfer to HE-301
Line Number: 24-CR-3012
Governing Standard: OISD-118, API 610

MEASURED PARAMETERS
Vibration reading: {vibration} mm/s
Vibration alarm limit: 4.5 mm/s
Bearing temperature: {bearing_temp} deg C
Discharge pressure: {discharge} bar
Suction pressure: 3.1 bar
Flow rate: 268 m3/hr
Motor current: {current} A

OBSERVATIONS
{observations}

STATUS: {status}
Logged By: A. Fernandes, Condition Monitoring Technician
Reviewed By: P. Shetty, Manager (Rotating Equipment)
"""


DOC4A = pump_log(
    150, f"{(TODAY - timedelta(days=150)).year}-0188", 2.6, 62, 15.0, 92,
    "Routine quarterly reading. Overall vibration well within limits, spectrum clean with no\n"
    "dominant harmonics. Bearing temperatures steady. Alignment check not due.",
    "NORMAL")

DOC4B = pump_log(
    90, f"{(TODAY - timedelta(days=90)).year}-0301", 3.3, 68, 15.1, 94,
    "Vibration has risen since the previous reading. Spectrum shows an emerging 1x running\n"
    "speed component. Lubrication verified. Interval reduced to monthly.",
    "MONITOR")

DOCUMENTS = [
    ("01_HE-301_inspection_baseline.txt", DOC1, "inspection_report", "HE-301"),
    ("02_HE-301_inspection_6month.txt", DOC2, "inspection_report", "HE-301"),
    ("03_HE-301_inspection_recent.txt", DOC3, "inspection_report", "HE-301"),
    ("04a_P-301_maintenance_log_q1.txt", DOC4A, "maintenance_log", "P-301"),
    ("04b_P-301_maintenance_log_q2.txt", DOC4B, "maintenance_log", "P-301"),
    ("04_P-301_maintenance_log.txt", DOC4, "maintenance_log", "P-301"),
    ("05_HE-301_datasheet_rev3.txt", DOC5, "specification", "HE-301"),
]

SHIFT_EVENTS = [
    # Same equipment across three consecutive shifts -> RECURRING_ISSUE
    (d(1), "morning", "HE-301", "observation", "Shell side pressure drop holding high at 1.7 bar, cleaning not yet scheduled."),
    (d(1), "evening", "HE-301", "observation", "Pressure drop unchanged. Outlet temperature 234 deg C, drifting up through the shift."),
    (d(1), "night", "HE-301", "observation", "No change. Noted audible vibration from P-301 suction line again during round."),
    (d(0), "morning", "P-301", "observation", "Vibration at 4.2 mm/s on portable meter, close to the 4.5 mm/s alarm limit."),
    (d(0), "morning", "HE-301", "escalation", "Referred HE-301 thinning trend and P-301 vibration to Mechanical for joint review."),
]


# --------------------------------------------------------------------------------------
# File generation
# --------------------------------------------------------------------------------------

def try_pdf(path_txt: str, text: str) -> str:
    """Render as PDF when reportlab is available; otherwise keep the .txt."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except ImportError:
        return path_txt

    path_pdf = path_txt.replace(".txt", ".pdf")
    c = canvas.Canvas(path_pdf, pagesize=A4)
    width, height = A4
    y = height - 20 * mm
    for line in text.splitlines():
        if y < 20 * mm:
            c.showPage()
            y = height - 20 * mm
        bold = line.isupper() and len(line.strip()) > 3
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 9.5 if bold else 9)
        c.drawString(18 * mm, y, line[:110])
        y -= 5.2 * mm
    c.save()
    os.remove(path_txt)
    return path_pdf


def write_files() -> list:
    os.makedirs(OUT_DIR, exist_ok=True)
    written = []
    for filename, body, doc_type, tag in DOCUMENTS:
        path = os.path.join(OUT_DIR, filename)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(body)
        written.append((try_pdf(path, body), doc_type, tag))

    for filename, body in [("SOP-MI-014_thickness_monitoring.txt", SOP_TEXT),
                           ("OISD-130_extract.txt", STANDARD_TEXT)]:
        with open(os.path.join(OUT_DIR, filename), "w", encoding="utf-8") as fh:
            fh.write(body)
    print(f"[sample_data] wrote {len(written) + 2} files to {OUT_DIR}")
    return written


# --------------------------------------------------------------------------------------
# Live API seeding
# --------------------------------------------------------------------------------------

def upload(files: list) -> None:
    for path, doc_type, tag in files:
        with open(path, "rb") as fh:
            r = requests.post(
                f"{API}/api/ingest/upload",
                files={"file": (os.path.basename(path), fh, "application/octet-stream")},
                data={"doc_type": doc_type, "equipment_tag": tag, "uploaded_by": "demo_seed"},
                timeout=600)
        if r.ok:
            j = r.json()
            print(f"  ingested {os.path.basename(path):<42} doc {j['doc_id']:<3} "
                  f"tags={j['equipment_tags']} measurements={j['measurements_found']}")
        else:
            print(f"  FAILED {os.path.basename(path)}: {r.status_code} {r.text[:200]}")


def post(path: str, payload: dict, label: str) -> dict:
    """POST JSON and surface failures instead of silently ignoring them."""
    r = requests.post(f"{API}{path}", json=payload, timeout=1800)
    if not r.ok:
        print(f"  FAILED {label}: {r.status_code} {r.text[:300]}")
        return {}
    return r.json()


def seed_demo() -> None:
    # Process connection so the correlation detector can link HE-301 and P-301.
    post("/api/graph/add_connection", {
        "tag_a": "HE-301", "tag_b": "P-301", "connection_type": "process",
        "line_number": "24-CR-3012", "added_by": "demo_seed"}, "add_connection")
    print("  graph: HE-301 <-> P-301 process connection added (line 24-CR-3012)")

    # Normal operating ranges for the threshold detector.
    for tag, ranges in [
        ("HE-301", {"wall_thickness": {"min": 8.0, "unit": "mm"},
                    "fouling_index": {"max": 0.85, "unit": ""},
                    "shell_side_pressure_drop": {"max": 1.35, "unit": "bar"}}),
        ("P-301", {"vibration_reading": {"max": 4.5, "unit": "mm/s"},
                   "bearing_temperature": {"max": 80.0, "unit": "deg C"}}),
    ]:
        post("/api/graph/set_node_attributes", {
            "tag": tag, "normal_range": ranges, "line_number": "24-CR-3012",
            "service": "Crude / Atmospheric Residue", "updated_by": "demo_seed"},
            f"set_node_attributes {tag}")
    print("  graph: normal operating ranges set for HE-301 and P-301")

    # SOP + standard for the compliance matrix.
    post("/api/compliance/register_sop", {
        "filename": "SOP-MI-014_thickness_monitoring.txt", "sop_code": "SOP-MI-014",
        "raw_text": SOP_TEXT, "standard_refs": "OISD-130", "version": "2.1",
        "effective_date": d(700), "domain": "mechanical_integrity"}, "register_sop")
    print("  compliance: SOP-MI-014 registered")

    std_path = os.path.join(OUT_DIR, "OISD-130_extract.txt")
    with open(std_path, "rb") as fh:
        r = requests.post(f"{API}/api/compliance/load_standard",
                          files={"file": ("OISD-130_extract.txt", fh, "text/plain")},
                          data={"standard_code": "OISD-130", "version": "current",
                                "domain": "mechanical_integrity", "loaded_by": "demo_seed"},
                          timeout=600)
    print(f"  compliance: OISD-130 loaded ({r.json().get('clauses_extracted', 0) if r.ok else 'failed'} clauses)")

    for shift_date, shift_type, tag, event_type, description in SHIFT_EVENTS:
        post("/api/shift/log_event", {
            "shift_date": shift_date, "shift_type": shift_type, "equipment_tag": tag,
            "event_type": event_type, "description": description, "logged_by": "demo_seed"},
            f"log_event {tag}")
    print(f"  shift: {len(SHIFT_EVENTS)} events logged across consecutive shifts")

    scan = requests.post(f"{API}/api/monitor/run_full_scan", timeout=1800)
    if scan.ok:
        s = scan.json()
        print(f"  monitor: scanned {s['documents_scanned']} docs, "
              f"active alerts {s['active_alerts_by_severity']}")

    con = requests.post(f"{API}/api/contradict/scan",
                        json={"equipment_tag": "HE-301", "scanned_by": "demo_seed"}, timeout=1800)
    if con.ok:
        print(f"  contradiction: {con.json()['contradictions_found']} found on HE-301")

    health = requests.get(f"{API}/api/graph/health_map", timeout=120)
    if health.ok:
        print(f"  health map: {health.json()['health_scores']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="ZINGO demo data generator")
    parser.add_argument("--upload", action="store_true", help="ingest via the running backend")
    parser.add_argument("--demo", action="store_true", help="also seed graph, SOP, standard, shifts, scans")
    args = parser.parse_args()

    files = write_files()
    if not (args.upload or args.demo):
        return 0

    try:
        requests.get(f"{API}/health", timeout=10)
    except requests.RequestException:
        print(f"[sample_data] backend not reachable at {API}. Start it first:\n"
              f"  python -m uvicorn server:app --port 8000")
        return 1

    print(f"[sample_data] ingesting into {API}")
    upload(files)
    if args.demo:
        seed_demo()
    print("[sample_data] done. Open the workbench and start at the Audit Trail network proof panel.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
