import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
  FileDown,
  Radar,
  TrendingDown,
  Link2,
  Gauge,
  History,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { useZingoStore } from '../../stores/zingoStore'
import { zingoApi, tagList, severityVariant, type Alert } from '../../services/zingoApi'
import { ModulePage, StatCard, EmptyState, SeverityDot, formatDateTime } from './shared'

const DETECTOR_ICON: Record<string, React.ReactNode> = {
  A_monotonic_degradation: <TrendingDown size={13} />,
  B_threshold_breach: <Gauge size={13} />,
  C_cross_equipment_correlation: <Link2 size={13} />,
  D_historical_pattern: <History size={13} />,
}

const AlertCard: React.FC<{ alert: Alert; onAcknowledge: (id: number) => void }> = ({
  alert,
  onAcknowledge,
}) => {
  const [open, setOpen] = useState(false)
  const ev = alert.evidence || {}
  const window = ev.predicted_failure_window
  const tags = tagList(alert.equipment_tags)

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-elevated/60 transition-colors"
      >
        <SeverityDot severity={alert.severity} className="mt-1.5" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={severityVariant(alert.severity)} size="sm">
              {alert.severity}
            </Badge>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wide text-content-tertiary">
              {DETECTOR_ICON[ev.detector || ''] || <Radar size={13} />}
              {alert.alert_type.replace(/_/g, ' ')}
            </span>
            {tags.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded bg-elevated text-[11px] font-mono text-content-secondary border border-border-subtle"
              >
                {t}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-sm font-medium text-content-primary leading-snug">{alert.title}</p>
          <p className="mt-1 text-[11px] text-content-tertiary">
            Raised {formatDateTime(alert.created_at)}
            {window?.predicted_date ? ` · limit reached ~${window.predicted_date}` : ''}
          </p>
        </div>
        <span className="mt-0.5 text-content-tertiary shrink-0">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {open && (
        <div className="border-t border-border-subtle px-4 py-4 space-y-4">
          <p className="text-sm text-content-secondary leading-relaxed">{alert.description}</p>

          {window && (
            <div className="rounded-md border border-warning/25 bg-warning/5 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-warning">
                Predicted failure window
              </p>
              <p className="mt-1 text-sm text-content-primary">
                Reaches the limit of {window.limit} in about {window.days_remaining} days
                {window.predicted_date ? ` (around ${window.predicted_date})` : ''}.
              </p>
              {window.basis && (
                <p className="mt-1 text-[11px] text-content-tertiary">Basis: {window.basis}</p>
              )}
            </div>
          )}

          {ev.correlated_assets && ev.correlated_assets.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                Correlated assets
              </p>
              <ul className="space-y-1">
                {ev.correlated_assets.map((a, i) => (
                  <li key={i} className="text-xs text-content-secondary">
                    <span className="font-mono text-content-primary">{a.tag}</span> —{' '}
                    {a.parameter?.replace(/_/g, ' ')} {a.value} {a.unit} on {a.date}
                    {a.reason ? ` (${a.reason})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ev.evidence && ev.evidence.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                Evidence trail
              </p>
              <div className="overflow-x-auto rounded-md border border-border-subtle">
                <table className="w-full text-xs">
                  <thead className="bg-elevated text-content-tertiary">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">Reading</th>
                      <th className="px-3 py-2 text-left font-medium">Source document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ev.evidence.map((e, i) => (
                      <tr key={i} className="border-t border-border-subtle">
                        <td className="px-3 py-2 whitespace-nowrap text-content-secondary">{e.date || '—'}</td>
                        <td className="px-3 py-2 font-mono text-content-primary">
                          {e.measurement || `${e.parameter} = ${e.value} ${e.unit || ''}`}
                        </td>
                        <td className="px-3 py-2 text-content-secondary">
                          {e.document || `document ${e.doc_id}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {ev.sop_clause?.clause && (
            <div className="rounded-md border border-border-subtle bg-elevated/50 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                Governing clause
              </p>
              <p className="mt-1 text-xs text-content-secondary">
                <span className="font-mono text-content-primary">
                  {ev.sop_clause.sop_code} {ev.sop_clause.clause}
                </span>
                {ev.sop_clause.text ? ` — ${ev.sop_clause.text}` : ''}
              </p>
            </div>
          )}

          {ev.draft_action_note && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                Drafted action note
              </p>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border-subtle bg-elevated/50 px-3.5 py-3 text-xs leading-relaxed text-content-secondary font-sans">
                {ev.draft_action_note}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => zingoApi.downloadAlertNote(alert.id)}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-hover transition-colors"
            >
              <FileDown size={13} />
              Download action note (.docx)
            </button>
            {alert.status === 'active' && (
              <button
                onClick={() => onAcknowledge(alert.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:text-content-primary hover:bg-elevated transition-colors"
              >
                <Check size={13} />
                Acknowledge
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export const AlertsPanel: React.FC = () => {
  const { activeAlerts, isLoading, isScanning, error, refresh, runFullScan, acknowledgeAlert } =
    useZingoStore()
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL')

  useEffect(() => {
    refresh()
  }, [refresh])

  const counts = useMemo(() => {
    const base = { CRITICAL: 0, WARNING: 0, INFO: 0 }
    activeAlerts.forEach((a) => {
      base[a.severity] = (base[a.severity] || 0) + 1
    })
    return base
  }, [activeAlerts])

  const shown = useMemo(
    () => (filter === 'ALL' ? activeAlerts : activeAlerts.filter((a) => a.severity === filter)),
    [activeAlerts, filter]
  )

  return (
    <ModulePage
      title="Alerts"
      subtitle="Findings the passive monitor raised on its own while reading your documents — degradation trends, threshold breaches and anomalies that correlate across connected equipment."
      icon={<AlertTriangle size={22} />}
      loading={isLoading && activeAlerts.length === 0}
      error={error}
      onRefresh={refresh}
      actions={
        <button
          onClick={runFullScan}
          disabled={isScanning}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          <Radar size={13} className={isScanning ? 'animate-spin' : ''} />
          {isScanning ? 'Scanning…' : 'Run full scan'}
        </button>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Critical" value={counts.CRITICAL} tone="danger" />
        <StatCard label="Warning" value={counts.WARNING} tone="warning" />
        <StatCard label="Informational" value={counts.INFO} />
        <StatCard label="Total open" value={activeAlerts.length} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-pill border px-3 py-1 text-[11px] font-medium transition-colors ${
              filter === f
                ? 'border-accent bg-accent text-accent-text'
                : 'border-border text-content-secondary hover:bg-elevated'
            }`}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="No open alerts"
          hint="Ingest inspection reports, then run a full scan. The monitor compares every new reading against the equipment's own history and its connected assets."
          icon={<Radar size={22} />}
        />
      ) : (
        <div className="space-y-2.5">
          {shown.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={(id) => acknowledgeAlert(id, 'Acknowledged from workbench')}
            />
          ))}
        </div>
      )}
    </ModulePage>
  )
}

export default AlertsPanel
