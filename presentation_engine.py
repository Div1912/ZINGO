"""
ZINGO — Autonomous Executive Presentation Engine (Dual-Node Architecture)
=========================================================================
Two-stage pipeline:
  Stage 1: Node 2 (Qwen 2.5-VL 3B) → generates structured slide JSON quickly
  Stage 2: Python backend builds deck_manifest.json deterministically (guaranteed format)
  Stage 3: Node 1 (Qwen 3 8B) → generates interactive HTML using the manifest

This guarantees the frontend always receives a valid deck_manifest.json code block.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple
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
    if not query:
        return False
    return bool(PRESENTATION_REGEX.search(query.strip()))


def _call_node2_sync(
    prompt: str,
    system: str,
    l2_url: str,
    num_predict: int = 600,
    timeout: tuple = (2.0, 8.0),
) -> Optional[str]:
    """Generic synchronous call to Node 2."""
    base = l2_url.strip().rstrip("/")
    if base.endswith("/api/generate"):
        endpoint = base
    elif base.endswith("/api/chat"):
        endpoint = base.replace("/api/chat", "/api/generate")
    else:
        endpoint = f"{base}/api/generate"

    payload = {
        "model": "qwen2.5-vl:3b",
        "prompt": prompt,
        "system": system,
        "stream": False,
        "options": {"num_predict": num_predict, "temperature": 0.1},
        "keep_alive": -1,
    }
    headers = {"ngrok-skip-browser-warning": "true", "User-Agent": "ZingoPPTEngine/2.0"}
    try:
        resp = requests.post(endpoint, json=payload, headers=headers, timeout=timeout)
        if resp.status_code == 200:
            return resp.json().get("response", "").strip()
    except Exception as err:
        print(f"[presentation_engine] Node 2 call failed: {err}")
    return None


def generate_slide_structure_node2(
    query: str,
    l2_url: str,
) -> Optional[List[Dict]]:
    """
    Stage 1: Ask Node 2 to generate slide content as a simple JSON array.
    Returns a list of slide dicts, or None on failure.
    Each slide has: title, layout, and layout-specific fields.
    """
    prompt = f"""Generate a professional presentation for: {query.strip()[:600]}

Output ONLY a valid JSON array. No other text before or after the JSON.
Each slide must have 'title' and 'layout'. Use 5-6 slides.

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
        "Start your response with '[' and end with ']'."
    )

    raw = _call_node2_sync(prompt, system, l2_url, num_predict=800, timeout=(2.0, 10.0))
    if not raw:
        return None

    # Extract JSON array from the response
    # Try direct parse first
    for candidate in [raw, raw.strip()]:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, list) and len(parsed) >= 2:
                return parsed
        except Exception:
            pass

    # Try to extract JSON array using regex
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


def build_default_slides(query: str) -> List[Dict]:
    """
    Fallback: build a reasonable slide structure from just the query topic.
    Used when Node 2 fails or is offline.
    """
    topic = query.strip()[:80]
    return [
        {"title": topic, "subtitle": "Executive Strategic Briefing", "layout": "title"},
        {
            "title": "Key Performance Indicators",
            "layout": "kpi_metrics",
            "cards": [
                {"stat": "—", "title": "Primary Metric", "description": "Core performance indicator"},
                {"stat": "—", "title": "Secondary Metric", "description": "Supporting metric"},
                {"stat": "—", "title": "Target", "description": "Strategic goal"},
            ],
        },
        {
            "title": "Strategic Overview",
            "layout": "card_grid",
            "cards": [
                {"title": "Opportunity", "description": "Market or operational opportunity"},
                {"title": "Approach", "description": "Recommended methodology"},
                {"title": "Impact", "description": "Expected outcomes"},
            ],
        },
        {
            "title": "Implementation Roadmap",
            "layout": "timeline",
            "cards": [
                {"title": "Phase 1", "description": "Initiation and planning"},
                {"title": "Phase 2", "description": "Execution and rollout"},
                {"title": "Phase 3", "description": "Review and optimization"},
            ],
        },
        {
            "title": "Recommendations",
            "layout": "bullets",
            "bullets": [
                f"Prioritize high-impact initiatives for {topic}",
                "Establish clear KPIs and review cadence",
                "Secure stakeholder alignment before execution",
            ],
            "takeaway": f"Strategic action on {topic} is critical for competitive advantage.",
        },
    ]


def build_deck_manifest(
    query: str,
    slides: List[Dict],
    author: str = "AIRA Sovereign Intelligence",
) -> str:
    """
    Stage 2: Build the complete deck_manifest.json from validated slide list.
    This is pure deterministic Python — no model involved.
    Returns the formatted JSON string.
    """
    title = query.strip()[:80] if query else "Executive Presentation"
    # Ensure first slide is a title slide with proper subtitle
    if slides and slides[0].get("layout") != "title":
        slides = [{"title": title, "subtitle": "Executive Strategic Briefing", "layout": "title"}] + slides

    manifest = {
        "title": title,
        "subtitle": slides[0].get("subtitle", "Executive Strategic Briefing") if slides else "Executive Strategic Briefing",
        "author": author,
        "theme": "dark",
        "slides": slides,
    }
    return json.dumps(manifest, indent=2, ensure_ascii=False)


def get_html_generation_instruction(manifest_json: str) -> str:
    """
    Stage 3: System instruction for Node 1 to generate ONLY the index.html.
    The manifest is provided so Node 1 doesn't need to think about content structure.
    """
    # Trim manifest for context window efficiency
    manifest_preview = manifest_json[:2000]

    return f"""================================================================================
GENERATE ONLY THE index.html CODE BLOCK — NOTHING ELSE
================================================================================
The slide data (deck_manifest.json) has already been generated. Your ONLY task is to create an interactive HTML slide presentation using the data below.

SLIDE DATA:
```
{manifest_preview}
```

Output EXACTLY ONE fenced code block:
```html index.html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Executive Presentation</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#0B0F19] text-white flex flex-col items-center justify-center min-h-screen">
  <!-- 
    Requirements:
    - Display slides from the JSON data above (title, layout, cards, bullets etc.)
    - 16:9 slide aspect ratio, dark theme #0B0F19
    - Prev/Next arrow navigation buttons
    - Keyboard arrow key navigation
    - Slide counter (e.g. "2 / 5")
    - Each layout renders differently:
      * title: large centered title + subtitle
      * kpi_metrics: 3 stat cards with large number
      * card_grid: 3 cards in a grid
      * timeline: horizontal steps
      * bullets: bullet list + highlighted takeaway box
  -->
</body>
</html>
```

Use REAL content from the slide data above. Fill in actual titles, stats, bullets. DO NOT use placeholders.
Output ONLY the html code block. No explanation text before or after.
================================================================================"""


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
