export type ArtifactType = 'html' | 'react' | 'svg' | 'markdown' | 'code'

export interface Artifact {
  id: string
  chatId?: string
  projectId?: string
  title: string
  type: ArtifactType
  language: string
  content: string
  createdAt: string
  updatedAt: string
  equipmentTag?: string
  isPlantAware?: boolean
  plantContext?: any
  savedState?: any
}
