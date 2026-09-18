import React, { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  MessageSquare,
  AlertTriangle,
  Factory,
  FileText,
  RefreshCcw,
  CheckCircle2,
  Network,
  ClipboardList,
  PenTool,
} from 'lucide-react'
import { useZingoStore } from '../../stores/zingoStore'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const ITEMS: NavItem[] = [
  { to: '/app', label: 'Chat', icon: <MessageSquare size={16} /> },
  { to: '/app/action-notes', label: 'Action Notes', icon: <PenTool size={16} /> },
  { to: '/app/alerts', label: 'Alerts', icon: <AlertTriangle size={16} /> },
  { to: '/app/health', label: 'Plant Health', icon: <Factory size={16} /> },
  { to: '/app/documents', label: 'Documents', icon: <FileText size={16} /> },
  { to: '/app/shift', label: 'Shift Handover', icon: <RefreshCcw size={16} /> },
  { to: '/app/compliance', label: 'Compliance', icon: <CheckCircle2 size={16} /> },
  { to: '/app/graph', label: 'Knowledge Graph', icon: <Network size={16} /> },
  { to: '/app/audit', label: 'Audit Trail', icon: <ClipboardList size={16} /> },
]

export const ZingoNav: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const criticalCount = useZingoStore((s) => s.activeAlerts.filter((a) => a.severity === 'CRITICAL').length)
  const documentCount = useZingoStore((s) => s.documentCount)
  const startPolling = useZingoStore((s) => s.startPolling)
  const stopPolling = useZingoStore((s) => s.stopPolling)

  useEffect(() => {
    startPolling(60000)
    return () => stopPolling()
  }, [startPolling, stopPolling])

  const isActive = (to: string) =>
    to === '/app'
      ? location.pathname === '/app' || location.pathname.startsWith('/app/chat')
      : location.pathname.startsWith(to)

  const badgeFor = (to: string): string | null => {
    if (to === '/app/alerts' && criticalCount > 0) return String(criticalCount)
    if (to === '/app/documents' && documentCount > 0) return String(documentCount)
    return null
  }

  return (
    <nav className="space-y-0.5 pt-1">
      <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
        Workbench
      </p>
      {ITEMS.map((item) => {
        const active = isActive(item.to)
        const badge = badgeFor(item.to)
        const isCritical = item.to === '/app/alerts' && criticalCount > 0
        return (
          <button
            key={item.to}
            type="button"
            onClick={() => {
              navigate(item.to)
              onNavigate?.()
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors border-none cursor-pointer font-normal ${
              active
                ? 'bg-elevated text-content-primary'
                : 'bg-transparent text-content-secondary hover:text-content-primary hover:bg-elevated/60'
            }`}
          >
            <span className={active ? 'text-accent shrink-0' : 'text-content-tertiary shrink-0'}>
              {item.icon}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {badge && (
              <span
                className={`shrink-0 rounded-pill px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  isCritical ? 'bg-danger text-white' : 'bg-elevated text-content-tertiary'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

export default ZingoNav
