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


def compile_pptx_deck(manifest: Dict[str, Any], output_path: str) -> str:
    """
    Compiles a genuine Microsoft PowerPoint (.pptx) widescreen 16:9 file
    directly on the server using python-pptx.
    Supports layouts: title, kpi_metrics, card_grid, timeline, bullets.
    """
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
            fp.text = f"{manifest.get('author', 'AIRA Sovereign Intelligence')}  •  {manifest.get('date', 'MRPL Executive Deck')}"
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
    System instruction for Node 1 to generate an executive presentation briefing and script.
    Guarantees that NO HTML CODE is emitted in the chat.
    """
    manifest_preview = manifest_json[:2000]

    return f"""================================================================================
EXECUTIVE PRESENTATION BRIEFING & SPEAKER SCRIPT (MANDATORY FORMAT)
================================================================================
The presentation slide deck has been compiled by the sovereign engine.
Your task is to present an executive walkthrough and speaker script for this presentation.

DO NOT output any HTML code (no <html>, no <!DOCTYPE>, no <script>, no CSS).
Write in professional executive Markdown format:

# <Presentation Title>
> **Executive Briefing & Strategic Overview**

## Strategic Context
<2-3 concise sentences on why this topic matters right now for MRPL leadership>

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
