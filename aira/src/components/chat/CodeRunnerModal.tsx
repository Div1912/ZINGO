import React, { useState, useEffect } from 'react'
import { Terminal, Check, Copy, RotateCcw } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { ThinkingOrbs } from '../ui/thinking-orbs'

interface CodeRunnerModalProps {
  code: string | null
  onClose: () => void
}

export const CodeRunnerModal: React.FC<CodeRunnerModalProps> = ({ code, onClose }) => {
  const [isRunning, setIsRunning] = useState(true)
  const [output, setOutput] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  const executeCode = () => {
    setIsRunning(true)
    setOutput(['[MRPL Sovereign Runtime] Dispatching code to G15 #2 Coder Node (192.168.1.11)...'])

    setTimeout(() => {
      setOutput((prev) => [
        ...prev,
        '[Air-Gap Sandbox] Initialized Python 3.11 environment with NumPy & Pandas.',
        '[Telemetry Hook] Connected to Honeywell Experion DCS simulated stream.',
      ])
    }, 600)

    setTimeout(() => {
      setOutput((prev) => [
        ...prev,
        '------------------------------------------------------------',
        '=== MRPL REFINERY TELEMETRY & CUT PREDICTOR ===',
        '  LPG (C3-C4)                        :   2.67 %',
        '  Light Naphtha (C5-85°C)            :   5.85 %',
        '  Heavy Naphtha (85-140°C)           :   9.75 %',
        '  Aviation Turbine Fuel (140-240°C)  :  14.89 %',
        '  High Speed Diesel (240-370°C)      :  27.03 %',
        '  Atmospheric Residue (370°C+)       :  39.81 %',
        '------------------------------------------------------------',
        '[Process Safety] Maximum Coil Outlet Temp Delta: 4.60 °C (Within safe limits)',
        'Process finished with exit code 0 (Execution time: 14.8 ms)',
      ])
      setIsRunning(false)
    }, 1500)
  }

  useEffect(() => {
    if (code) {
      executeCode()
    }
  }, [code])

  const copyTerminalOutput = async () => {
    await navigator.clipboard.writeText(output.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal
      isOpen={Boolean(code)}
      onClose={onClose}
      title="Sovereign Code Execution Sandbox"
      description="G15 #2 Local GPU Compute Environment · Air-gapped"
      maxWidth="xl"
    >
      <div className="space-y-3">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-3 py-2 rounded-md bg-elevated border border-border text-xs">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-content-secondary" />
            <span className="font-mono text-content-primary">
              node://192.168.1.11/sandbox/python3
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <ThinkingOrbs compact status="Executing inside sandbox..." />
            ) : (
              <span className="inline-flex items-center gap-1 text-success">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span>Exit code 0</span>
              </span>
            )}
          </div>
        </div>

        {/* Terminal Window */}
        <div className="bg-[#0A0A0A] border border-border rounded-lg p-4 font-mono text-xs text-[#E0E0E0] min-h-[220px] max-h-[340px] overflow-y-auto space-y-1 select-text">
          {output.map((line, idx) => (
            <div
              key={idx}
              className={`${
                line.includes('exit code 0')
                  ? 'text-success font-medium'
                  : line.includes('===')
                  ? 'text-content-primary font-semibold'
                  : line.startsWith('[')
                  ? 'text-content-tertiary'
                  : 'text-[#E5E5E5]'
              }`}
            >
              {line}
            </div>
          ))}
          {isRunning && (
            <div className="flex items-center gap-2 text-content-tertiary mt-2">
              <span className="w-1.5 h-3 bg-content-primary animate-pulse" />
              <span>executing stream...</span>
            </div>
          )}
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
              <RotateCcw size={12} />
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
