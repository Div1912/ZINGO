import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ServerConfig } from '../types'
import { useToastStore } from './toastStore'
import { checkServerHealth } from '../services/qwenApi'

interface ServerStore {
  server: ServerConfig
  isChecking: boolean
  lastChecked: string | null
  updateServer: (updates: Partial<ServerConfig>) => void
  checkConnection: () => Promise<void>
  checkIndividual: (node: 'primary' | 'coder') => Promise<void>
}

export const DEFAULT_TUNNEL_URL = 'https://lbs-litigation-really-tap.trycloudflare.com'

const DEFAULT_SERVER: ServerConfig = {
  g15_1_url: DEFAULT_TUNNEL_URL,
  g15_2_url: 'http://127.0.0.1:11434',
  connectionStatus: 'connected',
  primaryStatus: 'connected',
  coderStatus: 'connected',
}

export const useServerStore = create<ServerStore>()(
  persist(
    (set, get) => ({
      server: DEFAULT_SERVER,
      isChecking: false,
      lastChecked: new Date().toISOString(),
      updateServer: (updates) =>
        set((state) => ({
          server: { ...state.server, ...updates },
        })),
      checkConnection: async () => {
        set({ isChecking: true })
        set((state) => ({
          server: {
            ...state.server,
            connectionStatus: 'checking',
            primaryStatus: 'checking',
            coderStatus: 'checking',
          },
        }))

        const currentServer = get().server
        const primaryRes = await checkServerHealth(currentServer.g15_1_url)
        const coderRes = await checkServerHealth(currentServer.g15_2_url)

        const primarySuccess = primaryRes.connected
        const coderSuccess = coderRes.connected
        const overall = primarySuccess || coderSuccess ? 'connected' : 'disconnected'

        set({
          isChecking: false,
          lastChecked: new Date().toISOString(),
          server: {
            ...get().server,
            connectionStatus: overall,
            primaryStatus: primarySuccess ? 'connected' : 'disconnected',
            coderStatus: coderSuccess ? 'connected' : 'disconnected',
          },
        })

        const addToast = useToastStore.getState().addToast
        if (primarySuccess) {
          addToast({
            type: 'success',
            title: 'Qwen Tunnel Online',
            message: `Connected to live ${primaryRes.model || 'Qwen 3 (8B)'} model node.`,
          })
        } else {
          addToast({
            type: 'error',
            title: 'Tunnel Connection Warning',
            message: `Could not reach model endpoint at ${currentServer.g15_1_url}`,
          })
        }
      },
      checkIndividual: async (node: 'primary' | 'coder') => {
        const updateKey = node === 'primary' ? 'primaryStatus' : 'coderStatus'
        set((state) => ({
          server: { ...state.server, [updateKey]: 'checking' },
        }))

        const currentServer = get().server
        const url = node === 'primary' ? currentServer.g15_1_url : currentServer.g15_2_url
        const res = await checkServerHealth(url)

        const status = res.connected ? 'connected' : 'disconnected'

        set((state) => ({
          server: { ...state.server, [updateKey]: status },
          lastChecked: new Date().toISOString(),
        }))

        const addToast = useToastStore.getState().addToast
        const nodeName = node === 'primary' ? 'Qwen Tunnel Node' : 'Local Ollama Node'
        if (res.connected) {
          addToast({
            type: 'success',
            title: `${nodeName} Online`,
            message: `Node responded with 200 OK (${res.model || 'ready'}).`,
          })
        } else {
          addToast({
            type: 'error',
            title: `${nodeName} Unreachable`,
            message: res.error || `Connection failed to ${url}`,
          })
        }
      },
    }),
    {
      name: 'aira-server-config-v2',
      onRehydrateStorage: () => (state) => {
        if (state && state.server) {
          if (!state.server.g15_1_url || state.server.g15_1_url.includes('oasis-modular-card-symbol')) {
            state.server.g15_1_url = DEFAULT_TUNNEL_URL
          }
        }
      },
    }
  )
)
