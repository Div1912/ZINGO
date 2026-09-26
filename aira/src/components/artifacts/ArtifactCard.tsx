import React from 'react'
import { Sparkles, Eye, ExternalLink, FileCode, FileText, GitBranch, ChevronRight } from 'lucide-react'
import type { Artifact } from '../../types/artifact'
import { useArtifactStore } from '../../stores/artifactStore'

interface ArtifactCardProps {
  artifact: Artifact
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({ artifact }) => {
  const { openArtifact, activeArtifactId, isViewerOpen } = useArtifactStore()
  const isActive = isViewerOpen && activeArtifactId === artifact.id

  const handleOpenLive = (e: React.MouseEvent) => {
    e.stopPropagation()
    const blob = new Blob([artifact.content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  const versionCount = artifact.versions?.length || 1
  const currentVer = (artifact.currentVersionIndex ?? (versionCount - 1)) + 1

  const renderIcon = () => {
    if (artifact.type === 'html' || artifact.type === 'react') {
      return <Sparkles size={16} />
    }
    if (artifact.type === 'mermaid') {
      return <GitBranch size={16} />
    }
    if (artifact.type === 'markdown') {
      return <FileText size={16} />
    }
    if (artifact.type === 'svg') {
      return <Eye size={16} />
    }
    return <FileCode size={16} />
  }

  return (
    <div
      onClick={() => openArtifact(artifact.id)}
      className={`my-3 group p-3.5 rounded-xl border transition-all cursor-pointer shadow-sm flex items-center justify-between gap-3 ${
        isActive
          ? 'border-violet-500/60 bg-[#161033] shadow-violet-500/10'
          : 'border-violet-500/25 bg-[#0f0b1e]/70 hover:bg-[#150f2b]/90 hover:border-violet-500/40'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
          isActive
            ? 'bg-violet-500/25 border border-violet-500/40 text-violet-300'
            : 'bg-violet-500/15 border border-violet-500/25 text-violet-400'
        }`}>
          {renderIcon()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs sm:text-sm font-semibold text-content-primary truncate group-hover:text-violet-300 transition-colors">
              {artifact.title}
            </h4>
            {versionCount > 1 && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                v{currentVer}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-content-tertiary mt-0.5">
            <span className="uppercase font-mono font-semibold text-violet-400">
              {artifact.type.toUpperCase()}
            </span>
            <span>•</span>
            <span className="text-slate-400">
              {isActive ? 'Currently viewing in side panel' : 'Click to inspect in side panel'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => openArtifact(artifact.id)}
          className={`btn-glass !py-1.5 !px-2.5 !text-xs flex items-center gap-1.5 transition ${
            isActive ? 'text-violet-200 border-violet-500/50 bg-violet-600/30' : 'text-violet-300 hover:text-white'
          }`}
        >
          <span>{isActive ? 'Active' : 'Open'}</span>
          <ChevronRight size={13} />
        </button>

        {artifact.type === 'html' && (
          <button
            type="button"
            onClick={handleOpenLive}
            className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
            title="Open in new window"
          >
            <ExternalLink size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

