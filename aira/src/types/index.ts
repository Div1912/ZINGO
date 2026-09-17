export type ModelId = 'qwen3:8b' | 'qwen3-8b' | 'qwen2.5-7b' | 'qwen2.5-coder-7b'
export type TaskType = 'document' | 'code' | 'analysis' | 'general'
export type MessageRole = 'user' | 'assistant' | 'system'
export type Theme = 'light' | 'dark' | 'system'

export interface Source {
  id: string
  title: string
  document: string       // e.g. "MRPL_SOP_CDU2.pdf"
  page?: number
  excerpt: string
  relevanceScore: number // 0-1
}

export interface UploadedFile {
  id: string
  name: string
  type: 'pdf' | 'image' | 'docx' | 'xlsx' | 'txt'
  size: number
  previewUrl?: string
  rawFile?: File
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: string | Date
  modelUsed?: ModelId
  taskType?: TaskType
  sources?: Source[]
  files?: UploadedFile[]
  isStreaming?: boolean
  tokensUsed?: number
  latencyMs?: number
  effort?: string
  error?: string
}

export interface Chat {
  id: string
  title: string
  createdAt: string | Date
  updatedAt: string | Date
  messages: Message[]
  model: ModelId
  pinned?: boolean
}

export interface ServerConfig {
  g15_1_url: string      // default: http://192.168.1.10:8080
  g15_2_url: string      // default: http://192.168.1.11:11434
  connectionStatus: 'connected' | 'disconnected' | 'checking'
  primaryStatus?: 'connected' | 'disconnected' | 'checking'
  coderStatus?: 'connected' | 'disconnected' | 'checking'
}

export interface AutoRouteRule {
  id: string
  keywords: string
  targetModel: ModelId
}

export interface IndexedDocument {
  id: string
  name: string
  size: string
  indexedAt: string
  category: string
}

export interface AppSettings {
  userName?: string
  preferredName?: string
  workDescription?: string
  customInstructions?: string
  reducedMotion?: boolean
  chatFont?: 'inter' | 'mono' | 'system' | 'serif'
  theme: Theme
  defaultModel: ModelId
  autoRouteModel: boolean
  streamingEnabled: boolean
  showSources: boolean
  showModelBadge: boolean
  showTokenCount: boolean
  showLatency: boolean
  systemPrompt: string
  temperature: number     // 0-2, default 0.7
  maxTokens: number       // 256-4096, default 2048
  topP?: number           // 0.1-1.0, default 0.9
  contextWindow: number   // 1-20 messages
  fontSize: 'sm' | 'base' | 'lg'
  enterToSend: boolean
  notificationsEnabled: boolean
  autoRouteRules?: AutoRouteRule[]
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  title?: string
}
