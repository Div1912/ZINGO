import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Network, Send, Plus } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Spinner } from '../ui/Spinner'
import { zingoApi } from '../../services/zingoApi'
import { ModulePage, StatCard, EmptyState, Section } from './shared'

interface GNode {
  id: string
  label: string
  type?: string
  service?: string
  line_number?: string
  alert_count?: number
  critical_alerts?: number
  warning_alerts?: number
  health_score?: number
  band?: string
  degree?: number
}
interface GEdge {
  source: string
  target: string
  line_number?: string
  connection_type?: string
  inferred?: boolean
}

const bandFill = (band?: string, score?: number): string => {
  const s = score ?? 100
  if (band === 'critical' || s < 40) return '#ef4444'
  if (band === 'poor' || s < 60) return '#f97316'
  if (band === 'fair' || s < 80) return '#eab308'
  return '#22c55e'
}

/** Deterministic circular layout — readable, no physics simulation, no layout jitter. */
const layout = (nodes: GNode[], width: number, height: number) => {
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) / 2 - 70
  const positions: Record<string, { x: number; y: number }> = {}
  if (nodes.length === 1) {
    positions[nodes[0].id] = { x: cx, y: cy }
    return positions
  }
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
    positions[n.id] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  })
  return positions
}

export const KnowledgeGraph: React.FC = () => {
  const [nodes, setNodes] = useState<GNode[]>([])
  const [edges, setEdges] = useState<GEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, any> | null>(null)
  const [query, setQuery] = useState('what equipment is connected to HE-301?')
  const [answer, setAnswer] = useState<Record<string, any> | null>(null)
  const [asking, setAsking] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [conn, setConn] = useState({ from_tag: '', to_tag: '', connection_type: 'process', line_number: '' })
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 640, height: 420 })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res: any = await zingoApi.topology()
      setNodes(res.nodes || [])
      setEdges(res.edges || [])
    } catch (err: any) {
      setError(err?.message || 'Backend unreachable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const measure = () => {
      const w = wrapRef.current?.clientWidth || 640
      setSize({ width: w, height: Math.max(360, Math.min(520, w * 0.62)) })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    zingoApi
      .equipment(selected)
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [selected])

  const positions = useMemo(() => layout(nodes, size.width, size.height), [nodes, size])

  const ask = async () => {
    if (!query.trim()) return
    setAsking(true)
    setAnswer(null)
    try {
      setAnswer(await zingoApi.graphQuery(query.trim()))
    } catch (err: any) {
      setAnswer({ error: err?.response?.data?.detail || err?.message })
    } finally {
      setAsking(false)
    }
  }

  const addConnection = async () => {
    if (!conn.from_tag.trim() || !conn.to_tag.trim()) return
    await zingoApi.addConnection({
      tag_a: conn.from_tag.trim().toUpperCase(),
      tag_b: conn.to_tag.trim().toUpperCase(),
      connection_type: conn.connection_type,
      line_number: conn.line_number.trim() || null,
      added_by: 'engineer',
    })
    setConn({ from_tag: '', to_tag: '', connection_type: 'process', line_number: '' })
    setShowAdd(false)
    await load()
  }

  return (
    <ModulePage
      title="Knowledge Graph"
      subtitle="How your plant is actually wired together, built from the documents themselves. This is what lets a reading on one asset explain a reading on another."
      icon={<Network size={22} />}
      loading={loading && nodes.length === 0}
      error={error}
      onRefresh={load}
      actions={
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-elevated hover:text-content-primary transition-colors"
        >
          <Plus size={13} />
          Add connection
        </button>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Assets" value={nodes.length} />
        <StatCard label="Connections" value={edges.length} />
        <StatCard
          label="Assets with alerts"
          value={nodes.filter((n) => (n.alert_count || 0) > 0).length}
          tone="warning"
        />
        <StatCard
          label="Most connected"
          value={nodes.length ? [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0))[0].id : '—'}
        />
      </div>

      {showAdd && (
        <div className="mb-6 rounded-lg border border-accent/40 bg-surface p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <input
              value={conn.from_tag}
              onChange={(e) => setConn({ ...conn, from_tag: e.target.value })}
              placeholder="From tag"
              className="rounded-md border border-border bg-elevated px-3 py-2 font-mono text-sm text-content-primary outline-none placeholder:text-content-disabled focus:border-accent"
            />
            <input
              value={conn.to_tag}
              onChange={(e) => setConn({ ...conn, to_tag: e.target.value })}
              placeholder="To tag"
              className="rounded-md border border-border bg-elevated px-3 py-2 font-mono text-sm text-content-primary outline-none placeholder:text-content-disabled focus:border-accent"
            />
            <select
              value={conn.connection_type}
              onChange={(e) => setConn({ ...conn, connection_type: e.target.value })}
              className="rounded-md border border-border bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-accent"
            >
              {['process', 'utility', 'upstream', 'downstream', 'shared_service'].map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <input
              value={conn.line_number}
              onChange={(e) => setConn({ ...conn, line_number: e.target.value })}
              placeholder="Line number"
              className="rounded-md border border-border bg-elevated px-3 py-2 font-mono text-sm text-content-primary outline-none placeholder:text-content-disabled focus:border-accent"
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-elevated"
            >
              Cancel
            </button>
            <button
              onClick={addConnection}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-hover"
            >
              Add
            </button>
          </div>
        </div>
      )}

      <Section title="Ask the graph">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask()}
              placeholder="What equipment is connected to HE-301?"
              className="flex-1 rounded-md border border-border bg-elevated px-3 py-2 text-sm text-content-primary outline-none placeholder:text-content-disabled focus:border-accent"
            />
            <button
              onClick={ask}
              disabled={asking}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-xs font-medium text-accent-text hover:bg-accent-hover transition-colors disabled:opacity-60"
            >
              {asking ? <Spinner size="sm" /> : <Send size={13} />}
              Ask
            </button>
          </div>

          {answer && (
            <div className="mt-3 rounded-md border border-border-subtle bg-elevated/50 px-3.5 py-3">
              {answer.error ? (
                <p className="text-xs text-danger">{answer.error}</p>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-content-primary">
                    {answer.explanation || 'No answer produced.'}
                  </p>
                  {answer.results?.connected && (
                    <ul className="mt-2 space-y-1">
                      {Object.entries(answer.results.connected as Record<string, any[]>).map(
                        ([tag, list]) => (
                          <li key={tag} className="text-xs text-content-secondary">
                            <span className="font-mono text-content-primary">{tag}</span> connects to{' '}
                            {list.length
                              ? list
                                  .map(
                                    (c: any) =>
                                      `${c.tag} (${c.hops} hop${c.hops === 1 ? '' : 's'}${
                                        c.line_number ? `, line ${c.line_number}` : ''
                                      }, health ${c.health_score})`
                                  )
                                  .join(', ')
                              : 'nothing recorded yet'}
                          </li>
                        )
                      )}
                    </ul>
                  )}
                  {Array.isArray(answer.highlight_nodes) && answer.highlight_nodes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {answer.highlight_nodes.map((t: string) => (
                        <span
                          key={t}
                          className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[11px] text-content-secondary"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {answer.structured_query?.query_type && (
                    <p className="mt-2 text-[11px] text-content-tertiary">
                      Interpreted as: {String(answer.structured_query.query_type).replace(/_/g, ' ')}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="Plant topology">
        {nodes.length === 0 ? (
          <EmptyState
            title="No equipment in the graph yet"
            hint="Tags mentioned together in a document become connected nodes. Upload a P&ID note or inspection report to seed it."
            icon={<Network size={22} />}
          />
        ) : (
          <div ref={wrapRef} className="rounded-lg border border-border bg-surface p-2">
            <svg width="100%" height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
              {edges.map((e, i) => {
                const a = positions[e.source]
                const b = positions[e.target]
                if (!a || !b) return null
                return (
                  <g key={i}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="currentColor"
                      className="text-border-strong"
                      strokeWidth={1.5}
                      strokeDasharray={e.inferred ? '4 4' : undefined}
                    />
                    <text
                      x={(a.x + b.x) / 2}
                      y={(a.y + b.y) / 2 - 5}
                      textAnchor="middle"
                      className="fill-current text-content-tertiary"
                      fontSize={10}
                    >
                      {e.line_number || e.connection_type?.replace(/_/g, ' ') || ''}
                    </text>
                  </g>
                )
              })}
              {nodes.map((n) => {
                const p = positions[n.id]
                if (!p) return null
                const r = 22 + Math.min(10, (n.degree || 0) * 2)
                return (
                  <g
                    key={n.id}
                    onClick={() => setSelected(n.id === selected ? null : n.id)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r}
                      fill={bandFill(n.band, n.health_score)}
                      fillOpacity={selected === n.id ? 0.95 : 0.7}
                      stroke={selected === n.id ? '#fff' : bandFill(n.band, n.health_score)}
                      strokeWidth={selected === n.id ? 2.5 : 1}
                    />
                    <text
                      x={p.x}
                      y={p.y + r + 15}
                      textAnchor="middle"
                      className="fill-current text-content-primary"
                      fontSize={12}
                      fontWeight={600}
                    >
                      {n.id}
                    </text>
                    <text
                      x={p.x}
                      y={p.y + 4}
                      textAnchor="middle"
                      fill="#0b0b0b"
                      fontSize={12}
                      fontWeight={700}
                    >
                      {n.health_score ?? '—'}
                    </text>
                  </g>
                )
              })}
            </svg>
            <p className="px-2 pb-1 text-[11px] text-content-tertiary">
              Circle size = number of connections · colour = health score · dashed line = inferred from
              document co-occurrence. Click a node for detail.
            </p>
          </div>
        )}
      </Section>

      {selected && detail && (
        <Section title={`${selected} detail`}>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-content-primary">{selected}</span>
              {detail.attributes?.equipment_type && (
                <Badge size="sm" variant="outline">
                  {String(detail.attributes.equipment_type).replace(/_/g, ' ')}
                </Badge>
              )}
              {typeof detail.health?.health_score === 'number' && (
                <Badge
                  size="sm"
                  variant={detail.health.health_score < 40 ? 'danger' : detail.health.health_score < 80 ? 'warning' : 'success'}
                >
                  health {detail.health.health_score}
                </Badge>
              )}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                  Directly connected
                </p>
                <p className="mt-1 text-xs text-content-secondary">
                  {(detail.connected_equipment || [])
                    .map((c: any) => `${c.tag} (${c.hops} hop${c.hops === 1 ? '' : 's'})`)
                    .join(', ') || 'none recorded'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                  Documents referencing it
                </p>
                <p className="mt-1 text-xs text-content-secondary">
                  {(detail.documents || []).length}
                </p>
              </div>
            </div>

            {Array.isArray(detail.active_alerts) && detail.active_alerts.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                  Open alerts
                </p>
                <ul className="mt-1 space-y-1">
                  {detail.active_alerts.map((a: any) => (
                    <li key={a.id} className="text-xs text-content-secondary">
                      <span className={a.severity === 'CRITICAL' ? 'text-danger' : 'text-warning'}>
                        {a.severity}
                      </span>{' '}
                      — {a.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}
    </ModulePage>
  )
}

export default KnowledgeGraph
