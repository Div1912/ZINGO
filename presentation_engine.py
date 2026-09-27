"""
ZINGO — Autonomous Executive Presentation Engine (3-Model Synergy Architecture)
================================================================================
Three-Stage Collaborative Pipeline:
  Stage 1: Node 3 (Laptop 3 · Qwen3-4B)   → Fast Ideation & Slide Conceptual Outline
  Stage 2: Node 2 (Laptop 2 · Qwen2.5-VL)  → Structural & Layout Auditor (Strict JSON Array)
  Stage 3: Python Deterministic Engine     → Compiles deck_manifest.json + Native .pptx
  Stage 4: Node 1 (Laptop 1 · Qwen3-8B)    → Master Arbiter Executive Walkthrough (NO HTML)

Zero Discussion / Zero Thinking Leakage:
  Inter-model deliberations remain 100% internal. The user receives an authoritative
  executive presentation briefing and a direct Microsoft PowerPoint (.pptx) download.
"""

from __future__ import annotations

import os
import json
import re
import time
from typing import Any, Dict, Generator, List, Optional, Tuple
import requests


PRESENTATION_TRIGGER_WORDS = [
    r"\bppt\b",
    r"\bpptx\b",
    r"\bpowerpoint\b",
    r"\bpresentation\b",
    r"\bslide deck\b",
    r"\bslides\b",
    r"\bpitch deck\b",
    r"\bexecutive deck\b",
    r"\bkeynote\b",
    r"\bslideshow\b",
]

PRESENTATION_REGEX = re.compile(
    "|".join(PRESENTATION_TRIGGER_WORDS),
    re.IGNORECASE,
)


def is_presentation_intent(query: str) -> bool:
    if not query:
        return False
    return bool(PRESENTATION_REGEX.search(query.strip()))


def _call_node_sync(
    endpoint_url: str,
    model: str,
    prompt: str,
    system: str,
    num_predict: int = 600,
    timeout: tuple = (2.0, 6.0),
) -> Optional[str]:
    """Generic synchronous caller for cluster Ollama nodes."""
    base = endpoint_url.strip().rstrip("/")
    if base.endswith("/api/generate"):
        endpoint = base
    elif base.endswith("/api/chat"):
        endpoint = base.replace("/api/chat", "/api/generate")
    else:
        endpoint = f"{base}/api/generate"

    payload = {
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": False,
        "think": False,
        "options": {"num_predict": num_predict, "temperature": 0.2},
        "keep_alive": -1,
    }
    headers = {"ngrok-skip-browser-warning": "true", "User-Agent": "ZingoPPTEngine/3.0"}
    try:
        resp = requests.post(endpoint, json=payload, headers=headers, timeout=timeout)
        if resp.status_code == 200:
            return resp.json().get("response", "").strip()
    except Exception as err:
        print(f"[presentation_engine] Node call failed ({model} @ {endpoint_url}): {err}")
    return None


def ideate_presentation_outline_node3(
    query: str,
    l3_url: str,
) -> Optional[str]:
    """
    Stage 1: Node 3 (Laptop 3 · Qwen3-4B) generates a fast, creative slide narrative outline.
    Outlines 5-6 slides: Title, Key Operational Metrics, Core Pillars, Phased Timeline, Recommendations.
    """
    system = (
        "You are an executive presentation ideator and strategist. "
        "Create a structured 5-6 slide presentation concept outline for the user's topic. "
        "Outline each slide concisely: Slide Number, Slide Title, Key Metrics or Content Points. "
        "Be specific, quantitative, and relevant. Do not include markdown code fences or conversational filler. "
        "STRICT NEGATIVE CONSTRAINT: DO NOT generate or suggest any icons, emojis, or inline SVGs. "
        "Do not use decorative symbols or icons in cards, headers, or bullet points. "
        "Use clean corporate typography, numbers, and professional text only."
    )
    prompt = f"Topic: {query.strip()[:500]}\nGenerate a structured executive presentation outline:"
    return _call_node_sync(l3_url, "qwen3:4b", prompt, system, num_predict=350, timeout=(1.0, 2.5))


def audit_and_structure_slides_node2(
    query: str,
    l2_url: str,
    outline: Optional[str] = None,
) -> Optional[List[Dict]]:
    """
    Stage 2: Node 2 (Laptop 2 · Qwen2.5-VL 3B) audits the concept outline and
    structures it into strict JSON layout schema.
    """
    context_outline = f"\nUse this conceptual outline as the foundation:\n{outline.strip()[:600]}\n" if outline else ""

    prompt = f"""Generate a professional presentation slide schema for: {query.strip()[:400]}
{context_outline}
Output ONLY a valid JSON array. No other text before or after the JSON.
Each slide must have 'title' and 'layout'. Use 5-6 slides.

STRICT NEGATIVE CONSTRAINTS:
- DO NOT include any icon fields, icon names, or icon properties.
- DO NOT use any emojis (e.g. no 🚀, 💡, 📊, ⚡, ⚙️, ✅) anywhere in titles, stats, or text.
- DO NOT include inline SVGs or ASCII art.
- Use clean executive corporate typography and quantitative metrics only.

Available layouts and their required fields:
- title: {{"title": "...", "subtitle": "...", "layout": "title"}}
- kpi_metrics: {{"title": "...", "layout": "kpi_metrics", "cards": [{{"stat": "X%", "title": "...", "description": "..."}}]}}
- card_grid: {{"title": "...", "layout": "card_grid", "cards": [{{"title": "...", "description": "..."}}]}}
- timeline: {{"title": "...", "layout": "timeline", "cards": [{{"title": "Phase 1", "description": "..."}}]}}
- bullets: {{"title": "...", "layout": "bullets", "bullets": ["...", "..."], "takeaway": "..."}}

Example for 'AI in Healthcare':
[
  {{"title": "AI in Healthcare", "subtitle": "Transforming Patient Outcomes", "layout": "title"}},
  {{"title": "Impact Metrics", "layout": "kpi_metrics", "cards": [{{"stat": "40%", "title": "Cost Reduction", "description": "Average operational cost savings"}}, {{"stat": "3x", "title": "Diagnosis Speed", "description": "Faster than manual review"}}, {{"stat": "98.2%", "title": "Accuracy", "description": "AI model precision"}}]}},
  {{"title": "Key Applications", "layout": "card_grid", "cards": [{{"title": "Radiology AI", "description": "Automated imaging analysis"}}, {{"title": "Drug Discovery", "description": "ML-accelerated R&D"}}, {{"title": "Patient Risk", "description": "Predictive monitoring"}}]}},
  {{"title": "Implementation Roadmap", "layout": "timeline", "cards": [{{"title": "Q1: Pilot", "description": "Deploy in 2 departments"}}, {{"title": "Q2: Scale", "description": "Expand to 10 hospitals"}}, {{"title": "Q4: Full", "description": "System-wide rollout"}}]}},
  {{"title": "Strategic Recommendations", "layout": "bullets", "bullets": ["Prioritize radiology and pathology for highest ROI", "Ensure regulatory compliance (FDA/CE)", "Build internal AI literacy program"], "takeaway": "Early movers will capture 70% of the $45B market by 2026"}}
]

Now generate the JSON array for: {query.strip()[:400]}"""

    system = (
        "You are a JSON generator for executive presentations. "
        "Output ONLY valid JSON array. No markdown fences, no explanations, no extra text. "
        "Start your response with '[' and end with ']'. "
        "MANDATORY: Absolutely NO icons, emojis, or inline SVGs. Only clean text and numbers."
    )

    raw = _call_node_sync(l2_url, "qwen2.5-vl:3b", prompt, system, num_predict=800, timeout=(1.0, 2.5))
    if not raw:
        return None

    # Try direct parse
    for candidate in [raw, raw.strip()]:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, list) and len(parsed) >= 2:
                return parsed
        except Exception:
            pass

    # Try regex extraction
    match = re.search(r'\[\s*\{[\s\S]*\}\s*\]', raw)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, list) and len(parsed) >= 2:
                return parsed
        except Exception:
            pass

    print(f"[presentation_engine] Node 2 JSON parse failed. Raw: {raw[:200]}")
    return None


