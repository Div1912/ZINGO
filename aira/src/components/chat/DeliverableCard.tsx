import React, { useState } from 'react'
import {
  FileText,
  Presentation,
  Table,
  FileDown,
  Download,
  Code2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Highlight, themes } from 'prism-react-renderer'
import type { DeliverableFile, DeliverableFormat } from '../../types/deliverable'
import { useToastStore } from '../../stores/toastStore'

interface DeliverableCardProps {
  deliverable: DeliverableFile
}

const FORMAT_CONFIG: Record<
  DeliverableFormat,
  {
    label: string
    icon: LucideIcon
    accentBorder: string
    accentBg: string
    badgeBg: string
    badgeText: string
    btnPrimary: string
  }
> = {
  docx: {
    label: 'Word Document (.docx)',
    icon: FileText,
    accentBorder: 'border-blue-500/30',
    accentBg: 'bg-blue-950/20',
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-400',
    btnPrimary: 'bg-blue-600 hover:bg-blue-500 text-white',
  },
  pptx: {
    label: 'PowerPoint Deck (.pptx)',
    icon: Presentation,
    accentBorder: 'border-amber-500/30',
    accentBg: 'bg-amber-950/20',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-400',
    btnPrimary: 'bg-amber-600 hover:bg-amber-500 text-white',
  },
  xlsx: {
    label: 'Excel Spreadsheet (.xlsx)',
    icon: Table,
    accentBorder: 'border-emerald-500/30',
    accentBg: 'bg-emerald-950/20',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
    btnPrimary: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  },
  pdf: {
    label: 'PDF Engineering Report (.pdf)',
    icon: FileDown,
    accentBorder: 'border-rose-500/30',
    accentBg: 'bg-rose-950/20',
    badgeBg: 'bg-rose-500/15',
    badgeText: 'text-rose-400',
    btnPrimary: 'bg-rose-600 hover:bg-rose-500 text-white',
  },
  csv: {
    label: 'CSV Data Table (.csv)',
    icon: Table,
    accentBorder: 'border-slate-500/30',
    accentBg: 'bg-slate-900/40',
    badgeBg: 'bg-slate-500/15',
    badgeText: 'text-slate-300',
    btnPrimary: 'bg-slate-700 hover:bg-slate-600 text-white',
  },
  zip: {
    label: 'ZIP Archive (.zip)',
    icon: FileDown,
    accentBorder: 'border-purple-500/30',
    accentBg: 'bg-purple-950/20',
    badgeBg: 'bg-purple-500/15',
    badgeText: 'text-purple-400',
    btnPrimary: 'bg-purple-600 hover:bg-purple-500 text-white',
  },
  json: {
    label: 'JSON Data (.json)',
    icon: Code2,
    accentBorder: 'border-cyan-500/30',
    accentBg: 'bg-cyan-950/20',
    badgeBg: 'bg-cyan-500/15',
    badgeText: 'text-cyan-400',
    btnPrimary: 'bg-cyan-600 hover:bg-cyan-500 text-white',
  },
  other: {
    label: 'Deliverable File',
    icon: FileDown,
    accentBorder: 'border-border',
    accentBg: 'bg-surface',
    badgeBg: 'bg-elevated',
    badgeText: 'text-content-secondary',
    btnPrimary: 'bg-accent hover:bg-accent-hover text-white',
  },
}

