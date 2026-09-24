import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings } from '../types'

interface SettingsStore {
  settings: AppSettings
  updateSettings: (updates: Partial<AppSettings>) => void
  resetSettings: () => void
}

export const DEFAULT_SETTINGS: AppSettings = {
  userName: 'User',
  preferredName: 'User',
  workDescription: 'Refinery Process Engineer (CDU/VDU)',
  customInstructions: 'Keep technical explanations rigorous and precise. Ground calculations in MRPL crude assays and reference relevant OISD safety standards.',
  reducedMotion: false,
  chatFont: 'inter',
  theme: 'dark',
  defaultModel: 'qwen3:8b',
  autoRouteModel: true,
  streamingEnabled: true,
  showSources: true,
  showModelBadge: true,
  showTokenCount: true,
  showLatency: true,
  systemPrompt: `You are AIRA, an intelligent AI research assistant grounded in technical operating manuals, P&IDs, and process engineering standards.`,
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.9,
  contextWindow: 10,
  fontSize: 'base',
  enterToSend: true,
  notificationsEnabled: true,
  autoRouteRules: [
    { id: '1', keywords: 'code, script, python, debug, function, bash, algorithm, calculate, yield', targetModel: 'qwen2.5-coder-7b' },
    { id: '2', keywords: 'document, SOP, report, search, find, permit, inspection, OISD, CDU, valve, audit', targetModel: 'qwen3:8b' },
    { id: '3', keywords: 'general, chat, hello, hi, quick, summary, explain, overview, brief, tell me', targetModel: 'qwen3:4b' },
    { id: '4', keywords: 'image, picture, photo, diagram, blueprint, visual, schematic, chart', targetModel: 'qwen2.5vl:3b' },
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
      name: 'aira-settings-v3',
      migrate: (persistedState: any) => {
        if (persistedState?.settings) {
          if (persistedState.settings.userName === 'Div') {
            persistedState.settings.userName = 'User'
          }
          if (persistedState.settings.preferredName === 'Div') {
            persistedState.settings.preferredName = 'User'
          }
        }
        return persistedState
      },
    }
  )
)
