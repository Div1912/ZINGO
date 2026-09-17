/**
 * ZINGO backend client.
 *
 * The base URL is read from serverStore at call time so the workbench follows whatever
 * backend the user configured in Settings — nothing is hardcoded here.
 */
import axios from 'axios'
import { useServerStore } from '../stores/serverStore'

export const zingoBaseUrl = (): string => {
  // VITE_ZINGO_API_URL wins when set (useful for `http://127.0.0.1:8000` during local dev),
  // otherwise follow whatever backend the user configured in Settings.
  const override = (import.meta.env.VITE_ZINGO_API_URL as string | undefined) || ''
  const url = override || useServerStore.getState().server.g15_1_url
  return (url || '').replace(/\/+$/, '')
}

const client = axios.create({ timeout: 180000 })

async function req<T>(method: 'get' | 'post' | 'delete', path: string, opts: {
  params?: Record<string, unknown>
  data?: unknown
  formData?: FormData
} = {}): Promise<T> {
  const res = await client.request<T>({
    method,
    url: `${zingoBaseUrl()}${path}`,
    params: opts.params,
    data: opts.formData ?? opts.data,
    headers: opts.formData ? { 'Content-Type': 'multipart/form-data' } : { 'Content-Type': 'application/json' },
  })
  return res.data
}

