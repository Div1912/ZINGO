import React, { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ScanSearch, FileDown, Check, BookOpen } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Spinner } from '../ui/Spinner'
import { zingoApi, severityVariant, type ComplianceGap } from '../../services/zingoApi'
import { ModulePage, StatCard, EmptyState, Section } from './shared'

const LEVEL_LABEL: Record<string, string> = {
  compliant: 'Compliant',
  full: 'Compliant',
  partial: 'Weaker than standard',
  conflict: 'Conflicts with standard',
  not_addressed: 'Not addressed',
}

const levelVariant = (level?: string): 'success' | 'warning' | 'danger' | 'default' => {
  switch ((level || '').toLowerCase()) {
    case 'compliant':
    case 'full':
      return 'success'
    case 'partial':
      return 'warning'
    case 'conflict':
    case 'not_addressed':
      return 'danger'
    default:
      return 'default'
  }
}

export const ComplianceMatrix: React.FC = () => {
  const [gaps, setGaps] = useState<ComplianceGap[]>([])
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({})
  const [sops, setSops] = useState<string[]>([])
  const [standards, setStandards] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'open' | 'all'>('open')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res: any = await zingoApi.gaps(status === 'open' ? { status: 'open' } : {})
      setGaps(res.gaps || [])
      setMatrix(res.matrix || {})
      setSops(res.sops || [])
      setStandards(res.standards || [])
    } catch (err: any) {
      setError(err?.message || 'Backend unreachable')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  const runCheck = async () => {
    setChecking(true)
    setError(null)
    try {
      await zingoApi.checkAllSops()
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Check failed')
    } finally {
      setChecking(false)
    }
  }

  const resolve = async (id: number) => {
    await zingoApi.resolveGap(id, { resolved_by: 'engineer', notes: 'Closed from workbench' })
    await load()
  }

  const bySeverity = (s: string) => gaps.filter((g) => (g.severity || '').toLowerCase() === s).length

  return (
    <ModulePage
      title="Compliance"
      subtitle="Your internal procedures read against the standards they are supposed to satisfy, clause by clause. The system reports where the SOP is silent, weaker, or in conflict — and drafts the amendment text."
      icon={<CheckCircle2 size={22} />}
      loading={loading && gaps.length === 0}
      error={error}
      onRefresh={load}
      actions={
        <button
          onClick={runCheck}
          disabled={checking}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {checking ? <Spinner size="sm" /> : <ScanSearch size={13} />}
          {checking ? 'Checking clauses…' : 'Check all SOPs'}
        </button>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="SOPs registered" value={sops.length} />
        <StatCard label="Standards loaded" value={standards.length} />
        <StatCard label="High severity gaps" value={bySeverity('high')} tone="danger" />
        <StatCard label="Total gaps" value={gaps.length} tone={gaps.length ? 'warning' : 'success'} />
      </div>

      {sops.length > 0 && standards.length > 0 && (
        <Section title="Coverage matrix">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-elevated text-content-tertiary">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">SOP</th>
                  {standards.map((std) => (
                    <th key={std} className="px-3 py-2 text-left font-mono font-medium">
                      {std}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sops.map((sop) => (
                  <tr key={sop} className="border-t border-border-subtle">
                    <td className="px-3 py-2 font-mono text-content-primary">{sop}</td>
                    {standards.map((std) => {
                      const level = matrix[sop]?.[std]
                      return (
                        <td key={std} className="px-3 py-2">
                          <Badge size="sm" variant={level ? levelVariant(level) : 'success'}>
                            {level ? LEVEL_LABEL[level] || level : 'Compliant'}
                          </Badge>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-content-tertiary">
            A cell shows the worst finding for that SOP against that standard. Cells with no finding
            passed every mandatory clause that was checked.
          </p>
        </Section>
      )}

      <Section
        title={`Gaps (${gaps.length})`}
        right={
          <div className="flex gap-1.5">
            {(['open', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-pill border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  status === s
                    ? 'border-accent bg-accent text-accent-text'
                    : 'border-border text-content-secondary hover:bg-elevated'
                }`}
              >
                {s === 'open' ? 'Open' : 'All'}
              </button>
            ))}
          </div>
        }
      >
        {gaps.length === 0 ? (
          <EmptyState
            title="No compliance gaps recorded"
            hint="Register an SOP and load the standard it must satisfy, then run a check. Every mandatory 'shall' clause is compared against your procedure text."
            icon={<BookOpen size={22} />}
          />
        ) : (
          <div className="space-y-2.5">
            {gaps.map((gap) => (
              <div key={gap.id} className="rounded-lg border border-border bg-surface px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge size="sm" variant={severityVariant(gap.severity)}>
                    {gap.severity}
                  </Badge>
                  <Badge size="sm" variant={levelVariant(gap.compliance_level)}>
                    {LEVEL_LABEL[gap.compliance_level || ''] || gap.compliance_level || 'finding'}
                  </Badge>
                  <span className="font-mono text-[11px] text-content-secondary">
                    {gap.sop_code || `SOP ${gap.sop_id}`} vs {gap.standard_code}
                    {gap.clause_number ? ` clause ${gap.clause_number}` : ''}
                  </span>
                  {gap.status !== 'open' && (
                    <Badge size="sm" variant="outline">
                      {gap.status}
                    </Badge>
                  )}
                </div>

                {gap.clause_text && (
                  <div className="mt-2.5 rounded-md border border-border-subtle bg-elevated/50 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                      Standard requires
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-content-secondary">
                      {gap.clause_text}
                    </p>
                  </div>
                )}

                <div className="mt-2.5 rounded-md border border-warning/25 bg-warning/5 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-warning">
                    What is missing in your SOP
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-content-secondary">
                    {gap.gap_description}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => zingoApi.downloadAmendment(gap.id)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-hover transition-colors"
                  >
                    <FileDown size={13} />
                    Draft amendment (.docx)
                  </button>
                  {gap.status === 'open' && (
                    <button
                      onClick={() => resolve(gap.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-elevated hover:text-content-primary transition-colors"
                    >
                      <Check size={13} />
                      Mark resolved
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </ModulePage>
  )
}

export default ComplianceMatrix
