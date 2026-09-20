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
    Constructs a concise, imperative system prompt that forces the LLM to output
    exactly two fenced code blocks (deck_manifest.json and index.html).
    Designed to work reliably with small 8B quantized models.
    """
    outline_note = ""
    if speculative_outline:
        outline_note = f"USE THIS SLIDE STRUCTURE:\n{speculative_outline.strip()[:600]}\n\n"

    return f"""================================================================================
OUTPUT FORMAT REQUIREMENT (MANDATORY — DO NOT DEVIATE)
================================================================================
You MUST output EXACTLY two fenced code blocks. Output NOTHING else — no plain text, no explanations, no "Slide 1:", no markdown headings.

BLOCK 1 — deck_manifest.json:
```json
<!-- filename: deck_manifest.json -->
{{
  "title": "<Presentation Title>",
  "subtitle": "<Subtitle>",
  "author": "AIRA Sovereign Intelligence",
  "theme": "dark",
  "slides": [
    {{"title": "<Title>", "subtitle": "<Subtitle>", "layout": "title"}},
    {{"title": "<Title>", "layout": "kpi_metrics", "cards": [
      {{"stat": "99.8%", "title": "<Metric>", "description": "<Detail>"}},
      {{"stat": "2x", "title": "<Metric>", "description": "<Detail>"}},
      {{"stat": "0ms", "title": "<Metric>", "description": "<Detail>"}}
    ]}},
    {{"title": "<Title>", "layout": "card_grid", "cards": [
      {{"title": "<Point>", "description": "<Detail>"}},
      {{"title": "<Point>", "description": "<Detail>"}},
      {{"title": "<Point>", "description": "<Detail>"}}
    ]}},
    {{"title": "<Title>", "layout": "timeline", "cards": [
      {{"title": "Phase 1", "description": "<Detail>"}},
      {{"title": "Phase 2", "description": "<Detail>"}},
      {{"title": "Phase 3", "description": "<Detail>"}}
    ]}},
    {{"title": "<Title>", "layout": "bullets",
      "bullets": ["<Point 1>", "<Point 2>", "<Point 3>"],
      "takeaway": "<Strategic conclusion>"
    }}
  ]
}}
```

BLOCK 2 — index.html (interactive 16:9 slide deck with keyboard navigation, dark theme #0B0F19, Tailwind CDN):
```html
<!-- filename: index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Executive Presentation</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100">
  <!-- slide carousel with prev/next buttons and keyboard navigation -->
</body>
</html>
```

{outline_note}Fill in ALL placeholder values with real, specific content relevant to the user's topic. Replace every <...> with actual content. Output ONLY the two code blocks.
================================================================================"""
