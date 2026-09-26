import { useServerStore } from '../stores/serverStore'
import type { DeliverableFile, BuildDeliverableParams, DeliverableFormat } from '../types/deliverable'

export interface RawDeliverableBuildResponse {
  success: boolean
  exit_code: number
  filename?: string
  format?: string
  file_size_bytes?: number
  file_size_formatted?: string
  download_url?: string
  stdout: string
  stderr: string
  execution_time_ms: number
  promoted: boolean
  error?: string
  qa_report?: {
    content_qa_passed: boolean
    file_qa_passed: boolean
    visual_qa_passed: boolean
    overall_passed: boolean
    slide_count?: number
    issues: string[]
    details?: string
  }
}

/**
 * Builds a verified file deliverable in the sovereign sandbox workspace:
 *   1. Writes code to scratch/build.py
 *   2. Mounts any inputs to inputs/
 *   3. Executes in scratch/
 *   4. Verifies output file existence & size
 *   5. Promotes to outputs/ and returns download URL
 */
export async function buildSandboxDeliverable(params: BuildDeliverableParams): Promise<DeliverableFile> {
  const { g15_1_url } = useServerStore.getState().server
  const baseUrl = (g15_1_url || import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')
  const endpoint = `${baseUrl}/api/sandbox/build-deliverable`

  const payload = {
    chat_id: params.chatId || 'default',
    code: params.code,
    target_format: params.targetFormat,
    expected_filename: params.expectedFilename,
    input_files: params.inputFiles || [],
    allow_network_egress: params.allowNetworkEgress || false,
    timeout_seconds: 40,
    user: 'engineer',
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Sandbox deliverable build failed HTTP ${response.status}: ${errorText}`)
  }

  const data: RawDeliverableBuildResponse = await response.json()

  if (!data.success) {
    throw new Error(data.error || data.stderr || 'Build failed in sandbox workspace.')
  }

  const fullDownloadUrl = data.download_url?.startsWith('http')
    ? data.download_url
    : `${baseUrl}${data.download_url}`

  return {
    id: `deliv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    filename: data.filename || `deliverable.${params.targetFormat}`,
    format: (data.format || params.targetFormat) as DeliverableFormat,
    sizeBytes: data.file_size_bytes || 0,
    sizeFormatted: data.file_size_formatted || '0 B',
    downloadUrl: fullDownloadUrl,
    createdAt: new Date().toISOString(),
    codeUsed: params.code,
    executionTimeMs: data.execution_time_ms,
    status: 'completed',
    qaReport: data.qa_report
      ? {
          contentQaPassed: data.qa_report.content_qa_passed,
          fileQaPassed: data.qa_report.file_qa_passed,
          visualQaPassed: data.qa_report.visual_qa_passed,
          overallPassed: data.qa_report.overall_passed,
          slideCount: data.qa_report.slide_count,
          issues: data.qa_report.issues || [],
          details: data.qa_report.details,
        }
      : undefined,
  }
}

/**
 * Parses any embedded <deliverable format="..." filename="...">...code...</deliverable>
 * blocks from assistant message responses.
 */
export function extractDeliverablesFromMessage(content: string): Array<{
  format: DeliverableFormat
  filename: string
  code: string
}> {
  if (!content) return []

  const deliverables: Array<{ format: DeliverableFormat; filename: string; code: string }> = []
  const regex = /<deliverable\s+(?:format="([^"]+)")?\s*(?:filename="([^"]+)")?[^>]*>([\s\S]*?)<\/deliverable>/gi

  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const format = (match[1] || 'docx').toLowerCase().replace(/^\./, '') as DeliverableFormat
    const filename = match[2] || `document.${format}`
    const code = match[3]?.trim() || ''

    if (code) {
      deliverables.push({ format, filename, code })
    }
  }

  // Also check standard Python code blocks with doc.save(), wb.save(), prs.save()
  if (deliverables.length === 0) {
    const pyBlockRegex = /```python\s*([\s\S]*?)```/gi
    let pyMatch: RegExpExecArray | null
    while ((pyMatch = pyBlockRegex.exec(content)) !== null) {
      const code = pyMatch[1]
      if (code.includes('.save(') && (code.includes('Document()') || code.includes('docx'))) {
        const fnMatch = code.match(/\.save\(['"]([^'"]+\.docx)['"]\)/i)
        const filename = fnMatch ? fnMatch[1] : 'document.docx'
        deliverables.push({ format: 'docx', filename, code })
      } else if (code.includes('.save(') && (code.includes('Workbook()') || code.includes('openpyxl'))) {
        const fnMatch = code.match(/\.save\(['"]([^'"]+\.xlsx)['"]\)/i)
        const filename = fnMatch ? fnMatch[1] : 'workbook.xlsx'
        deliverables.push({ format: 'xlsx', filename, code })
      } else if (code.includes('.save(') && (code.includes('Presentation()') || code.includes('pptx'))) {
        const fnMatch = code.match(/\.save\(['"]([^'"]+\.pptx)['"]\)/i)
        const filename = fnMatch ? fnMatch[1] : 'presentation.pptx'
        deliverables.push({ format: 'pptx', filename, code })
      } else if (code.includes('.build(') && code.includes('reportlab')) {
        const fnMatch = code.match(/SimpleDocTemplate\(['"]([^'"]+\.pdf)['"]\)/i)
        const filename = fnMatch ? fnMatch[1] : 'report.pdf'
        deliverables.push({ format: 'pdf', filename, code })
      }
    }
  }

  return deliverables
}
