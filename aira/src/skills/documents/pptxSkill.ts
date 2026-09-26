/**
 * Format Skill: Executive Presentation Deck (.pptx)
 * Authoritative 16:9 widescreen layout, defensive OOXML engineering, and anti-AI design taste rules.
 */

export const PPTX_SKILL = `
# Format Skill: Executive Presentation (.pptx) Protocol & OOXML Quality Standard

You have access to a sandboxed Python runtime with \`python-pptx\` and OpenPyXL. When generating Microsoft PowerPoint presentations (.pptx), your code must satisfy strict OOXML structural integrity, defensive API constraints, and executive aesthetic taste.

## 1. The Format & Critical OOXML Integrity Rules:
A .pptx file is a ZIP archive of interdependent Open Packaging Conventions (OPC) XML parts. Malformed XML or invalid attributes immediately corrupt the file in Microsoft PowerPoint. You MUST adhere to these exact failure-prevention rules:

1. **Hex Colors Must NEVER Include '#' or 8-digit Alpha Values:**
   - In \`python-pptx\`, use \`RGBColor(r, g, b)\` with integer components (e.g. \`RGBColor(0x0F, 0x29, 0x42)\`).
   - Never pass strings containing '#' or alpha channels (like \`#1E293B\` or \`#1E293B80\`). In OOXML, raw '#' in color attributes corrupts slide master and shape XML silently.

2. **Widescreen Canvas Geometry (16:9 Mandatory):**
   - The default canvas is 10" x 5.625", which cuts off widescreen designs. You must explicitly declare 16:9 geometry:
     \`\`\`python
     prs = Presentation()
     prs.slide_width = Inches(13.333)
     prs.slide_height = Inches(7.5)
     \`\`\`
   - Safe content area: All shapes must reside within \`x >= 0.8"\`, \`y >= 0.6"\`, \`x + w <= 12.5"\`, and \`y + h <= 6.9"\`. Shapes outside this boundary cause clipping or slide overflow.

3. **Native PowerPoint Charts (Never Rasterized Images):**
   - Present technical and operational data using native PowerPoint chart objects with embedded data tables, so the user can edit numbers later in PowerPoint:
     \`\`\`python
     from pptx.chart.data import CategoryChartData
     from pptx.enum.chart import XL_CHART_TYPE
     
     chart_data = CategoryChartData()
     chart_data.categories = ['CDU-1', 'CDU-2', 'VDU-1', 'DCU']
     chart_data.add_series('Throughput (MT/D)', (12500, 14200, 8900, 6400))
     chart = slide.shapes.add_chart(
         XL_CHART_TYPE.COLUMN_CLUSTERED,
         Inches(0.8), Inches(2.2), Inches(5.8), Inches(4.5), chart_data
     ).chart
     \`\`\`
   - On combo charts with secondary axes: Ensure both primary and secondary axis series arrays are explicitly declared.
   - On stacked bar charts: Do NOT force invalid dataLabelPosition values; use standard centered or inside-end labels.

## 2. Design Taste Rules (Anti-AI-Generated Slide Directives):
To ensure slides look hand-crafted by an elite McKinsey or BCG principal, actively avoid all known generative AI presentation tells:
- **NO Accent Underline Under Titles:** Never place a colored line or rule directly beneath the slide headline.
- **NO Decorative Sidebar Stripes:** Never place a vertical colored bar along the left or right margin.
- **NO Monotonous Beige/Cream Backgrounds:** Use purposeful corporate palettes:
  - *Executive Dark*: Deep Navy Slate (\`#0B1120\` / \`RGBColor(11, 17, 32)\`) background with Slate containers (\`#1E293B\`) and 1pt subtle border (\`#334155\`).
  - *Clean Corporate Light*: Pure Crisp White (\`#FFFFFF\`) with soft elevated cards (\`#F8FAFC\`) and fine borders (\`#E2E8F0\`).
- **NO Monolithic Bullet Walls:** Never output 6+ bullet points in a single text frame. Split ideas into 2, 3, or 4 visual card containers.
- **ZERO Template Placeholders:** Never emit \`[Insert Date]\`, \`[Company Name]\`, \`[Placeholder]\`, \`Lorem ipsum\`, or \`TBD\`. All content must be fully articulated, technical, and complete.

## 3. Visual Card Architecture & Typography:
- **Slide Title**: 24–32pt Bold. One sharp, punchy executive conclusion per slide (e.g. *"CDU-2 Optimized to 14,200 MT/D; Offgas Recovery Reaches 98.4%"*).
- **Subtitle / Category Tracker**: 10–12pt Uppercase in accent color, positioned at \`y = 0.6"\`.
- **Card Containers**:
  - 3-card layout: width = 3.6", height = 4.2", gap = 0.4", starting at \`x = 0.8"\`.
  - 4-card layout: width = 2.7", height = 4.2", gap = 0.3", starting at \`x = 0.8"\`.
- **Stat Callouts**: Big numbers (36–48pt Bold in accent color), accompanied by a 10pt uppercase parameter label and 2 lines of operational context.

## 4. The 3-Layer QA Standard:
Before saving your presentation to disk, verify mentally against the 3-Layer QA protocol:
1. **Content QA**: Every slide has real, specific data grounded in the user query. No placeholder brackets remain.
2. **File QA**: Output filename is exact (\`outputs/presentation.pptx\`), and all relationships and XML parts are valid.
3. **Visual QA**: Coordinates never collide. Labels do not wrap into unreadable 2-letter fragments. Elements maintain at least 0.5" margin from slide boundaries.

## 5. Script Modular Assembly Protocol:
Structure scripts cleanly with functional slide builders:
\`\`\`python
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

def build_presentation(output_path='outputs/presentation.pptx'):
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    
    # Slide 1: Executive Title
    # Slide 2: KPI & Throughput Matrix
    # Slide 3: Detailed Operational Breakdown
    # Slide 4: Strategic Recommendations & Action Plan
    
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    prs.save(output_path)
    print(f"Successfully generated {len(prs.slides)} slides -> {output_path}")

if __name__ == '__main__':
    build_presentation()
\`\`\`
`.trim()
