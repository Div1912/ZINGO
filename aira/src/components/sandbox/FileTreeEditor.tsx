import React from 'react'
import {
  FileCode,
  FileText,
  FileJson,
  Code2,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react'
import type { VirtualProject, VirtualFile } from '../../types/project'
import { useToastStore } from '../../stores/toastStore'

interface FileTreeEditorProps {
  project: VirtualProject
  activeFilePath: string
  onSelectFile: (path: string) => void
  onUpdateFileContent: (path: string, content: string) => void
}

export const FileTreeEditor: React.FC<FileTreeEditorProps> = ({
  project,
  activeFilePath,
  onSelectFile,
  onUpdateFileContent,
}) => {
  const { addToast } = useToastStore()
  const [copied, setCopied] = React.useState(false)

  const files = Object.values(project.files)
  const currentFile = project.files[activeFilePath] || files[0]

  const handleCopyCurrent = async () => {
    if (!currentFile) return
    await navigator.clipboard.writeText(currentFile.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    addToast({ type: 'success', message: `Copied ${currentFile.name} to clipboard` })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle tab key to insert 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const value = target.value
      const newValue = value.substring(0, start) + '  ' + value.substring(end)
      onUpdateFileContent(currentFile.path, newValue)

      // Restore cursor position
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2
      }, 0)
    }
  }

  const getFileIcon = (file: VirtualFile) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'html':
      case 'htm':
        return <FileCode size={14} className="text-orange-400 shrink-0" />
      case 'css':
      case 'scss':
        return <FileCode size={14} className="text-sky-400 shrink-0" />
      case 'js':
      case 'javascript':
      case 'jsx':
        return <Code2 size={14} className="text-amber-400 shrink-0" />
      case 'ts':
      case 'typescript':
      case 'tsx':
        return <Code2 size={14} className="text-blue-400 shrink-0" />
      case 'json':
        return <FileJson size={14} className="text-emerald-400 shrink-0" />
      case 'py':
        return <FileCode size={14} className="text-indigo-400 shrink-0" />
      default:
        return <FileText size={14} className="text-slate-400 shrink-0" />
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  const lineCount = (currentFile?.content || '').split('\n').length

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Left File Tree Sidebar */}
      <div className="w-56 shrink-0 border-r border-slate-800/80 bg-slate-900/60 p-2 flex flex-col">
        <div className="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase flex items-center justify-between">
          <span>Project Files</span>
          <span className="text-[10px] text-slate-500 font-mono">{files.length} files</span>
        </div>

        <div className="mt-1 space-y-1 overflow-y-auto flex-1 custom-scrollbar">
          {files.map((file) => {
            const isActive = file.path === currentFile?.path
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => onSelectFile(file.path)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  isActive
                    ? 'bg-violet-500/20 text-violet-200 border border-violet-500/30 font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {getFileIcon(file)}
                  <span className="truncate">{file.name}</span>
                </div>
                <span className="text-[10px] text-slate-500 shrink-0 font-sans">
                  {formatSize(file.size)}
                </span>
              </button>
            )
          })}
        </div>

        <div className="p-2 border-t border-slate-800/80 mt-auto bg-slate-900/40 rounded-lg">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Sparkles size={12} className="text-violet-400 shrink-0" />
            <span>Hot-reloads on edits</span>
          </div>
        </div>
      </div>

      {/* Right Code Editor Pane */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
        {/* Editor Tab Header */}
        <div className="h-9 px-4 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-300">
            {currentFile && getFileIcon(currentFile)}
            <span className="font-semibold text-slate-200">{currentFile?.path}</span>
            <span className="text-slate-500 text-[11px]">({lineCount} lines)</span>
          </div>
          <button
            type="button"
            onClick={handleCopyCurrent}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded hover:bg-slate-800 transition"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy File'}</span>
          </button>
        </div>

        {/* Text Area Code Editor */}
        <div className="flex-1 relative overflow-hidden flex">
          {/* Line Numbers Bar */}
          <div className="w-12 shrink-0 py-3 pr-2 text-right font-mono text-xs text-slate-600 bg-slate-950/80 select-none border-r border-slate-800/40">
            {Array.from({ length: Math.min(lineCount, 500) }).map((_, i) => (
              <div key={i} className="leading-6">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code Textarea */}
          <textarea
            value={currentFile?.content || ''}
            onChange={(e) => onUpdateFileContent(currentFile.path, e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="flex-1 w-full h-full p-3 font-mono text-xs leading-6 bg-transparent text-slate-200 focus:outline-none resize-none overflow-auto custom-scrollbar whitespace-pre"
          />
        </div>
      </div>
    </div>
  )
}
