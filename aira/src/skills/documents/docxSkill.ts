/**
 * Format Skill: Professional Word Document Creation (.docx)
 * Authoritative styling, typography, and layout rules for python-docx
 */

export const DOCX_SKILL = `
# Format Skill: Executive Word Document (.docx) Protocol

You have access to a sandboxed Python runtime with \`python-docx\`. When creating Word deliverables, strictly adhere to these design principles:

## 1. Typography & Hierarchy:
- **Font Family**: Arial or Calibri across the entire document. Never mix more than two fonts.
- **Title**: 24pt, Bold, Primary Color (\`#0F2942\`), 12pt space after.
- **Heading 1**: 16pt, Bold, Primary Color (\`#0F2942\`), 12pt space before, 4pt space after. Add a subtle bottom accent line or left border where appropriate.
- **Heading 2**: 13pt, Semi-bold, Secondary Color (\`#334E68\`), 8pt space before, 3pt space after.
- **Heading 3**: 11pt, Semi-bold, Slate (\`#486581\`), 6pt space before, 2pt space after.
- **Body Text**: 10.5pt, Regular, Charcoal (\`#243B53\`), 1.15 line spacing, 6pt space after.

## 2. Professional Color Palette:
- **Primary Header**: Deep Industrial Navy (\`#0F2942\`)
- **Secondary Subhead**: Steel Blue (\`#334E68\`)
- **Body Neutral**: Charcoal (\`#243B53\`)
- **Muted / Caption**: Slate Gray (\`#627D98\`)
- **Accent / Alert**: Crimson / Amber (\`#BA2525\` / \`#D97706\`)
- **Table Fill (Header)**: Navy (\`#0F2942\`) with White bold text
- **Table Alternate Row**: Soft Ice (\`#F8FAFC\`)

## 3. Page Geometry & Layout:
- Set explicit 1-inch margins on all sides (72pt = \`Inches(1.0)\`).
- Header: Document title & plant unit tag (small 8.5pt muted slate, right-aligned).
- Footer: Page numbers formatted as "Page X of Y" or standard right-aligned page counter.

## 4. Tables Design (Never Raw Grid):
- Explicit column widths on every cell to prevent awkward wrapping.
- Header row: Colored background (\`#0F2942\`), bold white text, center or left aligned.
- Cell padding: Top/Bottom 6pt, Left/Right 8pt.
- Zebra striping: Alternate rows shaded with \`#F8FAFC\`.
- Light subtle cell borders (\`#E2E8F0\`), never heavy black grid lines.

## 5. Callouts & Warning Panels:
- For safety warnings, operational holds, or key takeaways, create a 1-cell table:
  - 3pt solid left accent border (e.g., Red \`#BA2525\` for Safety Hold, Amber \`#D97706\` for Caution).
  - Light background fill (\`#FEF2F2\` or \`#FFFBEB\`).
  - Indented text inside cell with an icon/label (e.g. "CRITICAL SAFETY GATE").

## 6. Modular Script Assembly (>100 Lines):
- Do NOT generate one monolithic script. Structure your Python script into modular functions:
  1. \`def setup_styles(doc): ...\`
  2. \`def build_header_footer(doc): ...\`
  3. \`def add_callout(doc, title, text, severity): ...\`
  4. \`def build_section_X(doc): ...\`
  5. \`if __name__ == '__main__': doc = Document(); ...; doc.save('outputs/deliverable.docx')\`
`.trim()