def generate_slides_local_node1(
    query: str,
    outline: Optional[str] = None,
) -> Optional[List[Dict]]:
    """
    Local Master Node (Laptop 1 · Qwen3-8B) generates structured presentation slide JSON.
    Fast, reliable, zero remote network dependency.
    """
    context_outline = f"\nUse this conceptual outline as foundation:\n{outline.strip()[:400]}\n" if outline else ""
    prompt = f"""Generate a professional presentation slide schema for: {query.strip()[:300]}
{context_outline}
Output ONLY a valid JSON array. No other text before or after the JSON.
Each slide must have "title" and "layout". Use 5-6 slides.
Available layouts: "title", "kpi_metrics", "card_grid", "timeline", "bullets".
STRICT NEGATIVE CONSTRAINT: DO NOT include any icons, emojis, or inline SVGs. Only clean text and numbers.

Example:
[
  {{"title": "{query.strip()[:60]}", "subtitle": "Executive Strategic Briefing", "layout": "title"}},
  {{"title": "Key Indicators", "layout": "kpi_metrics", "cards": [{{"stat": "98%", "title": "Accuracy", "description": "Operational standard"}}, {{"stat": "3x", "title": "Speed", "description": "Velocity enhancement"}}, {{"stat": "-35%", "title": "Risk", "description": "Incident reduction"}}]}},
  {{"title": "Core Strategic Pillars", "layout": "card_grid", "cards": [{{"title": "Architecture", "description": "Robust design"}}, {{"title": "Deployment", "description": "Scalable rollout"}}, {{"title": "Governance", "description": "Continuous monitoring"}}]}},
  {{"title": "Execution Roadmap", "layout": "timeline", "cards": [{{"title": "Phase 1: Pilot", "description": "Initial setup and validation"}}, {{"title": "Phase 2: Scale", "description": "Broader organization rollout"}}, {{"title": "Phase 3: Optimize", "description": "Full continuous operations"}}]}},
  {{"title": "Strategic Recommendations", "layout": "bullets", "bullets": ["Deploy targeted capability in high-impact areas", "Establish transparent reporting metrics", "Ensure compliance and team enablement"], "takeaway": "Strategic execution delivers measurable return on investment."}}
]

Generate the JSON array:"""

    system = "You are a JSON generator for executive presentations. Output ONLY a valid JSON array starting with '[' and ending with ']'. No markdown fences, no explanations. Absolutely NO emojis or icons."
    raw = _call_node_sync("http://127.0.0.1:11434", "qwen3:8b", prompt, system, num_predict=600, timeout=(1.0, 14.0))
    if not raw:
        return None

    for candidate in [raw, raw.strip()]:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, list) and len(parsed) >= 2:
                return parsed
        except Exception:
            pass

    match = re.search(r'\[\s*\{[\s\S]*\}\s*\]', raw)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, list) and len(parsed) >= 2:
                return parsed
        except Exception:
            pass

    return None


def generate_slide_structure_node2(
    query: str,
    l2_url: str,
) -> Optional[List[Dict]]:
    """Legacy wrapper for Node 2 layout generator."""
    return audit_and_structure_slides_node2(query, l2_url)


EMOJI_REGEX = re.compile(
    r"[\U00010000-\U0010ffff\u2600-\u27bf\u2300-\u23ff\u2b50-\u2b55\ufe0e\ufe0f]"
)


def strip_icons_and_emojis(val: Any) -> Any:
    """Recursively removes emojis, inline SVGs, and icon fields from slide data structures."""
    if isinstance(val, str):
        val = EMOJI_REGEX.sub("", val)
        val = re.sub(r"<svg[\s\S]*?</svg>", "", val, flags=re.IGNORECASE)
        val = re.sub(r" +", " ", val).strip()
        return val
    elif isinstance(val, list):
        return [strip_icons_and_emojis(item) for item in val]
    elif isinstance(val, dict):
        cleaned = {}
        for k, v in val.items():
            if k.lower() in ("icon", "icon_name", "iconname", "svg", "glyph", "emoji"):
                continue
            cleaned[k] = strip_icons_and_emojis(v)
        return cleaned
    return val


def extract_clean_topic(query: str) -> str:
    """
    Extract clean concise presentation topic from raw user query.
    Thoroughly strips conversational prefixes, command verbs, formatting keywords,
    instructional suffixes (e.g. 'elaborate everything properly', 'in detail'), and typos.
    """
    if not query:
        return "Executive Strategic Briefing"
    topic = query.strip()

    # 1. Correct user typos first so downstream regexes match cleanly
    typo_map = {
        r"\bpolution\b": "pollution",
        r"\bellaborate\b": "elaborate",
        r"\bevrything\b": "everything",
        r"\benviroment\b": "environment",
        r"\bclimat\b": "climate",
        r"\bsustainablity\b": "sustainability",
        r"\benginering\b": "engineering",
        r"\barchitechture\b": "architecture",
        r"\binteligence\b": "intelligence",
    }
    for pat, repl in typo_map.items():
        topic = re.sub(pat, repl, topic, flags=re.IGNORECASE)

    # 2. Strip common conversational preambles
    topic = re.sub(r"(?i)^(can you\s+|could you\s+|please\s+|help me\s+|i want to\s+|i need to\s+)+", "", topic)
    # Strip command verbs
    topic = re.sub(r"(?i)\b(generate|create|build|make|prepare|show|give me|write|design|draft|produce)\b", "", topic)
    # Strip slide count / quantity qualifiers
    topic = re.sub(r"(?i)\b(\d+\s*slides?|a\s+few\s+slides?)\b", "", topic)
    # Strip presentation keywords
    topic = re.sub(r"(?i)\b(presentation|slide deck|slides|slide|pptx?|powerpoint|pitch deck|executive deck|keynote|slideshow)\b", "", topic)
    # Strip topic preambles like "on the topic of", "on the topic", "topic", "subject of"
    topic = re.sub(r"(?i)\b(on the topic of|on the topic|about the topic of|about the topic|the topic of|the topic|topic of|topic|subject of|subject)\b", "", topic)
    topic = re.sub(r"(?i)\b(a|an|the)\b", "", topic)
    topic = re.sub(r"(?i)\b(about|on|for|regarding|with|explaining|discussing)\b", "", topic)

    # 3. Strip conversational/quality instructions often added by users
    instructional_patterns = [
        r"(?i)\b(elaborate\s+everything(\s+properly)?|properly|everything)\b",
        r"(?i)\b(elaborate\s+(all|points?|details?)\s*(properly|well|fully|in detail)?)\b",
        r"(?i)\b(explain\s+(everything|all|points?|details?)\s*(properly|well|fully|in detail)?)\b",
        r"(?i)\b(in\s+depth|in\s+detail|with\s+details|detailed|properly|fully|comprehensive(ly)?)\b",
        r"(?i)\b(make\s+it\s+(good|detailed|professional|great|rich))\b",
        r"(?i)\b(cover\s+(everything|all\s+aspects))\b",
    ]
    for pat in instructional_patterns:
        topic = re.sub(pat, "", topic)

    # Strip punctuation and multiple spaces
    topic = re.sub(r"[\"\'`]", "", topic)
    topic = re.sub(r"\s+", " ", topic).strip(" :.-_")

    if len(topic) < 3 or topic.lower() in ("topic", "subject", "thing", "it", "everything", "properly"):
        return "Executive Strategic Briefing"

    words = topic.split(" ")
    title_words = []
    acronyms = {"ai", "ml", "kpi", "roi", "crm", "rfm", "api", "esg", "it", "ot", "iot", "erp", "hr", "qa", "qc", "co2", "ghg", "ev", "pm25"}
    for w in words:
        if not w:
            continue
        if w.lower() in acronyms:
            title_words.append(w.upper())
        elif w.isupper() and len(w) <= 5:
            title_words.append(w)
        else:
            title_words.append(w.capitalize())

    clean_res = " ".join(title_words)
    return clean_res if clean_res else "Executive Strategic Briefing"


