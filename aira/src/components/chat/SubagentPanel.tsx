import React, { useState } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  Zap,
} from 'lucide-react'
import type { SubagentExecution } from '../../types'
import { useToastStore } from '../../stores/toastStore'

interface SubagentPanelProps {
  subagents?: SubagentExecution[]
}

export const SubagentPanel: React.FC<SubagentPanelProps> = ({ subagents }) => {
  const { addToast } = useToastStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedSubagentId, setExpandedSubagentId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const displayAgents = (subagents || []).filter(
    (s) => s.status === 'completed' && s.output && !s.output.startsWith('[Subagent')
  )

  if (displayAgents.length === 0) return null

  const maxElapsedMs = Math.max(...displayAgents.map((s) => s.elapsed_ms || 0), 0)
  const totalTokens = displayAgents.reduce((acc, s) => acc + (s.tokens_used || 0), 0)

  const handleCopySubagent = (sub: SubagentExecution, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(`[${sub.role} - ${sub.model}]\n${sub.output}`)
    setCopiedId(sub.id)
    addToast({
      type: 'success',
      message: `Copied briefing from ${sub.role}`,
    })
    setTimeout(() => {
      setCopiedId((curr) => (curr === sub.id ? null : curr))
    }, 2000)
  }

  const formatModelLabel = (model: string) => {
    const m = model.toLowerCase()
    if (m.includes('4b')) return 'Laptop 2 · Fast Edge (Qwen3-4B)'
    if (m.includes('vl') || m.includes('vision')) return 'Laptop 2 · Vision Auditor (Qwen2.5-VL)'
    if (m.includes('coder')) return 'Laptop 2 · Coder Node (Qwen2.5-Coder)'
    return 'Laptop 1 · Master Node (Qwen3-8B)'
  }

  return (
    <div className="my-3 rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/25 via-surface/60 to-surface/40 backdrop-blur-xs shadow-xs overflow-hidden transition-all duration-200">
      {/* Top Banner / Accordion Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-emerald-500/5 transition cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Bot size={13} className="text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-semibold text-emerald-200">
              Autonomous Subagent Swarm
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
              {displayAgents.length} {displayAgents.length === 1 ? 'Specialist' : 'Specialists'} Executed
            </span>
            {maxElapsedMs > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-content-tertiary">
                <Zap size={11} className="text-emerald-400" />
                {(maxElapsedMs / 1000).toFixed(1)}s parallel
              </span>
            )}
            {totalTokens > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-content-tertiary px-1.5 py-0.2 rounded bg-surface border border-border">
                {totalTokens} tokens
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-content-tertiary shrink-0">
          <span className="text-[11px] text-emerald-400/90 hidden xs:inline font-medium">
            {isExpanded ? 'Hide Briefings' : 'View Specialist Findings'}
          </span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Expanded Subagent Cards */}
      {isExpanded && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-emerald-500/15 animate-in fade-in duration-150">
          <p className="text-[11px] text-content-secondary leading-relaxed pt-1 pb-1">
            The Chief Arbiter decomposed this engineering problem and dispatched concurrent specialized subagents across cluster nodes. Their findings were synthesized into the authoritative response below:
          </p>

          <div className="grid grid-cols-1 gap-2 pt-1">
            {displayAgents.map((agent) => {
              const isCardOpen = expandedSubagentId === agent.id
              const isCompleted = agent.status === 'completed'
              const isTimedOut = agent.status === 'timed_out'

              return (
                <div
                  key={agent.id}
                  className="rounded-lg border border-border/70 bg-elevated/60 hover:bg-elevated/90 transition overflow-hidden text-xs"
                >
                  <div
                    onClick={() => setExpandedSubagentId(isCardOpen ? null : agent.id)}
                    className="p-2.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isCompleted ? (
                        <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                      ) : isTimedOut ? (
                        <Clock size={13} className="text-amber-400 shrink-0" />
                      ) : (
                        <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-content-primary truncate">
                            {agent.role}
                          </span>
                          <span className="text-[10px] font-mono text-content-tertiary px-1.5 py-0.2 rounded bg-surface border border-border/80">
                            {formatModelLabel(agent.model)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {agent.elapsed_ms > 0 && (
                        <span className="text-[10px] font-mono text-content-tertiary">
                          {agent.elapsed_ms}ms
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleCopySubagent(agent, e)}
                        className="p-1 text-content-tertiary hover:text-content-primary rounded hover:bg-surface/80 transition"
                        title="Copy specialist briefing"
                      >
                        {copiedId === agent.id ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                      {isCardOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </div>
                  </div>

                  {/* Findings Body Drawer */}
                  {isCardOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-surface/40">
                      <div className="flex items-center justify-between gap-2 pt-1 pb-1.5 text-[10px] text-content-tertiary font-mono">
                        <span>Domain Specialist Briefing:</span>
                        <span>{agent.tokens_used ? `${agent.tokens_used} tokens` : ''}</span>
                      </div>
                      <div className="text-content-secondary leading-relaxed font-sans whitespace-pre-wrap select-text text-xs bg-surface/60 p-2.5 rounded-md border border-border/50">
                        {agent.output}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
