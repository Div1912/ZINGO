import { useChatStore } from '../stores/chatStore'
import type { PastChatSearchResult, PastChatSearchMeta } from '../types/memory'

const STOP_WORDS = new Set([
  'what', 'when', 'where', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
  'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would', 'should',
  'could', 'ought', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until',
  'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to',
  'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'all', 'any', 'both', 'each',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'dont',
  'didnt', 'tell', 'discuss', 'discussed', 'talk', 'talked', 'decide', 'decided',
  'remember', 'mention', 'mentioned', 'find', 'search', 'past', 'chats', 'chat',
])

export interface SearchPastChatsOptions {
  query: string
  projectId?: string | null
  currentChatId?: string
  limit?: number
}

/**
 * Detects if a user prompt is asking conversationally about past discussions, decisions, or code.
 */
export function detectPastChatIntent(prompt: string): { isIntent: boolean; query: string } {
  const clean = prompt.trim()
  if (!clean || clean.length < 5) return { isIntent: false, query: '' }

  // 1. Explicit search triggers
  const explicitMatch = clean.match(/^(?:search\s+past\s+chats?\s+for|find\s+in\s+past\s+chats?)\s*[:,-]?\s*(.+)/i)
  if (explicitMatch && explicitMatch[1]?.trim()) {
    return { isIntent: true, query: explicitMatch[1].trim() }
  }

  // 2. Conversational past reference patterns
  const conversationalPatterns = [
    /(?:what\s+did\s+we\s+(?:discuss|decide|agree|say|conclude)\s+(?:about|on|regarding)|what\s+was\s+our\s+decision\s+on)\s+(.+)/i,
    /(?:do\s+you\s+remember\s+(?:when\s+we|what\s+we|how\s+we)|remind\s+me\s+what\s+we\s+said\s+about)\s+(.+)/i,
    /(?:find\s+(?:that|the)\s+(?:discussion|notes?|code\s+snippet|solution|sop)\s+(?:for|about|on))\s+(.+)/i,
    /(?:earlier\s+(?:we|you)\s+(?:discussed|mentioned|wrote|suggested)|where\s+did\s+we\s+(?:talk\s+about|mention))\s+(.+)/i,
    /(?:have\s+we\s+(?:ever\s+)?discussed|did\s+we\s+already\s+cover)\s+(.+)/i,
  ]

  for (const pattern of conversationalPatterns) {
    const match = clean.match(pattern)
    if (match && match[1]?.trim()) {
      const extracted = match[1].trim().replace(/[?!.]+$/, '')
      if (extracted.length >= 3) {
        return { isIntent: true, query: extracted }
      }
    }
  }

  return { isIntent: false, query: '' }
}

/**
 * Bounded Past Chat Search (Conversational RAG Tool)
 * - Strict project isolation: searches ONLY chats within the active project,
 *   or ONLY global non-project chats if projectId is null.
 * - Excludes the current active chat.
 * - Excludes empty chats.
 * - Scores keyword frequency, title matches, and phrase matches with recency weighting.
 */