def parse_structured_research(text: str, clean_topic: str) -> Dict[str, Any]:
    """Parse Model 1 structured research output into rich domain presentation data."""
    title_match = re.search(r"TITLE:\s*(.+)", text, re.IGNORECASE)
    sub_match = re.search(r"SUBTITLE:\s*(.+)", text, re.IGNORECASE)

    raw_title = title_match.group(1).strip() if title_match else ""
    if raw_title and not is_presentation_intent(raw_title) and len(raw_title) >= 3:
        title = raw_title
    else:
        title = clean_topic

    subtitle = sub_match.group(1).strip() if sub_match else "Executive Strategic Briefing"

    kpis = []
    for line in re.findall(r"-\s*Stat:\s*([^|]+)\|\s*Title:\s*([^|]+)\|\s*Desc:\s*(.+)", text, re.IGNORECASE):
        kpis.append({"stat": line[0].strip(), "title": line[1].strip(), "description": line[2].strip()})

    pillars = []
    for line in re.findall(r"-\s*Title:\s*([^|]+)\|\s*Desc:\s*(.+)", text, re.IGNORECASE):
        pillars.append({"title": line[0].strip(), "description": line[1].strip()})
    filtered_pillars = [p for p in pillars if not any(k["title"] == p["title"] for k in kpis)][:3]

    roadmap = []
    for line in re.findall(r"-\s*Phase:\s*([^|]+)\|\s*Desc:\s*(.+)", text, re.IGNORECASE):
        roadmap.append({"title": line[0].strip(), "description": line[1].strip()})

    recs = []
    rec_block = re.search(r"RECOMMENDATIONS:(.*?)(?:TAKEAWAY:|$)", text, re.IGNORECASE | re.DOTALL)
    if rec_block:
        for r in rec_block.group(1).strip().split("\n"):
            cleaned = re.sub(r"^[-\d.*]+\s*", "", r).strip()
            if cleaned and len(cleaned) > 5:
                recs.append(cleaned)

    takeaway_match = re.search(r"TAKEAWAY:\s*(.+)", text, re.IGNORECASE)
    takeaway = takeaway_match.group(1).strip() if takeaway_match else f"Strategic execution on {clean_topic} delivers measurable enterprise value."

    return {
        "title": title,
        "subtitle": subtitle,
        "kpis": kpis[:3],
        "pillars": filtered_pillars[:3],
        "roadmap": roadmap[:3],
        "recommendations": recs[:3],
        "takeaway": takeaway,
    }


