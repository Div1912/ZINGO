import React, { useState, useEffect, useRef } from 'react'
import {
  Terminal,
  Check,
  Copy,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Code2,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { sandboxApi } from '../../services/zingoApi'

interface CodeRunnerModalProps {
  code: string | null
  onClose: () => void
}

interface TerminalLine {
  text: string
  type: 'info' | 'stdout' | 'stderr' | 'success' | 'error' | 'meta'
}

export const CodeRunnerModal: React.FC<CodeRunnerModalProps> = ({ code, onClose }) => {
  const [isRunning, setIsRunning] = useState(false)
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [runtimeLabel, setRuntimeLabel] = useState('Python 3.10 Sovereign Host')
  const [showCode, setShowCode] = useState(false)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  const executeCode = async () => {
    if (!code) return
    setIsRunning(true)
    setExitCode(null)
    setLines([
      { text: '[Sovereign Runtime] Initializing isolated sandboxed execution environment...', type: 'info' },
      { text: `[Process] Executing script (${code.trim().length} chars) on local Python runtime...`, type: 'info' },
    ])

    try {
      const res = await sandboxApi.executeCode(code, 'python', 20)
      setExitCode(res.exit_code)
      if (res.runtime) setRuntimeLabel(res.runtime)

      const outputLines: TerminalLine[] = []

      if (res.stdout) {
        res.stdout.split('\n').forEach((line) => {
          outputLines.push({ text: line, type: 'stdout' })
        })
      }

      if (res.stderr) {
        res.stderr.split('\n').forEach((line) => {
          outputLines.push({ text: line, type: 'stderr' })
        })
      }

      if (!res.stdout && !res.stderr) {
        outputLines.push({ text: '[Sovereign Runtime] Script executed successfully with no standard output.', type: 'info' })
      }

      outputLines.push({
        text: '------------------------------------------------------------',
        type: 'meta',
      })
      outputLines.push({
        text: `Process finished with exit code ${res.exit_code} (Execution time: ${res.execution_time_ms.toFixed(1)} ms)`,
        type: res.exit_code === 0 ? 'success' : 'error',
      })

      setLines((prev) => [...prev, ...outputLines])
    } catch (err: any) {
      setExitCode(1)
      setLines((prev) => [
        ...prev,
        { text: `[Execution Error] Local sandbox request failed: ${err.message || err}`, type: 'error' },
      ])
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    if (code) {
      executeCode()
    }
  }, [code])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, isRunning])

  const copyTerminalOutput = async () => {
    await navigator.clipboard.writeText(lines.map((l) => l.text).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal
      isOpen={Boolean(code)}
      onClose={onClose}
      title="Sovereign Code Execution Sandbox"
      description={`${runtimeLabel} · Local Air-Gapped Compute`}
      maxWidth="xl"
    >
      <div className="space-y-3">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-3 py-2 rounded-md bg-elevated border border-border text-xs">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-content-secondary" />
            <span className="font-mono text-content-primary">
              node://localhost/sandbox/python
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <span className="inline-flex items-center gap-1.5 text-violet-400 font-mono text-xs">
                <Loader2 size={13} className="animate-spin" />
                <span>Running inside sandbox...</span>
              </span>
            ) : exitCode === 0 ? (
              <span className="inline-flex items-center gap-1 text-success font-mono text-xs">
                <CheckCircle2 size={13} />
                <span>Exit code 0</span>
              </span>
            ) : exitCode !== null ? (
              <span className="inline-flex items-center gap-1 text-danger font-mono text-xs">
                <AlertTriangle size={13} />
                <span>Exit code {exitCode}</span>
              </span>
            ) : null}
          </div>
        </div>

        {/* Code Snippet Drawer Toggle */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            className="text-[11px] font-mono text-content-secondary hover:text-content-primary flex items-center gap-1"
          >
            <Code2 size={12} />
            <span>{showCode ? 'Hide source code' : 'Inspect source code'}</span>
          </button>
        </div>

        {showCode && code && (
          <div className="bg-[#111] border border-border rounded-md p-3 max-h-40 overflow-y-auto font-mono text-xs text-content-secondary">
            <pre className="whitespace-pre-wrap">{code}</pre>
          </div>
        )}

        {/* Real Terminal Window */}
        <div className="bg-[#0A0A0A] border border-border rounded-lg p-4 font-mono text-xs text-[#E0E0E0] min-h-[220px] max-h-[340px] overflow-y-auto space-y-1 select-text">
          {lines.map((l, idx) => (
            <div
              key={idx}
              className={`${
                l.type === 'success'
                  ? 'text-success font-semibold'
                  : l.type === 'error'
                  ? 'text-danger font-semibold'
                  : l.type === 'stderr'
                  ? 'text-amber-400'
                  : l.type === 'meta'
                  ? 'text-content-tertiary/70'
                  : l.type === 'info'
                  ? 'text-content-tertiary'
                  : 'text-[#E5E5E5]'
              }`}
            >
              {l.text}
            </div>
          ))}
          {isRunning && (
            <div className="flex items-center gap-2 text-content-tertiary mt-2">
              <span className="w-1.5 h-3 bg-content-primary animate-pulse" />
              <span>executing stream...</span>
            </div>
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={copyTerminalOutput}
            className="btn-ghost !text-xs !py-1.5 !px-2.5 flex items-center gap-1.5"
          >
            {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy Output'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={executeCode}
              disabled={isRunning}
              className="btn-glass !text-xs !py-1.5 !px-3 flex items-center gap-1.5"
            >
              <RotateCcw size={12} className={isRunning ? 'animate-spin' : ''} />
              <span>Re-run</span>
            </button>
            <button onClick={onClose} className="btn-primary !text-xs !py-1.5 !px-3">
              Close
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
