import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MemoryTopic, MemoryCategory } from '../types/memory'
import { useProjectStore } from './projectStore'
import { zingoApi } from '../services/zingoApi'

// ============================================================================
// Security Filters: Hard Blocks & Sensitive Scrubbers
// ============================================================================

// Hard-blocked regex patterns: Credit cards, Passwords, API tokens, Govt IDs, Bank accounts
const HARD_BLOCK_PATTERNS = [
  // Credit card formats (Visa, MasterCard, Amex, Discover)
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/,
  // 16-digit card sequences with dashes/spaces
  /\b(?:\d{4}[ -]){3}\d{4}\b/,
  // Passwords / Bearer tokens / API secrets
  /\b(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,}|bearer\s+[a-zA-Z0-9_.\-]{20,}|[a-zA-Z0-9_-]{32,64}\.(?:jwt|secret))\b/i,
  /\bpassword\s*[:=]\s*\S+/i,
  // US SSN
  /\b\d{3}-\d{2}-\d{4}\b/,
  // Indian Aadhaar (12 digits with spaces)
  /\b[2-9]\d{3}\s\d{4}\s\d{4}\b/,
  // Indian PAN (5 letters, 4 digits, 1 letter)
  /\b[A-Z]{5}[0-9]{4}[A-Z]\b/,
  // Financial account numbers
  /\b(?:account|acc|routing)\s*(?:number|no|#)?\s*[:=]?\s*\d{8,18}\b/i,
]

// Soft-blocked patterns: Health/medical, political, religion, race/ethnicity
const SENSITIVE_PATTERNS = [
  /\b(?:diagnosed with|medical condition|prescription|medication|doctor(?:'s)? appointment|biopsy|chemotherapy|psychiatric)\b/i,
  /\b(?:political party|democrat|republican|voting for|election campaign|political donation)\b/i,
  /\b(?:religious belief|church|mosque|synagogue|temple attendance|confession of faith)\b/i,
  /\b(?:racial background|ethnic heritage|sexual orientation|gender transition)\b/i,
]

export function containsHardBlockedContent(text: string): boolean {
  return HARD_BLOCK_PATTERNS.some((pattern) => pattern.test(text))
}

export function containsSensitiveContent(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))
}

// ============================================================================
// Default Initial Memories (Reflecting sovereign plant engineering context)
// ============================================================================

