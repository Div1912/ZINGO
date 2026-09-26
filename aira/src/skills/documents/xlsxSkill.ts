/**
 * Format Skill: Professional Excel Spreadsheet (.xlsx)
 * Authoritative financial & engineering modeling guidelines for openpyxl
 */

export const XLSX_SKILL = `
# Format Skill: Financial & Engineering Workbook (.xlsx) Protocol

You have access to a sandboxed Python runtime with \`openpyxl\`. When building spreadsheets, strictly adhere to these design principles:

## 1. Sheet Setup & Usability:
- **Freeze Panes**: ALWAYS freeze the header row so column names stay visible when scrolling:
  \`ws.freeze_panes = 'A2'\`
- **Gridlines**: ALWAYS explicitly enable gridlines (openpyxl disables them by default in some views):
  \`ws.views.sheetView[0].showGridLines = True\`
- **Auto-Filter**: Enable auto-filter on the header row for tabular datasets:
  \`ws.auto_filter.ref = ws.dimensions\`

## 2. Header & Row Styling:
- **Header Row**:
  - Fill: Dark Slate / Navy (\`PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")\`).
  - Font: Bold, White (\`Font(name="Calibri", size=11, bold=True, color="FFFFFF")\`).
  - Alignment: Left for text, Right for numbers, Center for dates/codes.
  - Height: Minimum 26pt (\`ws.row_dimensions[1].height = 26\`).
- **Data Rows**:
  - Zebra striping: Alternate rows shaded with \`F8FAFC\`.
  - Height: 20pt for readable row breathing room.
- **Totals / Summary Row**:
  - Bold text.
  - Top border: thin line; Bottom border: double accounting underline (\`border_style="double"\`).

## 3. Explicit Number Formatting (Never Raw Unformatted Numbers):
- Always assign explicit \`number_format\` to numeric cells:
  - Currencies: \`'$#,##0.00'\` or \`'₹#,##0.00'\`
  - Percentages: \`'0.0%'\`
  - Quantities / Integers: \`'#,##0'\`
  - Decimals: \`'0.00'\`
  - Dates: \`'YYYY-MM-DD'\`
  - Engineering Units: \`'0.00 "bar"'\` or \`'0.0 "°C"'\`

## 4. Column Widths (Prevent '###' Overflow):
- Auto-calculate column widths based on maximum content length + 4 safety characters padding:
  \`\`\`python
  for col in ws.columns:
      max_len = max(len(str(cell.value or '')) for cell in col)
      col_letter = get_column_letter(col[0].column)
      ws.column_dimensions[col_letter].width = max(max_len + 4, 12)
  \`\`\`

## 5. Multi-Tab Organization:
- For complex models, separate into distinct tabs (e.g. \`Executive_Summary\`, \`Process_Data\`, \`Assumptions\`).
- Tab colors: Color code tabs using \`ws.sheet_properties.tabColor = "0284C7"\`.

## 6. Modular Script Assembly (>100 Lines):
- Break the script into clean functional builders:
  1. \`def create_styles(): ...\`
  2. \`def populate_headers(ws): ...\`
  3. \`def write_data_rows(ws, records): ...\`
  4. \`def apply_formatting_and_autofit(ws): ...\`
  5. \`if __name__ == '__main__': wb = Workbook(); ...; wb.save('outputs/model.xlsx')\`
`.trim()
