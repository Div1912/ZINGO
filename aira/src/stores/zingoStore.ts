/**
 * Global ZINGO state: active alerts, plant health, document count, last scan time.
 * Polls the backend overview so the sidebar badge stays live across every module.
 */
import { create } from 'zustand'
import { zingoApi, type Alert, type EquipmentHealth, type Overview } from '../services/zingoApi'

interface ZingoStore {
  activeAlerts: Alert[]
  plantHealth: EquipmentHealth[]
  healthScores: Record<string, number>
  averageHealth: number
  documentCount: number
  lastScanTime: string | null
  overview: Overview | null
  externalCallsDetected: number
  isLoading: boolean
  isScanning: boolean
  error: string | null
  lastRefreshed: string | null

  refresh: () => Promise<void>
  refreshAlerts: () => Promise<void>
  runFullScan: () => Promise<Record<string, unknown> | null>
  acknowledgeAlert: (id: number, notes?: string, by?: string) => Promise<void>
  criticalCount: () => number
  startPolling: (intervalMs?: number) => void
  stopPolling: () => void
}

let pollTimer: ReturnType<typeof setInterval> | null = null

export const useZingoStore = create<ZingoStore>((set, get) => ({
  activeAlerts: [],
  plantHealth: [],
  healthScores: {},
  averageHealth: 0,
  documentCount: 0,
  lastScanTime: null,
  overview: null,
  externalCallsDetected: 0,
  isLoading: false,
  isScanning: false,
  error: null,
  lastRefreshed: null,

  refresh: async () => {
    set({ isLoading: true, error: null })
    try {
      const [overview, alerts, health] = await Promise.all([
        zingoApi.overview(),
        zingoApi.alerts({ status: 'active', limit: 200 }),
        zingoApi.healthMap(),
      ])
      set({
        overview,
        documentCount: overview.documents,
        lastScanTime: overview.last_scan_time,
        externalCallsDetected: overview.external_calls_detected ?? 0,
        activeAlerts: alerts.alerts || [],
        plantHealth: health.equipment || health.worst_offenders || [],
        healthScores: health.health_scores || {},
        averageHealth: health.average_health ?? 0,
        isLoading: false,
        lastRefreshed: new Date().toISOString(),
      })
    } catch (err: any) {
      set({ isLoading: false, error: err?.message || 'Backend unreachable' })
    }
  },

  refreshAlerts: async () => {
    try {
      const alerts = await zingoApi.alerts({ status: 'active', limit: 200 })
      set({ activeAlerts: alerts.alerts || [] })
    } catch (err: any) {
      set({ error: err?.message || 'Could not load alerts' })
    }
  },

  runFullScan: async () => {
    set({ isScanning: true, error: null })
    try {
      const result = await zingoApi.runFullScan()
      await get().refresh()
      set({ isScanning: false })
      return result
    } catch (err: any) {
      set({ isScanning: false, error: err?.message || 'Scan failed' })
      return null
    }
  },

  acknowledgeAlert: async (id, notes, by = 'engineer') => {
    await zingoApi.acknowledgeAlert(id, { acknowledged_by: by, notes })
    await get().refresh()
  },

  criticalCount: () => get().activeAlerts.filter((a) => a.severity === 'CRITICAL').length,

  startPolling: (intervalMs = 60000) => {
    get().refresh()
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(() => get().refresh(), intervalMs)
  },

  stopPolling: () => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  },
}))