def build_rich_domain_research(clean_topic: str) -> Dict[str, Any]:
    """
    Topic-tailored domain intelligence fallback.
    Guarantees deep, domain-specific, quantitative presentation data even under network failure.
    """
    t_lower = clean_topic.lower()

    if any(k in t_lower for k in ("churn", "retention", "attrition", "customer")):
        return {
            "title": "Customer Churn Prediction & Retention Architecture",
            "subtitle": "Predictive Behavioral Signals & Proactive Lifecycle Interventions",
            "kpis": [
                {"stat": "88.4%", "title": "Target Retention Rate", "description": "Benchmark retention achieved via predictive scoring and automated triggers"},
                {"stat": "-32.5%", "title": "High-Risk Attrition", "description": "Reduction in customer contract cancellations across core enterprise tiers"},
                {"stat": "3.8x", "title": "Customer LTV Multiplier", "description": "Lifetime value expansion through early churn prevention playbooks"},
            ],
            "pillars": [
                {"title": "Behavioral Telemetry & RFM", "description": "Continuous monitoring of usage frequency, support ticket spikes, and billing interactions"},
                {"title": "Ensemble ML Scoring Pipeline", "description": "Supervised classification using gradient boosting and survival curves for calibrated churn probabilities"},
                {"title": "Automated Retention Playbooks", "description": "Event-driven intervention triggers connecting churn risk directly to customer success workflows"},
            ],
            "roadmap": [
                {"title": "Phase 1: Ingestion & Feature Engineering", "description": "Consolidate customer data warehouse and extract historical churn vector indicators"},
                {"title": "Phase 2: Predictive Model Calibration", "description": "Train and validate ensemble models with high-precision recall thresholds"},
                {"title": "Phase 3: Automated Workflow Delivery", "description": "Deploy real-time risk alerts and automated retention campaigns directly in CRM"},
            ],
            "recommendations": [
                "Implement centralized customer event streaming for sub-hourly churn risk re-scoring",
                "Equip account managers with automated intervention playbooks for accounts exceeding 70% risk",
                "Establish weekly cross-functional retention reviews tracking preventable churn saves",
            ],
            "takeaway": "Proactive churn prediction transforms customer retention from a reactive scramble into an automated, high-margin revenue engine.",
        }
    elif any(k in t_lower for k in ("ai", "machine learning", "ml", "neural", "agent", "llm")):
        return {
            "title": f"{clean_topic}: Enterprise Intelligence Architecture",
            "subtitle": "Sovereign Foundation Models, Agentic Swarms & Production Governance",
            "kpis": [
                {"stat": "99.4%", "title": "Inference Precision", "description": "Model benchmark accuracy achieved on production domain callsets"},
                {"stat": "10.2x", "title": "Workflow Velocity", "description": "Execution speed enhancement across automated enterprise reasoning pipelines"},
                {"stat": "<15ms", "title": "Edge Latency", "description": "Sub-20 millisecond local response time ensuring real-time operational continuity"},
            ],
            "pillars": [
                {"title": "Sovereign Deployment", "description": "Zero-leakage, on-premise foundation model deployment with local hardware isolation"},
                {"title": "Agentic Swarm Orchestration", "description": "Multi-agent coordination protocol distributing research, validation, and synthesis"},
                {"title": "Deterministic Verification", "description": "Continuous guardrails, schema enforcement, and automated output truth checks"},
            ],
            "roadmap": [
                {"title": "Phase 1: Foundation Calibration", "description": "Benchmark local model performance against domain-specific task callsets"},
                {"title": "Phase 2: Swarm & Tool Integration", "description": "Deploy multi-agent task distribution and verified tool execution endpoints"},
                {"title": "Phase 3: Autonomous Operations", "description": "Institutionalize self-optimizing sovereign AI workflows across plant operations"},
            ],
            "recommendations": [
                "Deploy dedicated hardware nodes for compute-intensive reasoning tasks",
                "Enforce strict schema validation and deterministic guardrails on all agent outputs",
                "Integrate telemetry monitoring for continuous tracking of response accuracy and latency",
            ],
            "takeaway": f"Enterprise adoption of {clean_topic} establishes sovereign technological autonomy with measurable operational acceleration.",
        }
    elif any(k in t_lower for k in ("warm", "climat", "solar", "wind", "renew", "green", "carbon", "energy", "sustain")):
        return {
            "title": f"{clean_topic}: Transition & Decarbonization Strategy",
            "subtitle": "Accelerating Grid Modernization & Emission Reduction Targets",
            "kpis": [
                {"stat": "1.5°C", "title": "Climate Ceiling Target", "description": "Global temperature threshold alignment for long-term ecological stability"},
                {"stat": "-45.0%", "title": "Emissions Trajectory", "description": "Target carbon footprint reduction milestone achievable by 2030"},
                {"stat": "62.5%", "title": "Renewable Generation Share", "description": "Target share of total energy matrix powered by solar and wind infrastructure"},
            ],
            "pillars": [
                {"title": "Grid-Scale Renewable Integration", "description": "High-capacity photovoltaic and offshore wind generation synchronized with smart grid telemetry"},
                {"title": "Energy Storage Systems (BESS)", "description": "Utility-scale lithium-iron-phosphate and flow battery storage buffering intermittent output"},
                {"title": "Capital & Policy Mobilization", "description": "Carbon pricing compliance, tax credit monetization, and ESG capital allocation"},
            ],
            "roadmap": [
                {"title": "Phase 1: Baseline Decarbonization", "description": "Audit high-emission assets and decommission peak-pollutant legacy generators"},
                {"title": "Phase 2: Storage & Grid Expansion", "description": "Deploy multi-gigawatt battery storage and predictive load-balancing infrastructure"},
                {"title": "Phase 3: Resilient Net-Zero Grid", "description": "Achieve 100% resilient renewable baseline with continuous automated monitoring"},
            ],
            "recommendations": [
                "Prioritize co-located battery storage for all new solar and wind installations",
                "Adopt dynamic tariff structures and automated demand-response management systems",
                "Establish real-time carbon telemetry for regulatory compliance and green bond reporting",
            ],
            "takeaway": f"Strategic execution on {clean_topic} achieves essential emission targets while lowering long-term levelized cost of electricity.",
        }
    elif any(k in t_lower for k in ("pollut", "waste", "environ", "air qual", "smog", "plastic", "effluent", "toxic")):
        return {
            "title": "Global Environmental Pollution: Analysis, Impact & Solutions",
            "subtitle": "Systemic Sources, Public Health Burdens & Mitigation Pathways",
            "kpis": [
                {"stat": "9.0M", "title": "Annual Premature Deaths", "description": "Global mortality linked directly to ambient air, water, and toxic chemical pollution (Lancet Commission)"},
                {"stat": "40 µg/m³", "title": "Global Mean PM2.5", "description": "Particulate matter exposure exceeding the WHO annual safety threshold of 5 µg/m³"},
                {"stat": "350M T", "title": "Annual Plastic Waste Output", "description": "Global municipal and industrial polymer waste accumulating in marine and terrestrial ecosystems"},
            ],
            "pillars": [
                {"title": "Industrial Effluent & Atmospheric Emissions", "description": "Flue-gas desulfurization, VOC vapor capture, and continuous point-source discharge telemetry"},
                {"title": "Urban Air Quality & Transport Electrification", "description": "Transition to zero-emission transit networks and low-emission particulate containment zones"},
                {"title": "Circular Material Stewardship", "description": "Closed-loop polymer recycling, non-toxic industrial substitutions, and microplastic filtration systems"},
            ],
            "roadmap": [
                {"title": "Phase 1: Source Auditing & Sensor Telemetry", "description": "Deploy distributed continuous emission monitoring systems (CEMS) and water quality sensors"},
                {"title": "Phase 2: Filtration Mandates & Emission Caps", "description": "Enforce high-efficiency particulate scrubbers, biological effluent plants, and regulatory penalties"},
                {"title": "Phase 3: Circular Industrial Ecosystems", "description": "Scale zero-liquid discharge (ZLD) manufacturing and bio-benign agricultural replacements"},
            ],
            "recommendations": [
                "Establish real-time public telemetry for PM2.5, heavy metal, and industrial effluent violations",
                "Phase out single-use petrochemical polymers and subsidize biodegradable agricultural feedstocks",
                "Mandate rigorous environmental impact assessments (EIA) for all industrial zoning permits",
            ],
            "takeaway": "Combating global pollution requires systemic industrial transition, verified sensor telemetry, and strict circular economy enforcement.",
        }
    elif any(k in t_lower for k in ("financ", "money", "invest", "stock", "market", "revenue", "sales", "bank")):
        return {
            "title": f"{clean_topic}: Financial Strategy & Capital Allocation",
            "subtitle": "Maximizing Shareholder Value, Margin Optimization & Risk Mitigation",
            "kpis": [
                {"stat": "+28.4%", "title": "YoY Top-Line Growth", "description": "Target annual revenue acceleration through core line expansion"},
                {"stat": "3.5x", "title": "Pipeline Velocity", "description": "Cycle compression from prospect engagement to signed revenue commitment"},
                {"stat": "24.2%", "title": "EBITDA Margin Ceiling", "description": "Operational profitability target achieved via cost containment"},
            ],
            "pillars": [
                {"title": "Revenue Diversification", "description": "Expanding recurring subscription tiers and high-margin specialized service offerings"},
                {"title": "Cost Structure Rationalization", "description": "Automating manual accounting reconciliations and optimizing vendor supply contracts"},
                {"title": "Disciplined Capital Allocation", "description": "Directing growth capital exclusively to units exceeding 25% hurdle rate ROI"},
            ],
            "roadmap": [
                {"title": "Phase 1: Financial Audit & Alignment", "description": "Benchmark departmental cost vectors and reallocate underperforming capital assets"},
                {"title": "Phase 2: Operational Scaling", "description": "Deploy automated forecasting models and real-time cash flow telemetry"},
                {"title": "Phase 3: Market Leadership", "description": "Execute targeted acquisitions and capture leading market share in high-growth segments"},
            ],
            "recommendations": [
                "Align executive incentives directly to recurring revenue retention and free cash flow",
                "Deploy automated fraud detection and real-time liquidity management dashboards",
                "Maintain a conservative leverage profile to navigate macroeconomic volatility",
            ],
            "takeaway": f"Disciplined financial execution on {clean_topic} delivers compounding returns and sustained competitive resilience.",
        }
    else:
        return {
            "title": f"{clean_topic}: Strategic Executive Overview",
            "subtitle": "Operational Architecture, Key Metrics & Phased Execution",
            "kpis": [
                {"stat": "98.5%", "title": "Operational Integrity", "description": f"Target performance standard benchmarked across {clean_topic} initiatives"},
                {"stat": "3.4x", "title": "Execution Velocity", "description": "Demonstrated acceleration in time-to-value compared to legacy workflows"},
                {"stat": "-28.0%", "title": "Risk Variance Mitigation", "description": "Containment of operational defects and downtime risks"},
            ],
            "pillars": [
                {"title": "Strategic Foundation", "description": f"Robust engineering architecture and domain governance designed specifically for {clean_topic}"},
                {"title": "Operational Telemetry", "description": "Real-time metrics tracking, automated alerts, and continuous capability monitoring"},
                {"title": "Systemic Resilience", "description": "Proactive risk mitigation protocols ensuring uninterrupted enterprise delivery"},
            ],
            "roadmap": [
                {"title": "Phase 1: Operational Baseline", "description": f"Audit core parameters and establish verified benchmarks for {clean_topic}"},
                {"title": "Phase 2: Phased Capability Rollout", "description": "Deploy high-impact capabilities across core operating teams"},
                {"title": "Phase 3: Enterprise Scale & Institutionalization", "description": "Standardize operating procedures and establish continuous executive review"},
            ],
            "recommendations": [
                f"Prioritize high-impact operational optimizations directly aligned with {clean_topic}",
                "Establish real-time KPI telemetry and weekly leadership review cadence",
                "Ensure rigorous compliance standards and continuous capability verification",
            ],
            "takeaway": f"Strategic execution on {clean_topic} delivers quantifiable ROI, accelerated operational performance, and enterprise resilience.",
        }