const INITIAL_MEMORIES: MemoryTopic[] = [
  {
    id: 'mem-initial-plant-01',
    title: 'CDU-2 Furnace Operating Ceiling',
    content: 'Furnace COT must not exceed 370°C; maintain stripping steam ratio at 0.15 kg/kg hydrocarbon feed.',
    category: 'operational',
    projectId: 'proj-cdu2-turnaround',
    projectName: 'CDU-2 Turnaround & Revamp 2026',
    isSensitive: false,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'mem-initial-pref-01',
    title: 'Engineering Deliverable Format',
    content: 'Deliver SOPs and turnaround checklists with specific equipment tag references, step-by-step numbers, and explicit LEL/H2S safety gates.',
    category: 'preference',
    projectId: null,
    projectName: undefined,
    isSensitive: false,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
]

// ============================================================================
// Store Interface
// ============================================================================

interface MemoryStore {
  topics: MemoryTopic[]
  isPaused: boolean
  includeSensitive: boolean
  autoExtract: boolean
  lastSavedTopic: MemoryTopic | null

  // CRUD
  addTopic: (data: Omit<MemoryTopic, 'id' | 'createdAt' | 'updatedAt'>) => MemoryTopic | null
  updateTopic: (id: string, updates: Partial<MemoryTopic>) => void
  deleteTopic: (id: string) => void
  clearAllTopics: (projectId?: string | null) => void
  resetAllMemory: () => void

  // Configuration
  setIsPaused: (paused: boolean) => void
  setIncludeSensitive: (include: boolean) => void
  setAutoExtract: (auto: boolean) => void

  // Scoped queries
  getTopicsForScope: (projectId: string | null) => MemoryTopic[]
  formatMemoryContextForPrompt: (projectId: string | null) => string

  // Continuous extraction engine
  extractFromTurn: (
    userText: string,
    assistantText?: string,
    projectId?: string | null,
    chatId?: string
  ) => MemoryTopic[]
}

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set, get) => ({
      topics: INITIAL_MEMORIES,
      isPaused: false,
      includeSensitive: false,
      autoExtract: true,
      lastSavedTopic: null,

      // ─── Add Topic ──────────────────────────────────────────────────────────
      addTopic: (data) => {
        const { isPaused, includeSensitive } = get()
        if (isPaused) {
          return null
        }

        // 1. Hard Security Check: Unconditionally reject cards, passwords, SSN, tokens
        if (containsHardBlockedContent(data.title) || containsHardBlockedContent(data.content)) {
          console.warn('[MemoryStore] Blocked topic containing restricted sensitive data (cards/passwords/Govt ID).')
          return null
        }

        // 2. Soft Sensitive Check: If sensitive and user opted out, reject
        const isSoftSensitive = data.isSensitive || containsSensitiveContent(data.title) || containsSensitiveContent(data.content)
        if (isSoftSensitive && !includeSensitive) {
          console.warn('[MemoryStore] Suppressed sensitive memory topic (opt-in disabled).')
          return null
        }

        // 3. Deduplicate / Update existing topic in same scope
        const existingIndex = get().topics.findIndex(
          (t) =>
            t.projectId === (data.projectId ?? null) &&
            (t.title.toLowerCase().trim() === data.title.toLowerCase().trim() ||
              t.content.toLowerCase().trim() === data.content.toLowerCase().trim())
        )

        const now = new Date().toISOString()
        let resolvedTopic: MemoryTopic

        if (existingIndex >= 0) {
          // Update existing topic
          const existing = get().topics[existingIndex]
          resolvedTopic = {
            ...existing,
            ...data,
            isSensitive: isSoftSensitive,
            updatedAt: now,
          }
          const updatedList = [...get().topics]
          updatedList[existingIndex] = resolvedTopic
          set({ topics: updatedList, lastSavedTopic: resolvedTopic })
        } else {
          // Insert new topic
          resolvedTopic = {
            ...data,
            id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            isSensitive: isSoftSensitive,
            createdAt: now,
            updatedAt: now,
          }
          set((state) => ({
            topics: [resolvedTopic, ...state.topics],
            lastSavedTopic: resolvedTopic,
          }))
        }

        // Async sync with ZINGO backend if available
        try {
          zingoApi.addMemoryFile({
            title: resolvedTopic.title,
            content: resolvedTopic.content,
            category: resolvedTopic.category,
            is_sensitive: resolvedTopic.isSensitive,
          }).catch(() => {
            // Offline fallback handled gracefully
          })
        } catch {
          // ignore network error
        }

        return resolvedTopic
      },

      // ─── Update Topic ───────────────────────────────────────────────────────
      updateTopic: (id, updates) => {
        // Enforce hard security check on updates
        if (updates.title && containsHardBlockedContent(updates.title)) return
        if (updates.content && containsHardBlockedContent(updates.content)) return

        set((state) => ({
          topics: state.topics.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...updates,
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        }))
      },

      // ─── Delete Topic ───────────────────────────────────────────────────────
      deleteTopic: (id) => {
        set((state) => ({
          topics: state.topics.filter((t) => t.id !== id),
        }))
      },

      // ─── Clear All Topics (Scoped or Global) ────────────────────────────────
      clearAllTopics: (projectId) => {
        set((state) => {
          if (projectId !== undefined) {
            return {
              topics: state.topics.filter((t) => t.projectId !== projectId),
            }
          }
          return { topics: [] }
        })
      },

      // ─── Reset All Memory (Wipe completely) ──────────────────────────────────
      resetAllMemory: () => {
        set({ topics: [], lastSavedTopic: null })
        try {
          zingoApi.clearMemoryFiles().catch(() => {})
        } catch {
          // ignore
        }
      },

      // ─── Configuration ─────────────────────────────────────────────────────
      setIsPaused: (paused) => set({ isPaused: paused }),
      setIncludeSensitive: (include) => set({ includeSensitive: include }),
      setAutoExtract: (auto) => set({ autoExtract: auto }),

      // ─── Scoped Queries ────────────────────────────────────────────────────
      getTopicsForScope: (projectId) => {
        const { topics, isPaused } = get()
        if (isPaused) return []

        if (projectId) {
          // Project scope: return all topics for this project + general user preferences
          return topics.filter(
            (t) =>
              t.projectId === projectId ||
              (!t.projectId && t.category === 'preference')
          )
        }

        // Global chat scope: ONLY return topics with no projectId (never leak project memories!)
        return topics.filter((t) => !t.projectId)
      },

      formatMemoryContextForPrompt: (projectId) => {
        const scoped = get().getTopicsForScope(projectId)
        if (scoped.length === 0) return ''

        const lines = [
          '# Persistent Memory Topics (Continuously Maintained & Project-Isolated)',
          'You have access to durable user preferences and operational facts remembered from past interactions. Use these implicitly to inform your decisions, format, and tone without explicitly reciting the memory list unless asked.',
        ]

        if (projectId) {
          lines.push(`Scope: Project "${projectId}"`)
        } else {
          lines.push('Scope: Global User Preferences')
        }

        scoped.forEach((t, i) => {
          const catTag = t.category.toUpperCase()
          lines.push(`${i + 1}. [${catTag}] **${t.title}**: ${t.content}`)
        })

        return lines.join('\n')
      },

      // ─── Continuous Mid-Conversation Extraction Engine ──────────────────────
      extractFromTurn: (userText, assistantText = '', projectId = null, chatId) => {
        const { isPaused, autoExtract, addTopic } = get()
        if (isPaused) return []

        const activeProject = projectId ? useProjectStore.getState().getProject(projectId) : undefined
        const projectName = activeProject?.title
        const saved: MemoryTopic[] = []

        const cleanUser = userText.trim()
        if (!cleanUser) return []

        // 1. Explicit Memory Triggers (Always executed unless paused)
        const explicitTriggers = [
          /(?:please\s+)?remember\s+(?:that\s+|this\s+|to\s+)?[:,-]?\s*(.+)/i,
          /save\s+(?:this\s+)?to\s+memory\s*[:,-]?\s*(.+)/i,
          /note\s+that\s*[:,-]?\s*(.+)/i,
          /keep\s+in\s+mind\s+that\s*[:,-]?\s*(.+)/i,
          /don't\s+forget\s+(?:that\s+)?[:,-]?\s*(.+)/i,
          /always\s+(?:remember\s+to\s+|ensure\s+that\s+|format\s+as\s+)(.+)/i,
          /(?:my|our)\s+preference\s+is\s+(.+)/i,
        ]

        for (const trigger of explicitTriggers) {
          const match = cleanUser.match(trigger)
          if (match && match[1]?.trim()) {
            const rawFact = match[1].trim().replace(/[.!?]+$/, '')
            if (rawFact.length > 8 && rawFact.length < 350) {
              // Derive title
              const words = rawFact.split(/\s+/).slice(0, 6).join(' ')
              const title = words.charAt(0).toUpperCase() + words.slice(1)
              const category: MemoryCategory = projectId ? 'project' : 'preference'

              const res = addTopic({
                title,
                content: rawFact,
                category,
                projectId,
                projectName,
                sourceChatId: chatId,
              })
              if (res) saved.push(res)
              return saved // Explicit command fulfilled
            }
          }
        }

        // If automatic extraction is disabled, stop here
        if (!autoExtract) return saved

        // 2. Implicit Heuristic Extraction (Durable facts & constraints)
        // Detect operational constraints (e.g. pressure limits, temperature, equipment tags)
        const limitPattern = /\b(?:limit|ceiling|maximum|minimum|threshold|operating\s+pressure|cot|temperature)\s*(?:is|should be|must be|<=|>=|<|>|=|of)\s*([0-9.]+\s*(?:°?c|bar|kpa|barg|psi|kg\/kg|rpm|m3\/hr|mm|%))/i
        const limitMatch = cleanUser.match(limitPattern)
        if (limitMatch && limitMatch[0]) {
          const words = cleanUser.split(/\s+/).slice(0, 7).join(' ')
          const title = `Operating Limit: ${words.slice(0, 40)}`
          const res = addTopic({
            title,
            content: cleanUser.length > 200 ? cleanUser.slice(0, 200) + '...' : cleanUser,
            category: 'operational',
            projectId,
            projectName,
            sourceChatId: chatId,
          })
          if (res) saved.push(res)
        }

        // Detect deadline or schedule adjustments
        const schedulePattern = /\b(?:deadline|turnaround|schedule|milestone|delivery date)\s*(?:moved to|postponed to|set for|scheduled for|is now|rescheduled to)\s*([a-zA-Z0-9,\s]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}))/i
        const schedMatch = cleanUser.match(schedulePattern)
        if (schedMatch && schedMatch[0]) {
          const res = addTopic({
            title: `Schedule: ${schedMatch[1].trim().slice(0, 30)}`,
            content: schedMatch[0].trim(),
            category: projectId ? 'project' : 'technical',
            projectId,
            projectName,
            sourceChatId: chatId,
          })
          if (res) saved.push(res)
        }

        // Detect user role / domain identity statements
        const identityPattern = /\b(?:i am|i'm|we are|we work as)\s+(?:the\s+)?([a-zA-Z\s]+(?:engineer|operator|manager|consultant|technician|specialist|developer))/i
        const idMatch = cleanUser.match(identityPattern)
        if (idMatch && idMatch[1]) {
          const roleTitle = idMatch[1].trim()
          const res = addTopic({
            title: `User Role: ${roleTitle}`,
            content: `User acts as ${roleTitle}. Adapt technical depth and operational rigor accordingly.`,
            category: 'preference',
            projectId,
            projectName,
            sourceChatId: chatId,
          })
          if (res) saved.push(res)
        }

        // Assistant confirmed decisions & setpoints
        if (assistantText) {
          const decisionPattern = /(?:agreed|confirmed|decided|finalized)\s+(?:that|to\s+set)?\s*([a-zA-Z0-9\s-]{5,60}\s+(?:limit|setting|value|ratio|setpoint)\s*(?:is|at|to)\s*[0-9.]+\s*(?:°?c|bar|kpa|barg|psi|kg\/kg|rpm|m3\/hr|mm|%))/i
          const decisionMatch = assistantText.match(decisionPattern)
          if (decisionMatch && decisionMatch[1]) {
            const decTitle = `Agreed: ${decisionMatch[1].trim().slice(0, 35)}`
            const res = addTopic({
              title: decTitle,
              content: decisionMatch[0].trim(),
              category: 'operational',
              projectId,
              projectName,
              sourceChatId: chatId,
            })
            if (res) saved.push(res)
          }
        }

        return saved
      },
    }),
    {
      name: 'aira-memory-store',
      partialize: (state) => ({
        topics: state.topics,
        isPaused: state.isPaused,
        includeSensitive: state.includeSensitive,
        autoExtract: state.autoExtract,
      }),
    }
  )
)
