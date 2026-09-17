import React from 'react'
import { RefreshCw, Inbox, AlertTriangle } from 'lucide-react'
import { Spinner } from '../ui/Spinner'

/** Page frame shared by every ZINGO module so the modules feel like one product. */
export const ModulePage: React.FC<{
  title: string
  subtitle?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  loading?: boolean
  error?: string | null
  onRefresh?: () => void
  children: React.ReactNode
}> = ({ title, subtitle, icon, actions, loading, error, onRefresh, children }) => (
  <div className="flex-1 h-full overflow-y-auto bg-page">
    <div className="max-w-6xl mx-auto px-5 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3 min-w-0">
          {icon && <span className="mt-0.5 text-accent shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold text-content-primary tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-content-secondary leading-relaxed max-w-2xl">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-content-secondary hover:text-content-primary hover:bg-elevated transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Could not reach the ZINGO backend</p>
            <p className="mt-0.5 text-xs opacity-80">{error}</p>
          </div>
        </div>
      )}

      {loading && !error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Spinner size="lg" />
          <span className="text-xs font-mono uppercase tracking-wider text-content-tertiary">
            Reading local index
          </span>
        </div>
      ) : (
        children
      )}
    </div>
  </div>
)

export const StatCard: React.FC<{
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'default' | 'danger' | 'warning' | 'success'
}> = ({ label, value, hint, tone = 'default' }) => {
  const toneClass =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'warning'
      ? 'text-warning'
      : tone === 'success'
      ? 'text-success'
      : 'text-content-primary'
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-content-tertiary">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-content-tertiary leading-snug">{hint}</p>}
    </div>
  )
}

export const EmptyState: React.FC<{ title: string; hint?: string; icon?: React.ReactNode }> = ({
  title,
  hint,
  icon,
}) => (
  <div className="flex flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border py-16 text-center">
    <span className="text-content-tertiary">{icon || <Inbox size={22} />}</span>
    <p className="text-sm font-medium text-content-secondary">{title}</p>
    {hint && <p className="max-w-md text-xs text-content-tertiary leading-relaxed">{hint}</p>}
  </div>
)

export const SeverityDot: React.FC<{ severity?: string; className?: string }> = ({
  severity,
  className = '',
}) => {
  const s = (severity || '').toUpperCase()
  const color =
    s === 'CRITICAL' || s === 'HIGH'
      ? 'bg-danger'
      : s === 'WARNING' || s === 'MEDIUM'
      ? 'bg-warning'
      : 'bg-content-tertiary'
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${color} ${className}`} />
}

export const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({
  title,
  children,
  right,
}) => (
  <section className="mb-6">
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">{title}</h2>
      {right}
    </div>
    {children}
  </section>
)

export const formatDate = (value?: string | null): string => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const formatDateTime = (value?: string | null): string => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