/** POST an endpoint that returns a .docx / .csv and save it to disk. */
export async function downloadDoc(
  path: string,
  filename: string,
  body: Record<string, unknown> = {},
  params: Record<string, unknown> = {}
): Promise<void> {
  const res = await client.post(`${zingoBaseUrl()}${path}`, body, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/* ---------------------------------- Types ---------------------------------- */

export type Severity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface EvidenceItem {
  doc_id?: number
  document?: string
  measurement?: string
  date?: string
  parameter?: string
  value?: number
  unit?: string
}

export interface Alert {
  id: number
  alert_type: string
  severity: Severity
  title: string
  description: string
  equipment_tags: string[] | string
  created_at: string
  status: string
  acknowledged_by?: string | null
  acknowledged_at?: string | null
  ack_notes?: string | null
  evidence?: {
    detector?: string
    parameter?: string
    percent_change?: number
    latest_value?: number
    baseline_value?: number
    slope_per_day?: number
    r_squared?: number
    accelerating?: boolean
    predicted_failure_window?: {
      limit?: number
      days_remaining?: number
      predicted_date?: string
      basis?: string
    } | null
    historical_precedent?: unknown
    sop_clause?: { sop_code?: string; clause?: string; text?: string } | null
    draft_action_note?: string | null
    evidence?: EvidenceItem[]
    correlated_assets?: Array<{ tag: string; parameter: string; value: number; unit?: string; date?: string; reason?: string }>
    hop_distances?: Record<string, number | string>
  } | null
}

export interface EquipmentHealth {
  tag: string
  health_score: number
  equipment_type?: string
  critical_alerts: number
  warning_alerts: number
  open_contradictions: number
  last_measurement_date?: string | null
  inspection_stale?: boolean
  document_count?: number
  deductions?: string[]
  band?: 'good' | 'fair' | 'poor' | 'critical'
}

export interface HealthMap {
  equipment_count: number
  bands: Record<string, number>
  average_health: number
  worst_offenders: EquipmentHealth[]
  health_scores: Record<string, number>
  equipment: EquipmentHealth[]
}

export interface DocumentRecord {
  id: number
  filename: string
  upload_time: string
  doc_type?: string
  equipment_tags?: string[] | string
  standard_refs?: string[] | string
  document_date?: string | null
  uploaded_by?: string
  processed?: number
  measurements_found?: number
  superseded?: number
}

export interface Contradiction {
  id: number
  equipment_tag: string
  parameter: string
  value_a: string | number
  value_b: string | number
  unit?: string
  doc_a_id: number
  doc_b_id: number
  doc_a?: string
  doc_b?: string
  doc_a_date?: string
  doc_b_date?: string
  severity: 'high' | 'medium' | 'low'
  contradiction_type: string
  explanation: string
  recommended_resolution: string
  resolution_basis?: string
  status: string
}

export interface ComplianceGap {
  id: number
  sop_id: number
  sop_code?: string
  sop_filename?: string
  standard_code: string
  clause_number?: string
  clause_text?: string
  gap_description: string
  severity: string
  compliance_level?: string
  detected_at?: string
  resolved_by?: string | null
  resolution_notes?: string | null
  status: string
}

export interface Overview {
  documents: number
  measurements: number
  active_alerts: number
  critical_alerts: number
  open_gaps: number
  open_contradictions: number
  audit_entries: number
  model_calls: number
  external_calls_detected: number
  graph_nodes: number
  graph_edges: number
  last_scan_time: string | null
}

/* -------------------------------- Endpoints -------------------------------- */

export const zingoApi = {
  health: () => req<Record<string, unknown>>('get', '/api/health'),
  overview: () => req<Overview>('get', '/api/overview'),
  models: (taskType = 'chat') => req<Record<string, unknown>>('get', '/api/models', { params: { task_type: taskType } }),

  // Feature 1 — ingestion
  upload: (file: File, meta: { doc_type?: string; equipment_tag?: string; uploaded_by?: string } = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    if (meta.doc_type) fd.append('doc_type', meta.doc_type)
    if (meta.equipment_tag) fd.append('equipment_tag', meta.equipment_tag)
    fd.append('uploaded_by', meta.uploaded_by || 'engineer')
    return req<Record<string, any>>('post', '/api/ingest/upload', { formData: fd })
  },
  documents: (params: { equipment_tag?: string; doc_type?: string; limit?: number } = {}) =>
    req<{ documents: DocumentRecord[]; total: number }>('get', '/api/ingest/documents', { params }),
  document: (id: number) => req<Record<string, any>>('get', `/api/ingest/document/${id}`),
  deleteDocument: (id: number) => req<Record<string, any>>('delete', `/api/ingest/document/${id}`),
  ingestStats: () => req<Record<string, any>>('get', '/api/ingest/stats'),

  // Feature 2 — monitoring
  alerts: (params: { status?: string; severity?: string; equipment_tag?: string; limit?: number } = {}) =>
    req<{ alerts: Alert[]; total: number; counts?: Record<string, number> }>('get', '/api/monitor/alerts', { params }),
  alert: (id: number) => req<Alert>('get', `/api/monitor/alerts/${id}`),
  acknowledgeAlert: (id: number, body: { acknowledged_by: string; notes?: string }) =>
    req<Record<string, any>>('post', `/api/monitor/alerts/${id}/acknowledge`, { data: body }),
  downloadAlertNote: (id: number) =>
    downloadDoc(`/api/monitor/alerts/${id}/generate_word`, `action_note_alert_${id}.docx`, {}, { generated_by: 'engineer' }),
  timeline: (tag: string) => req<Record<string, any>>('get', `/api/monitor/equipment/${tag}/timeline`),
  runFullScan: () => req<Record<string, any>>('post', '/api/monitor/run_full_scan'),
  monitorSummary: () => req<Record<string, any>>('get', '/api/monitor/summary'),

  // Feature 3 — compliance
  gaps: (params: { status?: string; sop_id?: number; severity?: string } = {}) =>
    req<{ gaps: ComplianceGap[]; matrix?: any; total: number }>('get', '/api/compliance/gaps', { params }),
  sops: () => req<Record<string, any>>('get', '/api/compliance/sops'),
  standards: () => req<Record<string, any>>('get', '/api/compliance/standards'),
  checkAllSops: () => req<Record<string, any>>('post', '/api/compliance/check_all_sops'),
  checkSop: (id: number) => req<Record<string, any>>('post', `/api/compliance/check_sop/${id}`),
  resolveGap: (id: number, body: { resolved_by: string; notes?: string; status?: string }) =>
    req<Record<string, any>>('post', `/api/compliance/gaps/${id}/resolve`, { data: body }),
  downloadAmendment: (id: number) =>
    downloadDoc(`/api/compliance/gaps/${id}/generate_amendment`, `amendment_gap_${id}.docx`, {}, { drafted_by: 'engineer' }),

  // Feature 4 — contradictions
  contradictions: (params: { status?: string; equipment_tag?: string } = {}) =>
    req<{ contradictions: Contradiction[]; total: number }>('get', '/api/contradict/contradictions', { params }),
  scanContradictions: (body: { equipment_tag?: string; doc_ids?: number[]; refresh_claims?: boolean; scanned_by?: string } = {}) =>
    req<Record<string, any>>('post', '/api/contradict/scan', { data: body }),
  resolveContradiction: (id: number, body: { resolution: 'accept_doc_a' | 'accept_doc_b' | 'manual'; resolved_by: string; notes?: string }) =>
    req<Record<string, any>>('post', `/api/contradict/contradictions/${id}/resolve`, { data: body }),
  checkBeforePublish: (docId: number) =>
    req<Record<string, any>>('post', '/api/contradict/check_before_publish', { data: { doc_id: docId } }),

  // Feature 5 — shift handover
  logShiftEvent: (body: Record<string, unknown>) => req<Record<string, any>>('post', '/api/shift/log_event', { data: body }),
  generateHandover: (body: { shift_date: string; shift_type: string; generated_by?: string }) =>
    req<Record<string, any>>('post', '/api/shift/generate_handover', { data: body }),
  handover: (date: string, type: string) => req<Record<string, any>>('get', `/api/shift/handover/${date}/${type}`),
  handovers: () => req<Record<string, any>>('get', '/api/shift/handovers'),
  shiftEvents: (params: { shift_date?: string; shift_type?: string; limit?: number } = {}) =>
    req<Record<string, any>>('get', '/api/shift/events', { params }),
  downloadHandover: (date: string, type: string) =>
    downloadDoc('/api/shift/generate_word', `handover_${date}_${type}.docx`, {
      shift_date: date,
      shift_type: type,
      generated_by: 'shift_incharge',
    }),

  // Feature 6 — knowledge graph
  topology: () => req<Record<string, any>>('get', '/api/graph/topology'),
  equipment: (tag: string) => req<Record<string, any>>('get', `/api/graph/equipment/${tag}`),
  addConnection: (body: Record<string, unknown>) => req<Record<string, any>>('post', '/api/graph/add_connection', { data: body }),
  graphQuery: (query: string) =>
    req<Record<string, any>>('post', '/api/graph/query', { data: { natural_language_query: query } }),
  healthMap: () => req<HealthMap>('get', '/api/graph/health_map'),

  // Feature 7 — audit
  auditLog: (params: { feature?: string; user?: string; action?: string; limit?: number; offset?: number } = {}) =>
    req<Record<string, any>>('get', '/api/audit/log', { params }),
  networkProof: () => req<Record<string, any>>('get', '/api/audit/network_proof'),
  documentTrace: (id: number) => req<Record<string, any>>('get', `/api/audit/document/${id}/trace`),
  auditSummary: () => req<Record<string, any>>('get', '/api/audit/summary'),
  downloadAuditExport: (format: 'json' | 'csv' = 'csv') =>
    downloadDoc('/api/audit/export', `zingo_audit_log.${format}`, { format, exported_by: 'engineer' }),
}

export const tagList = (tags: string[] | string | undefined): string[] => {
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  return tags.split(',').map((t) => t.trim()).filter(Boolean)
}

export const severityVariant = (severity?: string): 'danger' | 'warning' | 'default' => {
  const s = (severity || '').toUpperCase()
  if (s === 'CRITICAL' || s === 'HIGH') return 'danger'
  if (s === 'WARNING' || s === 'MEDIUM') return 'warning'
  return 'default'
}

export const healthColor = (score: number): string => {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-warning'
  if (score >= 40) return 'text-orange-500'
  return 'text-danger'
}
