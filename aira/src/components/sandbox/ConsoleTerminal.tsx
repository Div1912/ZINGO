import React, { useRef, useEffect, useState } from 'react'
import {
  Terminal,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  Wand2,
  Copy,
  Check,
} from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'

export interface SandboxConsoleLog {
  id: string
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}

interface ConsoleTerminalProps {
  logs: SandboxConsoleLog[]
  onClearLogs: () => void
  onFixWithAI?: (errorMessage: string) => void
}

export const ConsoleTerminal: React.FC<ConsoleTerminalProps> = ({
  logs,
  onClearLogs,
  onFixWithAI,
}) => {
  const { addToast } = useToastStore()
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const filteredLogs = logs.filter((log) => {
    if (filter === 'error') return log.level === 'error'
    if (filter === 'warn') return log.level === 'warn'
    return true
  })

  const errorCount = logs.filter((l) => l.level === 'error').length
  const warnCount = logs.filter((l) => l.level === 'warn').length

  const handleCopyLog = async (log: SandboxConsoleLog) => {
    await navigator.clipboard.writeText(log.message)
    setCopiedId(log.id)
    setTimeout(() => setCopiedId(null), 2000)
    addToast({ type: 'success', message: 'Log message copied to clipboard' })
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 font-mono text-xs text-slate-200">
      {/* Console Header / Filter Bar */}
      <div className="h-9 px-3 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-violet-400" />
          <span className="font-semibold text-slate-300">Sandbox Console</span>
          <span className="text-[10px] text-slate-500">({logs.length} events)</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Pills */}
          <div className="flex items-center bg-slate-950/80 rounded-md p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                filter === 'all'
                  ? 'bg-slate-800 text-slate-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('error')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition flex items-center gap-1 ${
                filter === 'error'
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              <AlertCircle size={10} className="text-rose-400" />
              Errors ({errorCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('warn')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition flex items-center gap-1 ${
                filter === 'warn'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
            >
              <AlertTriangle size={10} className="text-amber-400" />
              Warn ({warnCount})
            </button>
          </div>

          <button
            type="button"
            onClick={onClearLogs}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            title="Clear Console"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Console Log List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-1">
            <Terminal size={24} className="opacity-40" />
            <p className="text-xs">No runtime logs recorded yet</p>
            <p className="text-[10px] text-slate-700">Console output and uncaught exceptions appear here</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isError = log.level === 'error'
            const isWarn = log.level === 'warn'

            return (
              <div
                key={log.id}
                className={`p-2 rounded-lg border leading-relaxed flex items-start justify-between gap-3 group transition ${
                  isError
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : isWarn
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-slate-900/50 border-slate-800/80 text-slate-300'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className="shrink-0 mt-0.5">
                    {isError ? (
                      <AlertCircle size={13} className="text-rose-400" />
                    ) : isWarn ? (
                      <AlertTriangle size={13} className="text-amber-400" />
                    ) : (
                      <Info size={13} className="text-slate-400" />
                    )}
                  </span>
                  <span className="text-[10px] text-slate-500 shrink-0 font-sans mt-0.5">
                    {log.timestamp}
                  </span>
                  <pre className="whitespace-pre-wrap break-all font-mono text-xs">
                    {log.message}
                  </pre>
                </div>

                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                  {isError && onFixWithAI && (
                    <button
                      type="button"
                      onClick={() => onFixWithAI(log.message)}
                      className="px-2 py-0.5 rounded bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 border border-violet-500/40 text-[10px] flex items-center gap-1 font-sans transition"
                      title="Send error to AI to automatically fix"
                    >
                      <Wand2 size={10} className="text-violet-300" />
                      <span>Fix with AI</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopyLog(log)}
                    className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                    title="Copy message"
                  >
                    {copiedId === log.id ? (
                      <Check size={11} className="text-emerald-400" />
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
