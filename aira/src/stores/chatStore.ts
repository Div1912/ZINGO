import { create } from 'zustand'
import type { Chat, Message, Source, TaskType } from '../types'
import {
  fetchUserChats,
  saveChatToDb,
  saveMessageToDb,
  deleteChatFromDb,
} from '../services/chatDb'

interface ChatStore {
  chats: Chat[]
  activeChatId: string | null
  currentUserId: string | null
  isLoadingChats: boolean
  isGenerating: boolean
  isComplexGenerating: boolean
  currentTaskType: TaskType | null
  generatingChatIds: string[]
  activeSources: Source[] | null
  isSourcePanelOpen: boolean
  abortController: AbortController | null
  abortControllers: Record<string, AbortController>

  // actions
  loadUserChats: (userId: string) => Promise<void>
  clearUserChats: () => void
  seedSampleChats: () => Promise<void>
  createChat: () => string
  deleteChat: (id: string) => void
  renameChat: (id: string, title: string) => void
  pinChat: (id: string) => void
  setActiveChat: (id: string) => void
  addMessage: (chatId: string, message: Message) => void
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void
  clearChat: (chatId: string) => void
  searchChats: (query: string) => Chat[]
  stopGeneration: (chatId?: string) => void
  setIsGenerating: (isGenerating: boolean) => void
  setIsComplexGenerating: (isComplex: boolean, taskType?: TaskType | null) => void
  startGenerating: (chatId: string, controller?: AbortController) => void
  stopGenerating: (chatId: string) => void
  isChatGenerating: (chatId: string | null) => boolean
  setActiveSources: (sources: Source[] | null) => void
  toggleSourcePanel: (open?: boolean) => void
  setAbortController: (controller: AbortController | null) => void
}

// Sample engineering conversations that users can optionally load
export const SAMPLE_SOP_CHATS: Chat[] = [
  {
    id: 'sample-chat-cdu-2',
    title: 'CDU-2 Pre-heat Train Exchanger Cleaning SOP',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    model: 'qwen3:8b',
    pinned: true,
    messages: [
      {
        id: 'sample-msg-1',
        role: 'user',
        content: 'What is the standard procedure for chemical backwashing and offline hydro-jetting of the CDU-2 pre-heat train heat exchangers (E-101A/B)?',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'sample-msg-2',
        role: 'assistant',
        content: `Based on **MRPL CDU-2 Standard Operating Procedures (Rev 4)** and equipment registry guidelines, here is the approved protocol for offline servicing of shell-and-tube heat exchangers E-101A/B:

### 1. Isolation & De-inventorying
* Obtain a valid **Class-A Cold Work Permit** and **Confined Space Entry Permit** per *MRPL OISD-105 PTW manual*.
* Close and lock out the crude feed inlet manual valve \`V-CDU2-041\` and desalted crude outlet \`V-CDU2-044\`.
* Positively isolate both tubeside (raw crude) and shellside (reduced crude bottoms) with slip blinds (spectacle blinds rotated to blind position).
* Vent residual hydrocarbons to the **Closed Blowdown Header (CBD-2)** until hydrocarbon vapors read < 1% LEL and zero toxic H₂S.

### 2. Chemical Circulation Flushing
* Circulate inhibited 5% sulfamic acid with surfactant through tubeside at 45°C - 55°C for 6 hours to dissolve carbonate and iron sulfide scaling.
* Monitor pH and iron concentration at 45-minute intervals. Cease circulation when iron levels stabilize.
* Flush with demineralized (DM) water and neutralize with a 1% soda ash solution until wash effluent reaches pH 7.0–7.5.

### 3. High-Pressure Hydro-Jetting
| Parameter | Specified Value |
| :--- | :--- |
| **Water Pressure** | 700 bar (10,000 psi) rotating lance |
| **Lance Travel Rate** | 20–30 cm/sec continuous |
| **Inspection Target** | ≥ 95% metal surface exposure on carbon steel tubes |

Ensure all wash effluent is routed to the **Effluent Treatment Plant (ETP-2)** oily water sewer via designated drain sumps.`,
        timestamp: new Date(Date.now() - 3500000).toISOString(),
        modelUsed: 'qwen3:8b',
        taskType: 'document',
        tokensUsed: 468,
        latencyMs: 1420,
        sources: [
          {
            id: 's-1',
            title: 'MRPL CDU-2 Operating Manual',
            document: 'MRPL_CDU2_SOP_Rev4.pdf',
            page: 42,
            excerpt: 'Section 4.3.2: Exchanger train E-101A/B chemical wash sequence must adhere to chemical concentration limits to prevent tube wall erosion.',
            relevanceScore: 0.94,
          },
          {
            id: 's-2',
            title: 'OISD Guidelines for Permit-to-Work',
            document: 'MRPL_OISD_PermitToWork_2023.pdf',
            page: 18,
            excerpt: 'Isolation standards require physical slip blinds on all process nozzles exceeding 2-inch nominal bore before hydro-cleaning.',
            relevanceScore: 0.89,
          },
          {
            id: 's-3',
            title: 'Equipment Maintenance Registry',
            document: 'MRPL_Equipment_Registry.xlsx',
            page: 7,
            excerpt: 'E-101A/B bundle specification: 19.05mm OD x 2.11mm BWG Carbon Steel SA-179 seamless tubes, 6096mm length.',
            relevanceScore: 0.82,
          },
        ],
      },
    ],
  },
]

