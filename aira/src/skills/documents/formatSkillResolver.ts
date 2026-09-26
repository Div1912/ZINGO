import { DOCX_SKILL } from './docxSkill'
import { PPTX_SKILL } from './pptxSkill'
import { XLSX_SKILL } from './xlsxSkill'
import { PDF_SKILL } from './pdfSkill'

export type DocumentFormat = 'docx' | 'pptx' | 'xlsx' | 'pdf'

export interface FormatSkillResult {
  requiresSkill: boolean
  format: DocumentFormat | null
  skillPrompt: string
  expectedExtension: string
  mimeType: string
}

const MIME_MAP: Record<DocumentFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

/**
 * Detects if a user prompt is asking to generate or export a professional file (Word, PowerPoint, Excel, PDF),
 * and resolves the matching authoritative formatting Skill.
 */
export function detectFormatSkillIntent(prompt: string): FormatSkillResult {
  const clean = prompt.trim().toLowerCase()
  if (!clean || clean.length < 4) {
    return { requiresSkill: false, format: null, skillPrompt: '', expectedExtension: '', mimeType: '' }
  }

  // 1. PowerPoint / Slide Deck
  if (
    clean.includes('.pptx') ||
    clean.includes('powerpoint') ||
    clean.includes('slide deck') ||
    clean.includes('slideshow') ||
    clean.includes('presentation slides') ||
    /\b(?:create|make|generate|build|export)\s+(?:a\s+)?(?:slides?|deck|presentation)\b/i.test(clean)
  ) {
    return {
      requiresSkill: true,
      format: 'pptx',
      skillPrompt: PPTX_SKILL,
      expectedExtension: '.pptx',
      mimeType: MIME_MAP.pptx,
    }
  }

  // 2. Excel / Spreadsheet / Workbook
  if (
    clean.includes('.xlsx') ||
    clean.includes('excel') ||
    clean.includes('spreadsheet') ||
    clean.includes('workbook') ||
    /\b(?:create|make|generate|build|export)\s+(?:a\s+)?(?:spreadsheet|excel sheet|sheet|financial model)\b/i.test(clean)
  ) {
    return {
      requiresSkill: true,
      format: 'xlsx',
      skillPrompt: XLSX_SKILL,
      expectedExtension: '.xlsx',
      mimeType: MIME_MAP.xlsx,
    }
  }

  // 3. Word Document / DOCX / SOP / Technical Spec
  if (
    clean.includes('.docx') ||
    clean.includes('word doc') ||
    clean.includes('word document') ||
    clean.includes('technical spec') ||
    clean.includes('standard operating procedure') ||
    /\b(?:create|make|generate|build|export|write)\s+(?:a\s+)?(?:word document|sop document|sop doc|specification document|turnaround doc)\b/i.test(clean)
  ) {
    return {
      requiresSkill: true,
      format: 'docx',
      skillPrompt: DOCX_SKILL,
      expectedExtension: '.docx',
      mimeType: MIME_MAP.docx,
    }
  }

  // 4. PDF Document / Engineering Report
  if (
    clean.includes('.pdf') ||
    /\b(?:create|make|generate|build|export)\s+(?:a\s+)?(?:pdf report|pdf document|printable report)\b/i.test(clean)
  ) {
    return {
      requiresSkill: true,
      format: 'pdf',
      skillPrompt: PDF_SKILL,
      expectedExtension: '.pdf',
      mimeType: MIME_MAP.pdf,
    }
  }

  return { requiresSkill: false, format: null, skillPrompt: '', expectedExtension: '', mimeType: '' }
}
