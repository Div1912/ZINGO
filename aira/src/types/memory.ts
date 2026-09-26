export type MemoryCategory = 'technical' | 'preference' | 'project' | 'operational' | 'sensitive'

export interface MemoryTopic {
  id: string
  title: string
  content: string
  category: MemoryCategory
  projectId?: string | null
  projectName?: string
  sourceChatId?: string
  isSensitive?: boolean
  createdAt: string
  updatedAt: string
}

export interface PastChatSearchResult {
  query: string
  chatId: string
  chatTitle: string
  messageId: string
  role: 'user' | 'assistant'
  snippet: string
  timestamp: string
  relevanceScore: number
  projectId?: string | null
}

export interface PastChatSearchMeta {
  query: string
  searchedAt: string
  resultsCount: number
  results: PastChatSearchResult[]
}
