import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  RotateCcw,
  ExternalLink,
  Download,
  Maximize2,
  Minimize2,
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  FileCode,
  Terminal,
  Sparkles,
} from 'lucide-react'

import { useProjectStore } from '../../stores/projectStore'
import { useToastStore } from '../../stores/toastStore'
import { bundleVirtualProject } from '../../services/sandboxBundler'
import { FileTreeEditor } from './FileTreeEditor'
import { ConsoleTerminal, type SandboxConsoleLog } from './ConsoleTerminal'
import { MicroVMTerminal } from './MicroVMTerminal'

type CanvasTab = 'preview' | 'code' | 'console' | 'terminal'
type DeviceMode = 'desktop' | 'tablet' | 'mobile'

interface LiveSandboxCanvasProps {
  onFixWithAI?: (errorMessage: string) => void
}

export const LiveSandboxCanvas: React.FC<LiveSandboxCanvasProps> = ({ onFixWithAI }) => {
  const {
    isSandboxCanvasOpen,
    activeVirtualProjectId,
    virtualProjects,
    closeSandboxCanvas,
    updateVirtualFile,
    exportProjectAsZip,
  } = useProjectStore()


  const { addToast } = useToastStore()

  const [activeTab, setActiveTab] = useState<CanvasTab>('preview')
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [logs, setLogs] = useState<SandboxConsoleLog[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string>('')
  const [isExporting, setIsExporting] = useState(false)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)

  const activeProject = virtualProjects.find((p) => p.id === activeVirtualProjectId) || virtualProjects[0]

  // Default active file
  useEffect(() => {
    if (activeProject) {
      if (!activeFilePath || !activeProject.files[activeFilePath]) {
        setActiveFilePath(activeProject.entryPoint || Object.keys(activeProject.files)[0] || '')
      }
    }
  }, [activeProject, activeFilePath])

  // Clear logs when project changes
  useEffect(() => {
    setLogs([])
  }, [activeProject?.id])

  // Listen for console telemetry from sandboxed iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'SANDBOX_CONSOLE') {
        const newLog: SandboxConsoleLog = {
          id: Math.random().toString(36).slice(2, 7),
          level: e.data.level || 'info',
          message: e.data.message || '',
          timestamp: e.data.timestamp || new Date().toLocaleTimeString(),
        }
        setLogs((prev) => [...prev.slice(-199), newLog])
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Bundle virtual project into executable HTML
  const bundle = useMemo(() => {
    if (!activeProject) return null
    return bundleVirtualProject(activeProject)
  }, [activeProject, reloadKey])

  // Clean up blob URLs
  useEffect(() => {
    if (bundle?.html) {
      const blob = new Blob([bundle.html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      setLiveUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [bundle?.html])

  if (!isSandboxCanvasOpen || !activeProject) {
    return null
  }

  const fileCount = Object.keys(activeProject.files).length
  const errorCount = logs.filter((l) => l.level === 'error').length

  const handleReload = () => {
    setReloadKey((prev) => prev + 1)
    addToast({ type: 'info', message: 'Reloaded sandbox preview' })
  }

  const handleOpenNewWindow = () => {
    if (!liveUrl) return
    window.open(liveUrl, '_blank')
    addToast({ type: 'info', message: 'Launched application in external window' })
  }

  const handleExportZip = async () => {
    try {
      setIsExporting(true)
      const zipBlob = await exportProjectAsZip(activeProject.id)
      const downloadUrl = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${activeProject.title.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'zingo_project'}.zip`
      a.click()
      URL.revokeObjectURL(downloadUrl)
      addToast({ type: 'success', message: `Exported ${activeProject.title} as ZIP` })
    } catch (err: any) {
      addToast({ type: 'error', message: err.message || 'Failed to export project ZIP' })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div
      className={`fixed z-50 transition-all duration-300 flex flex-col bg-slate-900 border-l border-slate-800 shadow-2xl ${
        isFullscreen
          ? 'inset-0 w-screen h-screen'
          : 'top-14 right-0 bottom-0 w-full lg:w-[54%] xl:w-[50%]'
      }`}
    >
      {/* ------------------------------------------------------------- */}
      {/* Top Control Bar (Claude Style)                                */}
      {/* ------------------------------------------------------------- */}
      <div className="h-12 px-3 border-b border-slate-800/90 bg-slate-950/80 backdrop-blur-md flex items-center justify-between shrink-0 select-none">
        {/* Left: Project Info & Multi-Project Selector */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-md shadow-violet-500/20 shrink-0">
            <Sparkles size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-100 truncate max-w-[200px] sm:max-w-[280px]">
                {activeProject.title}
              </h2>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/15 text-violet-300 border border-violet-500/25 shrink-0">
                {fileCount} files
              </span>
            </div>
          </div>
        </div>

        {/* Center: Tabs Switcher (Preview | Code | Console) */}
        <div className="flex items-center bg-slate-900/90 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              activeTab === 'preview'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Eye size={13} />
            <span>Preview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              activeTab === 'code'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileCode size={13} />
            <span>Code</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('console')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all relative ${
              activeTab === 'console'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Terminal size={13} />
            <span>Console</span>
            {errorCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white animate-pulse">
                {errorCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'terminal'
                ? 'bg-slate-800 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Terminal size={13} className="text-emerald-400" />
            <span>Terminal (WASM)</span>
          </button>
        </div>

        {/* Right: Viewport Mode Switcher & Global Actions */}
        <div className="flex items-center gap-1.5">
          {activeTab === 'preview' && (
            <div className="hidden sm:flex items-center bg-slate-900/80 rounded-lg p-0.5 border border-slate-800 mr-1">
              <button
                type="button"
                onClick={() => setDeviceMode('desktop')}
                className={`p-1 rounded text-slate-400 hover:text-white transition ${
                  deviceMode === 'desktop' ? 'bg-slate-800 text-violet-400' : ''
                }`}
                title="Desktop View (100%)"
              >
                <Monitor size={14} />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('tablet')}
                className={`p-1 rounded text-slate-400 hover:text-white transition ${
                  deviceMode === 'tablet' ? 'bg-slate-800 text-violet-400' : ''
                }`}
                title="Tablet View (768px)"
              >
                <Tablet size={14} />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('mobile')}
                className={`p-1 rounded text-slate-400 hover:text-white transition ${
                  deviceMode === 'mobile' ? 'bg-slate-800 text-violet-400' : ''
                }`}
                title="Mobile View (375px)"
              >
                <Smartphone size={14} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleReload}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Reload Sandbox"
          >
            <RotateCcw size={14} />
          </button>

          <button
            type="button"
            onClick={handleOpenNewWindow}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Open in Full Browser Tab"
          >
            <ExternalLink size={14} />
          </button>

          <button
            type="button"
            onClick={handleExportZip}
            disabled={isExporting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition disabled:opacity-50"
            title="Export Entire Project as ZIP"
          >
            <Download size={14} />
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <div className="w-px h-4 bg-slate-800 mx-0.5" />

          <button
            type="button"
            onClick={closeSandboxCanvas}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            title="Close Sandbox Canvas"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Content Area                                                  */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 relative overflow-hidden bg-slate-950 flex flex-col">
        {/* Tab 1: Live Interactive Preview */}
        {activeTab === 'preview' && (
          <div className="flex-1 w-full h-full flex items-center justify-center bg-[#07090e] p-2 overflow-auto">
            <div
              className={`h-full transition-all duration-300 bg-slate-950 rounded-xl overflow-hidden shadow-2xl flex flex-col ${
                deviceMode === 'mobile'
                  ? 'w-[375px] max-h-[812px] border-4 border-slate-700/80 rounded-[32px] my-auto'
                  : deviceMode === 'tablet'
                  ? 'w-[768px] max-h-[1024px] border-4 border-slate-700/80 rounded-[24px] my-auto'
                  : 'w-full h-full border border-slate-800/80'
              }`}
            >
              {bundle?.html ? (
                <iframe
                  key={reloadKey}
                  title={activeProject.title}
                  srcDoc={bundle.html}
                  sandbox="allow-scripts allow-forms allow-modals"
                  className="w-full h-full border-none bg-white dark:bg-[#0b0f19]"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  Generating project bundle...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: File Tree & Code Editor */}
        {activeTab === 'code' && (
          <FileTreeEditor
            project={activeProject}
            activeFilePath={activeFilePath}
            onSelectFile={setActiveFilePath}
            onUpdateFileContent={(path, content) => {
              updateVirtualFile(activeProject.id, path, content)
            }}
          />
        )}

        {/* Tab 3: Runtime Console & Telemetry */}
        {activeTab === 'console' && (
          <ConsoleTerminal
            logs={logs}
            onClearLogs={() => setLogs([])}
            onFixWithAI={onFixWithAI}
          />
        )}

        {/* Tab 4: Interactive WebContainer MicroVM Terminal */}
        {activeTab === 'terminal' && (
          <MicroVMTerminal project={activeProject} />
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Bottom Footer Information Bar                                 */}
      {/* ------------------------------------------------------------- */}
      <div className="h-7 px-3 border-t border-slate-800/80 bg-slate-950 flex items-center justify-between text-[11px] text-slate-500 font-mono shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-slate-400">Sandbox Active</span>
          </span>
          <span>Entry: {activeProject.entryPoint}</span>
        </div>
        <div className="flex items-center gap-4">
          {errorCount > 0 ? (
            <span className="text-rose-400 font-semibold">{errorCount} Error(s)</span>
          ) : (
            <span className="text-emerald-400/80">0 Errors</span>
          )}
          <span>VFS v{activeProject.version || 1}</span>
        </div>
      </div>
    </div>
  )
}
