import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ServerConfig } from '../types'
import { useToastStore } from './toastStore'
import { checkServerHealth } from '../services/qwenApi'

export type ClusterNodeKey = 'primary' | 'coder' | 'vision' | 'fast4b' | 'reasoning'

interface ServerStore {
  server: ServerConfig
  isChecking: boolean
  lastChecked: string | null
  updateServer: (updates: Partial<ServerConfig>) => void
  checkConnection: () => Promise<void>
  checkIndividual: (node: ClusterNodeKey) => Promise<void>
}

export const DEFAULT_TUNNEL_URL = 'https://splendid-sensibly-primate.ngrok-free.app'
export const DEFAULT_LAPTOP2_VISION_TUNNEL_URL = 'https://unfailing-idealism-caretaker.ngrok-free.dev'
export const DEFAULT_QWEN3_4B_TUNNEL_URL = 'https://yoyo-evolve-untimed.ngrok-free.dev'

const DEFAULT_SERVER: ServerConfig = {
  g15_1_url: DEFAULT_TUNNEL_URL,
  g15_2_url: DEFAULT_LAPTOP2_VISION_TUNNEL_URL, // Laptop 2: Multimodal & Vision Node (Permanent Ngrok Tunnel)
  vision_url: DEFAULT_LAPTOP2_VISION_TUNNEL_URL,
  fast_4b_url: DEFAULT_QWEN3_4B_TUNNEL_URL, // Fast Synthesis Node: Qwen3-4B (Permanent Ngrok Tunnel)
  reasoning_url: 'http://192.168.1.17:11434',
  connectionStatus: 'connected',
  primaryStatus: 'connected',
  coderStatus: 'connected',
  visionStatus: 'connected',
  fast4bStatus: 'connected',
  reasoningStatus: 'disconnected',
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
            visionStatus: 'checking',
            fast4bStatus: 'checking',
            reasoningStatus: 'checking',
          },
        }))

        const cur = get().server
        const proxyHost = cur.g15_1_url

        const [primaryRes, coderRes, visionRes, fast4bRes, reasoningRes] = await Promise.all([
          checkServerHealth(cur.g15_1_url, proxyHost),
          checkServerHealth(cur.g15_2_url, proxyHost),
          cur.vision_url ? checkServerHealth(cur.vision_url, proxyHost) : Promise.resolve({ connected: false }),
          cur.fast_4b_url ? checkServerHealth(cur.fast_4b_url, proxyHost) : Promise.resolve({ connected: false }),
          cur.reasoning_url ? checkServerHealth(cur.reasoning_url, proxyHost) : Promise.resolve({ connected: false }),
        ])

        const primarySuccess = primaryRes.connected
        const coderSuccess = coderRes.connected
        const visionSuccess = visionRes.connected
        const fast4bSuccess = fast4bRes.connected
        const reasoningSuccess = reasoningRes.connected
        const overall = primarySuccess || coderSuccess || visionSuccess || fast4bSuccess ? 'connected' : 'disconnected'

        set({
          isChecking: false,
          lastChecked: new Date().toISOString(),
          server: {
            ...get().server,
            connectionStatus: overall,
            primaryStatus: primarySuccess ? 'connected' : 'disconnected',
            coderStatus: coderSuccess ? 'connected' : 'disconnected',
            visionStatus: visionSuccess ? 'connected' : 'disconnected',
            fast4bStatus: fast4bSuccess ? 'connected' : 'disconnected',
            reasoningStatus: reasoningSuccess ? 'connected' : 'disconnected',
          },
        })

        const addToast = useToastStore.getState().addToast
        const activeCount = [primarySuccess, coderSuccess, visionSuccess, fast4bSuccess, reasoningSuccess].filter(Boolean).length
        addToast({
          type: activeCount > 0 ? 'success' : 'warning',
          title: `Cluster Check Complete (${activeCount}/5 Online)`,
          message: `Primary: ${primarySuccess ? 'OK' : 'Offline'} | Vision: ${visionSuccess ? 'OK' : 'Offline'} | Fast 4B: ${fast4bSuccess ? 'OK' : 'Offline'} | Coder: ${coderSuccess ? 'OK' : 'Offline'}`,
        })
      },
      checkIndividual: async (node: ClusterNodeKey) => {
        const statusMap: Record<ClusterNodeKey, keyof ServerConfig> = {
          primary: 'primaryStatus',
          coder: 'coderStatus',
          vision: 'visionStatus',
          fast4b: 'fast4bStatus',
          reasoning: 'reasoningStatus',
        }
        const labelMap: Record<ClusterNodeKey, string> = {
          primary: 'Laptop 1 (Master Node - Qwen3-8B)',
          vision: 'Laptop 2 (Multimodal / Vision Node - Qwen2.5-VL)',
          fast4b: 'Laptop 3 (Fast Synthesis Node - Qwen3-4B)',
          coder: 'Coder Node (Optional)',
          reasoning: 'Reasoning Node (Optional)',
        }

        const updateKey = statusMap[node]
        set((state) => ({
          server: { ...state.server, [updateKey]: 'checking' },
        }))

        const cur = get().server
        let url = cur.g15_1_url
        if (node === 'vision') url = cur.vision_url || cur.g15_2_url || 'http://127.0.0.1:11434'
        else if (node === 'fast4b') url = cur.fast_4b_url || 'http://127.0.0.1:11434'
        else if (node === 'coder') url = cur.g15_2_url
        else if (node === 'reasoning') url = cur.reasoning_url || ''

        const res = await checkServerHealth(url, cur.g15_1_url)
        const status = res.connected ? 'connected' : 'disconnected'

        set((state) => ({
          server: { ...state.server, [updateKey]: status },
          lastChecked: new Date().toISOString(),
        }))

        const addToast = useToastStore.getState().addToast
        const nodeName = labelMap[node]
        if (res.connected) {
          addToast({
            type: 'success',
            title: `${nodeName} Online`,
            message: `Responded with 200 OK (${res.model || 'ready'}).`,
          })
        } else {
          addToast({
            type: 'error',
            title: `${nodeName} Unreachable`,
            message: res.error || `Could not connect to ${url || 'unspecified endpoint'}.`,
          })
        }
      },
    }),
    {
      name: 'aira-server-config-v6',
      onRehydrateStorage: () => (state) => {
        if (state && state.server) {
          if (!state.server.g15_1_url || state.server.g15_1_url.includes('trycloudflare.com')) {
            state.server.g15_1_url = DEFAULT_TUNNEL_URL
          }
          if (
            !state.server.vision_url ||
            state.server.vision_url.includes('192.168.1.16') ||
            state.server.vision_url === 'http://127.0.0.1:11434'
          ) {
            state.server.vision_url = DEFAULT_LAPTOP2_VISION_TUNNEL_URL
            state.server.g15_2_url = DEFAULT_LAPTOP2_VISION_TUNNEL_URL
          }
          if (!state.server.fast_4b_url) {
            state.server.fast_4b_url = DEFAULT_QWEN3_4B_TUNNEL_URL
          }
          if (!state.server.reasoning_url) {
            state.server.reasoning_url = 'http://192.168.1.17:11434'
          }
        }
      },
    }
  )
)
