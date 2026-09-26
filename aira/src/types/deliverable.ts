export type DeliverableFormat = 'docx' | 'pptx' | 'xlsx' | 'pdf' | 'csv' | 'zip' | 'json' | 'other'

export interface DeliverableQAReport {
  contentQaPassed: boolean
  fileQaPassed: boolean
  visualQaPassed: boolean
  overallPassed: boolean
  slideCount?: number
  issues: string[]
  details?: string
}

export interface DeliverableFile {
  id: string
  filename: string
  format: DeliverableFormat
  sizeBytes: number
  sizeFormatted: string
  downloadUrl?: string
  createdAt: string
  codeUsed?: string
  executionTimeMs?: number
  status: 'completed' | 'compiling' | 'generating' | 'failed'
  error?: string
  qaReport?: DeliverableQAReport
}

export interface BuildDeliverableParams {
  code: string
  targetFormat: DeliverableFormat
  expectedFilename?: string
  chatId?: string
  inputFiles?: Array<{ name: string; content_text?: string; content_base64?: string }>
  allowNetworkEgress?: boolean
}
