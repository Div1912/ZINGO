"""
ZINGO — Autonomous Executive Presentation & Slide Deck Engine
=============================================================
Powers end-to-end professional presentation generation:
  1. Strategic Planning Phase: Conducts audience analysis, narrative arc design,
     and slide-by-slide layout blueprinting before code synthesis.
  2. Dual Generation: Produces both interactive 16:9 HTML/Tailwind slides (for Live Sandbox)
     and structured deck_manifest.json (for client-side zero-overhead .pptx compilation via PptxGenJS).
  3. Visual Standard: Strict McKinsey/Stripe-grade layouts (Hero, 3-Card KPI Matrix,
     Comparison Grids, Milestone Timelines, Strategic Takeaways).
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional
import requests


PRESENTATION_TRIGGER_WORDS = [
    r"\bppt\b",
    r"\bpowerpoint\b",
    r"\bpresentation\b",
    r"\bslide deck\b",
    r"\bslides\b",
    r"\bpitch deck\b",
    r"\bexecutive deck\b",
    r"\bkeynote\b",
]

PRESENTATION_REGEX = re.compile(
    "|".join(PRESENTATION_TRIGGER_WORDS),
    re.IGNORECASE,
)


def is_presentation_intent(query: str) -> bool:
    """
    Detects if the user query is asking for a presentation, PowerPoint, or slide deck.
    """
    if not query:
        return False
    q_clean = query.strip()
    return bool(PRESENTATION_REGEX.search(q_clean))


def generate_presentation_speculative_plan(
    query: str,
    custom_node_url: Optional[str] = None,
    default_l2_url: str = "https://unfailing-idealism-caretaker.ngrok-free.dev",
) -> Optional[str]:
    """
    Queries Node 2 (qwen2.5-vl:3b worker) to rapidly outline a 5-6 slide presentation blueprint
    in < 1 second.
    """
    if not query or len(query.strip()) < 10:
        return None

    l2_base = (custom_node_url or default_l2_url).strip().rstrip("/")
    if l2_base.endswith("/api/generate"):
        l2_endpoint = l2_base
    elif l2_base.endswith("/api/chat"):
        l2_endpoint = l2_base.replace("/api/chat", "/api/generate")
    else:
        l2_endpoint = f"{l2_base}/api/generate"

    prompt = f"""Task: {query.strip()[:1000]}

Provide a concise 5-6 slide strategic presentation outline.
Specify for each slide:
- Slide number & Title
- Recommended layout: [title | kpi_metrics | card_grid | timeline | bullets]
- 1-line key message"""

    payload = {
        "model": "qwen2.5-vl:3b",
        "prompt": prompt,
        "system": (
            "You are an executive McKinsey presentation architect. Output ONLY a concise slide-by-slide "
            "structural outline (5-6 slides max). Keep it under 150 words. No intro or outro."
        ),
        "stream": False,
        "options": {
            "num_predict": 200,
            "temperature": 0.2,
        },
        "keep_alive": -1,
    }

    try:
        t0 = time.time()
        resp = requests.post(
            l2_endpoint,
            json=payload,
            headers={"ngrok-skip-browser-warning": "true", "User-Agent": "ZingoPresentationPlanner/1.0"},
            timeout=(1.5, 3.5),
        )
        if resp.status_code == 200:
            plan = resp.json().get("response", "").strip()
            elapsed_ms = int((time.time() - t0) * 1000)
            if plan and len(plan) > 30:
                print(f"[presentation_engine] Node 2 generated slide outline in {elapsed_ms}ms.")
                return plan
    except Exception as err:
        print(f"[presentation_engine] Node 2 outline skipped (non-critical): {err}")

    return None


def get_presentation_system_instruction(speculative_outline: Optional[str] = None) -> str:
    """
    Constructs the system prompt that forces the LLM to plan the presentation
    deeply before generating code, and emit both deck_manifest.json and an interactive index.html.
    """
    outline_block = ""
    if speculative_outline:
        outline_block = f"""
[ARCHITECTURAL BLUEPRINT FROM NODE 2 FAST PLANNER]:
{speculative_outline}
"""

    return f"""