export function searchPastChats({
  query,
  projectId = null,
  currentChatId,
  limit = 4,
}: SearchPastChatsOptions): PastChatSearchResult[] {
  const cleanQuery = query.trim().toLowerCase()
  if (!cleanQuery) return []

  const allChats = useChatStore.getState().chats

  // Tokenize keywords
  const queryTokens = cleanQuery
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))

  const candidateResults: PastChatSearchResult[] = []

  // Filter scoped chats strictly
  const scopedChats = allChats.filter((c) => {
    // Exclude current chat being held
    if (currentChatId && c.id === currentChatId) return false
    // Skip empty chats
    if (!c.messages || c.messages.length === 0) return false

    // STRICT PROJECT ISOLATION:
    if (projectId) {
      return c.projectId === projectId
    }
    // Global scope: only chats without a projectId
    return !c.projectId
  })

  const now = Date.now()

  for (const chat of scopedChats) {
    const chatTitle = chat.title || 'Untitled Conversation'
    const titleLower = chatTitle.toLowerCase()

    // Title score bonus
    let titleScore = 0
    if (titleLower.includes(cleanQuery)) {
      titleScore += 8
    } else {
      for (const tok of queryTokens) {
        if (titleLower.includes(tok)) titleScore += 3
      }
    }

    // Recency factor (up to +2 for chats within last 7 days)
    const chatAgeDays = Math.max(0, (now - new Date(chat.updatedAt || chat.createdAt).getTime()) / (1000 * 3600 * 24))
    const recencyBonus = Math.max(0, 2 - chatAgeDays * 0.1)

    for (const msg of chat.messages) {
      if (!msg.content || msg.role === 'system') continue

      const contentLower = msg.content.toLowerCase()
      let msgScore = titleScore + recencyBonus

      // Phrase match bonus
      if (contentLower.includes(cleanQuery)) {
        msgScore += 12
      }

      // Keyword matches
      let matchedKeywordCount = 0
      for (const token of queryTokens) {
        if (contentLower.includes(token)) {
          matchedKeywordCount++
          msgScore += 3
        }
      }

      // Must have matched at least one significant token or phrase
      if (matchedKeywordCount === 0 && !contentLower.includes(cleanQuery)) {
        continue
      }

      // Extract high-quality contextual snippet
      let snippet = ''
      const firstToken = queryTokens.find((t) => contentLower.includes(t)) || cleanQuery
      const matchIndex = contentLower.indexOf(firstToken)

      if (matchIndex >= 0) {
        const start = Math.max(0, matchIndex - 60)
        const end = Math.min(msg.content.length, matchIndex + 140)
        snippet = (start > 0 ? '...' : '') + msg.content.substring(start, end).replace(/\s+/g, ' ').trim() + (end < msg.content.length ? '...' : '')
      } else {
        snippet = msg.content.slice(0, 160).replace(/\s+/g, ' ').trim() + (msg.content.length > 160 ? '...' : '')
      }

      candidateResults.push({
        query,
        chatId: chat.id,
        chatTitle,
        messageId: msg.id,
        role: msg.role as 'user' | 'assistant',
        snippet,
        timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString(),
        relevanceScore: msgScore,
        projectId: chat.projectId || null,
      })
    }
  }

  // Sort by score descending and deduplicate by chat (pick best snippet per chat)
  candidateResults.sort((a, b) => b.relevanceScore - a.relevanceScore)

  const seenChats = new Set<string>()
  const finalResults: PastChatSearchResult[] = []

  for (const res of candidateResults) {
    if (!seenChats.has(res.chatId)) {
      seenChats.add(res.chatId)
      finalResults.push(res)
      if (finalResults.length >= limit) break
    }
  }

  return finalResults
}

/**
 * Formats past chat search results for insertion into the LLM system prompt context
 */
export function formatPastChatsForPrompt(meta: PastChatSearchMeta): string {
  if (!meta.results || meta.results.length === 0) return ''

  const lines = [
    `# Past Conversation Knowledge (Retrieved on-demand via search_past_chats)`,
    `Query: "${meta.query}"`,
    `The following historical conversation snippets were retrieved from the user's past records:`,
  ]

  meta.results.forEach((r, idx) => {
    lines.push(
      `${idx + 1}. [Chat: "${r.chatTitle}"](chat://${r.chatId}) (${r.role === 'assistant' ? 'Assistant' : 'User'} turn):`
    )
    lines.push(`   > "${r.snippet}"`)
  })

  lines.push('')
  lines.push(
    `Cite past decisions or code directly when answering. You can link to past discussions using markdown links like [Chat: ${meta.results[0].chatTitle}](chat://${meta.results[0].chatId}).`
  )

  return lines.join('\n')
}
