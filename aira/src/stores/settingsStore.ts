import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings } from '../types'

interface SettingsStore {
  settings: AppSettings
  updateSettings: (updates: Partial<AppSettings>) => void
  resetSettings: () => void
}

export const DEFAULT_SETTINGS: AppSettings = {
  userName: 'Div',
  preferredName: 'Div',
  workDescription: 'Refinery Process Engineer (CDU/VDU)',
  customInstructions: 'Keep technical explanations rigorous and precise. Ground calculations in MRPL crude assays and reference relevant OISD safety standards.',
  reducedMotion: false,
  chatFont: 'inter',
  theme: 'dark',
  defaultModel: 'qwen2.5-7b',
  autoRouteModel: true,
  streamingEnabled: true,
  showSources: true,
  showModelBadge: true,
  showTokenCount: true,
  showLatency: true,
  systemPrompt: `You are AIRA, an AI assistant for Mangalore Refinery and Petrochemicals Limited (MRPL).
You have access to MRPL's internal documents, SOPs, and historical data.
Always ground your answers in the available documentation.
You are running entirely on-premise — no data leaves MRPL's network.`,
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.9,
  contextWindow: 10,
  fontSize: 'base',
  enterToSend: true,
  notificationsEnabled: true,
  autoRouteRules: [
    { id: '1', keywords: 'code, script, python, debug, function, bash, algorithm, calculate, yield', targetModel: 'qwen2.5-coder-7b' },
    { id: '2', keywords: 'document, SOP, report, search, find, permit, inspection, OISD, CDU, valve', targetModel: 'qwen2.5-7b' },
  ],
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),
      resetSettings: () =>
        set(() => ({
          settings: DEFAULT_SETTINGS,
        })),
    }),
    {
      name: 'aira-settings-v2',
    }
  )
)