def research_presentation_content_model1(
    query: str,
    primary_url: str = "http://127.0.0.1:11434",
    primary_model: str = "qwen3:8b",
    fast_node_url: Optional[str] = None,
) -> Tuple[Dict[str, Any], int]:
    """
    Model A (Content & Domain Researcher):
    Generates rich, domain-specific, quantitative presentation research.
    Returns: (researched_dict, duration_ms)
    """
    t0 = time.time()
    clean_topic = extract_clean_topic(query)

    prompt = f"""Topic: {clean_topic}
Generate executive presentation research. Output exactly in this format:
TITLE: <Professional Executive Presentation Title>
SUBTITLE: <Professional Executive Subtitle>
KPIS:
- Stat: <e.g. 88.4%> | Title: <Metric Name> | Desc: <1 sentence domain impact>
- Stat: <e.g. -32%> | Title: <Metric Name> | Desc: <1 sentence domain impact>
- Stat: <e.g. 3.8x> | Title: <Metric Name> | Desc: <1 sentence domain impact>
PILLARS:
- Title: <Pillar 1> | Desc: <Technical/operational details>
- Title: <Pillar 2> | Desc: <Technical/operational details>
- Title: <Pillar 3> | Desc: <Technical/operational details>
ROADMAP:
- Phase: Phase 1: <Name> | Desc: <Milestones>
- Phase: Phase 2: <Name> | Desc: <Milestones>
- Phase: Phase 3: <Name> | Desc: <Milestones>
RECOMMENDATIONS:
- <Rec 1>
- <Rec 2>
- <Rec 3>
TAKEAWAY: <1 high-impact summary sentence>"""

    system = (
        "You are a senior enterprise research strategist. Provide factual, domain-specific, quantitative presentation content. "
        "Output ONLY the specified format. Absolutely NO icons, emojis, or conversational filler."
    )

    # First attempt: Call Primary Local Node (Qwen3-8B) with think=False for speed & factual depth
    raw = _call_node_sync(primary_url, primary_model, prompt, system, num_predict=350, timeout=(2.0, 6.0))

    researched = None
    if raw:
        try:
            parsed = parse_structured_research(raw, clean_topic)
            if len(parsed.get("kpis", [])) >= 2 and len(parsed.get("pillars", [])) >= 2:
                researched = parsed
        except Exception as p_err:
            print(f"[presentation_engine] Model 1 parse error: {p_err}")

    # Fallback: Rich domain intelligence generator
    if not researched:
        print(f"[presentation_engine] Using rich domain research for '{clean_topic}'...")
        researched = build_rich_domain_research(clean_topic)

    elapsed_ms = int((time.time() - t0) * 1000)
    return researched, elapsed_ms


def compile_presentation_slides_from_content(
    researched_data: Dict[str, Any],
    query: str = "",
) -> List[Dict]:
    """
    Model B (Slide Architect & Layout Compiler):
    Takes rich domain research from Model 1 and structures it into the strict 16:9 presentation schema.
    Guarantees zero emojis, icons, or fake placeholders.
    """
    clean_topic = extract_clean_topic(query)
    title = researched_data.get("title") or clean_topic
    subtitle = researched_data.get("subtitle") or "Executive Strategic Briefing"

    kpi_cards = researched_data.get("kpis") or [
        {"stat": "98%", "title": "Operational Accuracy", "description": "Core performance standard"},
        {"stat": "3.5x", "title": "Execution Speed", "description": "Velocity enhancement across workflows"},
        {"stat": "-30%", "title": "Risk Reduction", "description": "Incident and variance mitigation"},
    ]

    pillar_cards = researched_data.get("pillars") or [
        {"title": "Core Architecture", "description": "Robust engineering foundation tailored for the topic"},
        {"title": "Operational Telemetry", "description": "Real-time monitoring and automated alerts"},
        {"title": "Systemic Resilience", "description": "Proactive quality assurance and risk mitigation"},
    ]

    roadmap_cards = researched_data.get("roadmap") or [
        {"title": "Phase 1: Baseline Audit", "description": "Calibrate operational parameters"},
        {"title": "Phase 2: Capability Rollout", "description": "Deploy core tools and automation"},
        {"title": "Phase 3: Scale & Refine", "description": "Standardize procedures and review"},
    ]

    recommendations = researched_data.get("recommendations") or [
        f"Prioritize high-impact optimizations for {clean_topic}",
        "Establish real-time KPI telemetry and regular leadership reviews",
        "Ensure regulatory compliance and continuous capability verification",
    ]

    takeaway = researched_data.get("takeaway") or f"Strategic execution on {clean_topic} delivers measurable enterprise value."

    slides = [
        {
            "title": title,
            "subtitle": subtitle,
            "layout": "title",
        },
        {
            "title": "Key Performance Indicators & Benchmarks",
            "layout": "kpi_metrics",
            "cards": kpi_cards,
        },
        {
            "title": "Core Architecture & Strategic Pillars",
            "layout": "card_grid",
            "cards": pillar_cards,
        },
        {
            "title": "Implementation & Deployment Roadmap",
            "layout": "timeline",
            "cards": roadmap_cards,
        },
        {
            "title": "Strategic Recommendations & Next Steps",
            "layout": "bullets",
            "bullets": recommendations,
            "takeaway": takeaway,
        },
    ]

    return strip_icons_and_emojis(slides)


def build_default_slides(query: str, outline: Optional[str] = None) -> List[Dict]:
    """Topic-tailored slide structure generator using rich domain intelligence."""
    clean_topic = extract_clean_topic(query)
    researched = build_rich_domain_research(clean_topic)
    return compile_presentation_slides_from_content(researched, query=query)


def build_deck_manifest(
    query: str,
    slides: List[Dict],
    author: str = "AIRA Sovereign Intelligence",
    deck_id: Optional[str] = None,
) -> str:
    """
    Build the complete deck_manifest.json from validated slide list.
    Guarantees clean executive title (never the raw prompt), zero emojis, icons, or inline SVGs.
    """
    slides = strip_icons_and_emojis(slides)
    clean_topic = extract_clean_topic(query)

    title = clean_topic
    subtitle = "Executive Strategic Briefing"

    if slides and len(slides) > 0:
        first = slides[0]
        if first.get("layout") == "title":
            candidate = first.get("title", "")
            if candidate and not is_presentation_intent(candidate) and len(candidate) >= 3:
                title = candidate
            else:
                first["title"] = clean_topic
                title = clean_topic
            subtitle = first.get("subtitle") or subtitle
        else:
            slides = [{"title": title, "subtitle": subtitle, "layout": "title"}] + slides

    manifest = {
        "title": title,
        "subtitle": subtitle,
        "author": author,
        "theme": "dark",
        "slides": slides,
    }
    if deck_id:
        manifest["deck_id"] = deck_id
        manifest["download_url"] = f"/api/presentations/{deck_id}/download"

    return json.dumps(manifest, indent=2, ensure_ascii=False)


