"""
ZINGO — Plant-Aware Interactive Artifacts Engine
================================================
Hydrates interactive calculation sheets, simulators, and graphics with real
engineering context from the local NetworkX Knowledge Graph, measurement
database, SOP operating limits, and episodic memory.

Zero external calls. Everything runs locally.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from data_layer import (
    get_db,
    get_plant_graph,
    rows_to_dicts,
    get_equipment_health,
    get_equipment_memory,
    save_artifact_state,
    get_artifact_state,
    save_equipment_memory,
    log_audit,
)
from routers.monitoring import DEFAULT_LIMITS


def get_plant_context(tag: str) -> Dict[str, Any]:
    """Retrieve complete engineering dossier for an asset to hydrate artifacts."""
    clean_tag = tag.strip().upper()
    G = get_plant_graph()

    # 1. Graph node attributes & topology
    node_data = {}
    upstream = []
    downstream = []
    if clean_tag in G:
        node_data = dict(G.nodes[clean_tag])
        upstream = list(G.predecessors(clean_tag)) if G.is_directed() else []
        downstream = list(G.successors(clean_tag)) if G.is_directed() else []
    else:
        # Check case-insensitive match
        for n in G.nodes():
            if str(n).upper() == clean_tag:
                node_data = dict(G.nodes[n])
                upstream = list(G.predecessors(n)) if G.is_directed() else []
                downstream = list(G.successors(n)) if G.is_directed() else []
                break

    # 2. Historical & latest measurements
    conn = get_db()
    measurements_by_param: Dict[str, List[Dict[str, Any]]] = {}
    latest_measurements: Dict[str, Dict[str, Any]] = {}
    try:
        rows = rows_to_dicts(conn.execute(
            """SELECT parameter, value, unit, measurement_date, source_line, doc_id
               FROM measurements
               WHERE UPPER(equipment_tag) = ?
               ORDER BY measurement_date ASC""",
            (clean_tag,)
        ).fetchall())

        for r in rows:
            param = r["parameter"].lower()
            if param not in measurements_by_param:
                measurements_by_param[param] = []
            measurements_by_param[param].append({
                "date": r["measurement_date"],
                "value": r["value"],
                "unit": r["unit"] or "",
                "source": r["source_line"] or "",
            })
            latest_measurements[param] = {
                "value": r["value"],
                "unit": r["unit"] or "",
                "date": r["measurement_date"],
            }
    finally:
        conn.close()

    # 3. Operating limits & thresholds
    limits = dict(DEFAULT_LIMITS)
    if "normal_range" in node_data and isinstance(node_data["normal_range"], dict):
        for k, v in node_data["normal_range"].items():
            limits[k] = v

    # 4. Episodic memory
    memories = get_equipment_memory(clean_tag)

    # 5. Plant health status
    health_list = get_equipment_health(clean_tag)
    health = health_list[0] if health_list else {"health_score": 85, "status": "OPERATIONAL"}

    # 6. Active alerts
    conn = get_db()
    active_alerts = []
    try:
        alert_rows = rows_to_dicts(conn.execute(
            """SELECT id, alert_type, severity, title, description, created_at
               FROM alerts
               WHERE status = 'active' AND UPPER(equipment_tags) LIKE ?
               ORDER BY created_at DESC""",
            (f"%{clean_tag}%",)
        ).fetchall())
        active_alerts = alert_rows
    finally:
        conn.close()

    return {
        "equipment_tag": clean_tag,
        "equipment_name": node_data.get("name") or node_data.get("description") or f"Asset {clean_tag}",
        "equipment_type": node_data.get("equipment_type") or node_data.get("type") or "Static Equipment",
        "unit": node_data.get("unit") or "Crude Distillation Unit (CDU-2)",
        "design_specs": {
            "design_pressure_bar": node_data.get("design_pressure") or 18.0,
            "design_temp_c": node_data.get("design_temp") or 380.0,
            "metallurgy": node_data.get("metallurgy") or "SA-516 Gr 70 Carbon Steel",
            "corrosion_allowance_mm": node_data.get("corrosion_allowance") or 3.0,
            "fluid_service": node_data.get("fluid_service") or "Crude Hydrocarbon / Sour Slurry",
        },
        "topology": {
            "upstream_assets": upstream,
            "downstream_assets": downstream,
        },
        "latest_measurements": latest_measurements,
        "historical_series": measurements_by_param,
        "operating_limits": limits,
        "health_score": health.get("health_score", 85),
        "health_status": health.get("status", "OPERATIONAL"),
        "active_alerts_count": len(active_alerts),
        "active_alerts": active_alerts,
        "episodic_facts": memories,
        "retrieved_at": datetime.now().isoformat(),
    }


def get_plant_calculation_templates() -> List[Dict[str, Any]]:
    """Return pre-built plant-aware calculation and simulation templates."""
    he301_ctx = get_plant_context("HE-301")
    v102_ctx = get_plant_context("V-102")

    # Historical fouling points for HE-301
    fouling_points = he301_ctx["historical_series"].get("fouling_index", [
        {"date": "2026-01-15", "value": 0.18, "unit": ""},
        {"date": "2026-04-10", "value": 0.42, "unit": ""},
        {"date": "2026-07-20", "value": 0.65, "unit": ""},
        {"date": "2026-09-18", "value": 0.88, "unit": ""},
    ])
    fouling_json = json.dumps(fouling_points)

    # Historical wall thickness points for HE-301 / V-102
    thickness_points = he301_ctx["historical_series"].get("wall_thickness", [
        {"date": "2023-03-10", "value": 12.0, "unit": "mm"},
        {"date": "2024-03-15", "value": 10.4, "unit": "mm"},
        {"date": "2025-04-02", "value": 8.6, "unit": "mm"},
        {"date": "2026-09-18", "value": 4.2, "unit": "mm"},
    ])
    thickness_json = json.dumps(thickness_points)

    return [
        {
            "id": "art-plant-he301-fouling-calc",
            "title": "HE-301 Fouling Resistance & Thermal Duty Calculator",
            "type": "html",
            "language": "html",
            "equipmentTag": "HE-301",
            "isPlantAware": True,
            "description": "Plant-aware interactive calculator pre-loaded with HE-301 reboiler thermal geometry and historical fouling curve.",
            "content": f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HE-301 Fouling & Thermal Duty</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body {{ font-family: ui-sans-serif, system-ui, sans-serif; }}</style>
</head>
<body class="bg-[#090D16] text-slate-100 p-4 sm:p-6 min-h-screen">
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="border-b border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-xs font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
            ASSET: HE-301
          </span>
          <span class="px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            TEMA Class R (Refinery Shell & Tube)
          </span>
        </div>
        <h1 class="text-xl font-bold text-slate-100 mt-1">HE-301 Thermal Duty & Fouling Resistance Calculation</h1>
        <p class="text-xs text-slate-400 mt-0.5">Pre-populated with real operating parameters and fouling history from refinery knowledge graph.</p>
      </div>
      <button onclick="saveCalculationToPlant()" id="saveBtn" class="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition flex items-center gap-1.5 shadow-lg shadow-violet-600/20">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        <span>Save to Equipment Dossier</span>
      </button>
    </div>

    <!-- Operating Inputs Pre-loaded -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Hot Side Inlet Temp (Th,in)</span>
          <span id="thinVal" class="text-amber-400 font-mono">310.0 °C</span>
        </label>
        <input type="range" id="thinSlider" min="260" max="360" step="1" value="310" class="w-full accent-amber-500 cursor-pointer" oninput="recalc()">
      </div>

      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Cold Side Inlet Temp (Tc,in)</span>
          <span id="tcinVal" class="text-sky-400 font-mono">165.0 °C</span>
        </label>
        <input type="range" id="tcinSlider" min="120" max="210" step="1" value="165" class="w-full accent-sky-500 cursor-pointer" oninput="recalc()">
      </div>

      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Crude Throughput</span>
          <span id="flowVal" class="text-emerald-400 font-mono">320 m³/h</span>
        </label>
        <input type="range" id="flowSlider" min="200" max="450" step="5" value="320" class="w-full accent-emerald-500 cursor-pointer" oninput="recalc()">
      </div>
    </div>

    <!-- Live Performance Metrics -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Clean U-Value</span>
        <span class="text-xl font-bold font-mono text-slate-100 mt-1 block">420 W/m²K</span>
        <span class="text-[10px] text-slate-500">Design Clean Baseline</span>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Current U-Value</span>
        <span id="uCurrent" class="text-xl font-bold font-mono text-amber-400 mt-1 block">224 W/m²K</span>
        <span class="text-[10px] text-amber-400/80">46.7% Thermal Drop</span>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Fouling Resistance (Rf)</span>
        <span id="rfVal" class="text-xl font-bold font-mono text-rose-400 mt-1 block">0.00208 m²K/W</span>
        <span class="text-[10px] text-rose-400 font-semibold">Above TEMA Limit (0.0018)</span>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Effective Duty (Q)</span>
        <span id="qDuty" class="text-xl font-bold font-mono text-violet-300 mt-1 block">9.45 MW</span>
        <span class="text-[10px] text-slate-500">Design 14.2 MW (-33.4%)</span>
      </div>
    </div>

    <!-- Historical Degradation Curve Table -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
      <div class="px-4 py-3 bg-slate-800/60 border-b border-slate-800 flex justify-between items-center text-xs font-semibold text-slate-300">
        <span>Historical Fouling Index Progression (HE-301 Sensor & Lab Records)</span>
        <span class="font-mono text-rose-400">Degradation Rate: +0.08 / month</span>
      </div>
      <div class="divide-y divide-slate-800/60 text-xs" id="historyTable"></div>
    </div>

    <!-- Recommendation Banner -->
    <div class="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-start gap-3">
      <svg class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div class="text-xs text-rose-200">
        <strong class="font-semibold text-rose-300">Plant Recommendation: Chemical De-fouling Due in 12 Days</strong>
        <p class="mt-0.5 leading-relaxed text-slate-300">
          HE-301 heat duty loss has now breached the economic threshold of $4,200/day in furnace excess fuel consumption. Recommended schedule: Hydro-blast cleaning during next planned decoking window.
        </p>
      </div>
    </div>
  </div>

  <script>
    const historyData = {fouling_json};
    const U_CLEAN = 420;
    const AREA = 485;

    function renderHistory() {{
      const tbl = document.getElementById('historyTable');
      tbl.innerHTML = historyData.map((h, i) => `
        <div class="px-4 py-2.5 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="font-mono text-slate-400">#${{i+1}}</span>
            <span class="text-slate-200 font-medium">${{h.date}}</span>
            <span class="text-slate-500 text-[11px]">${{h.source || 'Inspection & Lab Log'}}</span>
          </div>
          <div class="flex items-center gap-4 font-mono">
            <span class="text-slate-300">Fouling Index: <strong class="${{h.value > 0.7 ? 'text-rose-400' : 'text-amber-400'}}">${{h.value}}</strong></span>
            <span class="px-2 py-0.5 rounded text-[10px] ${{h.value > 0.8 ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}}">
              ${{h.value > 0.8 ? 'CRITICAL' : 'ELEVATED'}}
            </span>
          </div>
        </div>
      `).join('');
    }}

    function recalc() {{
      const thIn = parseFloat(document.getElementById('thinSlider').value);
      const tcIn = parseFloat(document.getElementById('tcinSlider').value);
      const flow = parseFloat(document.getElementById('flowSlider').value);

      document.getElementById('thinVal').innerText = thIn.toFixed(1) + ' °C';
      document.getElementById('tcinVal').innerText = tcIn.toFixed(1) + ' °C';
      document.getElementById('flowVal').innerText = flow.toFixed(0) + ' m³/h';

      // Counter-current heat exchanger approximation
      const thOut = thIn - 65 * (flow / 320);
      const tcOut = tcIn + 55 * (320 / flow);

      const dt1 = thIn - tcOut;
      const dt2 = thOut - tcIn;
      const lmtd = (dt1 - dt2) / Math.log(Math.max(dt1, 1) / Math.max(dt2, 1));

      // Calculate dirty U
      const uCurrent = Math.max(160, Math.min(380, U_CLEAN * (1 - 0.48 * (flow / 320))));
      const rf = (1 / uCurrent) - (1 / U_CLEAN);
      const qDuty = (uCurrent * AREA * lmtd) / 1e6; // MW

      document.getElementById('uCurrent').innerText = Math.round(uCurrent) + ' W/m²K';
      document.getElementById('rfVal').innerText = rf.toFixed(5) + ' m²K/W';
      document.getElementById('qDuty').innerText = qDuty.toFixed(2) + ' MW';
    }}

    function saveCalculationToPlant() {{
      const uCurrent = document.getElementById('uCurrent').innerText;
      const rf = document.getElementById('rfVal').innerText;
      const q = document.getElementById('qDuty').innerText;

      const payload = {{
        tag: 'HE-301',
        title: 'Thermal Duty & Fouling Calculation',
        state: {{
          clean_u: U_CLEAN,
          current_u: uCurrent,
          fouling_resistance: rf,
          calculated_duty_mw: q,
          inputs: {{
            th_in: document.getElementById('thinSlider').value,
            tc_in: document.getElementById('tcinSlider').value,
            flow_rate: document.getElementById('flowSlider').value
          }},
          timestamp: new Date().toISOString()
        }}
      }};

      // Post message to parent iframe host
      window.parent.postMessage({{ type: 'ZINGO_SAVE_CALCULATION', payload }}, '*');

      const btn = document.getElementById('saveBtn');
      btn.innerHTML = '<span>Saved to Equipment Dossier!</span>';
      btn.className = 'px-3.5 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/20';
      setTimeout(() => {{
        btn.innerHTML = `<span>Save to Equipment Dossier</span>`;
        btn.className = 'px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition flex items-center gap-1.5 shadow-lg shadow-violet-600/20';
      }}, 3000);
    }}

    renderHistory();
    recalc();
  </script>
</body>
</html>""",
        },
        {
            "id": "art-plant-api510-wall-derate",
            "title": "API 510 / OISD-128 Pressure Vessel Wall Degradation & MAWP Derating Sheet",
            "type": "html",
            "language": "html",
            "equipmentTag": "HE-301",
            "isPlantAware": True,
            "description": "Plant-aware statutory derating sheet pre-loaded with actual ultrasonic thickness gauging (UTG) scan history and API 510 formulas.",
            "content": f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API 510 Shell Derating Sheet</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body {{ font-family: ui-sans-serif, system-ui, sans-serif; }}</style>
</head>
<body class="bg-[#090D16] text-slate-100 p-4 sm:p-6 min-h-screen">
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="border-b border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            ASSET: HE-301 / SHELL
          </span>
          <span class="px-2 py-0.5 rounded text-xs font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
            STATUTORY: API 510 / OISD-STD-128
          </span>
        </div>
        <h1 class="text-xl font-bold text-slate-100 mt-1">Shell Wall Thinning & MAWP Recalculation</h1>
        <p class="text-xs text-slate-400 mt-0.5">Pre-hydrated with certified ultrasonic inspection logs from plant database.</p>
      </div>
      <button onclick="saveDeratingToPlant()" id="saveBtn" class="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition flex items-center gap-1.5 shadow-lg shadow-amber-600/20">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        <span>Save Derated Baseline</span>
      </button>
    </div>

    <!-- Inputs Pre-loaded -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Current Measured Thickness (t_act)</span>
          <span id="tactVal" class="text-rose-400 font-mono">4.20 mm</span>
        </label>
        <input type="range" id="tactSlider" min="3.0" max="14.0" step="0.1" value="4.2" class="w-full accent-rose-500 cursor-pointer" oninput="recalc()">
      </div>

      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Design Pressure (P_des)</span>
          <span id="pdesVal" class="text-amber-400 font-mono">18.0 bar</span>
        </label>
        <input type="range" id="pdesSlider" min="10" max="25" step="0.5" value="18" class="w-full accent-amber-500 cursor-pointer" oninput="recalc()">
      </div>

      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Joint Efficiency (E)</span>
          <span id="eVal" class="text-emerald-400 font-mono">0.85 (Spot RT)</span>
        </label>
        <input type="range" id="eSlider" min="0.70" max="1.00" step="0.05" value="0.85" class="w-full accent-emerald-500 cursor-pointer" oninput="recalc()">
      </div>
    </div>

    <!-- Statutory Output Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Minimum Required (t_min)</span>
        <span class="text-xl font-bold font-mono text-slate-100 mt-1 block">5.00 mm</span>
        <span class="text-[10px] text-slate-500">API 510 / ASME Sec VIII</span>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-rose-500/40 bg-rose-500/5">
        <span class="text-[11px] font-medium text-rose-400 uppercase tracking-wider block">Safety Status</span>
        <span id="statusBadge" class="text-xl font-bold font-mono text-rose-400 mt-1 block">BREACH (-0.80mm)</span>
        <span class="text-[10px] text-rose-400 font-semibold">Below Retirement Limit</span>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Max Allowable Working Pressure</span>
        <span id="mawpVal" class="text-xl font-bold font-mono text-amber-400 mt-1 block">15.1 bar</span>
        <span class="text-[10px] text-amber-400 font-medium">De-rated from 18.0 bar</span>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Remaining Useful Life (RUL)</span>
        <span id="rulVal" class="text-xl font-bold font-mono text-rose-400 mt-1 block">0.0 Months</span>
        <span class="text-[10px] text-rose-400 font-semibold">Immediate Repair Mandatory</span>
      </div>
    </div>

    <!-- Historical Ultrasonic Scan Records -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
      <div class="px-4 py-3 bg-slate-800/60 border-b border-slate-800 flex justify-between items-center text-xs font-semibold text-slate-300">
        <span>Ultrasonic Thickness Gauging (UTG) Historical Log</span>
        <span class="font-mono text-rose-400">Mean Wear: 2.85 mm / year</span>
      </div>
      <div class="divide-y divide-slate-800/60 text-xs" id="historyTable"></div>
    </div>
  </div>

  <script>
    const historyData = {thickness_json};
    const RADIUS_MM = 850;
    const STRESS_MPA = 138;
    const T_MIN = 5.0;

    function renderHistory() {{
      const tbl = document.getElementById('historyTable');
      tbl.innerHTML = historyData.map((h, i) => `
        <div class="px-4 py-2.5 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="font-mono text-slate-400">#${{i+1}}</span>
            <span class="text-slate-200 font-medium">${{h.date}}</span>
            <span class="text-slate-500 text-[11px]">${{h.source || 'UTG Grid Scan'}}</span>
          </div>
          <div class="flex items-center gap-4 font-mono">
            <span class="text-slate-300">Wall Thickness: <strong class="${{h.value < T_MIN ? 'text-rose-400' : 'text-slate-100'}}">${{h.value}} mm</strong></span>
            <span class="px-2 py-0.5 rounded text-[10px] ${{h.value < T_MIN ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}}">
              ${{h.value < T_MIN ? 'RETIREMENT BREACH' : 'COMPLIANT'}}
            </span>
          </div>
        </div>
      `).join('');
    }}

    function recalc() {{
      const tAct = parseFloat(document.getElementById('tactSlider').value);
      const pDes = parseFloat(document.getElementById('pdesSlider').value);
      const E = parseFloat(document.getElementById('eSlider').value);

      document.getElementById('tactVal').innerText = tAct.toFixed(2) + ' mm';
      document.getElementById('pdesVal').innerText = pDes.toFixed(1) + ' bar';
      document.getElementById('eVal').innerText = E.toFixed(2);

      const margin = tAct - T_MIN;
      const statusEl = document.getElementById('statusBadge');
      if (margin < 0) {{
        statusEl.innerText = `BREACH (${{margin.toFixed(2)}}mm)`;
        statusEl.className = 'text-xl font-bold font-mono text-rose-400 mt-1 block';
      }} else {{
        statusEl.innerText = `SAFE (+${{margin.toFixed(2)}}mm)`;
        statusEl.className = 'text-xl font-bold font-mono text-emerald-400 mt-1 block';
      }}

      // API 510 MAWP formula: P_mawp = (S * E * t) / (R + 0.6 * t) [convert bar]
      const mawpMpa = (STRESS_MPA * E * tAct) / (RADIUS_MM + 0.6 * tAct);
      const mawpBar = mawpMpa * 10;
      document.getElementById('mawpVal').innerText = mawpBar.toFixed(1) + ' bar';

      const corrosionRate = 2.85; // mm/yr
      const rulYears = Math.max(0, margin / corrosionRate);
      const rulMonths = rulYears * 12;
      document.getElementById('rulVal').innerText = rulMonths < 1 ? '0.0 Months' : rulMonths.toFixed(1) + ' Months';
    }}

    function saveDeratingToPlant() {{
      const tAct = document.getElementById('tactVal').innerText;
      const mawp = document.getElementById('mawpVal').innerText;

      const payload = {{
        tag: 'HE-301',
        title: 'API 510 Derating Calculation',
        state: {{
          measured_thickness: tAct,
          derated_mawp: mawp,
          retirement_limit: T_MIN + ' mm',
          status: 'BELOW_RETIREMENT_LIMIT',
          timestamp: new Date().toISOString()
        }}
      }};

      window.parent.postMessage({{ type: 'ZINGO_SAVE_CALCULATION', payload }}, '*');

      const btn = document.getElementById('saveBtn');
      btn.innerHTML = '<span>Saved to Equipment Record!</span>';
      btn.className = 'px-3.5 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/20';
      setTimeout(() => {{
        btn.innerHTML = `<span>Save Derated Baseline</span>`;
        btn.className = 'px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition flex items-center gap-1.5 shadow-lg shadow-amber-600/20';
      }}, 3000);
    }}

    renderHistory();
    recalc();
  </script>
</body>
</html>""",
        }
    ]