export const DeliverableCard: React.FC<DeliverableCardProps> = ({ deliverable }) => {
  const [isCodeOpen, setIsCodeOpen] = useState(false)
  const { addToast } = useToastStore()

  const config = FORMAT_CONFIG[deliverable.format] || FORMAT_CONFIG.other
  const IconComponent = config.icon

  const handleDownload = () => {
    if (!deliverable.downloadUrl) {
      addToast({ type: 'error', message: 'Download link is unavailable.' })
      return
    }

    const a = document.createElement('a')
    a.href = deliverable.downloadUrl
    a.download = deliverable.filename
    document.body.appendChild(a)
    a.click()
    a.remove()

    addToast({
      type: 'success',
      title: 'Download Started',
      message: `Downloading "${deliverable.filename}"...`,
    })
  }

  return (
    <div
      className={`my-3.5 rounded-2xl border ${config.accentBorder} ${config.accentBg} backdrop-blur-md overflow-hidden shadow-lg transition-all`}
    >
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Icon & File Meta */}
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${config.accentBorder} ${config.badgeBg} shadow-xs`}
          >
            <IconComponent size={22} className={config.badgeText} />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${config.accentBorder} ${config.badgeBg} ${config.badgeText}`}
              >
                {config.label}
              </span>
              {deliverable.status === 'compiling' || deliverable.status === 'generating' ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium animate-pulse">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Compiling in Sandbox...</span>
                </span>
              ) : deliverable.status === 'failed' ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-medium">
                  <AlertTriangle size={12} />
                  <span>Build Error</span>
                </span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                    <CheckCircle2 size={12} />
                    <span>Verified in Sandbox</span>
                  </span>
                  {deliverable.qaReport && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      title={deliverable.qaReport.details || 'Content QA, File QA, and Visual Layout QA Verified'}
                    >
                      <ShieldCheck size={11} className="text-emerald-400" />
                      <span>3-Layer QA Passed</span>
                    </span>
                  )}
                  {deliverable.qaReport?.slideCount ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-elevated text-content-secondary border border-border">
                      {deliverable.qaReport.slideCount} Slides (16:9)
                    </span>
                  ) : null}
                </>
              )}
            </div>

            <h4 className="text-sm font-semibold text-content-primary truncate tracking-tight">
              {deliverable.filename}
            </h4>

            {deliverable.error ? (
              <p className="text-xs text-rose-300 font-mono truncate max-w-md">
                {deliverable.error}
              </p>
            ) : (
              <div className="flex items-center gap-2 text-xs text-content-tertiary font-mono">
                <span>{deliverable.sizeFormatted}</span>
                {deliverable.executionTimeMs ? (
                  <>
                    <span>•</span>
                    <span>⚡ {(deliverable.executionTimeMs / 1000).toFixed(1)}s build</span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {deliverable.codeUsed && (
            <button
              type="button"
              onClick={() => setIsCodeOpen(!isCodeOpen)}
              className="btn-glass !py-2 !px-3 !text-xs !rounded-xl flex items-center gap-1.5 text-content-secondary hover:text-content-primary cursor-pointer"
              title="Inspect Python build script"
            >
              <Code2 size={14} />
              <span className="hidden sm:inline">Code</span>
              {isCodeOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}

          {deliverable.status === 'compiling' || deliverable.status === 'generating' ? (
            <button
              type="button"
              disabled
              className="!py-2 !px-4 !text-xs !font-medium !rounded-xl flex items-center gap-2 opacity-60 bg-elevated border border-border text-content-secondary cursor-not-allowed"
            >
              <Loader2 size={14} className="animate-spin text-amber-400" />
              <span>Compiling...</span>
            </button>
          ) : deliverable.status === 'failed' ? (
            <button
              type="button"
              disabled
              className="!py-2 !px-4 !text-xs !font-medium !rounded-xl flex items-center gap-2 opacity-60 bg-rose-950/40 border border-rose-500/30 text-rose-300 cursor-not-allowed"
            >
              <AlertTriangle size={14} />
              <span>Failed</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDownload}
              className={`!py-2 !px-4 !text-xs !font-medium !rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer ${config.btnPrimary}`}
            >
              <Download size={14} />
              <span>Download</span>
            </button>
          )}
        </div>
      </div>

      {/* Code Inspector Collapsible */}
      {isCodeOpen && deliverable.codeUsed && (
        <div className="border-t border-border/80 bg-black/40 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs text-content-tertiary">
            <span className="font-mono text-[11px] text-content-secondary">
              Python Deliverable Script:
            </span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(deliverable.codeUsed || '')}
              className="text-xs text-accent hover:underline cursor-pointer"
            >
              Copy Script
            </button>
          </div>
          <Highlight
            theme={themes.vsDark}
            code={deliverable.codeUsed}
            language="python"
          >
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre
                className={`${className} p-3 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed max-h-60 border border-white/5`}
                style={{ ...style, backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
              >
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    <span className="inline-block w-6 text-content-tertiary select-none opacity-40 text-right mr-3 text-[10px]">
                      {i + 1}
                    </span>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </div>
      )}
    </div>
  )
}
