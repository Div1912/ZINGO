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

const client = axios.create({
  timeout: 180000,
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
})

async function req<T>(method: 'get' | 'post' | 'put' | 'delete', path: string, opts: {
  params?: Record<string, unknown>
  data?: unknown
  formData?: FormData
} = {}): Promise<T> {
  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
  }
  if (!opts.formData) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await client.request<T>({
    method,
    url: `${zingoBaseUrl()}${path}`,
    params: opts.params,
    data: opts.formData ?? opts.data,
    headers,
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

export interface ActionNote {
  id: number
  ref_number: string
  title: string
  doc_id?: number
  alert_id?: number
  equipment_tag: string
  severity: Severity
  status: 'DRAFT' | 'APPROVED' | 'REJECTED' | 'CLOSED'
  target_role: string
  anomaly_summary?: string
  technical_findings?: any
  regulatory_clauses?: any
  contradictions_detected?: any
  recommended_action?: string
  raw_markdown?: string
  original_draft?: string
  escalation_level?: number
  due_date?: string | null
  acknowledged_at?: string | null
  acknowledged_by?: string | null
  created_at: string
  updated_at: string
  approved_by?: string | null
  approved_at?: string | null
  approval_notes?: string | null
  signature_hash?: string | null
}

export interface LearnedPreference {
  id: number
  project_id?: string | null
  category: string
  title: string
  rule_instruction: string
  trigger_pattern?: string | null
  evidence_count: number
  confidence: number
  status: 'ACTIVE' | 'PROVISIONAL' | 'DISABLED'
  examples?: string[]
  created_at: string
  updated_at: string
}

export interface TemporalEvent {
  type: string
  timestamp: string
  date: string
  title: string
  description: string
  ref_id?: number | string
  severity?: string
}

export interface PlantContext {
  equipment_tag: string
  equipment_name: string
  equipment_type: string
  unit: string
  design_specs: {
    design_pressure_bar: number
    design_temp_c: number
    metallurgy: string
    corrosion_allowance_mm: number
    fluid_service: string
  }
  topology: {
    upstream_assets: string[]
    downstream_assets: string[]
  }
  latest_measurements: Record<string, { value: number; unit: string; date: string }>
  historical_series: Record<string, Array<{ date: string; value: number; unit: string; source: string }>>
  operating_limits: Record<string, any>
  health_score: number
  health_status: string
  active_alerts_count: number
  active_alerts: any[]
  episodic_facts: any[]
  retrieved_at: string
}

export interface RoleNotification {
  id: number
  recipient_role: string
  alert_id?: number
  action_note_id?: number
  equipment_tag?: string
  title: string
  message: string
  severity: Severity
  status: 'UNREAD' | 'READ'
  dispatched_at: string
  read_at?: string | null
}

export interface UserProfile {
  user_id: string
  full_name: string
  preferred_name: string
  work_role?: string
  personal_preferences?: string
  updated_at?: string
}

export interface UserCapabilities {
  user_id: string
  artifacts_enabled: boolean
  inline_visualizations: boolean
  code_execution: boolean
  switch_models_on_flagged: boolean
  generate_memory_from_chats: boolean
  include_sensitive_topics: boolean
  tool_access_mode: 'auto' | 'manual'
  updated_at?: string
}

export interface UserMemoryFile {
  id: number
  user_id: string
  title: string
  content: string
  category: 'general' | 'project' | 'preference' | 'sensitive'
  is_sensitive: boolean
  created_at: string
  updated_at: string
}

export interface UserPermissions {
  user_id: string
  location_permitted: boolean
  location_label?: string
  location_coords?: string
  calendar_permitted: boolean
  calendar_account?: string
  updated_at?: string
}

export interface UserConnector {
  connector_key: string
  user_id: string
  name: string
  description: string
  status: 'connected' | 'disconnected' | 'idle'
  account_email?: string
  config?: Record<string, any>
  updated_at?: string
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
  pipelineStatus: (pipelineId: string) => req<Record<string, any>>('get', `/api/ingest/pipeline/${pipelineId}`),
  runPipeline: (docId: number) => req<Record<string, any>>('post', `/api/ingest/run_pipeline/${docId}`),

  // Feature 2 — monitoring & action notes
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

  // Autonomous Action Notes
  actionNotes: (params: { equipment_tag?: string; status?: string; severity?: string; limit?: number } = {}) =>
    req<{ action_notes: ActionNote[]; total: number }>('get', '/api/monitor/action_notes', { params }),
  actionNote: (id: number) => req<ActionNote>('get', `/api/monitor/action_notes/${id}`),
  signActionNote: (
    id: number,
    body: {
      approved_by: string
      approval_notes?: string
      edited_title?: string
      edited_anomaly_summary?: string
      edited_recommended_action?: string
      edited_raw_markdown?: string
      project_id?: string
    }
  ) => req<ActionNote>('post', `/api/monitor/action_notes/${id}/sign`, { data: body }),
  acknowledgeActionNote: (id: number, body: { engineer_id: string; notes?: string }) =>
    req<ActionNote>('post', `/api/monitor/action_notes/${id}/acknowledge`, { data: body }),
  downloadActionNoteDocx: (id: number, refNumber: string) =>
    downloadDoc(`/api/monitor/action_notes/${id}/docx`, `${refNumber}.docx`),

  // Role Notifications
  notifications: (params: { role?: string; unread_only?: boolean; limit?: number } = {}) =>
    req<{ notifications: RoleNotification[]; total: number; unread: number }>('get', '/api/monitor/notifications', { params }),
  markNotificationRead: (id: number) => req<Record<string, any>>('post', `/api/monitor/notifications/${id}/read`),
  markAllNotificationsRead: (role?: string) =>
    req<Record<string, any>>('post', '/api/monitor/notifications/mark_all_read', { params: role ? { role } : {} }),

  // Plant-Aware Artifacts
  plantContext: (tag: string) => req<PlantContext>('get', `/api/artifacts/plant-context/${encodeURIComponent(tag)}`),
  saveArtifactState: (artifactId: string, data: { equipment_tag?: string; title: string; state: any; saved_by?: string; project_id?: string; update_equipment_memory?: boolean }) =>
    req<Record<string, any>>('post', `/api/artifacts/${encodeURIComponent(artifactId)}/save-state`, { data }),
  artifactState: (artifactId: string) => req<Record<string, any>>('get', `/api/artifacts/${encodeURIComponent(artifactId)}/state`),
  plantTemplates: () => req<{ templates: any[] }>('get', '/api/artifacts/templates'),

  // Behavioral Learning
  learnedPreferences: (params: { project_id?: string; status?: string } = {}) =>
    req<{ total: number; active_count: number; preferences: LearnedPreference[] }>('get', '/api/learning/preferences', { params }),
  toggleLearnedPreference: (id: number, status: string) =>
    req<Record<string, any>>('post', `/api/learning/preferences/${id}/toggle`, { data: { status } }),
  engineerEdits: (params: { item_type?: string; item_id?: number } = {}) =>
    req<{ total: number; edits: any[] }>('get', '/api/learning/edits', { params }),

  // Cross-Session Temporal Reasoning & Escalations
  temporalTimeline: (tag: string) =>
    req<{ equipment_tag: string; total_events: number; events: TemporalEvent[]; narrative_context: string }>('get', `/api/temporal/timeline/${encodeURIComponent(tag)}`),
  escalations: (params: { equipment_tag?: string; status?: string } = {}) =>
    req<{ total: number; escalations: any[] }>('get', '/api/temporal/escalations', { params }),
  evaluateEscalation: (tag: string) =>
    req<{ equipment_tag: string; escalations_triggered: number; details: any[] }>('post', `/api/temporal/evaluate/${encodeURIComponent(tag)}`),

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

  // Feature 8 — Persistent Conversations & Memory
  conversations: (projectId?: string) =>
    req<{ conversations: any[]; total: number }>('get', '/api/conversations', { params: projectId ? { project_id: projectId } : {} }),
  conversation: (id: string) => req<any>('get', `/api/conversations/${id}`),
  createConversation: (data: any) => req<any>('post', '/api/conversations', { data }),
  saveConversationMessage: (convId: string, message: any) =>
    req<any>('post', `/api/conversations/${convId}/messages`, { data: message }),
  deleteConversation: (id: string) => req<any>('delete', `/api/conversations/${id}`),
  equipmentMemory: (tag: string) => req<{ tag: string; total_facts: number; facts: any[] }>('get', `/api/memory/equipment/${tag}`),

  // Claude Settings & Identity Integration
  getProfile: (userId?: string) =>
    req<UserProfile>('get', '/api/settings/profile', { params: userId ? { user_id: userId } : {} }),
  updateProfile: (data: Partial<UserProfile>) =>
    req<UserProfile>('post', '/api/settings/profile', { data }),
  getCapabilities: (userId?: string) =>
    req<UserCapabilities>('get', '/api/settings/capabilities', { params: userId ? { user_id: userId } : {} }),
  updateCapabilities: (data: Partial<UserCapabilities>) =>
    req<UserCapabilities>('post', '/api/settings/capabilities', { data }),
  getPermissions: (userId?: string) =>
    req<UserPermissions>('get', '/api/settings/permissions', { params: userId ? { user_id: userId } : {} }),
  updatePermissions: (data: Partial<UserPermissions>) =>
    req<UserPermissions>('post', '/api/settings/permissions', { data }),
  getConnectors: (userId?: string) =>
    req<{ total: number; connectors: UserConnector[] }>('get', '/api/settings/connectors', { params: userId ? { user_id: userId } : {} }),
  toggleConnector: (connectorKey: string, data: { status?: string; account_email?: string; config?: any } = {}) =>
    req<UserConnector>('post', `/api/settings/connectors/${encodeURIComponent(connectorKey)}/toggle`, { data }),
  getMemoryFiles: (userId?: string, category?: string) =>
    req<{ total: number; memories: UserMemoryFile[] }>('get', '/api/settings/memory', { params: { user_id: userId, category } }),
  addMemoryFile: (data: { title: string; content: string; category?: string; is_sensitive?: boolean }) =>
    req<UserMemoryFile>('post', '/api/settings/memory', { data }),
  updateMemoryFile: (id: number, data: { title?: string; content?: string; category?: string; is_sensitive?: boolean }) =>
    req<UserMemoryFile>('put', `/api/settings/memory/${id}`, { data }),
  deleteMemoryFile: (id: number) =>
    req<{ success: boolean; deleted_id: number }>('delete', `/api/settings/memory/${id}`),
  clearMemoryFiles: (userId?: string) =>
    req<{ success: boolean }>('delete', '/api/settings/memory', { params: userId ? { user_id: userId } : {} }),
  deleteAccount: (userId?: string) =>
    req<{ success: boolean; message: string }>('post', '/api/settings/account/delete', { params: userId ? { user_id: userId } : {} }),
  getModelIdentityPrompt: (userId?: string) =>
    req<{ user_id: string; prompt: string }>('get', '/api/settings/model-identity', { params: userId ? { user_id: userId } : {} }),
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
