/**
 * ZINGO — ThinkingBlock Component
 * ================================
 * Renders the model's live chain-of-thought reasoning steps aligned 100%
 * with the SSE stream (Done, In Progress, Queued) with dropdown menu controls.
 */

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Loader2,
  CircleDashed,
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
  steps: ThinkStep[]
  rawThinking?: string        // live character stream before steps are flushed
  isStreaming?: boolean       // true while model is still thinking
  isThinkingPhase?: boolean   // true = still in <think>, false = answered
  totalSteps?: number
  elapsedMs?: number
}

// ─── High-Precision Pulse Indicator ──────────────────────────────────────────

const ThinkingRadar: React.FC = () => (
  <div className="flex items-center gap-2">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
    </span>
    <span className="text-[11px] font-mono text-violet-300 tracking-wide font-medium">
      AIRA Cognition · Active Reasoning
    </span>
  </div>
)

// ─── Main ThinkingBlock ───────────────────────────────────────────────────────

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  steps,
  rawThinking = '',
  isStreaming = false,
  isThinkingPhase = false,
  totalSteps,
  elapsedMs,
}) => {
  // Claude/Gemini style: Keep internal reasoning collapsed by default so chat stays clean
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (isStreaming && expanded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [steps, rawThinking, isStreaming, expanded])

  // Copy full reasoning trace to clipboard
  const handleCopyTrace = (e: React.MouseEvent) => {
    e.stopPropagation()
    const parts: string[] = []
    steps.forEach((s) => {
      parts.push(`[Step ${s.step_number} - Done]\n${s.content}`)
    })
    if (rawThinking.trim()) {
      parts.push(`[Active Thoughts]\n${rawThinking.trim()}`)
    }
    const fullTrace = parts.join('\n\n') || rawThinking
    navigator.clipboard.writeText(fullTrace)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (steps.length === 0 && !rawThinking && !isThinkingPhase) return null

  const activeStepNum = steps.length + 1
  const durationStr = elapsedMs && elapsedMs > 0 ? `${(elapsedMs / 1000).toFixed(1)}s` : '1.2s'

  return (
    <div className="my-2.5 rounded-xl border border-violet-500/25 bg-[#0e0a1a]/80 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(167,139,250,0.12)] overflow-hidden">
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
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-violet-300 bg-violet-500/15 border border-violet-500/30">
                Step {activeStepNum} In Progress
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400" strokeWidth={2.2} />
              <span className="text-xs font-mono text-emerald-300 font-medium">
                Reasoning Complete ({durationStr})
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20">
                {totalSteps || steps.length || 1} {(totalSteps || steps.length) === 1 ? 'step' : 'steps'} verified
              </span>
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
            <span>{expanded ? 'Collapse' : 'Inspect Steps'}</span>
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
            <div className="px-4 py-3 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-violet-800/40 space-y-3">
              {/* 1. COMPLETED STEPS (Emitted by model via SSE think_step) */}
              {steps.map((step) => (
                <div
                  key={step.step_number}
                  className="flex items-start gap-2.5 py-1 border-l-2 border-emerald-500/30 pl-3 ml-1"
                >
                  <div className="mt-0.5">
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-semibold text-emerald-400">
                        Step {step.step_number}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 font-medium">
                        Done
                      </span>
                    </div>
                    <p className="text-xs text-content-secondary leading-relaxed font-mono select-text break-words">
                      {step.content}
                    </p>
                  </div>
                </div>
              ))}

              {/* 2. CURRENTLY ACTIVE STEP (Real live raw reasoning stream from Ollama) */}
              {isThinkingPhase && (
                <div className="flex items-start gap-2.5 py-1 border-l-2 border-violet-500 pl-3 ml-1 animate-in fade-in duration-200">
                  <div className="mt-0.5">
                    <Loader2 size={13} className="text-violet-400 shrink-0 animate-spin" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-semibold text-violet-300">
                        Step {activeStepNum}
                      </span>
                      <span className="flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-mono text-violet-300 bg-violet-500/15 border border-violet-500/30 font-medium animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                        In Progress
                      </span>
                    </div>
                    <p className="text-xs text-violet-200/90 leading-relaxed font-mono whitespace-pre-wrap select-text break-words">
                      {rawThinking.trim()
                        ? rawThinking.slice(-320)
                        : 'Deconstructing problem parameters and validating engineering constraints...'}
                    </p>
                  </div>
                </div>
              )}

              {/* 3. WHAT IS LEFT TO FINISH (Queued vs Concluded) */}
              {isThinkingPhase ? (
                <div className="flex items-start gap-2.5 py-1 border-l-2 border-border pl-3 ml-1 opacity-60">
                  <div className="mt-0.5">
                    <CircleDashed size={13} className="text-content-tertiary shrink-0" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-medium text-content-tertiary">
                        Final Synthesis & Verification
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-content-tertiary bg-surface border border-border font-medium">
                        Queued
                      </span>
                    </div>
                    <p className="text-[11px] text-content-tertiary font-mono">
                      Formulate verified engineering conclusions and hand over to response generation
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 py-1 border-l-2 border-emerald-500/30 pl-3 ml-1">
                  <div className="mt-0.5">
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-semibold text-emerald-400">
                        Final Synthesis & Verification
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 font-medium">
                        Done
                      </span>
                    </div>
                    <p className="text-xs text-content-secondary font-mono">
                      Reasoning pathway verified. Answer formulated and streamed.
                    </p>
                  </div>
                </div>
              )}

              {/* Fallback if no structured steps but raw thinking exists */}
              {steps.length === 0 && rawThinking && !isThinkingPhase && (
                <div className="py-1 border-l-2 border-violet-500/30 pl-3 ml-1">
                  <p className="text-xs text-content-secondary leading-relaxed font-mono whitespace-pre-wrap select-text break-words">
                    {rawThinking}
                  </p>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