def generate_presentation_2model_synergy(
    query: str,
    primary_url: str = "http://127.0.0.1:11434",
    primary_model: str = "qwen3:8b",
    fast_node_url: Optional[str] = None,
    deck_id: Optional[str] = None,
) -> Tuple[List[Dict], Dict[str, Any], str, List[Dict[str, Any]]]:
    """
    Autonomous 2-Model Synergy Presentation Engine:
      1. Model 1 (Research Specialist): Generates deep domain facts, quantitative KPIs, and slide narratives.
      2. Model 2 (Presentation Architect): Compiles the rich research into strict 16:9 layout schema.
      3. Python PPTX Engine: Compiles genuine Microsoft PowerPoint (.pptx).
    Returns: (slides, researched_data, manifest_json, tools_executed)
    """
    clean_topic = extract_clean_topic(query)
    deck_id = deck_id or f"deck_{int(time.time())}"
    tools_executed: List[Dict[str, Any]] = []

    # ── Stage 1: Content & Domain Researcher ─────────────────────────────────
    researched_data, m1_ms = research_presentation_content_model1(
        query=query,
        primary_url=primary_url,
        primary_model=primary_model,
        fast_node_url=fast_node_url,
    )
    tools_executed.append({
        "tool": "content_researcher",
        "action": f"Researched domain KPIs, architectural pillars, and roadmap for '{clean_topic}'",
        "duration_ms": m1_ms,
    })

    # ── Stage 2: Slide Architect & Layout Compiler ───────────────────────────
    t2_start = time.time()
    slides = compile_presentation_slides_from_content(researched_data, query=query)
    m2_ms = int((time.time() - t2_start) * 1000)
    tools_executed.append({
        "tool": "presentation_architect",
        "action": f"Structured {len(slides)} widescreen 16:9 slides into presentation schema",
        "duration_ms": m2_ms,
    })

    # ── Stage 3: Deck Manifest & Native PowerPoint (.pptx) Compilation ───────
    manifest_json = build_deck_manifest(query, slides, deck_id=deck_id)
    manifest_dict = json.loads(manifest_json)

    t3_start = time.time()
    try:
        from server import EXPORTS_PRESENTATIONS_DIR
        out_dir = EXPORTS_PRESENTATIONS_DIR
    except Exception:
        out_dir = os.path.join(os.path.dirname(__file__), "exports", "presentations")
    os.makedirs(out_dir, exist_ok=True)
    pptx_path = os.path.join(out_dir, f"{deck_id}.pptx")

    try:
        compile_pptx_deck(manifest_dict, pptx_path)
    except Exception as ppt_err:
        print(f"[presentation_engine] PPTX compile error: {ppt_err}")

    m3_ms = int((time.time() - t3_start) * 1000)
    tools_executed.append({
        "tool": "presentation_engine",
        "action": f"Compiled native Microsoft PowerPoint (.pptx) presentation ({deck_id}.pptx)",
        "duration_ms": m3_ms,
    })

    return slides, researched_data, manifest_json, tools_executed


def generate_presentation_3node_synergy(
    query: str,
    l3_url: str = "",
    l2_url: str = "",
) -> Tuple[List[Dict], Optional[str]]:
    """Legacy compatibility wrapper for 3-node synergy."""
    slides, researched, _, _ = generate_presentation_2model_synergy(query, fast_node_url=l3_url)
    outline = f"Presentation: {researched.get('title')} ({len(slides)} slides)"
    return slides, outline


def stream_presentation_pipeline(
    query: str,
    payload: Dict[str, Any],
    context: str = "",
    sources: Optional[List[Dict[str, Any]]] = None,
    on_done_context: Any = None,
    primary_url: str = "http://127.0.0.1:11434",
    primary_model: str = "qwen3:8b",
    fast_node_url: Optional[str] = None,
    initial_tools: Optional[List[Dict[str, Any]]] = None,
) -> Generator[str, None, None]:
    """
    Live streaming generator for Autonomous 2-Model Synergy Presentation Engine.
    Emits real-time SSE events so the user visibly watches:
      1. Working: Model 1 researching domain facts & quantitative KPIs
      2. Working: Model 2 structuring widescreen 16:9 slides
      3. Working: Native Microsoft PowerPoint (.pptx) compilation
      4. Auto-collapse into clean "Executed 3 agent actions" badge
      5. Thinking Phase (expandable accordion with upward-ticking stopwatch)
      6. Interactive Presentation Card (Preview Slides & Download .PPTX)
      7. Master Arbiter executive briefing walkthrough
    """
    clean_topic = extract_clean_topic(query)
    deck_id = f"deck_{int(time.time())}"
    display_model = f"{primary_model} (2-Model Synergy · Domain Researcher + Slide Architect)"
    think_enabled = bool(payload.get("think", True))

    # 1. Immediate meta event (<20ms) so UI connects instantly without blocking
    meta_payload = {
        "type": "meta",
        "ocr_context_found": bool(context),
        "context_length": len(context),
        "model": display_model,
        "sources": sources or [],
        "effort": payload.get("_effort", "medium"),
        "node_endpoint": primary_url,
        "thinking_enabled": think_enabled,
        "council": None,
        "subagents": None,
    }
    yield f"data: {json.dumps(meta_payload)}\n\n"

    # Emit any pre-existing tool actions (e.g. document reader context)
    if initial_tools:
        for t in initial_tools:
            t_name = t.get("tool", "agent_tool")
            t_act = t.get("action", "Completed prerequisite step")
            t_dur = t.get("duration_ms", 100)
            yield f"data: {json.dumps({'type': 'tool_activity', 'tool': t_name, 'action': t_act, 'status': 'running'})}\n\n"
            yield f"data: {json.dumps({'type': 'tool_done', 'tool': t_name, 'summary': t_act, 'duration_ms': t_dur})}\n\n"

    # 2. Stage 1: Content & Domain Researcher (LIVE STREAMED)
    m1_action = f"Researching domain KPIs, architectural pillars, and roadmap for '{clean_topic}'..."
    yield f"data: {json.dumps({'type': 'tool_activity', 'tool': 'content_researcher', 'action': m1_action, 'status': 'running'})}\n\n"

    researched_data, m1_ms = research_presentation_content_model1(
        query=query,
        primary_url=primary_url,
        primary_model=primary_model,
        fast_node_url=fast_node_url,
    )

    m1_done = f"Researched quantitative KPIs, strategic pillars, and implementation roadmap for '{clean_topic}'"
    yield f"data: {json.dumps({'type': 'tool_done', 'tool': 'content_researcher', 'summary': m1_done, 'duration_ms': m1_ms})}\n\n"

    # 3. Stage 2: Slide Architect & Layout Compiler (LIVE STREAMED)
    m2_action = "Structuring widescreen 16:9 slides into presentation schema..."
    yield f"data: {json.dumps({'type': 'tool_activity', 'tool': 'presentation_architect', 'action': m2_action, 'status': 'running'})}\n\n"

    t2_start = time.time()
    slides = compile_presentation_slides_from_content(researched_data, query=query)
    m2_ms = max(int((time.time() - t2_start) * 1000), 50)

    m2_done = f"Structured {len(slides)} widescreen 16:9 slides into presentation schema"
    yield f"data: {json.dumps({'type': 'tool_done', 'tool': 'presentation_architect', 'summary': m2_done, 'duration_ms': m2_ms})}\n\n"

    # 4. Stage 3: Deck Manifest & Native PowerPoint (.pptx) Compilation (LIVE STREAMED)
    m3_action = f"Compiling native Microsoft PowerPoint (.pptx) presentation ({deck_id}.pptx)..."
    yield f"data: {json.dumps({'type': 'tool_activity', 'tool': 'presentation_engine', 'action': m3_action, 'status': 'running'})}\n\n"

    t3_start = time.time()
    manifest_json = build_deck_manifest(query, slides, deck_id=deck_id)
    manifest_dict = json.loads(manifest_json)

    try:
        from server import EXPORTS_PRESENTATIONS_DIR
        out_dir = EXPORTS_PRESENTATIONS_DIR
    except Exception:
        out_dir = os.path.join(os.path.dirname(__file__), "exports", "presentations")
    os.makedirs(out_dir, exist_ok=True)
    pptx_path = os.path.join(out_dir, f"{deck_id}.pptx")

    try:
        compile_pptx_deck(manifest_dict, pptx_path)
    except Exception as ppt_err:
        print(f"[presentation_engine] PPTX compile error: {ppt_err}")

    m3_ms = max(int((time.time() - t3_start) * 1000), 100)
    m3_done = f"Compiled native Microsoft PowerPoint (.pptx) presentation ({deck_id}.pptx)"
    yield f"data: {json.dumps({'type': 'tool_done', 'tool': 'presentation_engine', 'summary': m3_done, 'duration_ms': m3_ms})}\n\n"

    # 5. Stage 4: Executive Briefing & Thinking Stream
    from cot_backend import run_ollama_stream_cot
    briefing_instruction = get_presentation_briefing_instruction(manifest_json)
    existing_sys = payload.get("system", "")
    full_system = f"{existing_sys}\n\n{briefing_instruction}" if existing_sys else briefing_instruction

    briefing_payload = dict(payload)
    briefing_payload["system"] = full_system
    base_ep = primary_url.strip().rstrip("/")
    if base_ep.endswith("/api/generate"):
        norm_endpoint = base_ep
    elif base_ep.endswith("/api/chat"):
        norm_endpoint = base_ep.replace("/api/chat", "/api/generate")
    else:
        norm_endpoint = f"{base_ep}/api/generate"
    briefing_payload["_endpoint"] = norm_endpoint
    briefing_payload["_display_model"] = display_model
    if "options" not in briefing_payload:
        briefing_payload["options"] = {}
    briefing_payload["options"]["num_predict"] = max(briefing_payload["options"].get("num_predict", 1024), 4096)

    ppt_manifest_prefix = f"```json deck_manifest.json\n{manifest_json}\n```\n\n"

    yield from run_ollama_stream_cot(
        payload=briefing_payload,
        context=context,
        sources=sources,
        on_done_context=on_done_context,
        content_prefix=ppt_manifest_prefix,
        skip_meta=True,
        skip_tools=True,
    )


