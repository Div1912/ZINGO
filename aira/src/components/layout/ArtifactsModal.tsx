import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Copy, Download, Check, Terminal, FileCode, FileText } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'

interface ArtifactsModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenCodeRunner?: () => void
}

const REFINERY_ARTIFACTS = [
  {
    id: 'art-1',
    name: 'cdu2_cut_yield_optimizer.py',
    type: 'code',
    size: '4.2 KB',
    updated: 'Today',
    desc: 'Python cut yield equation solver with true boiling point (TBP) distribution fractions.',
    code: `# MRPL CDU-2 Column Flash Zone & Cut Balance
crude_flow_bpd = 120_000
cot_temp_c = 368.5

cut_yields = {
    "LPG (C3-C4)": 0.0267,
    "Light Naphtha (C5-85°C)": 0.0585,
    "Heavy Naphtha (85-140°C)": 0.0975,
    "ATF / Kerosene (140-240°C)": 0.1489,
    "High Speed Diesel (240-370°C)": 0.2703,
    "Atmospheric Residue (370°C+)": 0.3981
}
`,
  },
  {
    id: 'art-2',
    name: 'oisd105_ptw_compliance_matrix.md',
    type: 'doc',
    size: '12.8 KB',
    updated: 'Yesterday',
    desc: 'Complete safety audit checklist and LEL gas detector verification protocol.',
    code: `# OISD-105 Work Permit System & Safety Checklist
1. Combustible gas test (< 0% LEL) verified by Safety Officer
2. Vessel blind list signed by Shift Incharge
3. Electrical lockout & tagout (LOTO) breaker isolated
`,
  },
  {
    id: 'art-3',
    name: 'heater_cot_pass_balance.py',
    type: 'code',
    size: '3.1 KB',
    updated: '2 days ago',
    desc: 'Coil outlet temperature delta model across passes A, B, C, D to prevent tube coking.',
    code: `# Pass COT balancing model
passes = {"Pass_A": 366.2, "Pass_B": 368.1, "Pass_C": 369.4, "Pass_D": 367.0}
avg_cot = sum(passes.values()) / len(passes)
max_delta = max(passes.values()) - min(passes.values())
print(f"Average COT: {avg_cot:.1f} °C, Max Delta: {max_delta:.1f} °C")
`,
  },
]

export const ArtifactsModal: React.FC<ArtifactsModalProps> = ({
  isOpen,
  onClose,
  onOpenCodeRunner,
}) => {
  const { addToast } = useToastStore()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = (art: typeof REFINERY_ARTIFACTS[0]) => {
    navigator.clipboard.writeText(art.code)
    setCopiedId(art.id)
    setTimeout(() => setCopiedId(null), 2000)
    addToast({ type: 'success', message: `${art.name} copied to clipboard` })
  }

  const handleDownload = (art: typeof REFINERY_ARTIFACTS[0]) => {
    const blob = new Blob([art.code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = art.name
    link.click()
    URL.revokeObjectURL(url)
    addToast({ type: 'success', message: `${art.name} downloaded` })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Generated Refinery Artifacts"
      description="Interactive Python models, technical SOP checklists, and simulation scripts"
      maxWidth="xl"
    >
      <div className="space-y-3 pt-1 select-none">
        {REFINERY_ARTIFACTS.map((art) => (
          <div
            key={art.id}
            className="p-4 rounded-xl bg-elevated border border-border space-y-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-content-primary shrink-0">
                  {art.type === 'code' ? <FileCode size={16} /> : <FileText size={16} />}
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-content-primary font-mono">
                    {art.name}
                  </h3>
                  <span className="text-[11px] text-content-tertiary">
                    {art.size} · Updated {art.updated}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {art.type === 'code' && onOpenCodeRunner && (
                  <button
                    onClick={() => {
                      onClose()
                      onOpenCodeRunner()
                    }}
                    className="btn-glass !py-1 !px-2.5 !text-xs flex items-center gap-1"
                    title="Run in Python Sandbox"
                  >
                    <Terminal size={12} />
                    <span>Run</span>
                  </button>
                )}
                <button
                  onClick={() => handleCopy(art)}
                  className="btn-icon !w-7 !h-7 text-content-secondary hover:text-content-primary"
                  title="Copy code"
                >
                  {copiedId === art.id ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
                <button
                  onClick={() => handleDownload(art)}
                  className="btn-icon !w-7 !h-7 text-content-secondary hover:text-content-primary"
                  title="Download file"
                >
                  <Download size={13} />
                </button>
              </div>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed">
              {art.desc}
            </p>
          </div>
        ))}
      </div>
    </Modal>
  )
}
