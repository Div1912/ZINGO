import React from 'react'
import { Cpu, FileText, Code, BarChart2, Sparkles } from 'lucide-react'
import type { ModelId, TaskType } from '../../types'

interface ModelBadgeProps {
  model?: ModelId
  taskType?: TaskType
}

export const ModelBadge: React.FC<ModelBadgeProps> = ({
  model = 'qwen3:8b',
  taskType = 'document',
}) => {
  const modelName =
    model === 'qwen3:8b' || model === 'qwen3-8b'
      ? 'Qwen3-8B (Tunnel)'
      : model === 'qwen2.5-coder-7b'
      ? 'Qwen2.5-Coder-7B'
      : 'Qwen2.5-7B'

  let taskIcon = <FileText size={11} className="text-content-secondary" />
  let taskLabel = 'Document'

  switch (taskType) {
    case 'code':
      taskIcon = <Code size={11} className="text-content-secondary" />
      taskLabel = 'Code'
      break
    case 'analysis':
      taskIcon = <BarChart2 size={11} className="text-content-secondary" />
      taskLabel = 'Analysis'
      break
    case 'general':
      taskIcon = <Sparkles size={11} className="text-content-secondary" />
      taskLabel = 'General'
      break
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-elevated border border-border text-[11px] text-content-secondary font-medium tracking-tight">
      <Cpu size={11} className="text-content-tertiary" />
      <span className="text-content-primary">{modelName}</span>
      <span className="text-border-strong">&middot;</span>
      <span className="inline-flex items-center gap-1">
        {taskIcon}
        <span>{taskLabel}</span>
      </span>
    </div>
  )
}
