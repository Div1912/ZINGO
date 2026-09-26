import React, { useState, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import {
  Copy,
  Download,
  Check,
  Eye,
  ExternalLink,
  Trash2,
  Sparkles,
  FileCode,
  Search,
} from 'lucide-react'
import { useArtifactStore } from '../../stores/artifactStore'
import { useToastStore } from '../../stores/toastStore'
import type { Artifact, ArtifactType } from '../../types/artifact'

interface ArtifactsModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenCodeRunner?: () => void
}

export const ArtifactsModal: React.FC<ArtifactsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { artifacts, openArtifact, deleteArtifact } = useArtifactStore()
  const { addToast } = useToastStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<'all' | ArtifactType>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((art) => {
      const matchesSearch =
        !searchQuery.trim() ||
        art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        art.content.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesFilter = selectedFilter === 'all' || art.type === selectedFilter

      return matchesSearch && matchesFilter
    })
  }, [artifacts, searchQuery, selectedFilter])

  const handleCopy = (art: Artifact) => {
    navigator.clipboard.writeText(art.content)
    setCopiedId(art.id)
    setTimeout(() => setCopiedId(null), 2000)
    addToast({ type: 'success', message: `${art.title} copied to clipboard` })
  }

  const handleDownload = (art: Artifact) => {
    let ext = '.txt'
    if (art.type === 'html') ext = '.html'
    else if (art.type === 'svg') ext = '.svg'
    else if (art.type === 'react') ext = '.tsx'
    else if (art.type === 'markdown') ext = '.md'
    else if (art.type === 'mermaid') ext = '.mmd'
    else if (art.language === 'python' || art.language === 'py') ext = '.py'

    const blob = new Blob([art.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${art.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}${ext}`
    link.click()
    URL.revokeObjectURL(url)
    addToast({ type: 'success', message: `${art.title} downloaded` })
  }

  const handleOpenLivePage = (art: Artifact, e: React.MouseEvent) => {
    e.stopPropagation()
    let htmlPayload = art.content
    if (art.type === 'html' && !htmlPayload.includes('<html')) {
      htmlPayload = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${art.title}</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-[#0b0f19] text-slate-100 p-6">${art.content}</body></html>`
    }
    const blob = new Blob([htmlPayload], { type: 'text/html;charset=utf-8' })
    const liveUrl = URL.createObjectURL(blob)
    window.open(liveUrl, '_blank')
    addToast({ type: 'info', message: 'Launched live page in new tab' })
  }

  const handleOpenPreview = (art: Artifact) => {
    openArtifact(art.id)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Artifacts Gallery"
      description="Live interactive pages, visual models, and execution sandboxes built by AIRA"
      maxWidth="2xl"
    >
      <div className="space-y-4 pt-1 select-none">
        {/* Search & Filter Bar ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-2.5 text-content-tertiary pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search artifacts by name or code..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-content-primary placeholder-content-tertiary focus:border-accent outline-none"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
            {(['all', 'html', 'react', 'svg', 'mermaid', 'markdown', 'code'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setSelectedFilter(filter as any)}
                className={`px-2.5 py-1 rounded-md capitalize transition font-medium ${
                  selectedFilter === filter
                    ? 'bg-elevated text-content-primary border border-border'
                    : 'text-content-secondary hover:text-content-primary hover:bg-surface'
                }`}
              >
                {filter === 'all'
                  ? 'All Artifacts'
                  : filter === 'html'
                  ? 'Web Apps'
                  : filter === 'mermaid'
                  ? 'Diagrams'
                  : filter}
              </button>
            ))}
          </div>
        </div>

        {/* Artifacts List ─────────────────────────────────────────────────── */}
        <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
          {filteredArtifacts.map((art) => {
            const isHtml = art.type === 'html' || art.type === 'react'
            const approxKb = (new Blob([art.content]).size / 1024).toFixed(1)
            const versionCount = art.versions?.length || 1

            return (
              <div
                key={art.id}
                onClick={() => handleOpenPreview(art)}
                className="group p-3.5 rounded-xl bg-elevated hover:bg-surface border border-border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                    {isHtml ? <Sparkles size={16} /> : <FileCode size={16} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs sm:text-sm font-semibold text-content-primary group-hover:text-accent transition-colors truncate">
                        {art.title}
                      </h3>
                      {versionCount > 1 && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                          v{versionCount}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-content-tertiary mt-1">
                      <span className="uppercase font-mono font-semibold text-violet-400">
                        {art.type.toUpperCase()}
                      </span>
                      <span>•</span>
                      <span>{approxKb} KB</span>
                      <span>•</span>
                      <span>{new Date(art.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Toolbar */}
                <div
                  className="flex items-center gap-1.5 shrink-0 self-end sm:self-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(art)}
                    className="btn-glass !py-1.5 !px-2.5 !text-xs flex items-center gap-1 text-content-primary"
                    title="Open in interactive sandbox"
                  >
                    <Eye size={13} />
                    <span>Preview</span>
                  </button>

                  {isHtml && (
                    <button
                      type="button"
                      onClick={(e) => handleOpenLivePage(art, e)}
                      className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
                      title="Open full interactive page in new tab"
                    >
                      <ExternalLink size={13} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleCopy(art)}
                    className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
                    title="Copy code"
                  >
                    {copiedId === art.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownload(art)}
                    className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
                    title="Download file"
                  >
                    <Download size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteArtifact(art.id)}
                    className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-danger"
                    title="Delete artifact"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}

          {filteredArtifacts.length === 0 && (
            <div className="py-12 text-center text-xs text-content-tertiary space-y-1">
              <p className="font-medium text-content-secondary">No artifacts found</p>
              <p>Ask AIRA to create an interactive web app, chart, or script in chat to generate new artifacts.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
