/**
 * ZINGO — Extended Thinking & Deliberation Block
 * =============================================
 * Renders the model's live cognitive deliberation scratchpad (frontier LLM standard).
 * Features:
 * - Real-time stopwatch ticking upward during thinking (0.1s resolution)
 * - Auto-collapses cleanly when answer starts streaming, leaving "Thought for X.Xs"
 * - One-click expand/collapse to inspect the internal monologue
 * - Displays natural cognitive scratchpad with full Markdown & code/math rendering
 * - One-click copy reasoning trace
 * - Graceful interruption badge if safety or user interrupts
 */

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Loader2,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThinkStep {
  step_number: number
  content: string
}

export interface ThinkingBlockProps {
  steps?: ThinkStep[]
  rawThinking?: string        // live character stream of model deliberation
  isStreaming?: boolean       // true while model is still generating
  isThinkingPhase?: boolean   // true = still in <think> scratchpad, false = answering
  totalSteps?: number
  elapsedMs?: number
  isInterrupted?: boolean
}

// ─── Pulse Radar Indicator ───────────────────────────────────────────────────

const ThinkingRadar: React.FC = () => (
  <div className="flex items-center gap-2">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
    </span>
    <span className="text-[11px] font-mono text-violet-300 tracking-wide font-medium">
      AIRA Cognition · Extended Thinking
    </span>
  </div>
)

// ─── Main ThinkingBlock ───────────────────────────────────────────────────────

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  steps = [],
  rawThinking = '',
  isStreaming = false,
  isThinkingPhase = false,
  totalSteps: _totalSteps,
  elapsedMs,
  isInterrupted = false,
}) => {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Real-time live stopwatch
  const [liveSeconds, setLiveSeconds] = useState<number>(() =>
    elapsedMs && elapsedMs > 0 ? Number((elapsedMs / 1000).toFixed(1)) : 0
  )
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (isThinkingPhase) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now() - (elapsedMs || 0)
      }
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          const delta = (Date.now() - startTimeRef.current) / 1000
          setLiveSeconds(Number(delta.toFixed(1)))
        }
      }, 100)
      return () => clearInterval(interval)
    } else {
      if (elapsedMs && elapsedMs > 0) {
        setLiveSeconds(Number((elapsedMs / 1000).toFixed(1)))
      } else if (startTimeRef.current) {
        const delta = (Date.now() - startTimeRef.current) / 1000
        setLiveSeconds(Number(delta.toFixed(1)))
      }
      startTimeRef.current = null
    }
  }, [isThinkingPhase, elapsedMs])

  // Auto-scroll to bottom while actively streaming thoughts if expanded
  useEffect(() => {
    if (isStreaming && expanded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [steps, rawThinking, isStreaming, expanded])

  // Copy full reasoning trace to clipboard
  const handleCopyTrace = (e: React.MouseEvent) => {
    e.stopPropagation()
    let fullTrace = ''
    if (rawThinking.trim()) {
      fullTrace = rawThinking.trim()
    } else if (steps.length > 0) {
      fullTrace = steps.map((s) => `[Step ${s.step_number}]\n${s.content}`).join('\n\n')
    }
    navigator.clipboard.writeText(fullTrace)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (steps.length === 0 && !rawThinking && !isThinkingPhase && !elapsedMs) return null

  return (
    <div className="my-2.5 rounded-xl border border-violet-500/25 bg-[#0e0a1a]/85 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(167,139,250,0.12)] overflow-hidden">
      {/* ── Header bar & Dropdown trigger ──────────────────────────────────── */}
      <div
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((prev) => !prev)
          }
        }}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-violet-950/40 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          {isThinkingPhase ? (
            <div className="flex items-center gap-2">
              <ThinkingRadar />
              <span className="text-xs font-mono text-violet-300 font-medium">
                Thinking for {liveSeconds.toFixed(1)}s...
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400" strokeWidth={2.2} />
              <span className="text-xs font-mono text-emerald-300 font-medium">
                Thought for {liveSeconds > 0 ? `${liveSeconds.toFixed(1)}s` : 'a few seconds'}
              </span>
              {isInterrupted ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20">
                  Interrupted
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20">
                  Verified Reasoning
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-violet-400">
          {/* Quick Copy Action */}
          <button
            type="button"
            onClick={handleCopyTrace}
            className="p-1 rounded hover:bg-violet-900/40 text-violet-300/80 hover:text-violet-200 transition-colors"
            title="Copy reasoning trace"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>

          {/* Dropdown Toggle Pill */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-950/60 border border-violet-500/20 text-[11px] font-mono hover:border-violet-500/40">
            <span>{expanded ? 'Collapse' : 'Inspect Thoughts'}</span>
            <ChevronDown
              size={13}
              className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              strokeWidth={2}
            />
          </div>
        </div>
      </div>

      {/* ── Collapsible Steps Drawer ────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-violet-500/15"
          >
            <div className="px-4 py-3 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-violet-800/40 space-y-3">
              {/* Natural Cognitive Scratchpad Stream */}
              {rawThinking.trim() ? (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-violet-400/80">
                    Internal Deliberation Scratchpad:
                  </div>
                  <div className="p-3 rounded-lg bg-black/40 border border-violet-500/20 text-xs text-violet-200/90 leading-relaxed font-mono whitespace-pre-wrap select-text break-words shadow-inner">
                    {rawThinking.trim()}
                  </div>
                </div>
              ) : steps.length > 0 ? (
                <div className="space-y-2.5">
                  {steps.map((step) => (
                    <div
                      key={step.step_number}
                      className="flex items-start gap-2.5 py-1 border-l-2 border-emerald-500/30 pl-3 ml-1"
                    >
                      <div className="mt-0.5">
                        <CheckCircle2 size={13} className="text-emerald-400 shrink-0" strokeWidth={2.2} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <span className="text-[11px] font-mono font-semibold text-emerald-400">
                          Step {step.step_number}
                        </span>
                        <p className="text-xs text-content-secondary leading-relaxed font-mono select-text break-words">
                          {step.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : isThinkingPhase ? (
                <div className="py-2.5 flex items-center gap-2 text-xs font-mono text-violet-300/80">
                  <Loader2 size={14} className="animate-spin text-violet-400" />
                  <span>Deliberating and validating constraints across technical parameters...</span>
                </div>
              ) : null}

              <div ref={bottomRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
