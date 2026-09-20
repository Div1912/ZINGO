import React, { useState, useRef, useEffect } from 'react'
import { Terminal as TerminalIcon, Play, Trash2, Cpu } from 'lucide-react'
import { microVM, type TerminalOutputLine } from '../../services/webContainerService'
import type { VirtualProject } from '../../types/project'

interface MicroVMTerminalProps {
  project?: VirtualProject | null
}

export const MicroVMTerminal: React.FC<MicroVMTerminalProps> = ({ project }) => {
  const [history, setHistory] = useState<TerminalOutputLine[]>([
    {
      text: '\x1b[1;32mZINGO Sovereign WebContainer & MicroVM Runtime (WebAssembly)\x1b[0m\n' +
            'Zero server load · 100% Client Browser Sandboxed · Node.js & Pyodide VFS mounted\n' +
            'Type \x1b[36mhelp\x1b[0m for commands or run \x1b[33mls\x1b[0m to list files.',
      type: 'system',
      timestamp: new Date().toLocaleTimeString(),
    },
  ])
  const [inputVal, setInputVal] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [isRunning, setIsRunning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mount project files when project changes
  useEffect(() => {
    if (project && project.files) {
      const fileMap: Record<string, string> = {}
      for (const [path, file] of Object.entries(project.files)) {
        fileMap[path] = (file as { content: string }).content
      }
      microVM.mountProject(fileMap)
      setHistory((prev) => [
        ...prev,
        {
          text: `\x1b[2m[Mounted ${Object.keys(fileMap).length} project files to /workspace]\x1b[0m`,
          type: 'system',
          timestamp: new Date().toLocaleTimeString(),
        },
      ])
    }
  }, [project])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  const handleExecute = async (cmdToRun?: string) => {
    const command = (cmdToRun || inputVal).trim()
    if (!command) return

    if (command === 'clear') {
      setHistory([])
      setInputVal('')
      return
    }

    // Add prompt line to history
    setHistory((prev) => [
      ...prev,
      {
        text: `zingo@browser:/workspace$ ${command}`,
        type: 'prompt',
        timestamp: new Date().toLocaleTimeString(),
      },
    ])

    setCommandHistory((prev) => [...prev, command])
    setHistoryIndex(-1)
    setInputVal('')
    setIsRunning(true)

    try {
      const outputs = await microVM.executeCommand(command)
      setHistory((prev) => [...prev, ...outputs])
    } catch (err: any) {
      setHistory((prev) => [
        ...prev,
        {
          text: `Error executing command: ${err?.message || err}`,
          type: 'stderr',
          timestamp: new Date().toLocaleTimeString(),
        },
      ])
    } finally {
      setIsRunning(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleExecute()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length === 0) return
      const nextIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(nextIndex)
      setInputVal(commandHistory[nextIndex] || '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex === -1) return
      const nextIndex = historyIndex + 1
      if (nextIndex >= commandHistory.length) {
        setHistoryIndex(-1)
        setInputVal('')
      } else {
        setHistoryIndex(nextIndex)
        setInputVal(commandHistory[nextIndex] || '')
      }
    }
  }

  // Quick action buttons
  const quickActions = [
    { label: 'ls', cmd: 'ls' },
    { label: 'pwd', cmd: 'pwd' },
    { label: 'node index.js', cmd: 'node index.js' },
    { label: 'python script.py', cmd: 'python script.py' },
    { label: 'npm test', cmd: 'npm test' },
    { label: 'help', cmd: 'help' },
  ]

  return (
    <div className="flex flex-col h-full bg-[#080808] text-slate-200 font-mono text-xs select-text">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#121212] border-b border-border/60 text-[11px]">
        <div className="flex items-center gap-2">
          <TerminalIcon size={13} className="text-emerald-400" />
          <span className="font-semibold text-slate-100">WebContainer PTY Shell</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
            WASM Realm
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-content-tertiary">
          <span className="hidden sm:inline-flex items-center gap-1">
            <Cpu size={11} className="text-violet-400" />
            <span>0% Server Load</span>
          </span>
          <button
            type="button"
            onClick={() => setHistory([])}
            className="p-1 rounded hover:bg-white/5 hover:text-slate-200 text-content-tertiary"
            title="Clear terminal"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Quick Command Ribbon */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0e0e0e] border-b border-border/40 overflow-x-auto text-[10px]">
        <span className="text-content-tertiary mr-1 shrink-0">Quick Commands:</span>
        {quickActions.map((act) => (
          <button
            key={act.label}
            type="button"
            onClick={() => handleExecute(act.cmd)}
            className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 shrink-0 transition"
          >
            {act.label}
          </button>
        ))}
      </div>

      {/* Terminal Output Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {history.map((line, idx) => {
          if (line.type === 'prompt') {
            return (
              <div key={idx} className="text-emerald-400 font-semibold pt-1">
                {line.text}
              </div>
            )
          }

          if (line.type === 'stderr') {
            return (
              <pre
                key={idx}
                className="text-red-400 whitespace-pre-wrap leading-relaxed bg-red-950/20 p-1.5 rounded border border-red-900/30"
              >
                {line.text}
              </pre>
            )
          }

          if (line.type === 'system') {
            return (
              <pre
                key={idx}
                className="text-cyan-300 whitespace-pre-wrap leading-relaxed"
              >
                {line.text}
              </pre>
            )
          }

          return (
            <pre key={idx} className="text-slate-200 whitespace-pre-wrap leading-relaxed">
              {line.text}
            </pre>
          )
        })}

        {isRunning && (
          <div className="flex items-center gap-2 text-content-tertiary py-1">
            <span className="w-2.5 h-2.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <span>Executing inside WebAssembly MicroVM...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Prompt */}
      <div className="flex items-center gap-2 p-2.5 bg-[#121212] border-t border-border/60">
        <span className="text-emerald-400 font-bold shrink-0">zingo@browser:~$</span>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type command (e.g. ls, node script.js, python test.py)..."
          className="flex-1 bg-transparent text-slate-100 text-xs font-mono outline-none placeholder:text-content-tertiary/60"
          autoFocus
        />
        <button
          type="button"
          onClick={() => handleExecute()}
          disabled={isRunning || !inputVal.trim()}
          className="p-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 disabled:opacity-40"
        >
          <Play size={11} className="fill-emerald-400" />
        </button>
      </div>
    </div>
  )
}
