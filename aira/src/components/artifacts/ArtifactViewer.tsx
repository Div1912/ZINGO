import React, { useEffect, useState, useRef } from 'react'
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
  RotateCcw,
  Monitor,
  Tablet,
  Smartphone,
  Terminal,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlertCircle,
} from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Highlight, themes } from 'prism-react-renderer'
import { useArtifactStore } from '../../stores/artifactStore'
import { useToastStore } from '../../stores/toastStore'
import { zingoApi } from '../../services/zingoApi'

interface ConsoleLog {
  id: string
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile'

export const ArtifactViewer: React.FC = () => {
  const { artifacts, activeArtifactId, isViewerOpen, closeArtifact } = useArtifactStore()
  const { addToast } = useToastStore()

  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview')
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop')
  const [reloadKey, setReloadKey] = useState(0)
  const [logs, setLogs] = useState<ConsoleLog[]>([])
  const [isConsoleOpen, setIsConsoleOpen] = useState(false)

  const consoleBottomRef = useRef<HTMLDivElement>(null)

  const artifact = artifacts.find((a) => a.id === activeArtifactId)

  // Listen for calculation saves and console logs from sandboxed iframe
  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      // 1. Plant calculation state save
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

      // 2. Sandboxed iframe console logger
      if (e.data?.type === 'SANDBOX_LOG') {
        const newLog: ConsoleLog = {
          id: Math.random().toString(36).slice(2, 7),
          level: e.data.level || 'info',
          message: e.data.message || '',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }
        setLogs((prev) => [...prev.slice(-99), newLog])
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [artifact, addToast])

  // Clear logs when artifact switches
  useEffect(() => {
    setLogs([])
  }, [activeArtifactId])

  useEffect(() => {
    if (isConsoleOpen && consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isConsoleOpen])

  if (!isViewerOpen || !artifact) return null

  const isInteractive =
    artifact.type === 'html' ||
    artifact.type === 'svg' ||
    artifact.type === 'react' ||
    artifact.language === 'html' ||
    artifact.language === 'jsx' ||
    artifact.language === 'tsx' ||
    artifact.language === 'javascript' ||
    artifact.language === 'js' ||
    artifact.content.includes('<html') ||
    artifact.content.includes('<!DOCTYPE') ||
    (artifact.content.includes('<div') && artifact.content.includes('</div>'))

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    addToast({ type: 'success', message: 'Artifact source code copied to clipboard' })
  }

  const handleReload = () => {
    setReloadKey((prev) => prev + 1)
    addToast({ type: 'info', message: 'Sandbox reloaded' })
  }

  const handleDownload = () => {
    let ext = '.txt'
    if (artifact.type === 'html' || artifact.language === 'html') ext = '.html'
    else if (artifact.type === 'svg') ext = '.svg'
    else if (artifact.type === 'react' || artifact.language === 'jsx' || artifact.language === 'tsx') ext = '.tsx'
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
    let htmlPayload = artifact.content
    if (artifact.type === 'svg') {
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
    } else if (!htmlPayload.includes('<html') && !htmlPayload.includes('<!DOCTYPE')) {
      htmlPayload = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${artifact.title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#0b0f19] text-slate-100 p-6">
  ${artifact.content}
</body>
</html>`
    }

    const blob = new Blob([htmlPayload], { type: 'text/html;charset=utf-8' })
    const liveUrl = URL.createObjectURL(blob)
    window.open(liveUrl, '_blank')
    addToast({ type: 'info', message: 'Launched live page in new window' })
  }

  // Pre-process iframe source for preview
  const getIframeSrcDoc = () => {
    if (artifact.type === 'svg') {
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 24px; background: #0b0f19; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    svg { max-width: 100%; height: auto; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3)); }
  </style>
</head>
<body>
  ${artifact.content}
</body>
</html>`
    }

    const loggingScript = `
  <script>
    (function() {
      const _origLog = console.log;
      const _origWarn = console.warn;
      const _origError = console.error;

      function sendLog(level, args) {
        try {
          const str = args.map(function(a) {
            if (typeof a === 'object') {
              try { return JSON.stringify(a); } catch(e) { return String(a); }
            }
            return String(a);
          }).join(' ');
          window.parent.postMessage({ type: 'SANDBOX_LOG', level: level, message: str }, '*');
        } catch (err) {}
      }

      console.log = function() {
        _origLog.apply(console, arguments);
        sendLog('info', Array.from(arguments));
      };
      console.warn = function() {
        _origWarn.apply(console, arguments);
        sendLog('warn', Array.from(arguments));
      };
      console.error = function() {
        _origError.apply(console, arguments);
        sendLog('error', Array.from(arguments));
      };
      window.onerror = function(msg, url, line) {
        sendLog('error', [msg + (line ? ' (line ' + line + ')' : '')]);
      };
    })();
  </script>
`

    if (artifact.type === 'react' || artifact.language === 'jsx' || artifact.language === 'tsx') {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${artifact.title || 'React Sandbox'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: #0b0f19; color: #f8fafc; margin: 0; }
  </style>
  ${loggingScript}
</head>
<body class="p-4 sm:p-6 min-h-screen">
  <div id="root"></div>
  <script type="text/babel">
    ${artifact.content}

    try {
      let Comp = null;
      if (typeof App !== 'undefined') Comp = App;
      else if (typeof Main !== 'undefined') Comp = Main;
      else if (typeof Component !== 'undefined') Comp = Component;
      
      if (Comp) {
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Comp));
      }
    } catch (err) {
      console.error(err);
      document.getElementById('root').innerHTML = '<div style="color:#ef4444;background:#1e1b4b;padding:16px;border-radius:8px;border:1px solid #ef4444;"><strong>React Render Error:</strong> ' + err.message + '</div>';
    }
  </script>
</body>
</html>`
    }

    // Standard HTML
    let content = artifact.content
    const isFullDoc = content.includes('<html') || content.includes('<!DOCTYPE')

    if (isFullDoc) {
      if (content.includes('</head>')) {
        return content.replace('</head>', `${loggingScript}</head>`)
      }
      return `${loggingScript}${content}`
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${artifact.title || 'Live Sandbox'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; margin: 0; }
  </style>
  ${loggingScript}
</head>
<body class="bg-[#0b0f19] text-slate-100 p-4 sm:p-6 min-h-screen">
  ${content}
</body>
</html>`
  }

  const errorCount = logs.filter((l) => l.level === 'error').length

  return (
    <div
      className={`fixed z-50 bg-[#090D16] border border-border/80 shadow-2xl flex flex-col transition-all duration-300 ${
        isFullscreen
          ? 'inset-0'
          : 'inset-y-0 right-0 w-full lg:w-[720px] xl:w-[860px] 2xl:w-[980px] border-l'
      }`}
    >
      {/* Top Header Bar ──────────────────────────────────────────────────── */}
      <div className="h-14 px-3.5 border-b border-border/70 flex items-center justify-between gap-2.5 bg-surface/80 backdrop-blur-md shrink-0">
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
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Sandbox
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Responsive Viewport Controls (Desktop / Tablet / Mobile) */}
          {isInteractive && activeTab === 'preview' && (
            <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-surface border border-border mr-1">
              <button
                type="button"
                onClick={() => setDeviceMode('desktop')}
                className={`p-1.5 rounded-md transition ${
                  deviceMode === 'desktop'
                    ? 'bg-elevated text-violet-400 shadow-xs'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
                title="Desktop view (100% width)"
              >
                <Monitor size={13} />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('tablet')}
                className={`p-1.5 rounded-md transition ${
                  deviceMode === 'tablet'
                    ? 'bg-elevated text-violet-400 shadow-xs'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
                title="Tablet view (768px width)"
              >
                <Tablet size={13} />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('mobile')}
                className={`p-1.5 rounded-md transition ${
                  deviceMode === 'mobile'
                    ? 'bg-elevated text-violet-400 shadow-xs'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
                title="Mobile view (375px width)"
              >
                <Smartphone size={13} />
              </button>
            </div>
          )}

          {/* Reload / Refresh Button */}
          {isInteractive && activeTab === 'preview' && (
            <button
              type="button"
              onClick={handleReload}
              className="btn-icon !w-7 !h-7 text-content-secondary hover:text-content-primary"
              title="Reload sandbox"
            >
              <RotateCcw size={13} />
            </button>
          )}

          {/* Preview / Code Tab Toggle */}
          {isInteractive && (
            <div className="flex items-center p-0.5 rounded-lg bg-surface border border-border text-xs mx-1">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition font-medium ${
                  activeTab === 'preview'
                    ? 'bg-elevated text-content-primary shadow-xs'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <Eye size={12} />
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
                <Code2 size={12} />
                <span>Code</span>
              </button>
            </div>
          )}

          {/* Open live page in new tab */}
          {isInteractive && (
            <button
              type="button"
              onClick={handleOpenLivePage}
              className="btn-glass !py-1 !px-2 !text-xs hidden sm:flex items-center gap-1"
              title="Open full page in new tab"
            >
              <ExternalLink size={12} />
              <span>Live Page</span>
            </button>
          )}

          {/* Copy code */}
          <button
            type="button"
            onClick={handleCopy}
            className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
            title="Copy source code"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>

          {/* Download */}
          <button
            type="button"
            onClick={handleDownload}
            className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
            title="Download file"
          >
            <Download size={13} />
          </button>

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary hidden sm:flex"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={closeArtifact}
            className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary ml-0.5"
            title="Close viewer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Plant Context Ribbon (Preserved) */}
      {(artifact.isPlantAware || artifact.equipmentTag) && (
        <div className="px-4 py-1.5 bg-violet-950/40 border-b border-violet-500/20 flex flex-wrap items-center justify-between text-xs gap-2 shrink-0">
          <div className="flex items-center gap-2 text-violet-300">
            <Database size={13} className="text-violet-400" />
            <span className="font-semibold">Plant-Aware Artifact:</span>
            <span className="font-mono bg-violet-500/20 text-violet-200 px-2 py-0.5 rounded text-[11px] font-bold">
              {artifact.equipmentTag || 'HE-301'}
            </span>
            <span className="text-violet-400/80 hidden sm:inline">• Pre-hydrated with Knowledge Graph</span>
          </div>
          <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Bidirectional Link Active
          </span>
        </div>
      )}

      {/* Main Viewport ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative bg-[#070A11] flex flex-col">
        {activeTab === 'preview' && isInteractive ? (
          <div className="flex-1 overflow-auto flex flex-col items-center justify-center p-2 sm:p-4 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
            <div
              className={`transition-all duration-300 flex flex-col bg-[#0b0f19] ${
                deviceMode === 'desktop'
                  ? 'w-full h-full border-0 rounded-none'
                  : deviceMode === 'tablet'
                  ? 'w-[768px] max-w-full h-full border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden'
                  : 'w-[375px] max-w-full h-[667px] max-h-full border-4 border-slate-700/80 rounded-[32px] shadow-2xl overflow-hidden'
              }`}
            >
              {/* Optional Phone Notch Header when in Mobile mode */}
              {deviceMode === 'mobile' && (
                <div className="h-5 bg-slate-850 flex items-center justify-center shrink-0 border-b border-slate-800">
                  <div className="w-20 h-3 bg-slate-700 rounded-full" />
                </div>
              )}

              <iframe
                key={reloadKey}
                title={artifact.title}
                srcDoc={getIframeSrcDoc()}
                sandbox="allow-scripts allow-modals allow-same-origin allow-forms"
                className="w-full h-full border-0 bg-transparent flex-1"
              />
            </div>
          </div>
        ) : activeTab === 'preview' && artifact.type === 'markdown' ? (
          <div className="flex-1 overflow-y-auto p-6 select-text">
            <div className="max-w-3xl mx-auto markdown-body">
              <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {artifact.content}
              </Markdown>
            </div>
          </div>
        ) : (
          /* Code Tab / Non-interactive preview */
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs select-text">
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

        {/* Collapsible Sandbox Console Drawer ─────────────────────────────── */}
        {isInteractive && activeTab === 'preview' && (
          <div className="border-t border-slate-800 bg-[#070A11] shrink-0">
            <div className="px-3 py-1.5 bg-[#0d121f] border-b border-slate-800/80 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                className="flex items-center gap-1.5 font-mono text-slate-300 hover:text-white transition"
              >
                <Terminal size={12} className="text-violet-400" />
                <span className="font-semibold">Console</span>
                {logs.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                      errorCount > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {logs.length} {errorCount > 0 ? `(${errorCount} error${errorCount > 1 ? 's' : ''})` : ''}
                  </span>
                )}
                {isConsoleOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              </button>

              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setLogs([])}
                    className="text-slate-500 hover:text-slate-300 text-[11px] flex items-center gap-1"
                    title="Clear console logs"
                  >
                    <Trash2 size={11} />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {isConsoleOpen && (
              <div className="h-36 overflow-y-auto p-2 font-mono text-xs space-y-1 bg-[#05070d]">
                {logs.length === 0 ? (
                  <div className="text-slate-600 italic p-2 text-[11px]">
                    No console output or errors captured yet. Interact with the sandbox to test.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className={`flex items-start gap-2 px-2 py-1 rounded text-[11px] leading-relaxed ${
                        log.level === 'error'
                          ? 'bg-rose-950/40 text-rose-300 border-l-2 border-rose-500'
                          : log.level === 'warn'
                          ? 'bg-amber-950/30 text-amber-300 border-l-2 border-amber-500'
                          : 'text-slate-300 hover:bg-slate-900/60'
                      }`}
                    >
                      <span className="text-slate-500 text-[10px] shrink-0 select-none">
                        [{log.timestamp}]
                      </span>
                      {log.level === 'error' && (
                        <AlertCircle size={12} className="text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <span className="whitespace-pre-wrap break-all flex-1">{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={consoleBottomRef} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
