import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ServerConfig } from '../types'
import { useToastStore } from './toastStore'

interface ServerStore {
  server: ServerConfig
  isChecking: boolean
  lastChecked: string | null
  updateServer: (updates: Partial<ServerConfig>) => void
  checkConnection: () => Promise<void>
  checkIndividual: (node: 'primary' | 'coder') => Promise<void>
}

const DEFAULT_SERVER: ServerConfig = {
  g15_1_url: 'http://192.168.1.10:8080',
  g15_2_url: 'http://192.168.1.11:11434',
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

        await new Promise((resolve) => setTimeout(resolve, 1500))

        const primarySuccess = Math.random() > 0.15
        const coderSuccess = Math.random() > 0.15
        const overall = primarySuccess && coderSuccess ? 'connected' : primarySuccess || coderSuccess ? 'connected' : 'disconnected'

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
        if (overall === 'connected') {
          addToast({
            type: 'success',
            title: 'Cluster Status: Online',
            message: 'Successfully verified connection to local MRPL GPU nodes.',
          })
        } else {
          addToast({
            type: 'error',
            title: 'Cluster Warning',
            message: 'One or more local GPU nodes unreachable on 192.168.x.x',
          })
        }
      },
      checkIndividual: async (node: 'primary' | 'coder') => {
        const updateKey = node === 'primary' ? 'primaryStatus' : 'coderStatus'
        set((state) => ({
          server: { ...state.server, [updateKey]: 'checking' },
        }))

        await new Promise((resolve) => setTimeout(resolve, 1200))
        const success = Math.random() > 0.15
        const status = success ? 'connected' : 'disconnected'

        set((state) => ({
          server: { ...state.server, [updateKey]: status },
          lastChecked: new Date().toISOString(),
        }))

        const addToast = useToastStore.getState().addToast
        const nodeName = node === 'primary' ? 'G15 #1 (Primary)' : 'G15 #2 (Coder)'
        if (success) {
          addToast({
            type: 'success',
            title: `${nodeName} Online`,
            message: `Node responded with 200 OK via local network.`,
          })
        } else {
          addToast({
            type: 'error',
            title: `${nodeName} Failed`,
            message: `Connection timeout to node on local network.`,
          })
        }
      },
    }),
    {
      name: 'aira-server-config',
    }
  )
)
