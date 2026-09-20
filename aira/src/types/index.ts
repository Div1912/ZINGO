export type ModelId =
  | 'auto'
  | 'qwen3:8b'
  | 'qwen3-8b'
  | 'qwen2.5-7b'
  | 'qwen2.5-coder-7b'
  | 'qwen2.5-coder:7b'
  | 'qwen2.5vl:3b'
  | 'qwen2.5-vl:3b'
  | 'qwen2.5-vl:7b'
  | 'llava:7b'
  | 'deepseek-r1:8b'
export type TaskType = 'document' | 'code' | 'analysis' | 'general' | 'vision'
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

export interface ThinkStep {
  step_number: number
  content: string
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
  // CoT additions
  thinkSteps?: ThinkStep[]
  rawThinking?: string
  isThinkingPhase?: boolean
  thinkElapsedMs?: number
  thinkTotalSteps?: number
  // Artifact additions
  artifactIds?: string[]
  // Tree-of-Thought (ToT) Automated Verification additions
  totSpec?: any
  totResult?: any
}

export interface Chat {
  id: string
  title: string
  createdAt: string | Date
  updatedAt: string | Date
  messages: Message[]
  model: ModelId
  pinned?: boolean
  projectId?: string
}

export * from './artifact'
export * from './project'

export interface ServerConfig {
  g15_1_url: string      // Master / Chat Node (default: Live tunnel or http://127.0.0.1:8000)
  g15_2_url: string      // Laptop 2: Coder Node (default: http://192.168.1.15:11434)
  vision_url?: string    // Laptop 3: Vision Node (default: http://192.168.1.16:11434)
  reasoning_url?: string // Laptop 4: Reasoning Node (default: http://192.168.1.17:11434)
  connectionStatus: 'connected' | 'disconnected' | 'checking'
  primaryStatus?: 'connected' | 'disconnected' | 'checking'
  coderStatus?: 'connected' | 'disconnected' | 'checking'
  visionStatus?: 'connected' | 'disconnected' | 'checking'
  reasoningStatus?: 'connected' | 'disconnected' | 'checking'
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

  // Capabilities
  artifactsEnabled?: boolean
  inlineVisualizations?: boolean
  codeExecution?: boolean
  switchModelsOnFlagged?: boolean
  generateMemoryFromChats?: boolean
  includeSensitiveTopics?: boolean
  toolAccessMode?: 'auto' | 'manual'

  // Permissions
  locationPermitted?: boolean
  locationLabel?: string
  calendarPermitted?: boolean
  calendarAccount?: string

  // Connectors
  connectorDiscovery?: boolean
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  title?: string
}
