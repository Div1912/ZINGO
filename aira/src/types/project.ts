export interface ProjectFile {
  id: string
  name: string
  size: number
  type: string
  content: string // text content for context injection
  uploadedAt: string
}

export interface Project {
  id: string
  title: string
  description?: string
  customInstructions?: string // Project-specific system prompt guidelines
  files: ProjectFile[]        // Knowledge base files uploaded to project
  createdAt: string
  updatedAt: string
  chatIds: string[]
}
