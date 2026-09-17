import React, { useEffect, useMemo, useState } from 'react'
import { Factory, ChevronRight, TrendingDown, ShieldAlert } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { useZingoStore } from '../../stores/zingoStore'
import { zingoApi, healthColor, type EquipmentHealth } from '../../services/zingoApi'
import { ModulePage, StatCard, EmptyState, formatDate } from './shared'

const bandLabel = (score: number): { label: string; variant: 'success' | 'warning' | 'danger' | 'default' } => {
  if (score >= 80) return { label: 'Healthy', variant: 'success' }
  if (score >= 60) return { label: 'Watch', variant: 'warning' }
  if (score >= 40) return { label: 'Degraded', variant: 'warning' }
  return { label: 'Critical', variant: 'danger' }
}

const HealthTile: React.FC<{ item: EquipmentHealth; onSelect: (tag: string) => void; selected: boolean }> = ({
  item,
  onSelect,
  selected,
}) => {
  const band = bandLabel(item.health_score)
  return (
    <button
      onClick={() => onSelect(item.tag)}
      className={`w-full rounded-lg border px-4 py-3.5 text-left transition-colors ${
        selected ? 'border-accent bg-elevated' : 'border-border bg-surface hover:bg-elevated/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-content-primary">{item.tag}</p>
          <p className="mt-0.5 text-[11px] capitalize text-content-tertiary">
            {(item.equipment_type || 'equipment').replace(/_/g, ' ')}
          </p>
        </div>
        <Badge variant={band.variant} size="sm">
          {band.label}
        </Badge>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <span className={`text-3xl font-semibold tabular-nums ${healthColor(item.health_score)}`}>
          {item.health_score}
        </span>
        <div className="text-right text-[11px] text-content-tertiary leading-tight">
          {item.critical_alerts > 0 && <p className="text-danger">{item.critical_alerts} critical</p>}
          {item.warning_alerts > 0 && <p className="text-warning">{item.warning_alerts} warning</p>}
          {item.open_contradictions > 0 && <p>{item.open_contradictions} contradiction(s)</p>}
        </div>
      </div>

      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-pill bg-elevated">
        <div
          className={`h-full rounded-pill ${
            item.health_score >= 80
              ? 'bg-success'
              : item.health_score >= 60
              ? 'bg-warning'
              : item.health_score >= 40
              ? 'bg-orange-500'
              : 'bg-danger'
          }`}
          style={{ width: `${Math.max(item.health_score, 3)}%` }}
        />
      </div>
    </button>
  )
}

export const PlantHealthMap: React.FC = () => {
  const { plantHealth, averageHealth, isLoading, error, refresh } = useZingoStore()
  const [selected, setSelected] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<Record<string, any> | null>(null)
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!selected) return
    setLoadingTimeline(true)
    zingoApi
      .timeline(selected)
      .then(setTimeline)
      .catch(() => setTimeline(null))
      .finally(() => setLoadingTimeline(false))
  }, [selected])

  const sorted = useMemo(
    () => [...plantHealth].sort((a, b) => a.health_score - b.health_score),
    [plantHealth]
  )
  const worst = sorted[0]

  return (
    <ModulePage
      title="Plant Health"
      subtitle="A health score per asset, derived from open alerts, inspection recency and unresolved document conflicts. Every deduction is traceable to a specific finding."
      icon={<Factory size={22} />}
      loading={isLoading && plantHealth.length === 0}
      error={error}
      onRefresh={refresh}
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Assets tracked" value={plantHealth.length} />
        <StatCard
          label="Average health"
          value={Math.round(averageHealth)}
          tone={averageHealth >= 70 ? 'success' : averageHealth >= 40 ? 'warning' : 'danger'}
        />
        <StatCard
          label="Needs attention"
          value={plantHealth.filter((e) => e.health_score < 60).length}
          tone="warning"
        />
        <StatCard
          label="Worst asset"
          value={worst ? worst.tag : '—'}
          hint={worst ? `score ${worst.health_score}` : undefined}
          tone="danger"
        />
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="No equipment mapped yet"
          hint="Upload inspection reports or maintenance logs. Equipment tags found in your documents become nodes here automatically."
          icon={<Factory size={22} />}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-2.5">
            {sorted.map((item) => (
              <HealthTile
                key={item.tag}
                item={item}
                selected={selected === item.tag}
                onSelect={(tag) => setSelected(tag === selected ? null : tag)}
              />
            ))}
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            {!selected ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
                <ChevronRight size={20} className="text-content-tertiary" />
                <p className="text-sm text-content-secondary">Select an asset</p>
                <p className="max-w-xs text-xs text-content-tertiary">
                  You will see why its score dropped and the measurement history behind it.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="font-mono text-sm font-semibold text-content-primary">{selected}</p>
                  <p className="text-[11px] text-content-tertiary">Score breakdown and reading history</p>
                </div>

                {(() => {
                  const item = sorted.find((e) => e.tag === selected)
                  if (!item) return null
                  return (
                    <>
                      <div className="rounded-md border border-border-subtle bg-elevated/50 px-3.5 py-3">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                          <ShieldAlert size={12} /> Why this score
                        </p>
                        <ul className="mt-1.5 space-y-1 text-xs text-content-secondary">
                          <li>Starts at 100 for every asset.</li>
                          {(item.deductions || []).map((d, i) => (
                            <li key={i} className="text-danger">
                              {d}
                            </li>
                          ))}
                          {(item.deductions || []).length === 0 && <li>No deductions — nothing open.</li>}
                        </ul>
                        <p className="mt-2 text-xs text-content-primary">
                          Last reading {formatDate(item.last_measurement_date)}
                          {item.inspection_stale ? ' · inspection overdue' : ''}
                        </p>
                      </div>

                      <div>
                        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                          <TrendingDown size={12} /> Measurement history
                        </p>
                        {loadingTimeline ? (
                          <p className="text-xs text-content-tertiary">Loading…</p>
                        ) : timeline?.series ? (
                          <div className="space-y-3">
                            {Object.entries(timeline.series as Record<string, any[]>)
                              .filter(([p]) => !/^(design_|rated_|nominal_)|_limit$|retirement_/.test(p))
                              .map(
                              ([parameter, points]) => (
                                <div key={parameter}>
                                  <p className="text-xs font-medium capitalize text-content-primary">
                                    {parameter.replace(/_/g, ' ')}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    {points.map((p: any, i: number) => (
                                      <span
                                        key={i}
                                        className="rounded border border-border-subtle bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-content-secondary"
                                        title={p.date}
                                      >
                                        {p.value}
                                        {p.unit ? ` ${p.unit}` : ''}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-content-tertiary">No readings recorded yet.</p>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </ModulePage>
  )
}

export default PlantHealthMap
