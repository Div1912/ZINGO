/**
 * ZINGO / AIRA — Agent Activity Stepper ('Working...' Telemetry)
 * ==============================================================
 * Renders real-time autonomous tool execution telemetry in the chat flow:
 * 1. Active Phase ("Working..."): Animated status pill with live action label
 * 2. Completed Phase ("Executed N action(s)"): Expandable audit trail of tool steps
 */

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wrench,
  Search,
  Presentation,
  FileText,
  Terminal,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react'
import type { AgentToolActivity, CompletedTool } from '../../types'

interface AgentActivityStepperProps {
  activeTool?: AgentToolActivity
  completedTools?: CompletedTool[]
  isStreaming?: boolean
}

function getToolIcon(tool: string) {
  const t = (tool || '').toLowerCase()
  if (t === 'master_strategist' || t.includes('strategist')) {
    return <Sparkles size={13} className="text-amber-400" />
  }
  if (t === 'content_specialist' || t.includes('specialist')) {
    return <Layers size={13} className="text-sky-400" />
  }
  if (t === 'visual_architect' || t.includes('visual')) {
    return <Presentation size={13} className="text-violet-400" />
  }
  if (t.includes('presentation') || t.includes('ppt') || t.includes('slide')) {
    return <Presentation size={13} className="text-amber-400" />
  }
  if (t.includes('knowledge') || t.includes('rag') || t.includes('search') || t.includes('vector')) {
    return <Search size={13} className="text-sky-400" />
  }
  if (t.includes('document') || t.includes('reader') || t.includes('file')) {
    return <FileText size={13} className="text-violet-400" />
  }
  if (t.includes('python') || t.includes('code') || t.includes('sandbox') || t.includes('repl')) {
    return <Terminal size={13} className="text-emerald-400" />
  }
  if (t.includes('council') || t.includes('subagent') || t.includes('swarm')) {
    return <Layers size={13} className="text-indigo-400" />
  }
  if (t.includes('verifier') || t.includes('tot') || t.includes('architect')) {
    return <Sparkles size={13} className="text-emerald-400" />
  }
  return <Wrench size={13} className="text-indigo-400" />
}

function getToolLabel(tool: string) {
  const t = (tool || '').toLowerCase()
  if (t === 'master_strategist' || t.includes('strategist')) return 'Laptop 1 (Master Strategist · Qwen3-8B)'
  if (t === 'content_specialist' || t.includes('specialist')) return 'Laptop 3 (Content & Metrics · Qwen3-4B)'
  if (t === 'visual_architect' || t.includes('visual')) return 'Laptop 2 (Visual Architect · Qwen2.5-VL)'
  if (t.includes('presentation')) return 'Python PowerPoint Engine (.pptx)'
  if (t.includes('knowledge') || t.includes('rag')) return 'Industrial Knowledge Index'
  if (t.includes('document')) return 'Document Ingestion'
  if (t.includes('python') || t.includes('sandbox')) return 'Python Code Sandbox'
  if (t.includes('council')) return 'Model Council'
  if (t.includes('subagent')) return 'Subagent Swarm'
  if (t.includes('verifier') || t.includes('tot')) return 'Architectural Verifier'
  return 'Agent Tool'
}

export const AgentActivityStepper: React.FC<AgentActivityStepperProps> = ({
  activeTool,
  completedTools = [],
  isStreaming: _isStreaming = false,
}) => {
  const [expanded, setExpanded] = useState(false)

  const hasActiveTool = Boolean(activeTool && activeTool.status === 'running')
  const hasCompletedTools = completedTools.length > 0

  if (!hasActiveTool && !hasCompletedTools) {
    return null
  }

  return (
    <div className="my-2 select-none">
      {/* ── Active "Working..." Telemetry Chip ───────────────────────────── */}
      <AnimatePresence mode="wait">
        {hasActiveTool && activeTool && (
          <motion.div
            key="active-tool"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-xs shadow-sm mb-2"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
            </span>
            <div className="flex items-center gap-1.5">
              {getToolIcon(activeTool.tool)}
              <span className="font-semibold text-slate-100 font-mono text-[11px]">
                Working:
              </span>
              <span className="text-slate-300 text-xs truncate max-w-[280px] sm:max-w-md">
                {activeTool.action}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Completed Tools Summary Pill & Audit Dropdown ────────────────── */}
      {hasCompletedTools && (
        <div className="rounded-lg border border-border/60 bg-surface/50 text-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-surface/80 transition-colors text-content-secondary hover:text-content-primary cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
              <span className="font-medium text-slate-200">
                Executed {completedTools.length} agent action{completedTools.length > 1 ? 's' : ''}
              </span>
              <span className="text-[10px] text-content-muted font-mono hidden sm:inline">
                ({completedTools.map((t) => getToolLabel(t.tool)).join(', ')})
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 text-content-muted">
              <span className="text-[10px] uppercase font-mono">{expanded ? 'Hide' : 'Inspect'}</span>
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </div>
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-border/40 divide-y divide-border/30 bg-[#0C0C0C]/80"
              >
                {completedTools.map((tool, idx) => (
                  <div key={idx} className="px-3.5 py-2 flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5 shrink-0">{getToolIcon(tool.tool)}</div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-200 text-[11px]">
                          {getToolLabel(tool.tool)}
                        </div>
                        <div className="text-slate-400 text-[11px] leading-relaxed break-words">
                          {tool.summary}
                        </div>
                      </div>
                    </div>
                    {typeof tool.durationMs === 'number' && tool.durationMs > 0 && (
                      <div className="flex items-center gap-1 text-[10px] font-mono text-content-muted shrink-0 mt-0.5">
                        <Clock size={10} />
                        <span>{tool.durationMs}ms</span>
                      </div>
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
