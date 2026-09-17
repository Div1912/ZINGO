import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCcw, FileDown, Plus, Repeat, Clock } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Spinner } from '../ui/Spinner'
import { zingoApi } from '../../services/zingoApi'
import { ModulePage, StatCard, EmptyState, Section, SeverityDot, formatDateTime } from './shared'

const SHIFTS = ['morning', 'afternoon', 'night']
const today = () => new Date().toISOString().slice(0, 10)

const statusVariant = (status: string): 'danger' | 'warning' | 'default' =>
  status === 'CRITICAL' ? 'danger' : status === 'WATCH' ? 'warning' : 'default'

export const ShiftHandover: React.FC = () => {
  const [shiftDate, setShiftDate] = useState(today())
  const [shiftType, setShiftType] = useState('morning')
  const [handover, setHandover] = useState<Record<string, any> | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    equipment_tag: '',
    event_type: 'observation',
    description: '',
    severity: 'notable',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [existing, ev] = await Promise.all([
        zingoApi.handover(shiftDate, shiftType).catch(() => null),
        zingoApi.shiftEvents({ shift_date: shiftDate, shift_type: shiftType, limit: 100 }),
      ])
      setHandover(existing && (existing as any).handover_brief ? existing : null)
      setEvents((ev as any)?.events || [])
    } catch (err: any) {
      setError(err?.message || 'Backend unreachable')
    } finally {
      setLoading(false)
    }
  }, [shiftDate, shiftType])

  useEffect(() => {
    load()
  }, [load])

  const generate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await zingoApi.generateHandover({
        shift_date: shiftDate,
        shift_type: shiftType,
        generated_by: 'shift_incharge',
      })
      setHandover(res)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not build the handover')
    } finally {
      setGenerating(false)
    }
  }

  const logEvent = async () => {
    if (!form.description.trim()) return
    await zingoApi.logShiftEvent({
      shift_date: shiftDate,
      shift_type: shiftType,
      equipment_tag: form.equipment_tag.trim() || null,
      event_type: form.event_type,
      severity: form.severity,
      description: form.description.trim(),
      logged_by: 'shift_incharge',
    })
    setForm({ ...form, description: '', equipment_tag: '' })
    setShowForm(false)
    await load()
  }

  const recurring = handover?.recurring_issues || []
  const summary = handover?.equipment_summary || []

  return (
    <ModulePage
      title="Shift Handover"
      subtitle="The brief the outgoing shift never has time to write. It reads this shift's log entries, checks whether the same equipment appeared in previous shifts, and flags what is recurring rather than new."
      icon={<RefreshCcw size={22} />}
      loading={loading && !handover && events.length === 0}
      error={error}
      onRefresh={load}
      actions={
        <>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-elevated hover:text-content-primary transition-colors"
          >
            <Plus size={13} />
            Log event
          </button>
          <button
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-hover transition-colors disabled:opacity-60"
          >
            {generating ? <Spinner size="sm" /> : <RefreshCcw size={13} />}
            {generating ? 'Building…' : 'Build handover'}
          </button>
        </>
      }
    >
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-content-tertiary">
            Shift date
          </span>
          <input
            type="date"
            value={shiftDate}
            onChange={(e) => setShiftDate(e.target.value)}
            className="rounded-md border border-border bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-content-tertiary">
            Shift
          </span>
          <select
            value={shiftType}
            onChange={(e) => setShiftType(e.target.value)}
            className="rounded-md border border-border bg-elevated px-3 py-2 text-sm capitalize text-content-primary outline-none focus:border-accent"
          >
            {SHIFTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {handover && (
          <button
            onClick={() => zingoApi.downloadHandover(shiftDate, shiftType)}
            className="ml-auto inline-flex h-[38px] items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-content-secondary hover:bg-elevated hover:text-content-primary transition-colors"
          >
            <FileDown size={13} />
            Download brief (.docx)
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-accent/40 bg-surface p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={form.equipment_tag}
              onChange={(e) => setForm({ ...form, equipment_tag: e.target.value })}
              placeholder="Equipment tag (HE-301)"
              className="rounded-md border border-border bg-elevated px-3 py-2 font-mono text-sm text-content-primary outline-none placeholder:text-content-disabled focus:border-accent"
            />
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="rounded-md border border-border bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-accent"
            >
              {['observation', 'action_taken', 'escalation', 'pending_task', 'abnormality'].map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="rounded-md border border-border bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-accent"
            >
              {['routine', 'notable', 'critical'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            placeholder="What happened during this shift?"
            className="mt-3 w-full resize-y rounded-md border border-border bg-elevated px-3 py-2 text-sm text-content-primary outline-none placeholder:text-content-disabled focus:border-accent"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-elevated"
            >
              Cancel
            </button>
            <button
              onClick={logEvent}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-hover"
            >
              Save entry
            </button>
          </div>
        </div>
      )}

      {handover ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Log entries" value={handover.event_count ?? events.length} />
            <StatCard label="Open alerts referenced" value={handover.alert_count ?? 0} tone="warning" />
            <StatCard label="Critical items" value={handover.critical_count ?? 0} tone="danger" />
            <StatCard label="Recurring issues" value={recurring.length} tone={recurring.length ? 'warning' : 'default'} />
          </div>

          {recurring.length > 0 && (
            <Section title="Recurring across shifts">
              <div className="space-y-2">
                {recurring.map((r: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning/5 px-4 py-3"
                  >
                    <Repeat size={15} className="mt-0.5 shrink-0 text-warning" />
                    <div>
                      <p className="font-mono text-sm text-content-primary">{r.equipment_tag}</p>
                      <p className="mt-0.5 text-xs text-content-secondary">
                        Appeared in {r.consecutive_shifts} consecutive shifts — this is not a fresh
                        observation, it is an unresolved one.
                      </p>
                      {r.shift_chain?.length ? (
                        <p className="mt-1.5 font-mono text-[11px] text-content-tertiary">
                          {r.shift_chain.join('  <-  ')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Handover brief">
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface px-4 py-4 font-sans text-sm leading-relaxed text-content-secondary">
              {handover.handover_brief}
            </pre>
          </Section>

          {summary.length > 0 && (
            <Section title="Equipment status this shift">
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-elevated text-content-tertiary">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Equipment</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((s: any) => (
                      <tr key={s.tag} className="border-t border-border-subtle">
                        <td className="px-3 py-2 font-mono text-content-primary">{s.tag}</td>
                        <td className="px-3 py-2">
                          <Badge size="sm" variant={statusVariant(s.status)}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-content-secondary">
                          {(s.notes || []).join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      ) : (
        <EmptyState
          title="No handover built for this shift yet"
          hint="Log what happened, then build the handover. The brief is assembled from your entries, open alerts and what previous shifts already reported."
          icon={<Clock size={22} />}
        />
      )}

      <Section title={`Shift log (${events.length})`}>
        {events.length === 0 ? (
          <p className="text-xs text-content-tertiary">No entries recorded for this shift.</p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-4 py-3">
                <SeverityDot severity={e.severity === 'critical' ? 'CRITICAL' : e.severity === 'notable' ? 'WARNING' : 'INFO'} className="mt-1.5" />
                <div className="min-w-0">
                  <p className="text-sm text-content-primary leading-snug">{e.description}</p>
                  <p className="mt-1 text-[11px] text-content-tertiary">
                    {e.equipment_tag ? `${e.equipment_tag} · ` : ''}
                    {(e.event_type || '').replace(/_/g, ' ')} · {formatDateTime(e.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </ModulePage>
  )
}

export default ShiftHandover