const getLocalUserCacheKey = (userId: string) => `aira-chats-user-${userId}`

const persistUserLocalCache = (userId: string, chats: Chat[]) => {
  try {
    const valid = chats.filter((c) => c.messages.length > 0)
    localStorage.setItem(getLocalUserCacheKey(userId), JSON.stringify(valid))
  } catch (e) {
    console.warn('Could not cache chats locally:', e)
  }
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  activeChatId: null,
  currentUserId: null,
  isLoadingChats: false,
  isGenerating: false,
  isComplexGenerating: false,
  currentTaskType: null,
  generatingChatIds: [],
  abortControllers: {},
  activeSources: null,
  isSourcePanelOpen: false,
  abortController: null,

  loadUserChats: async (userId: string) => {
    set({ currentUserId: userId, isLoadingChats: true })

    // 1. Immediately hydrate from local per-user cache for instant UI
    try {
      const cached = localStorage.getItem(getLocalUserCacheKey(userId))
      if (cached) {
        const parsed = JSON.parse(cached) as Chat[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          set({
            chats: parsed,
            activeChatId: parsed[0]?.id || null,
          })
        }
      }
    } catch {
      // Ignore cache parse errors
    }

    // 2. Fetch ground-truth user chats from Supabase
    try {
      const dbChats = await fetchUserChats(userId)

      if (dbChats.length > 0) {
        const currentActive = get().activeChatId
        const activeExists = dbChats.some((c) => c.id === currentActive)
        const nextActive = activeExists ? currentActive : dbChats[0].id

        set({
          chats: dbChats,
          activeChatId: nextActive,
        })
        persistUserLocalCache(userId, dbChats)
      } else if (get().chats.length === 0) {
        // Brand new user with zero chats: create initial clean workspace
        const initialChat: Chat = {
          id: 'chat-' + Date.now(),
          title: 'New conversation',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          model: 'qwen3:8b',
          messages: [],
        }
        set({
          chats: [initialChat],
          activeChatId: initialChat.id,
        })
        // Save initial empty conversation to DB
        saveChatToDb(initialChat, userId)
      }
    } catch (err) {
      console.error('Failed to load user chats from Supabase:', err)
    } finally {
      set({ isLoadingChats: false })
    }
  },

  clearUserChats: () => {
    set({
      chats: [],
      activeChatId: null,
      currentUserId: null,
      isLoadingChats: false,
      activeSources: null,
      isSourcePanelOpen: false,
      generatingChatIds: [],
      abortControllers: {},
      isGenerating: false,
      isComplexGenerating: false,
      currentTaskType: null,
    })
  },

  seedSampleChats: async () => {
    const userId = get().currentUserId
    if (!userId) return

    const now = Date.now()
    const seeded = SAMPLE_SOP_CHATS.map((c, idx) => ({
      ...c,
      id: `chat-sample-${now}-${idx}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: c.messages.map((m, mIdx) => ({
        ...m,
        id: `msg-sample-${now}-${idx}-${mIdx}`,
        timestamp: new Date().toISOString(),
      })),
    }))

    const combined = [...seeded, ...get().chats]
    set({
      chats: combined,
      activeChatId: seeded[0].id,
    })
    persistUserLocalCache(userId, combined)

    // Sync to Supabase
    for (const chat of seeded) {
      await saveChatToDb(chat, userId)
      for (const msg of chat.messages) {
        await saveMessageToDb(chat.id, msg, userId)
      }
    }
  },

  createChat: () => {
    // If an empty chat already exists, reuse it! Never duplicate empty chats!
    const existingEmpty = get().chats.find((c) => c.messages.length === 0)
    if (existingEmpty) {
      set({
        activeChatId: existingEmpty.id,
        activeSources: null,
        isSourcePanelOpen: false,
      })
      return existingEmpty.id
    }

    // Filter out any other empty chats before creating a new one
    const chatsWithMessages = get().chats.filter((c) => c.messages.length > 0)
    const newId = 'chat-' + Date.now()
    const newChat: Chat = {
      id: newId,
      title: 'New conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: 'qwen3:8b',
      messages: [],
    }

    const updatedChats = [newChat, ...chatsWithMessages]
    set({
      chats: updatedChats,
      activeChatId: newId,
      activeSources: null,
      isSourcePanelOpen: false,
    })

    const userId = get().currentUserId
    if (userId) {
      saveChatToDb(newChat, userId)
      persistUserLocalCache(userId, updatedChats)
    }

    return newId
  },

  deleteChat: (id) => {
    const state = get()
    const remaining = state.chats.filter((c) => c.id !== id)
    const nextActive = state.activeChatId === id ? (remaining[0]?.id ?? null) : state.activeChatId

    set({
      chats: remaining,
      activeChatId: nextActive,
      activeSources: null,
      isSourcePanelOpen: false,
    })

    const userId = state.currentUserId
    if (userId) {
      deleteChatFromDb(id, userId)
      persistUserLocalCache(userId, remaining)
    }
  },

  renameChat: (id, title) => {
    const updatedChats = get().chats.map((c) =>
      c.id === id ? { ...c, title, updatedAt: new Date().toISOString() } : c
    )
    set({ chats: updatedChats })

    const userId = get().currentUserId
    if (userId) {
      const chat = updatedChats.find((c) => c.id === id)
      if (chat) saveChatToDb(chat, userId)
      persistUserLocalCache(userId, updatedChats)
    }
  },

  pinChat: (id) => {
    const updatedChats = get().chats.map((c) =>
      c.id === id ? { ...c, pinned: !c.pinned } : c
    )
    set({ chats: updatedChats })

    const userId = get().currentUserId
    if (userId) {
      const chat = updatedChats.find((c) => c.id === id)
      if (chat) saveChatToDb(chat, userId)
      persistUserLocalCache(userId, updatedChats)
    }
  },

  setActiveChat: (id) => {
    set((state) => {
      const cleaned = state.chats.filter((c) => c.id === id || c.messages.length > 0)
      const chat = cleaned.find((c) => c.id === id)
      const lastAssistantMsg = chat?.messages
        .slice()
        .reverse()
        .find((m) => m.role === 'assistant' && m.sources && m.sources.length > 0)

      return {
        chats: cleaned,
        activeChatId: id,
        activeSources: lastAssistantMsg?.sources ?? null,
      }
    })
  },

  addMessage: (chatId, message) => {
    let targetChat: Chat | undefined

    const updatedChats = get().chats.map((chat) => {
      if (chat.id !== chatId) return chat

      let updatedTitle = chat.title
      if (chat.messages.length === 0 && message.role === 'user') {
        updatedTitle = message.content.slice(0, 42).trim() + (message.content.length > 42 ? '...' : '')
      }

      const updated = {
        ...chat,
        title: updatedTitle,
        updatedAt: new Date().toISOString(),
        messages: [...chat.messages, message],
      }
      targetChat = updated
      return updated
    })

    set({ chats: updatedChats })

    const userId = get().currentUserId
    if (userId && targetChat) {
      saveMessageToDb(chatId, message, userId)
      saveChatToDb(targetChat, userId)
      persistUserLocalCache(userId, updatedChats)
    }
  },

  updateMessage: (chatId, messageId, updates) => {
    let updatedMsgObj: Message | undefined

    const updatedChats = get().chats.map((chat) => {
      if (chat.id !== chatId) return chat
      return {
        ...chat,
        updatedAt: new Date().toISOString(),
        messages: chat.messages.map((msg) => {
          if (msg.id === messageId) {
            const merged = { ...msg, ...updates }
            updatedMsgObj = merged
            return merged
          }
          return msg
        }),
      }
    })

    set({ chats: updatedChats })

    const userId = get().currentUserId
    if (userId && updatedMsgObj) {
      saveMessageToDb(chatId, updatedMsgObj, userId)
      persistUserLocalCache(userId, updatedChats)
    }
  },

  clearChat: (chatId) => {
    const updatedChats = get().chats.map((chat) =>
      chat.id === chatId ? { ...chat, messages: [], updatedAt: new Date().toISOString() } : chat
    )
    set({
      chats: updatedChats,
      activeSources: null,
      isSourcePanelOpen: false,
    })

    const userId = get().currentUserId
    if (userId) {
      const chat = updatedChats.find((c) => c.id === chatId)
      if (chat) saveChatToDb(chat, userId)
      persistUserLocalCache(userId, updatedChats)
    }
  },

  searchChats: (query) => {
    const q = query.toLowerCase().trim()
    if (!q) return get().chats

    return get().chats.filter((chat) => {
      if (chat.title.toLowerCase().includes(q)) return true
      return chat.messages.some((msg) => msg.content.toLowerCase().includes(q))
    })
  },

  isChatGenerating: (chatId: string | null) => {
    if (!chatId) return false
    return get().generatingChatIds.includes(chatId)
  },

  startGenerating: (chatId: string, controller?: AbortController) => {
    set((state) => {
      const updatedIds = Array.from(new Set([...state.generatingChatIds, chatId]))
      const updatedControllers = { ...state.abortControllers }
      if (controller) {
        updatedControllers[chatId] = controller
      }
      return {
        generatingChatIds: updatedIds,
        abortControllers: updatedControllers,
        isGenerating: true,
        abortController: controller || state.abortController,
      }
    })
  },

  stopGenerating: (chatId: string) => {
    set((state) => {
      const updatedIds = state.generatingChatIds.filter((id) => id !== chatId)
      const updatedControllers = { ...state.abortControllers }
      delete updatedControllers[chatId]
      const isStillGenerating = updatedIds.length > 0
      return {
        generatingChatIds: updatedIds,
        abortControllers: updatedControllers,
        isGenerating: isStillGenerating,
        isComplexGenerating: isStillGenerating ? state.isComplexGenerating : false,
        currentTaskType: isStillGenerating ? state.currentTaskType : null,
        abortController: updatedIds.length === 0 ? null : state.abortController,
      }
    })
  },

  stopGeneration: (chatId?: string) => {
    const state = get()
    const targetId = chatId || state.activeChatId
    if (targetId && state.abortControllers[targetId]) {
      try {
        state.abortControllers[targetId].abort()
      } catch {
        // ignore
      }
      state.stopGenerating(targetId)
    } else if (state.abortController) {
      try {
        state.abortController.abort()
      } catch {
        // ignore
      }
      set({
        isGenerating: false,
        isComplexGenerating: false,
        currentTaskType: null,
        abortController: null,
        generatingChatIds: [],
        abortControllers: {},
      })
    } else if (targetId) {
      state.stopGenerating(targetId)
    }
  },

  setIsGenerating: (isGenerating) =>
    set((state) => ({
      isGenerating,
      isComplexGenerating: isGenerating ? state.isComplexGenerating : false,
      currentTaskType: isGenerating ? state.currentTaskType : null,
    })),

  setIsComplexGenerating: (isComplex, taskType = null) =>
    set({ isComplexGenerating: isComplex, currentTaskType: taskType }),

  setActiveSources: (sources) => set({ activeSources: sources }),

  toggleSourcePanel: (open) =>
    set((state) => ({
      isSourcePanelOpen: open !== undefined ? open : !state.isSourcePanelOpen,
    })),

  setAbortController: (controller) => set({ abortController: controller }),
}))
