export type ArtifactType = 'html' | 'react' | 'svg' | 'markdown' | 'code' | 'mermaid'

export interface ArtifactVersion {
  version: number
  content: string
  title?: string
  timestamp: string
  summary?: string
}

export interface Artifact {
  id: string
  identifier?: string
  chatId?: string
  projectId?: string
  title: string
  type: ArtifactType
  language: string
  content: string
  versions: ArtifactVersion[]
  currentVersionIndex: number
  createdAt: string
  updatedAt: string
  equipmentTag?: string
  isPlantAware?: boolean
  plantContext?: any
  savedState?: any
}

