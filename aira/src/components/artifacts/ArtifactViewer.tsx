import React, { useEffect, useState } from 'react'
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Download,
  Code2,
  Eye,
  FileCode,
  Sparkles,
  Maximize2,
  Minimize2,
  Database,
} from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Highlight, themes } from 'prism-react-renderer'
import { useArtifactStore } from '../../stores/artifactStore'
import { useToastStore } from '../../stores/toastStore'
import { zingoApi } from '../../services/zingoApi'

export const ArtifactViewer: React.FC = () => {
  const { artifacts, activeArtifactId, isViewerOpen, closeArtifact } = useArtifactStore()
  const { addToast } = useToastStore()

  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview')
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const artifact = artifacts.find((a) => a.id === activeArtifactId)

  // Listen for calculation saves from the sandboxed iframe
  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      if (e.data?.type === 'ZINGO_SAVE_CALCULATION' && e.data.payload) {
        const { tag, title, state } = e.data.payload
        try {
          await zingoApi.saveArtifactState(artifact?.id || 'calc-result', {
            equipment_tag: tag || artifact?.equipmentTag,
            title: title || artifact?.title || 'Calculation Result',
            state,
            saved_by: 'engineer',
            update_equipment_memory: true,
          })
          addToast({
            type: 'success',
            title: 'Plant Dossier Updated',
            message: `Saved calculation results for ${tag || 'equipment'} into asset memory and audit log.`,
          })
        } catch (err: any) {
          addToast({
            type: 'error',
            title: 'Save Failed',
            message: err?.message || 'Could not save calculation to backend.',
          })
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [artifact, addToast])

  if (!isViewerOpen || !artifact) return null

  const isInteractive = artifact.type === 'html' || artifact.type === 'svg' || artifact.type === 'react'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    addToast({ type: 'success', message: 'Artifact source code copied to clipboard' })
  }

  const handleDownload = () => {
    let ext = '.txt'
    if (artifact.type === 'html') ext = '.html'
    else if (artifact.type === 'svg') ext = '.svg'
    else if (artifact.type === 'react') ext = '.tsx'
    else if (artifact.type === 'markdown') ext = '.md'
    else if (artifact.language === 'python' || artifact.language === 'py') ext = '.py'

    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${artifact.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}${ext}`
    a.click()
    URL.revokeObjectURL(url)
    addToast({ type: 'success', message: `Downloaded ${artifact.title}` })
  }

  const handleOpenLivePage = () => {
    // Generate standalone live web page blob URL
    let htmlPayload = artifact.content
    if (artifact.type === 'html' && !htmlPayload.includes('<html')) {
      htmlPayload = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${artifact.title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#0b0f19] text-slate-100 p-6">
  ${artifact.content}
</body>
</html>`
    } else if (artifact.type === 'svg') {
      htmlPayload = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${artifact.title}</title>
  <style>body { margin: 0; background: #0b0f19; display: flex; align-items: center; justify-content: center; min-height: 100vh; }</style>
</head>
<body>
  ${artifact.content}
</body>
</html>`
    }

    const blob = new Blob([htmlPayload], { type: 'text/html;charset=utf-8' })
    const liveUrl = URL.createObjectURL(blob)
    window.open(liveUrl, '_blank')
    addToast({ type: 'info', message: 'Launched live interactive page in new tab' })
  }

  // Pre-process iframe source for preview
  const getIframeSrcDoc = () => {
    if (artifact.type === 'svg') {
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 24px; background: transparent; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  ${artifact.content}
</body>
</html>`
    }

    if (artifact.type === 'html') {
      if (artifact.content.includes('<html') || artifact.content.includes('<!DOCTYPE')) {
        return artifact.content
      }
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body { font-family: ui-sans-serif, system-ui, sans-serif; }</style>
</head>
<body class="bg-[#0b0f19] text-slate-100 p-6 min-h-screen">
  ${artifact.content}
</body>
</html>`
    }

    return ''
  }

  return (
    <div
      className={`fixed z-50 bg-[#090D16] border border-border/80 shadow-2xl flex flex-col transition-all duration-300 ${
        isFullscreen
          ? 'inset-0'
          : 'inset-y-0 right-0 w-full lg:w-[680px] xl:w-[800px] border-l'
      }`}
    >
      {/* Top Header Bar ──────────────────────────────────────────────────── */}
      <div className="h-14 px-4 border-b border-border/70 flex items-center justify-between gap-3 bg-surface/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
            {artifact.type === 'html' || artifact.type === 'react' ? (
              <Sparkles size={16} />
            ) : artifact.type === 'svg' ? (
              <Eye size={16} />
            ) : (
              <FileCode size={16} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-content-primary truncate">
              {artifact.title}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-content-tertiary">
              <span className="uppercase font-mono tracking-wider font-semibold text-violet-400">
                {artifact.type.toUpperCase()}
              </span>
              <span>•</span>
              <span>Live Artifact</span>
            </div>
          </div>
        </div>

        {/* Action Buttons ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Preview / Code Tab Toggle */}
          {isInteractive && (
            <div className="flex items-center p-0.5 rounded-lg bg-surface border border-border text-xs mr-2">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition font-medium ${
                  activeTab === 'preview'
                    ? 'bg-elevated text-content-primary shadow-xs'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <Eye size={13} />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition font-medium ${
                  activeTab === 'code'
                    ? 'bg-elevated text-content-primary shadow-xs'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <Code2 size={13} />
                <span>Code</span>
              </button>
            </div>
          )}

          {/* Open live hosted link in new window */}
          {isInteractive && (
            <button
              type="button"
              onClick={handleOpenLivePage}
              className="btn-glass !py-1.5 !px-2.5 !text-xs flex items-center gap-1.5"
              title="Open full interactive page in new tab"
            >
              <ExternalLink size={13} />
              <span className="hidden sm:inline">Live Page</span>
            </button>
          )}

          {/* Copy code */}
          <button
            type="button"
            onClick={handleCopy}
            className="btn-icon !w-8 !h-8 text-content-tertiary hover:text-content-primary"
            title="Copy code"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>

          {/* Download */}
          <button
            type="button"
            onClick={handleDownload}
            className="btn-icon !w-8 !h-8 text-content-tertiary hover:text-content-primary"
            title="Download file"
          >
            <Download size={14} />
          </button>

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn-icon !w-8 !h-8 text-content-tertiary hover:text-content-primary hidden sm:flex"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={closeArtifact}
            className="btn-icon !w-8 !h-8 text-content-tertiary hover:text-content-primary ml-1"
            title="Close viewer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Plant Context Ribbon */}
      {(artifact.isPlantAware || artifact.equipmentTag) && (
        <div className="px-4 py-2 bg-violet-950/40 border-b border-violet-500/20 flex flex-wrap items-center justify-between text-xs gap-2 shrink-0">
          <div className="flex items-center gap-2 text-violet-300">
            <Database size={13} className="text-violet-400" />
            <span className="font-semibold">Plant-Aware Artifact:</span>
            <span className="font-mono bg-violet-500/20 text-violet-200 px-2 py-0.5 rounded text-[11px] font-bold">
              {artifact.equipmentTag || 'HE-301'}
            </span>
            <span className="text-violet-400/80 hidden sm:inline">• Pre-hydrated with Knowledge Graph & Measurements</span>
          </div>
          <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Bidirectional Dossier Link Active
          </span>
        </div>
      )}

      {/* Main Viewport ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative bg-[#070A11]">
        {activeTab === 'preview' && isInteractive ? (
          <iframe
            title={artifact.title}
            srcDoc={getIframeSrcDoc()}
            sandbox="allow-scripts allow-modals allow-same-origin allow-forms"
            className="w-full h-full border-0 bg-transparent"
          />
        ) : activeTab === 'preview' && artifact.type === 'markdown' ? (
          <div className="w-full h-full overflow-y-auto p-6 select-text">
            <div className="max-w-3xl mx-auto markdown-body">
              <Markdown remarkPlugins={[remarkGfm]}>
                {artifact.content}
              </Markdown>
            </div>
          </div>
        ) : (
          /* Code Tab / Non-interactive preview */
          <div className="w-full h-full overflow-y-auto p-4 font-mono text-xs select-text">
            <Highlight
              theme={themes.vsDark}
              code={artifact.content}
              language={artifact.language || 'html'}
            >
              {({ className: hlClass, style, tokens, getLineProps, getTokenProps }) => (
                <pre
                  className={`${hlClass} p-4 rounded-xl border border-slate-800/80 leading-relaxed overflow-x-auto`}
                  style={{ ...style, backgroundColor: '#090D16' }}
                >
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line })}>
                      <span className="inline-block w-8 text-slate-600 select-none text-right mr-4 opacity-50">
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
    </div>
  )
}
