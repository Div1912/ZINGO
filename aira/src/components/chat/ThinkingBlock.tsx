/**
 * ZINGO — ThinkingBlock Component
 * ================================
 * Renders the model's live chain-of-thought reasoning steps with
 * professional, custom vector iconography (no AI-generated emoji placeholders).
 */

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  CheckCircle2,
  Eye,
  ArrowRight,
  CornerDownRight,
  Target,
  CheckCheck,
  AlertTriangle,
  FileText,
  BarChart2,
  Lightbulb,
  GitCommit,
  ChevronDown,
  Sparkles,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThinkStep {
  step_number: number
  content: string
}

export interface ThinkingBlockProps {
  steps: ThinkStep[]
  rawThinking?: string        // live character stream before steps are flushed
  isStreaming?: boolean       // true while model is still thinking
  isThinkingPhase?: boolean   // true = still in <think>, false = answered
  totalSteps?: number
  elapsedMs?: number
}

// ─── Professional Vector Icon Resolver ───────────────────────────────────────

function renderStepIcon(content: string) {
  const lower = content.toLowerCase().trim()

  if (lower.startsWith('analysing') || lower.startsWith('analyzing')) {
    return <Search size={13} className="text-violet-400 shrink-0" strokeWidth={2} />
  }
  if (lower.startsWith('checking')) {
    return <CheckCircle2 size={13} className="text-emerald-400 shrink-0" strokeWidth={2} />
  }
  if (lower.startsWith('looking')) {
    return <Eye size={13} className="text-sky-400 shrink-0" strokeWidth={2} />
  }
  if (lower.startsWith('step') || lower.startsWith('next')) {
    return <ArrowRight size={13} className="text-violet-400 shrink-0" strokeWidth={2} />
  }
  if (lower.startsWith('therefore')) {
    return <CornerDownRight size={13} className="text-indigo-400 shrink-0" strokeWidth={2} />
  }
  if (lower.startsWith('conclusion')) {
    return <Target size={13} className="text-amber-400 shrink-0" strokeWidth={2} />
  }
  if (lower.startsWith('finally')) {
    return <CheckCheck size={13} className="text-emerald-400 shrink-0" strokeWidth={2} />
  }
  if (lower.startsWith('however')) {
    return <AlertTriangle size={13} className="text-amber-400 shrink-0" strokeWidth={2} />
  }
  if (lower.startsWith('given')) {
    return <FileText size={13} className="text-blue-400 shrink-0" strokeWidth={2} />
  }
  if (lower.startsWith('based')) {
    return <BarChart2 size={13} className="text-cyan-400 shrink-0" strokeWidth={2} />
  }
  if (lower.startsWith('so') || lower.startsWith('now')) {
    return <Lightbulb size={13} className="text-yellow-400 shrink-0" strokeWidth={2} />
  }

  return <GitCommit size={13} className="text-violet-400/60 shrink-0" strokeWidth={2} />
}

// ─── High-Precision Pulse Indicator ──────────────────────────────────────────

const ThinkingRadar: React.FC = () => (
  <div className="flex items-center gap-2">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
    </span>
    <span className="text-[11px] font-mono text-violet-300 tracking-wide font-medium">
      Synthesizing Deep Reasoning
    </span>
  </div>
)

// ─── Step Row Component ──────────────────────────────────────────────────────

const StepRow: React.FC<{ step: ThinkStep; index: number }> = ({ step, index }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
      className="flex items-start gap-2.5 py-1.5 border-l border-violet-500/20 pl-3 ml-1.5"
    >
      <div className="mt-0.5 flex items-center justify-center">
        {renderStepIcon(step.content)}
      </div>
      <p className="text-xs text-content-secondary leading-relaxed font-mono select-text break-words">
        {step.content}
      </p>
    </motion.div>
  )
}

// ─── Main ThinkingBlock ───────────────────────────────────────────────────────

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  steps,
  rawThinking = '',
  isStreaming = false,
  isThinkingPhase = false,
  totalSteps,
  elapsedMs,
}) => {
  const [expanded, setExpanded] = useState(true)
  const [autoCollapsed, setAutoCollapsed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (isStreaming && expanded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [steps, rawThinking, isStreaming, expanded])

  // Auto-collapse 1.5s after thinking ends
  useEffect(() => {
    if (!isThinkingPhase && !isStreaming && !autoCollapsed && steps.length > 0) {
      const t = setTimeout(() => {
        setExpanded(false)
        setAutoCollapsed(true)
      }, 1500)
      return () => clearTimeout(t)
    }
  }, [isThinkingPhase, isStreaming, autoCollapsed, steps.length])

  if (steps.length === 0 && !rawThinking && !isThinkingPhase) return null

  const summaryLabel = isThinkingPhase
    ? null
    : `Deliberated for ${elapsedMs ? (elapsedMs / 1000).toFixed(1) + 's' : `${totalSteps ?? steps.length} steps`}`

  return (
    <div className="my-2.5 rounded-xl border border-violet-500/25 bg-[#0e0a1a]/80 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(167,139,250,0.12)] overflow-hidden">
      {/* Header bar ──────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-violet-950/40 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          {isThinkingPhase ? (
            <ThinkingRadar />
          ) : (
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-violet-400" strokeWidth={2} />
              <span className="text-xs font-mono text-violet-300 font-medium">
                {summaryLabel}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono text-violet-300/80 bg-violet-500/10 border border-violet-500/20">
                {totalSteps ?? steps.length} {steps.length === 1 ? 'step' : 'steps'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-violet-400">
          <span className="text-[11px] font-mono opacity-60">
            {expanded ? 'Hide' : 'Inspect'}
          </span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            strokeWidth={2}
          />
        </div>
      </button>

      {/* Collapsible Steps Drawer ────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-violet-500/15"
          >
            <div className="px-3.5 py-2.5 max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-violet-800/40 space-y-1">
              {/* Completed step rows */}
              {steps.map((step, i) => (
                <StepRow key={step.step_number || i} step={step} index={i} />
              ))}

              {/* Live raw reasoning token preview */}
              {isThinkingPhase && rawThinking && (
                <motion.div
                  className="flex items-start gap-2.5 py-1.5 border-l border-violet-500/20 pl-3 ml-1.5 opacity-75"
                  animate={{ opacity: [0.5, 0.9, 0.5] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                >
                  <div className="mt-0.5">
                    <Sparkles size={12} className="text-violet-400 animate-spin" strokeWidth={2} />
                  </div>
                  <p className="text-xs text-content-tertiary leading-relaxed font-mono whitespace-pre-wrap break-words">
                    {rawThinking.slice(-280)}
                  </p>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