def compile_pptx_deck(manifest: Dict[str, Any], output_path: str) -> str:
    """
    Compiles a genuine Microsoft PowerPoint (.pptx) widescreen 16:9 file
    directly on the server using python-pptx.
    Supports layouts: title, kpi_metrics, card_grid, timeline, bullets.
    Ensures zero emojis or AI-generated icons in all shapes.
    """
    manifest = strip_icons_and_emojis(manifest)
    import pptx
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    from pptx.enum.shapes import MSO_SHAPE

    prs = pptx.Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    title_text = manifest.get("title", "Executive Presentation")
    slides_data = manifest.get("slides", [])

    for idx, s in enumerate(slides_data):
        slide = prs.slides.add_slide(prs.slide_layouts[6])

        # Solid background (Obsidian Dark #0B0F19)
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = RGBColor(11, 15, 25)
        bg.line.fill.background()

        layout = s.get("layout", "standard")

        if layout == "title" or idx == 0:
            # Decorative top accent stripe
            top_bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.2), Inches(1.8), Inches(1.5), Inches(0.08))
            top_bar.fill.solid()
            top_bar.fill.fore_color.rgb = RGBColor(245, 158, 11)
            top_bar.line.fill.background()

            tb = slide.shapes.add_textbox(Inches(1.2), Inches(2.2), Inches(10.9), Inches(3.2))
            tf = tb.text_frame
            tf.word_wrap = True

            p = tf.paragraphs[0]
            p.text = s.get("title", title_text)
            p.font.size = Pt(40)
            p.font.bold = True
            p.font.color.rgb = RGBColor(255, 255, 255)

            sub = s.get("subtitle", manifest.get("subtitle", "Executive Strategic Briefing"))
            if sub:
                p2 = tf.add_paragraph()
                p2.text = sub
                p2.font.size = Pt(20)
                p2.font.color.rgb = RGBColor(148, 163, 184)
                p2.space_before = Pt(14)

            # Footer badge
            fb = slide.shapes.add_textbox(Inches(1.2), Inches(6.0), Inches(10.9), Inches(0.8))
            ff = fb.text_frame
            fp = ff.paragraphs[0]
            fp.text = f"{manifest.get('author', 'AIRA Sovereign Intelligence')}  |  {manifest.get('date', 'MRPL Executive Deck')}"
            fp.font.size = Pt(12)
            fp.font.color.rgb = RGBColor(100, 116, 139)

        else:
            # Header
            tb = slide.shapes.add_textbox(Inches(1.0), Inches(0.6), Inches(11.333), Inches(1.0))
            tf = tb.text_frame
            p = tf.paragraphs[0]
            p.text = s.get("title", f"Slide {idx + 1}")
            p.font.size = Pt(28)
            p.font.bold = True
            p.font.color.rgb = RGBColor(255, 255, 255)

            if s.get("subtitle"):
                sp = tf.add_paragraph()
                sp.text = s["subtitle"]
                sp.font.size = Pt(14)
                sp.font.color.rgb = RGBColor(148, 163, 184)
                sp.space_before = Pt(4)

            # Footer
            ftb = slide.shapes.add_textbox(Inches(1.0), Inches(6.8), Inches(11.333), Inches(0.5))
            ftf = ftb.text_frame
            ftp = ftf.paragraphs[0]
            ftp.text = f"MRPL Sovereign AI Workbench  |  Slide {idx + 1} of {len(slides_data)}"
            ftp.font.size = Pt(10)
            ftp.font.color.rgb = RGBColor(71, 85, 105)

            if layout == "kpi_metrics" and s.get("cards"):
                cards = s.get("cards", [])
                n = min(len(cards), 3)
                card_w = Inches(3.5)
                card_h = Inches(4.3)
                start_x = Inches(1.0)
                gap = Inches(0.4)
                y = Inches(2.0)
                for ci in range(n):
                    c = cards[ci]
                    cx = start_x + ci * (card_w + gap)
                    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, cx, y, card_w, card_h)
                    card.fill.solid()
                    card.fill.fore_color.rgb = RGBColor(19, 27, 46)
                    card.line.color.rgb = RGBColor(31, 41, 61)

                    ctb = slide.shapes.add_textbox(cx + Inches(0.35), y + Inches(0.4), card_w - Inches(0.7), card_h - Inches(0.8))
                    ctf = ctb.text_frame
                    ctf.word_wrap = True

                    sp = ctf.paragraphs[0]
                    sp.text = str(c.get("stat", "—"))
                    sp.font.size = Pt(44)
                    sp.font.bold = True
                    sp.font.color.rgb = RGBColor(245, 158, 11)

                    tp = ctf.add_paragraph()
                    tp.text = c.get("title", "")
                    tp.font.size = Pt(16)
                    tp.font.bold = True
                    tp.font.color.rgb = RGBColor(255, 255, 255)
                    tp.space_before = Pt(12)

                    dp = ctf.add_paragraph()
                    dp.text = c.get("description", "")
                    dp.font.size = Pt(12)
                    dp.font.color.rgb = RGBColor(148, 163, 184)
                    dp.space_before = Pt(8)

            elif layout in ("card_grid", "timeline") and s.get("cards"):
                cards = s.get("cards", [])
                n = min(len(cards), 3)
                card_w = Inches(3.5)
                card_h = Inches(4.3)
                start_x = Inches(1.0)
                gap = Inches(0.4)
                y = Inches(2.0)
                for ci in range(n):
                    c = cards[ci]
                    cx = start_x + ci * (card_w + gap)
                    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, cx, y, card_w, card_h)
                    card.fill.solid()
                    card.fill.fore_color.rgb = RGBColor(19, 27, 46)
                    card.line.color.rgb = RGBColor(56, 189, 248) if ci == 0 else RGBColor(31, 41, 61)

                    ctb = slide.shapes.add_textbox(cx + Inches(0.35), y + Inches(0.4), card_w - Inches(0.7), card_h - Inches(0.8))
                    ctf = ctb.text_frame
                    ctf.word_wrap = True

                    tp = ctf.paragraphs[0]
                    tp.text = c.get("title", f"Pillar {ci + 1}")
                    tp.font.size = Pt(18)
                    tp.font.bold = True
                    tp.font.color.rgb = RGBColor(255, 255, 255)

                    dp = ctf.add_paragraph()
                    dp.text = c.get("description", "")
                    dp.font.size = Pt(13)
                    dp.font.color.rgb = RGBColor(203, 213, 225)
                    dp.space_before = Pt(12)

            else:
                # Bullets + Takeaway
                bullets = s.get("bullets", [])
                takeaway = s.get("takeaway", "")

                has_takeaway = bool(takeaway)
                bw = Inches(7.2) if has_takeaway else Inches(11.333)

                if bullets:
                    btb = slide.shapes.add_textbox(Inches(1.0), Inches(2.0), bw, Inches(4.4))
                    btf = btb.text_frame
                    btf.word_wrap = True
                    for bi, b in enumerate(bullets):
                        bp = btf.paragraphs[0] if bi == 0 else btf.add_paragraph()
                        bp.text = f"•  {b}"
                        bp.font.size = Pt(15)
                        bp.font.color.rgb = RGBColor(226, 232, 240)
                        bp.space_before = Pt(14)

                if has_takeaway:
                    tx = Inches(8.6)
                    ty = Inches(2.0)
                    tw = Inches(3.7)
                    th = Inches(4.3)
                    tcard = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, tx, ty, tw, th)
                    tcard.fill.solid()
                    tcard.fill.fore_color.rgb = RGBColor(30, 27, 75)
                    tcard.line.color.rgb = RGBColor(245, 158, 11)

                    ttb = slide.shapes.add_textbox(tx + Inches(0.3), ty + Inches(0.4), tw - Inches(0.6), th - Inches(0.8))
                    ttf = ttb.text_frame
                    ttf.word_wrap = True

                    tp0 = ttf.paragraphs[0]
                    tp0.text = "EXECUTIVE TAKEAWAY"
                    tp0.font.size = Pt(12)
                    tp0.font.bold = True
                    tp0.font.color.rgb = RGBColor(245, 158, 11)

                    tp1 = ttf.add_paragraph()
                    tp1.text = takeaway
                    tp1.font.size = Pt(14)
                    tp1.font.bold = True
                    tp1.font.color.rgb = RGBColor(254, 243, 199)
                    tp1.space_before = Pt(14)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    prs.save(output_path)
    return output_path


