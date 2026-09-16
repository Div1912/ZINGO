import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Chat, Message, Source, TaskType } from '../types'

interface ChatStore {
  chats: Chat[]
  activeChatId: string | null
  isGenerating: boolean
  isComplexGenerating: boolean
  currentTaskType: TaskType | null
  generatingChatIds: string[]
  activeSources: Source[] | null
  isSourcePanelOpen: boolean
  abortController: AbortController | null
  abortControllers: Record<string, AbortController>

  // actions
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

// Initial realistic conversations for refinery engineers
const INITIAL_CHATS: Chat[] = [
  {
    id: 'chat-cdu-2',
    title: 'CDU-2 Pre-heat Train Exchanger Cleaning SOP',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    model: 'qwen2.5-7b',
    pinned: true,
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'What is the standard procedure for chemical backwashing and offline hydro-jetting of the CDU-2 pre-heat train heat exchangers (E-101A/B)?',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'msg-2',
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
        modelUsed: 'qwen2.5-7b',
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
  {
    id: 'chat-yield-calc',
    title: 'Python Distillation Yield & API Gravity Calculator',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    model: 'qwen2.5-coder-7b',
    messages: [
      {
        id: 'msg-3',
        role: 'user',
        content: 'Write a Python script to compute true boiling point (TBP) cut yields (LPG, Naphtha, Kero/ATF, HSD, and Residue) from crude API gravity and Watson K-factor.',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'msg-4',
        role: 'assistant',
        content: `Here is a production-grade Python script calibrated to typical Mangalore Refinery crude assays (e.g., Arab Light, Kuwait Export, and Mangala blends):

\`\`\`python
import numpy as np

def calculate_crude_cuts(api_gravity: float, watson_k: float = 11.9):
    """
    Computes volume % distillation cut yields for MRPL atmospheric crude distillation.
    
    Parameters:
        api_gravity (float): Crude oil API gravity (e.g. 33.4 for Arab Light)
        watson_k (float): Characterization factor (default 11.9 for paraffinic-naphthenic)
    
    Returns:
        dict: Yield breakdown in vol% and specific gravity
    """
    # Specific Gravity @ 60°F
    sg = 141.5 / (api_gravity + 131.5)
    
    # Calibrated empirical correlation for MRPL Crude Distillation Units
    lpg_yield = max(1.2, 0.08 * api_gravity)
    light_naphtha = 0.22 * api_gravity - 1.5
    heavy_naphtha = 0.28 * api_gravity + 0.4
    atf_kero = 0.35 * api_gravity + 3.2
    hsd_gasoil = 0.45 * api_gravity + 12.0
    
    total_distillates = lpg_yield + light_naphtha + heavy_naphtha + atf_kero + hsd_gasoil
    atmospheric_residue = max(0.0, 100.0 - total_distillates)
    
    return {
        "crude_api": api_gravity,
        "specific_gravity": round(sg, 4),
        "watson_k": watson_k,
        "yields_vol_pct": {
            "LPG (C3-C4)": round(lpg_yield, 2),
            "Light Naphtha (C5-85°C)": round(light_naphtha, 2),
            "Heavy Naphtha (85-140°C)": round(heavy_naphtha, 2),
            "Aviation Turbine Fuel (140-240°C)": round(atf_kero, 2),
            "High Speed Diesel (240-370°C)": round(hsd_gasoil, 2),
            "Atmospheric Residue (370°C+)": round(atmospheric_residue, 2)
        }
    }

# Example run for typical Arab Light crude
if __name__ == "__main__":
    result = calculate_crude_cuts(api_gravity=33.4, watson_k=11.9)
    print("=== MRPL CRUDE ASSAY CUT PREDICTOR ===")
    for product, val in result["yields_vol_pct"].items():
        print(f"  {product:35s}: {val:5.2f} %")
\`\`\`

You can click **Run ›** above to test this script directly within the local sandbox environment.`,
        timestamp: new Date(Date.now() - 86350000).toISOString(),
        modelUsed: 'qwen2.5-coder-7b',
        taskType: 'code',
        tokensUsed: 592,
        latencyMs: 1680,
      },
    ],
  },
]

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      chats: INITIAL_CHATS,
      activeChatId: 'chat-cdu-2',
      isGenerating: false,
      isComplexGenerating: false,
      currentTaskType: null,
      generatingChatIds: [],
      abortControllers: {},
      activeSources: INITIAL_CHATS[0].messages[1].sources || null,
      isSourcePanelOpen: false,
      abortController: null,

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
          model: 'qwen2.5-7b',
          messages: [],
        }

        set({
          chats: [newChat, ...chatsWithMessages],
          activeChatId: newId,
          activeSources: null,
          isSourcePanelOpen: false,
        })

        return newId
      },

      deleteChat: (id) => {
        set((state) => {
          const remaining = state.chats.filter((c) => c.id !== id)
          const nextActive = state.activeChatId === id ? (remaining[0]?.id ?? null) : state.activeChatId
          return {
            chats: remaining,
            activeChatId: nextActive,
            activeSources: null,
            isSourcePanelOpen: false,
          }
        })
      },

      renameChat: (id, title) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === id ? { ...c, title, updatedAt: new Date().toISOString() } : c
          ),
        }))
      },

      pinChat: (id) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === id ? { ...c, pinned: !c.pinned } : c
          ),
        }))
      },

      setActiveChat: (id) => {
        // Clean up empty drafts when switching to another chat
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
        set((state) => ({
          chats: state.chats.map((chat) => {
            if (chat.id !== chatId) return chat

            // Auto title if first user message
            let updatedTitle = chat.title
            if (chat.messages.length === 0 && message.role === 'user') {
              updatedTitle = message.content.slice(0, 42).trim() + (message.content.length > 42 ? '...' : '')
            }

            return {
              ...chat,
              title: updatedTitle,
              updatedAt: new Date().toISOString(),
              messages: [...chat.messages, message],
            }
          }),
        }))
      },

      updateMessage: (chatId, messageId, updates) => {
        set((state) => ({
          chats: state.chats.map((chat) => {
            if (chat.id !== chatId) return chat
            return {
              ...chat,
              updatedAt: new Date().toISOString(),
              messages: chat.messages.map((msg) =>
                msg.id === messageId ? { ...msg, ...updates } : msg
              ),
            }
          }),
        }))
      },

      clearChat: (chatId) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId ? { ...chat, messages: [], updatedAt: new Date().toISOString() } : chat
          ),
          activeSources: null,
          isSourcePanelOpen: false,
        }))
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
    }),
    {
      name: 'aira-chats-v2',
      partialize: (state) => ({
        chats: state.chats.filter((c) => c.messages.length > 0 || c.id === state.activeChatId),
        activeChatId: state.activeChatId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.chats = state.chats.filter(
            (c) => (c.messages && c.messages.length > 0) || c.id === state.activeChatId
          )
        }
      },
    }
  )
)
