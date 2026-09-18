import React from 'react'
import { Sparkles, Eye, ExternalLink, FileCode } from 'lucide-react'
import type { Artifact } from '../../types/artifact'
import { useArtifactStore } from '../../stores/artifactStore'

interface ArtifactCardProps {
  artifact: Artifact
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({ artifact }) => {
  const { openArtifact } = useArtifactStore()

  const handleOpenLive = (e: React.MouseEvent) => {
    e.stopPropagation()
    const blob = new Blob([artifact.content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  return (
    <div
      onClick={() => openArtifact(artifact.id)}
      className="my-3 group p-3.5 rounded-xl border border-violet-500/25 bg-[#0f0b1e]/70 hover:bg-[#150f2b]/90 hover:border-violet-500/40 transition-all cursor-pointer shadow-sm flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-400 shrink-0 group-hover:scale-105 transition-transform">
          {artifact.type === 'html' || artifact.type === 'react' ? (
            <Sparkles size={16} />
          ) : (
            <FileCode size={16} />
          )}
        </div>
        <div className="min-w-0">
          <h4 className="text-xs sm:text-sm font-semibold text-content-primary truncate group-hover:text-violet-300 transition-colors">
            {artifact.title}
          </h4>
          <div className="flex items-center gap-2 text-[11px] text-content-tertiary mt-0.5">
            <span className="uppercase font-mono font-medium text-violet-400">
              {artifact.type.toUpperCase()}
            </span>
            <span>•</span>
            <span>Click to preview live interactive app</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => openArtifact(artifact.id)}
          className="btn-glass !py-1.5 !px-2.5 !text-xs flex items-center gap-1 text-violet-300 hover:text-white"
        >
          <Eye size={13} />
          <span className="hidden sm:inline">Preview</span>
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