================================================================================
EXECUTIVE PRESENTATION GENERATION PROTOCOL (MCKINSEY / STRIPE STANDARD)
================================================================================
The user has requested an executive presentation / slide deck. You must execute this in two distinct, mandatory phases:
{outline_block}
--------------------------------------------------------------------------------
PHASE 1: STRATEGIC PRESENTATION PLANNING (OUTPUT THIS FIRST)
--------------------------------------------------------------------------------
Before generating any slide code or files, you MUST provide a structured executive plan:
1. Target Audience & Executive Objective (e.g. C-Suite, Engineering Leadership, Plant Operations)
2. Narrative Arc & Key Conviction (e.g. Current Bottlenecks -> Quantifiable Impact -> Technical Solution -> Roadmap)
3. Slide-by-Slide Structural Layout Plan (5 to 7 slides):
   - Slide 1: Hero Cover (`title`)
   - Slide 2: Strategic Challenge / Market Context (`card_grid` or `bullets`)
   - Slide 3: Executive Metrics / KPI Impact (`kpi_metrics` - 3 big bold statistics)
   - Slide 4: Deep Dive / Core Architecture (`card_grid` with 3 feature cards)
   - Slide 5: Execution Roadmap / Phased Timeline (`timeline` with 3 sequential steps)
   - Slide 6: Strategic Recommendations & Next Actions (`bullets` + strategic takeaway callout)

--------------------------------------------------------------------------------
PHASE 2: CODE & DATA MANIFEST ARTIFACTS
--------------------------------------------------------------------------------
You must emit TWO distinct multi-file blocks that the ZINGO system compiles directly into an interactive live canvas and native Microsoft PowerPoint (.pptx) file:

FILE 1: `deck_manifest.json`
Provide a clean JSON manifest defining all slides and structured metadata:
```json
<!-- filename: deck_manifest.json -->
{{
  "title": "Presentation Title",
  "subtitle": "Strategic Executive Briefing",
  "author": "ZINGO Sovereign Intelligence",
  "theme": "dark",
  "slides": [
    {{
      "title": "Hero Title",
      "subtitle": "Subtitle explaining the deck",
      "layout": "title"
    }},
    {{
      "title": "Executive Performance Metrics",
      "layout": "kpi_metrics",
      "cards": [
        {{ "stat": "99.8%", "title": "Plant Availability", "description": "Continuous refinery operational uptime" }},
        {{ "stat": "14.2 ms", "title": "Inference Latency", "description": "Local sovereign response time" }},
        {{ "stat": "0.00", "title": "Cloud Leakage", "description": "Zero external telemetry exfiltration" }}
      ]
    }},
    {{
      "title": "Strategic Pillar Comparison",
      "layout": "card_grid",
      "cards": [
        {{ "title": "Pillar 1: Data Sovereignty", "description": "All telemetry confined strictly to on-premise hardware." }},
        {{ "title": "Pillar 2: Real-Time Safety", "description": "Automated anomaly prevention for high-pressure units." }},
        {{ "title": "Pillar 3: Autonomous Synthesis", "description": "Instant translation of raw telemetry into executive decks." }}
      ]
    }},
    {{
      "title": "Phased Implementation Roadmap",
      "layout": "timeline",
      "cards": [
        {{ "title": "Phase 1: Deployment", "description": "Cluster setup and edge node pairing." }},
        {{ "title": "Phase 2: Live Integration", "description": "SCADA / DCS data ingestion and sensor mapping." }},
        {{ "title": "Phase 3: Autonomous Run", "description": "Zero-intervention reporting and predictive maintenance." }}
      ]
    }},
    {{
      "title": "Strategic Recommendations & Next Steps",
      "layout": "bullets",
      "bullets": [
        "Immediate approval of the sovereign cluster architecture.",
        "Commissioning secondary GPU worker node for load balancing.",
        "Enforcing strict on-premise network isolation policies."
      ],
      "takeaway": "ZINGO delivers immediate operational superiority without compromising PSU data security."
    }}
  ]
}}
```

FILE 2: `index.html`
An interactive 16:9 widescreen HTML presentation deck utilizing Tailwind CSS (loaded via CDN https://cdn.tailwindcss.com) featuring:
- Keyboard navigation (Left Arrow `←` for previous, Right Arrow `→` or Spacebar for next, 'F' for fullscreen).
- Touch/click navigation buttons on screen with a progress bar and slide counter (`Slide X of Y`).
- Dark executive styling (`#0B0F19` deep slate background, glassmorphic cards `#1E293B`, indigo `#6366F1` accents, crisp emerald `#10B981` metric badges).
- No bullet-point walls. Every slide must feature spacious visual layout, 3-card grids, or bold statistics.

Format `index.html` with:
```html
<!-- filename: index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Executive Presentation</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Interactive slide styling and carousel script -->
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col justify-center items-center p-4">
  <!-- 16:9 presentation container with slides and controls -->
</body>
</html>
```

Always follow this exact structure: Strategic Plan first, then `deck_manifest.json`, then `index.html`.
================================================================================
"""