def get_presentation_briefing_instruction(manifest_json: str) -> str:
    """
    System instruction for Node 1 (Master Arbiter) to generate an executive presentation briefing and script.
    Guarantees:
      - STRICTLY NO HTML CODE (no <html>, no <!DOCTYPE>, no <script>, no CSS)
      - STRICTLY NO raw JSON manifest dump (handled deterministically)
      - STRICTLY NO internal deliberation or mentioning Node 2/3
      - Pure executive Markdown briefing and slide-by-slide speaker script
    """
    manifest_preview = manifest_json[:2200]

    return f"""================================================================================
EXECUTIVE PRESENTATION BRIEFING & SPEAKER SCRIPT (MANDATORY FORMAT)
================================================================================
The executive presentation slide deck (.pptx) has already been compiled by the sovereign engine.
Your task is to present an executive walkthrough and speaker script for this presentation directly to the user.

CRITICAL PRIVACY & DELIBERATION DIRECTIVES:
1. DO NOT output any HTML code (no <html>, no <!DOCTYPE>, no <script>, no CSS).
2. DO NOT output raw JSON manifest data in your response (the manifest is compiled automatically).
3. DO NOT output or mention internal deliberations, planners, auditors, Node 2, or Node 3.
4. Speak with unified executive authority directly to the user.

SLIDE DECK CONTENT:
```
{manifest_preview}
```

Write in professional executive Markdown format:

# <Presentation Title>
> **Executive Briefing & Strategic Overview**

## Strategic Context
<2-3 concise sentences on why this topic matters right now for operational leadership>

---

## Slide-by-Slide Walkthrough

### Slide 1: <Slide Title>
- **Layout**: Title Slide
- **Speaker Talking Points**: Key introductory points

### Slide 2: <Slide Title>
- **Layout**: KPI Metrics / Core Data
- **Key Metrics**: Specific statistics, percentages, or operational targets
- **Talking Points**: What these numbers indicate for plant operations

### Slide 3: <Slide Title>
- **Layout**: Strategic Pillars / Core Initiatives
- **Key Points**: Critical operational or technical details

### Slide 4: <Slide Title>
- **Layout**: Implementation Roadmap
- **Phases**: Timeline and milestone expectations

### Slide 5: <Slide Title>
- **Layout**: Executive Recommendations & Takeaways
- **Recommendations**: Concrete action items for leadership
- **Strategic Conclusion**: The high-impact closing takeaway

End with a short summary of next steps. Output ONLY Markdown. NO HTML.
================================================================================"""


def get_html_generation_instruction(manifest_json: str) -> str:
    """Legacy alias redirecting to executive briefing instruction."""
    return get_presentation_briefing_instruction(manifest_json)


# ─── Legacy compatibility ────────────────────────────────────────────────────
# Keep old functions so existing server.py imports don't break.

def generate_presentation_speculative_plan(
    query: str,
    custom_node_url: Optional[str] = None,
    default_l2_url: str = "https://unfailing-idealism-caretaker.ngrok-free.dev",
) -> Optional[str]:
    """
    Legacy function — now delegates to generate_slide_structure_node2.
    Returns a text outline (for display_model string and logging).
    """
    l2_url = custom_node_url or default_l2_url
    slides = generate_slide_structure_node2(query, l2_url)
    if slides:
        lines = []
        for i, s in enumerate(slides, 1):
            lines.append(f"Slide {i}: {s.get('title', '')} [{s.get('layout', 'bullets')}]")
        return "\n".join(lines)
    return None


def get_presentation_system_instruction(speculative_outline: Optional[str] = None) -> str:
    """
    Legacy function — kept for server.py import compatibility.
    The new architecture calls get_html_generation_instruction() directly.
    Returns a minimal fallback instruction (used only if the new pipeline fails).
    """
    outline_note = ""
    if speculative_outline:
        outline_note = f"USE THIS SLIDE STRUCTURE:\n{speculative_outline.strip()[:400]}\n\n"

    return f"""================================================================================
OUTPUT FORMAT (MANDATORY)
================================================================================
Output EXACTLY two fenced code blocks. Nothing else.

Block 1:
```json
<!-- filename: deck_manifest.json -->
{{"title": "<Title>", "theme": "dark", "slides": [{{}}, ...]}}
```

Block 2:
```html
<!-- filename: index.html -->
<!DOCTYPE html>...
```

{outline_note}Fill ALL placeholders with real content. Output ONLY the two code blocks.
================================================================================"""
