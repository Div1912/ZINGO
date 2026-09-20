import React from 'react'
import { Cpu, FileText, Code, BarChart2, Sparkles } from 'lucide-react'
import type { ModelId, TaskType } from '../../types'

interface ModelBadgeProps {
  model?: ModelId | string
  taskType?: TaskType
}

export function formatModelDisplayName(model?: string): string {
  if (!model) return 'Qwen 3 (8B)'
  const m = model.toLowerCase()
  if (m.includes('vl') || m.includes('vision')) return 'Qwen 2.5-VL'
  if (m.includes('coder')) return 'Qwen 2.5-Coder (7B)'
  if (m.includes('r1') || m.includes('deepseek')) return 'DeepSeek-R1 (8B)'
  if (m.includes('qwen3') || m.includes('8b')) return 'Qwen 3 (8B)'
  if (m.includes('7b')) return 'Qwen 2.5 (7B)'
  return model
}

export const ModelBadge: React.FC<ModelBadgeProps> = ({
  model = 'qwen3:8b',
  taskType = 'document',
}) => {
  const modelName = formatModelDisplayName(model)

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
