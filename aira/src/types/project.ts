export interface ProjectFile {
  id: string
  name: string
  size: number
  type: string
  content: string // text content for context injection
  uploadedAt: string
}

export interface VirtualFile {
  id: string
  name: string            // 'index.html', 'style.css', 'script.js'
  path: string            // relative path, e.g. 'index.html' or 'css/style.css'
  content: string         // raw source code
  language: string        // 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'python'
  size: number            // size in bytes
  updatedAt: string
}

export interface VirtualProject {
  id: string              // unique project ID
  title: string           // e.g. 'Modern Todo Application'
  description?: string
  entryPoint: string      // default: 'index.html'
  files: Record<string, VirtualFile> // key: relative file path (e.g. 'index.html')
  status: 'draft' | 'building' | 'ready' | 'error'
  createdAt: string
  updatedAt: string
  chatId?: string
  messageId?: string
  version?: number
}

export interface Project {
  id: string
  title: string
  description?: string
  customInstructions?: string // Project-specific system prompt guidelines
  files: ProjectFile[]        // Knowledge base files uploaded to project
  virtualProject?: VirtualProject // Linked interactive runnable code project
  createdAt: string
  updatedAt: string
  chatIds: string[]
}

