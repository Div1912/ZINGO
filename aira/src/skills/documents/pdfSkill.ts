/**
 * Format Skill: Sovereign Engineering PDF Report (.pdf)
 * Authoritative styling and layout guidelines for ReportLab / WeasyPrint
 */

export const PDF_SKILL = `
# Format Skill: Sovereign PDF Report (.pdf) Protocol

You have access to a sandboxed Python runtime with \`reportlab\`. When building PDF engineering reports, strictly adhere to these design principles:

## 1. Document Geometry & Margins:
- Use standard A4 or Letter with 0.75-inch margins (54pt) for optimal printable layout.
- Use \`SimpleDocTemplate\` with \`pagesize=letter\`, \`leftMargin=54\`, \`rightMargin=54\`, \`topMargin=54\`, \`bottomMargin=54\`.

## 2. Typography & Leading (Prevent Text Overlaps):
- **ALWAYS** set \`leading\` proportionally whenever you change \`fontSize\`: \`leading = fontSize * 1.25\`. Failing to set leading causes overlapping text in ReportLab.
- Title: 22pt Bold, leading 26pt, Navy (\`#0F2942\`).
- H1: 15pt Bold, leading 19pt, Slate (\`#1E293B\`), keepWithNext=True (prevents orphaned headers at page bottom).
- H2: 12pt Bold, leading 15pt, Steel Blue (\`#334E68\`), keepWithNext=True.
- Body: 10pt Regular, leading 13.5pt, Charcoal (\`#243B53\`).

## 3. Tables in PDF:
- Wrap text inside table cells with \`Paragraph(cell_text, body_style)\` so long strings wrap properly instead of clipping past table margins.
- Set explicit \`colWidths\` on \`Table(data, colWidths=[...])\`.
- \`TableStyle\`:
  - Background fill on header row: Navy (\`colors.HexColor('#0F2942')\`).
  - Text color header: White (\`colors.white\`).
  - Alternating rows: \`colors.HexColor('#F8FAFC')\`.
  - Grid lines: 0.5pt, \`colors.HexColor('#CBD5E1')\`.

## 4. Professional Headers & Dynamic Page Numbers:
- Use a custom \`NumberedCanvas\` to draw running headers and "Page X of Y" footers dynamically across multi-page documents.

## 5. Modular Script Assembly (>100 Lines):
- Break the script into clean structural builders:
  1. \`def get_custom_stylesheet(): ...\`
  2. \`def build_header_banner(story): ...\`
  3. \`def build_spec_table(story, data): ...\`
  4. \`if __name__ == '__main__': doc = SimpleDocTemplate('outputs/report.pdf'); ...; doc.build(story, canvasmaker=NumberedCanvas)\`
`.trim()
