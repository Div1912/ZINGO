import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Upload, Trash2, ShieldCheck, ShieldAlert, Search, Zap, Activity } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Spinner } from '../ui/Spinner'
import { zingoApi, tagList, type DocumentRecord } from '../../services/zingoApi'
import { useZingoStore } from '../../stores/zingoStore'
import { ModulePage, StatCard, EmptyState, Section, formatDate, formatDateTime } from './shared'
import { AutonomousPipelineModal } from './AutonomousPipelineModal'

const DOC_TYPES = [
  'inspection_report',
  'maintenance_log',
  'datasheet',
  'sop',
  'standard',
  'incident_report',
  'drawing',
]

export const DocumentTimeline: React.FC = () => {
  const navigate = useNavigate()
  const refreshGlobal = useZingoStore((s) => s.refresh)
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<Record<string, any> | null>(null)
  const [docType, setDocType] = useState('inspection_report')
  const [equipmentTag, setEquipmentTag] = useState('')
  const [query, setQuery] = useState('')
  const [gate, setGate] = useState<Record<string, any> | null>(null)
  const [selected, setSelected] = useState<DocumentRecord | null>(null)
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null)
  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState(false)
  const [triggeringDocId, setTriggeringDocId] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await zingoApi.documents({ limit: 200 })
      setDocs(res.documents || [])
    } catch (err: any) {
      setError(err?.message || 'Backend unreachable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onUpload = async (file: File) => {
    setUploading(true)
    setUploadResult(null)
    setError(null)
    try {
      const res = await zingoApi.upload(file, {
        doc_type: docType,
        equipment_tag: equipmentTag.trim() || undefined,
      })
      setUploadResult(res)
      if (res.pipeline_id) {
        setActivePipelineId(res.pipeline_id)
        setIsPipelineModalOpen(true)
      }
      await load()
      await refreshGlobal()
    } catch (err: any) {
      let msg = err?.response?.data?.detail || err?.message || 'Upload failed'
      if (Array.isArray(msg)) {
        msg = msg.map((m: any) => m.msg || JSON.stringify(m)).join(', ')
      } else if (typeof msg === 'object') {
        msg = JSON.stringify(msg)
      }
      setError(msg)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const checkGate = async (docId: number) => {
    setGate(null)
    try {
      setGate(await zingoApi.checkBeforePublish(docId))
    } catch (err: any) {
      setGate({ error: err?.response?.data?.detail || err?.message })
    }
  }

  const remove = async (docId: number) => {
    await zingoApi.deleteDocument(docId)
    await load()
    await refreshGlobal()
  }

  const filtered = docs.filter((d) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      d.filename.toLowerCase().includes(q) ||
      (d.doc_type || '').toLowerCase().includes(q) ||
      tagList(d.equipment_tags).join(' ').toLowerCase().includes(q)
    )
  })

  const totalMeasurements = docs.reduce((sum, d) => sum + (d.measurements_found || 0), 0)

  return (
    <ModulePage
      title="Documents"
      subtitle="Every file the system has read, in the order it learned about it. Text, tables and scanned pages are parsed locally, then indexed for retrieval — nothing leaves this machine."
      icon={<FileText size={22} />}
      loading={loading && docs.length === 0}
      error={error}
      onRefresh={load}
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Documents" value={docs.length} />
        <StatCard label="Measurements extracted" value={totalMeasurements} />
        <StatCard
          label="Assets referenced"
          value={new Set(docs.flatMap((d) => tagList(d.equipment_tags))).size}
        />
        <StatCard label="Superseded" value={docs.filter((d) => d.superseded).length} />
      </div>

      <Section title="Ingest a document">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-content-tertiary">
                Document type
              </span>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-accent"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-content-tertiary">
                Equipment tag (optional)
              </span>
              <input
                value={equipmentTag}
                onChange={(e) => setEquipmentTag(e.target.value)}
                placeholder="HE-301"
                className="w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-sm text-content-primary outline-none placeholder:text-content-disabled focus:border-accent"
              />
            </label>
            <div className="flex items-end">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-[38px] items-center gap-1.5 rounded-md bg-accent px-4 text-xs font-medium text-accent-text hover:bg-accent-hover transition-colors disabled:opacity-60"
              >
                {uploading ? <Spinner size="sm" /> : <Upload size={14} />}
                {uploading ? 'Reading…' : 'Choose file'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-content-tertiary">
            PDF, DOCX, TXT and images. Scanned pages fall back to on-device OCR.
          </p>

          {uploadResult && (
            <div className="mt-3 rounded-md border border-success/25 bg-success/5 px-3.5 py-3 text-xs text-content-secondary">
              <div className="flex items-center justify-between">
                <p className="font-medium text-success">Ingested {uploadResult.filename}</p>
                {uploadResult.pipeline_id && (
                  <button
                    onClick={() => {
                      setActivePipelineId(uploadResult.pipeline_id)
                      setIsPipelineModalOpen(true)
                    }}
                    className="inline-flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/20 transition-colors"
                  >
                    <Activity size={12} />
                    View Autonomous Pipeline
                  </button>
                )}
              </div>
              <p className="mt-1">
                {uploadResult.measurements_found ?? 0} measurements ·{' '}
                {uploadResult.chunks_indexed ?? 0} chunks indexed ·{' '}
                {(uploadResult.equipment_tags || []).join(', ') || 'no tags found'}
                {uploadResult.extraction_method ? ` · read via ${uploadResult.extraction_method}` : ''}
              </p>
              <p className="mt-1 text-content-tertiary">
                Autonomous 10-step agent pipeline initiated — topology matching, pattern analysis, SOP checks, and draft action notes run automatically.
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section
        title={`Timeline (${filtered.length})`}
        right={
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, type or tag"
              className="w-56 rounded-md border border-border bg-elevated py-1.5 pl-8 pr-3 text-xs text-content-primary outline-none placeholder:text-content-disabled focus:border-accent"
            />
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="No documents yet"
            hint="Upload an inspection report to start. The system extracts equipment tags, dates and measurements without any manual tagging."
            icon={<FileText size={22} />}
          />
        ) : (
          <ol className="relative space-y-2.5 border-l border-border pl-5">
            {filtered.map((doc) => (
              <li key={doc.id} className="relative">
                <span className="absolute -left-[23px] top-4 h-2 w-2 rounded-full bg-accent" />
                <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-content-primary">{doc.filename}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge size="sm" variant="outline">
                          {(doc.doc_type || 'document').replace(/_/g, ' ')}
                        </Badge>
                        {tagList(doc.equipment_tags).map((t) => (
                          <span
                            key={t}
                            className="rounded border border-border-subtle bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-content-secondary"
                          >
                            {t}
                          </span>
                        ))}
                        {doc.superseded ? (
                          <Badge size="sm" variant="warning">
                            superseded
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-[11px] text-content-tertiary">
                        Document date {formatDate(doc.document_date)} · ingested{' '}
                        {formatDateTime(doc.upload_time)} · {doc.measurements_found ?? 0} measurements
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={async () => {
                          try {
                            setTriggeringDocId(doc.id)
                            const res = await zingoApi.runPipeline(doc.id)
                            if (res.pipeline_id) {
                              setActivePipelineId(res.pipeline_id)
                              setIsPipelineModalOpen(true)
                            }
                          } catch (err: any) {
                            setError(err?.message || 'Failed to start autonomous pipeline')
                          } finally {
                            setTriggeringDocId(null)
                          }
                        }}
                        disabled={triggeringDocId === doc.id}
                        title="Trigger 10-step autonomous agent pipeline for this document"
                        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                      >
                        {triggeringDocId === doc.id ? <Spinner size="sm" /> : <Zap size={12} />}
                        Autonomous Pipeline
                      </button>
                      <button
                        onClick={() => checkGate(doc.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-content-secondary hover:bg-elevated hover:text-content-primary transition-colors"
                      >
                        <ShieldCheck size={12} />
                        Publish check
                      </button>
                      <button
                        onClick={() =>
                          setSelected(selected?.id === doc.id ? null : doc)
                        }
                        className="rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-content-secondary hover:bg-elevated hover:text-content-primary transition-colors"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => remove(doc.id)}
                        title="Remove document"
                        className="rounded-md border border-border p-1.5 text-content-tertiary hover:border-danger/40 hover:text-danger transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {selected?.id === doc.id && (
                    <div className="mt-3 border-t border-border-subtle pt-3 text-xs text-content-secondary">
                      <p>Standards referenced: {tagList(doc.standard_refs).join(', ') || 'none detected'}</p>
                      <p className="mt-1">Uploaded by {doc.uploaded_by || 'engineer'}</p>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {gate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start gap-2.5">
              {gate.publish_allowed ? (
                <ShieldCheck size={20} className="mt-0.5 text-success" />
              ) : (
                <ShieldAlert size={20} className="mt-0.5 text-danger" />
              )}
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-content-primary">
                  {gate.publish_allowed ? 'Cleared to publish' : 'Blocked — resolve conflicts first'}
                </h3>
                <p className="mt-1 text-xs text-content-secondary leading-relaxed">
                  {gate.message || gate.error || 'Gate result'}
                </p>
              </div>
            </div>

            {Array.isArray(gate.unresolved_high_severity) && gate.unresolved_high_severity.length > 0 && (
              <ul className="mt-3 space-y-2">
                {gate.unresolved_high_severity.map((c: any, i: number) => (
                  <li key={i} className="rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs">
                    <p className="font-mono text-content-primary">
                      {c.equipment_tag} · {c.parameter}
                    </p>
                    <p className="mt-0.5 text-content-secondary">
                      {c.value_a} vs {c.value_b} {c.unit || ''} — {c.explanation}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setGate(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-elevated hover:text-content-primary transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <AutonomousPipelineModal
        pipelineId={activePipelineId}
        isOpen={isPipelineModalOpen}
        onClose={() => setIsPipelineModalOpen(false)}
        onOpenActionNote={(_noteId) => {
          setIsPipelineModalOpen(false)
          navigate('/app/action-notes')
        }}
      />
    </ModulePage>
  )
}

export default DocumentTimeline
