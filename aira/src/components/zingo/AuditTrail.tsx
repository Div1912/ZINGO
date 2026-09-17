import React, { useCallback, useEffect, useState } from 'react'
import { ClipboardList, ShieldCheck, Download, WifiOff, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { zingoApi } from '../../services/zingoApi'
import { ModulePage, StatCard, EmptyState, Section, formatDateTime } from './shared'

const PAGE_SIZE = 50

export const AuditTrail: React.FC = () => {
  const [entries, setEntries] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [byFeature, setByFeature] = useState<Record<string, number>>({})
  const [offset, setOffset] = useState(0)
  const [feature, setFeature] = useState<string>('')
  const [proof, setProof] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [log, net]: any[] = await Promise.all([
        zingoApi.auditLog({ limit: PAGE_SIZE, offset, feature: feature || undefined }),
        zingoApi.networkProof(),
      ])
      setEntries(log.entries || [])
      setTotal(log.total || 0)
      setByFeature(log.by_feature || {})
      setProof(net)
    } catch (err: any) {
      setError(err?.message || 'Backend unreachable')
    } finally {
      setLoading(false)
    }
  }, [offset, feature])

  useEffect(() => {
    load()
  }, [load])

  const zeroExternal = (proof?.external_calls_detected ?? 0) === 0

  return (
    <ModulePage
      title="Audit Trail"
      subtitle="Every action the system took, who triggered it, and which document it touched — plus proof of where the model calls went."
      icon={<ClipboardList size={22} />}
      loading={loading && entries.length === 0}
      error={error}
      onRefresh={load}
      actions={
        <button
          onClick={() => zingoApi.downloadAuditExport('csv')}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-elevated hover:text-content-primary transition-colors"
        >
          <Download size={13} />
          Export CSV
        </button>
      }
    >
      <div
        className={`mb-6 rounded-lg border px-4 py-4 ${
          zeroExternal ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'
        }`}
      >
        <div className="flex items-start gap-3">
          {zeroExternal ? (
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-success" />
          ) : (
            <WifiOff size={20} className="mt-0.5 shrink-0 text-danger" />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${zeroExternal ? 'text-success' : 'text-danger'}`}>
              {zeroExternal
                ? 'Zero external calls detected'
                : `${proof?.external_calls_detected} external call(s) detected`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-content-secondary">
              {proof?.verdict ||
                'Every model call is logged with its endpoint. Nothing in this system reaches outside the machine it runs on.'}
            </p>
            {Array.isArray(proof?.distinct_endpoints_used) && proof.distinct_endpoints_used.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {proof.distinct_endpoints_used.map((e: any, i: number) => (
                  <span
                    key={i}
                    className="rounded border border-border-subtle bg-surface px-2 py-0.5 font-mono text-[11px] text-content-secondary"
                  >
                    {typeof e === 'string' ? e : e.endpoint}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Logged actions" value={total} />
        <StatCard
          label="Local model calls"
          hint={`inference host ${proof?.inference_host || "127.0.0.1:11434"}`} value={proof?.model_call_summary?.total_calls ?? 0} />
        <StatCard
          label="External calls"
          value={proof?.external_calls_detected ?? 0}
          tone={zeroExternal ? 'success' : 'danger'}
        />
        <StatCard label="Features touched" value={Object.keys(byFeature).length} />
      </div>

      <Section
        title="Filter by feature"
        right={
          <span className="text-[11px] text-content-tertiary">
            Showing {entries.length ? offset + 1 : 0}–{offset + entries.length} of {total}
          </span>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              setFeature('')
              setOffset(0)
            }}
            className={`rounded-pill border px-3 py-1 text-[11px] font-medium transition-colors ${
              feature === ''
                ? 'border-accent bg-accent text-accent-text'
                : 'border-border text-content-secondary hover:bg-elevated'
            }`}
          >
            All
          </button>
          {Object.entries(byFeature).map(([f, count]) => (
            <button
              key={f}
              onClick={() => {
                setFeature(f)
                setOffset(0)
              }}
              className={`rounded-pill border px-3 py-1 text-[11px] font-medium transition-colors ${
                feature === f
                  ? 'border-accent bg-accent text-accent-text'
                  : 'border-border text-content-secondary hover:bg-elevated'
              }`}
            >
              {f} ({count})
            </button>
          ))}
        </div>
      </Section>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          hint="Ingest a document or run a scan — every action is recorded here with a timestamp and the user who triggered it."
          icon={<ClipboardList size={22} />}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-elevated text-content-tertiary">
              <tr>
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-left font-medium">Feature</th>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Document</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <React.Fragment key={e.id}>
                  <tr className="border-t border-border-subtle hover:bg-elevated/40">
                    <td className="whitespace-nowrap px-3 py-2 text-content-tertiary">
                      {formatDateTime(e.timestamp)}
                    </td>
                    <td className="px-3 py-2 font-mono text-content-primary">{e.action}</td>
                    <td className="px-3 py-2">
                      <Badge size="sm" variant="outline">
                        {e.feature}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-content-secondary">{e.user}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-content-secondary">
                      {e.document_name || (e.document_id ? `#${e.document_id}` : '—')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                        className="text-content-tertiary hover:text-content-primary"
                      >
                        {expanded === e.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                  </tr>
                  {expanded === e.id && (
                    <tr className="border-t border-border-subtle bg-elevated/30">
                      <td colSpan={6} className="px-3 py-3">
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-content-secondary">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-elevated disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-elevated disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </ModulePage>
  )
}

export default AuditTrail
