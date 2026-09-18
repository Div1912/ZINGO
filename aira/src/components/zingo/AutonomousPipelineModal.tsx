import React, { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  FileText,
  Network,
  History,
  TrendingDown,
  PenTool,
  BookOpen,
  Scale,
  BellRing,
  ShieldCheck,
  Activity,
  X,
  RefreshCw,
} from 'lucide-react'
import { zingoApi } from '../../services/zingoApi'

interface AutonomousPipelineModalProps {
  pipelineId: string | null
  isOpen: boolean
  onClose: () => void
  onOpenActionNote?: (noteId: number) => void
}

const STEP_ICONS: Record<number, React.ReactNode> = {
  1: <FileText size={15} />,
  2: <Network size={15} />,
  3: <History size={15} />,
  4: <TrendingDown size={15} />,
  5: <PenTool size={15} />,
  6: <BookOpen size={15} />,
  7: <Scale size={15} />,
  8: <BellRing size={15} />,
  9: <ShieldCheck size={15} />,
  10: <Activity size={15} />,
}

const STEP_NAMES: Record<number, string> = {
  1: 'Ingest Document & Extract Entities',
  2: 'Knowledge Graph Topology Matching',
  3: 'Multi-Source Equipment History Retrieval',
  4: 'Autonomous Pattern & RUL Analysis',
  5: 'Draft Engineering Action Note',
  6: 'Evaluate SOP & Regulatory Triggers',
  7: 'Multi-Document Contradiction Check',
  8: 'Dispatch Alert to Engineer Role',
  9: 'Log Sovereign Audit Trail Entry',
  10: 'Update Live Plant Health Map',
}

export const AutonomousPipelineModal: React.FC<AutonomousPipelineModalProps> = ({
  pipelineId,
  isOpen,
  onClose,
  onOpenActionNote,
}) => {
  const [pipelineData, setPipelineData] = useState<any>(null)

  useEffect(() => {
    if (!isOpen || !pipelineId) return

    let cancelled = false
    const poll = async () => {
      try {
        const res = await zingoApi.pipelineStatus(pipelineId)
        if (!cancelled) {
          setPipelineData(res)
          // Keep polling if still running
          if (res.status === 'RUNNING') {
            setTimeout(poll, 1000)
          }
        }
      } catch {
        // Silently continue polling or finish
      }
    }

    poll()
    return () => {
      cancelled = true
    }
  }, [isOpen, pipelineId])

  if (!isOpen) return null

  const isCompleted = pipelineData?.status === 'COMPLETED'
  const isRunning = pipelineData?.status === 'RUNNING'
  const currentStep = pipelineData?.current_step || 1
  const stepsCompleted = pipelineData?.steps_completed || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-surface border border-border p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-accent">
                {pipelineId}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                isCompleted
                  ? 'bg-success/10 text-success border border-success/20'
                  : 'bg-accent/10 text-accent border border-accent/20 animate-pulse'
              }`}>
                {pipelineData?.status || 'INITIALIZING'}
              </span>
            </div>
            <h2 className="text-base font-bold text-content-primary mt-1">
              Autonomous Agent Ingestion Pipeline
            </h2>
            <p className="text-xs text-content-secondary mt-0.5">
              10-step autonomous event sequence executing automatically on document upload.
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-icon !w-8 !h-8 text-content-tertiary hover:text-content-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* 10-Step Progress Stepper */}
        <div className="space-y-2.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((stepNum) => {
            const isDone = stepsCompleted.some((s: any) => s.step === stepNum) || (isCompleted)
            const isCurrent = isRunning && currentStep === stepNum

            return (
              <div
                key={stepNum}
                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 text-xs ${
                  isDone
                    ? 'bg-success/5 border-success/20 text-content-primary'
                    : isCurrent
                    ? 'bg-accent/10 border-accent/40 text-accent animate-pulse'
                    : 'bg-elevated/40 border-border/50 text-content-tertiary opacity-70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                    isDone
                      ? 'bg-success/15 border-success/30 text-success'
                      : isCurrent
                      ? 'bg-accent/20 border-accent/40 text-accent'
                      : 'bg-surface border-border text-content-tertiary'
                  }`}>
                    {STEP_ICONS[stepNum]}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase font-bold text-content-tertiary">
                        Step {stepNum}
                      </span>
                      <strong className="font-medium">{STEP_NAMES[stepNum]}</strong>
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {isDone ? (
                    <CheckCircle2 size={16} className="text-success" />
                  ) : isCurrent ? (
                    <RefreshCw size={15} className="animate-spin text-accent" />
                  ) : (
                    <Clock size={15} className="text-content-tertiary opacity-40" />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Completed Verdict & Action Note Launcher */}
        {isCompleted && (
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-accent font-semibold text-xs">
                <CheckCircle2 size={16} />
                <span>Autonomous Analysis Complete</span>
              </div>
              <span className="text-[11px] font-mono text-content-secondary">
                Duration: {pipelineData?.execution_time_ms || 0} ms
              </span>
            </div>

            {pipelineData?.action_notes && pipelineData.action_notes.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-content-primary font-medium">
                  {pipelineData.action_notes.length} Action Note(s) drafted and ready for review:
                </p>
                {pipelineData.action_notes.map((note: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-surface border border-border flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-accent">{note.ref_number}</span>
                      <p className="text-[11px] text-content-secondary mt-0.5">
                        Assigned to: <strong className="text-content-primary">{note.target_role}</strong>
                      </p>
                    </div>

                    {onOpenActionNote && (
                      <button
                        onClick={() => {
                          onClose()
                          onOpenActionNote(note.note_id)
                        }}
                        className="btn-primary !py-1 !px-3 !text-xs flex items-center gap-1 shadow-xs"
                      >
                        <span>Review & Sign</span>
                        <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-content-secondary">
                No anomalous threshold breaches or degradation detected in this document. Baseline verified.
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="btn-ghost !py-1.5 !px-4 !text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
