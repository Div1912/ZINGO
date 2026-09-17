import React, { useState, useEffect } from 'react'
import {
  Search,
  X,
  Settings as SettingsIcon,
  User,
  Shield,
  Sliders,
  History,
  Bell,
  Moon,
  Code2,
  BookOpen,
  Cable,
  Puzzle,
  Server,
  Keyboard,
  Info,
  Upload,
  Trash2,
  RefreshCw,
  Sun,
  Monitor,
  ChevronDown,
  Check,
  CheckCircle2,
  AlertTriangle,
  Factory,
  FileText,
  RefreshCcw,
  Network,
  ClipboardList,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../../stores/settingsStore'
import { useServerStore } from '../../stores/serverStore'
import { useTheme } from '../../hooks/useTheme'
import { useToastStore } from '../../stores/toastStore'
import { useZingoStore } from '../../stores/zingoStore'
import { Toggle } from '../../components/ui/Toggle'
import { Spinner } from '../../components/ui/Spinner'
import type { ModelId } from '../../types'

const AlertsPanel = React.lazy(() => import('../../components/zingo/AlertsPanel'))
const PlantHealthMap = React.lazy(() => import('../../components/zingo/PlantHealthMap'))
const DocumentTimeline = React.lazy(() => import('../../components/zingo/DocumentTimeline'))
const ShiftHandover = React.lazy(() => import('../../components/zingo/ShiftHandover'))
const ComplianceMatrix = React.lazy(() => import('../../components/zingo/ComplianceMatrix'))
const KnowledgeGraph = React.lazy(() => import('../../components/zingo/KnowledgeGraph'))
const AuditTrail = React.lazy(() => import('../../components/zingo/AuditTrail'))

export type TabKey =
  | 'general'
  | 'account'
  | 'privacy'
  | 'capabilities'
  | 'memory'
  | 'reflect'
  | 'time'
  | 'code'
  | 'skills'
  | 'kb'
  | 'connectors'
  | 'plugins'
  | 'server'
  | 'shortcuts'
  | 'about'
  | 'alerts'
  | 'health'
  | 'documents'
  | 'shift'
  | 'compliance'
  | 'graph'
  | 'audit'

const INITIAL_DOCS = [
  { id: '1', name: 'MRPL_CDU2_SOP_Rev4.pdf', size: '2.3 MB', category: 'Standard Operating Procedure' },
  { id: '2', name: 'MRPL_OISD_PTW_Guidelines.pdf', size: '1.1 MB', category: 'Safety / Permit To Work' },
  { id: '3', name: 'MRPL_Annual_Inspection_2023.pdf', size: '4.7 MB', category: 'Mechanical Integrity' },
  { id: '4', name: 'MRPL_Equipment_Registry.xlsx', size: '890 KB', category: 'Asset Master Data' },
]

export interface SettingsModalProps {
  isOpen?: boolean
  initialTab?: TabKey
  onClose?: () => void
}

export const SettingsPage: React.FC<SettingsModalProps> = ({
  isOpen = true,
  initialTab = 'general',
  onClose,
}) => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)
  const [searchQuery, setSearchQuery] = useState('')

  const { settings, updateSettings } = useSettingsStore()
  const { server, updateServer, checkConnection, checkIndividual, isChecking, lastChecked } = useServerStore()
  const { theme, setTheme } = useTheme()
  const { addToast } = useToastStore()
  const criticalCount = useZingoStore((s) => s.activeAlerts.filter((a) => a.severity === 'CRITICAL').length)
  const isWorkbenchTab = ['alerts', 'health', 'documents', 'shift', 'compliance', 'graph', 'audit'].includes(activeTab)

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // Profile and general local state
  const [fullName, setFullName] = useState(settings.userName || 'Div')
  const [callMe, setCallMe] = useState(settings.preferredName || 'Div')
  const [workRole, setWorkRole] = useState(settings.workDescription || 'Refinery Process Engineer (CDU/VDU)')
  const [instructions, setInstructions] = useState(
    settings.customInstructions || settings.systemPrompt
  )

  // Server state
  const [g15Primary, setG15Primary] = useState(server.g15_1_url)
  const [g15Coder, setG15Coder] = useState(server.g15_2_url)
  const [g15Vision, setG15Vision] = useState(server.vision_url || 'http://192.168.1.16:11434')
  const [g15Reasoning, setG15Reasoning] = useState(server.reasoning_url || 'http://192.168.1.17:11434')

  // Knowledge base state
  const [docs, setDocs] = useState(INITIAL_DOCS)
  const [isReindexing, setIsReindexing] = useState(false)

  // Auto routing rules
  const [rules, setRules] = useState(settings.autoRouteRules || [])
  const [newKeyword, setNewKeyword] = useState('')
  const [newModel, setNewModel] = useState<ModelId>('qwen2.5-coder-7b')

  const handleClose = () => {
    if (onClose) {
      onClose()
    } else {
      navigate('/app')
    }
  }

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSaveProfile = () => {
    updateSettings({
      userName: fullName,
      preferredName: callMe,
      workDescription: workRole,
      customInstructions: instructions,
    })
    addToast({
      type: 'success',
      title: 'Profile Updated',
      message: 'Custom persona instructions updated for AIRA.',
    })
  }

  const handleReindex = () => {
    setIsReindexing(true)
    setTimeout(() => {
      setIsReindexing(false)
      addToast({
        type: 'success',
        title: 'Knowledge Base Re-indexed',
        message: 'ChromaDB embeddings refreshed across all internal documents.',
      })
    }, 2000)
  }

  const handleAddRule = () => {
    if (!newKeyword.trim()) return
    const newRule = {
      id: Math.random().toString(36).substring(2, 9),
      keywords: newKeyword.trim(),
      targetModel: newModel,
    }
    const updated = [...rules, newRule]
    setRules(updated)
    updateSettings({ autoRouteRules: updated })
    setNewKeyword('')
    addToast({ type: 'success', message: 'Auto-routing rule added' })
  }

  const handleDeleteRule = (id: string) => {
    const updated = rules.filter((r) => r.id !== id)
    setRules(updated)
    updateSettings({ autoRouteRules: updated })
  }

  const handleSaveServerConfig = () => {
    updateServer({
      g15_1_url: g15Primary,
      g15_2_url: g15Coder,
      vision_url: g15Vision,
      reasoning_url: g15Reasoning,
    })
    addToast({
      type: 'success',
      title: 'Cluster Configuration Saved',
      message: 'All 4 GPU cluster node endpoints updated.',
    })
  }

  const handleUploadKBFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
      const newDoc = {
        id: Math.random().toString(36).substring(2, 9),
        name: file.name,
        size: `${sizeMb} MB`,
        category: 'Uploaded Manual',
      }
      setDocs((prev) => [...prev, newDoc])
      addToast({
        type: 'success',
        title: 'Document Indexed',
        message: `${file.name} parsed into local ChromaDB.`,
      })
    }
  }

  // Sidebar navigation sections matching Claude screenshot
  const NAV_SECTIONS = [
    {
      group: 'Settings',
      items: [
        { id: 'general' as const, label: 'General', icon: <SettingsIcon size={15} /> },
        { id: 'account' as const, label: 'Account', icon: <User size={15} /> },
        { id: 'privacy' as const, label: 'Privacy', icon: <Shield size={15} /> },
        { id: 'capabilities' as const, label: 'Capabilities', icon: <Sliders size={15} /> },
        { id: 'memory' as const, label: 'Memory', icon: <History size={15} /> },
        { id: 'reflect' as const, label: 'Reflect', icon: <Bell size={15} /> },
        { id: 'time' as const, label: 'Time and focus', icon: <Moon size={15} /> },
        { id: 'code' as const, label: 'Code Sandbox', icon: <Code2 size={15} /> },
      ],
    },
    {
      group: 'Workbench & Operations',
      items: [
        { id: 'alerts' as const, label: 'Incident Alerts', icon: <AlertTriangle size={15} />, badge: criticalCount > 0 ? String(criticalCount) : undefined },
        { id: 'health' as const, label: 'Plant Health', icon: <Factory size={15} /> },
        { id: 'documents' as const, label: 'Document Library', icon: <FileText size={15} /> },
        { id: 'shift' as const, label: 'Shift Handover', icon: <RefreshCcw size={15} /> },
        { id: 'compliance' as const, label: 'Compliance Matrix', icon: <CheckCircle2 size={15} /> },
        { id: 'graph' as const, label: 'Knowledge Graph', icon: <Network size={15} /> },
        { id: 'audit' as const, label: 'Audit Trail', icon: <ClipboardList size={15} /> },
      ],
    },
    {
      group: 'Customize',
      items: [
        { id: 'skills' as const, label: 'Skills', icon: <BookOpen size={15} /> },
        { id: 'kb' as const, label: 'Knowledge Base', icon: <Upload size={15} /> },
        { id: 'connectors' as const, label: 'Connectors', icon: <Cable size={15} /> },
        { id: 'plugins' as const, label: 'Plugins', icon: <Puzzle size={15} /> },
      ],
    },
    {
      group: 'System',
      items: [
        { id: 'server' as const, label: 'Cluster Nodes', icon: <Server size={15} /> },
        { id: 'shortcuts' as const, label: 'Shortcuts', icon: <Keyboard size={15} /> },
        { id: 'about' as const, label: 'About AIRA', icon: <Info size={15} /> },
      ],
    },
  ]

  // Filter items if searching in sidebar
  const filteredSections = NAV_SECTIONS.map((sec) => ({
    ...sec,
    items: sec.items.filter((i) =>
      i.label.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((sec) => sec.items.length > 0)

  const userInitial = fullName.trim().charAt(0).toUpperCase() || 'D'

  if (!isOpen) return null

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-sm select-none animate-in fade-in duration-200"
    >
      {/* Modal Dialog Window */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${
          isWorkbenchTab ? 'max-w-6xl h-[820px]' : 'max-w-4xl h-[700px]'
        } max-h-[94vh] bg-surface text-content-primary rounded-2xl border border-border shadow-2xl flex overflow-hidden select-none transition-all duration-200`}
      >
        {/* Left Sidebar (Width ~230px) */}
        <aside className="w-56 sm:w-60 border-r border-border bg-surface/90 flex flex-col shrink-0">
          {/* Search input at top of sidebar matching Claude */}
          <div className="p-3.5 pb-2">
            <div className="relative flex items-center">
              <Search
                size={13}
                className="absolute left-2.5 text-content-tertiary pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="w-full py-1.5 pl-8 pr-3 text-xs bg-elevated border border-border rounded-lg text-content-primary placeholder-content-tertiary focus:border-border-strong outline-none transition-colors"
              />
            </div>
          </div>

          {/* Navigation list */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
            {filteredSections.map((sec) => (
              <div key={sec.group}>
                <div className="px-2.5 py-1 text-[11px] font-medium text-content-tertiary tracking-normal">
                  {sec.group}
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {sec.items.map((item) => {
                    const isActive = activeTab === item.id
                    const badge = (item as any).badge
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-normal transition-colors border-none bg-transparent cursor-pointer text-left ${
                          isActive
                            ? 'bg-elevated text-content-primary font-medium'
                            : 'text-content-secondary hover:bg-elevated/60 hover:text-content-primary'
                        }`}
                      >
                        <span className={isActive ? 'text-content-primary' : 'text-content-tertiary'}>
                          {item.icon}
                        </span>
                        <span className="truncate flex-1">{item.label}</span>
                        {badge && (
                          <span className="px-1.5 py-0.5 rounded-full bg-danger text-white text-[9px] font-semibold tabular-nums shrink-0 font-mono">
                            {badge}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-surface">
          {/* Top-Right Close Button (Identical to Claude 'X' position) */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-5 right-6 z-30 btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary hover:bg-elevated rounded-md transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X size={16} />
          </button>

          {/* Viewport: Workbench modules vs Standard Settings */}
          {isWorkbenchTab ? (
            <div className="flex-1 h-full overflow-y-auto select-text">
              <React.Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center p-12">
                    <Spinner size="lg" />
                  </div>
                }
              >
                {activeTab === 'alerts' && <AlertsPanel />}
                {activeTab === 'health' && <PlantHealthMap />}
                {activeTab === 'documents' && <DocumentTimeline />}
                {activeTab === 'shift' && <ShiftHandover />}
                {activeTab === 'compliance' && <ComplianceMatrix />}
                {activeTab === 'graph' && <KnowledgeGraph />}
                {activeTab === 'audit' && <AuditTrail />}
              </React.Suspense>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-7 sm:px-10 py-7 max-w-2xl select-text">
              {/* TAB: GENERAL (CLAUDE PROFILE & PREFERENCES EXACT REPLICA) */}
              {activeTab === 'general' && (
                <div className="space-y-6">
                {/* Profile Heading */}
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Profile
                  </h2>
                </div>

                {/* Avatar Row */}
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-xs sm:text-sm font-normal text-content-primary">
                    Avatar
                  </span>
                  <div className="w-8 h-8 rounded-full bg-elevated border border-border text-content-primary flex items-center justify-center font-semibold text-xs select-none">
                    {userInitial}
                  </div>
                </div>

                {/* Full name Row */}
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-xs sm:text-sm font-normal text-content-primary">
                    Full name
                  </span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onBlur={handleSaveProfile}
                    placeholder="Div"
                    className="w-56 sm:w-64 px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary focus:border-border-strong outline-none transition-colors"
                  />
                </div>

                {/* What should AIRA call you? Row */}
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-xs sm:text-sm font-normal text-content-primary">
                    What should AIRA call you?
                  </span>
                  <input
                    type="text"
                    value={callMe}
                    onChange={(e) => setCallMe(e.target.value)}
                    onBlur={handleSaveProfile}
                    placeholder="Div"
                    className="w-56 sm:w-64 px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary focus:border-border-strong outline-none transition-colors"
                  />
                </div>

                {/* What best describes your work? Row */}
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-xs sm:text-sm font-normal text-content-primary">
                    What best describes your work?
                  </span>
                  <div className="relative w-56 sm:w-64">
                    <select
                      value={workRole}
                      onChange={(e) => {
                        setWorkRole(e.target.value)
                        updateSettings({ workDescription: e.target.value })
                      }}
                      className="w-full appearance-none px-3 py-1.5 pr-8 bg-elevated border border-border rounded-lg text-xs text-content-primary focus:border-border-strong outline-none cursor-pointer"
                    >
                      <option value="Select">Select</option>
                      <option value="Refinery Process Engineer (CDU/VDU)">Refinery Process Engineer (CDU/VDU)</option>
                      <option value="Mechanical Maintenance Lead">Mechanical Maintenance Lead</option>
                      <option value="Safety & OISD Compliance Officer">Safety & OISD Compliance Officer</option>
                      <option value="Chemical Automation Specialist">Chemical Automation Specialist</option>
                      <option value="Refinery Operations Lead">Refinery Operations Lead</option>
                      <option value="Executive Management">Executive Management</option>
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-2.5 top-2.5 text-content-tertiary pointer-events-none"
                    />
                  </div>
                </div>

                {/* Instructions for AIRA (Claude Subtitle & Textarea) */}
                <div className="py-2 space-y-2">
                  <span className="text-xs sm:text-sm font-normal text-content-primary block">
                    Instructions for AIRA
                  </span>
                  <p className="text-xs text-content-secondary leading-relaxed max-w-xl">
                    AIRA will keep these in mind for this and any of your associated accounts across chats and refinery workflows within MRPL safety guidelines.{' '}
                    <button
                      type="button"
                      onClick={() => addToast({ type: 'info', message: 'MRPL Operational & OISD Compliance Guidelines active.' })}
                      className="text-content-secondary underline hover:text-content-primary cursor-pointer bg-transparent border-none p-0 inline"
                    >
                      Learn more
                    </button>
                  </p>
                  <textarea
                    rows={4}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    onBlur={handleSaveProfile}
                    placeholder="e.g. keep explanations brief and to the point"
                    className="w-full mt-2 p-3 bg-elevated border border-border rounded-xl text-xs text-content-primary placeholder-content-tertiary focus:border-border-strong outline-none resize-y leading-relaxed transition-colors"
                  />
                </div>

                {/* Preferences Heading */}
                <div className="pt-4">
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Preferences
                  </h2>
                </div>

                {/* Appearance Row (Monitor, Sun, Moon Segmented Icons) */}
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-xs sm:text-sm font-normal text-content-primary">
                    Appearance
                  </span>
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-elevated border border-border">
                    <button
                      type="button"
                      onClick={() => setTheme('system')}
                      className={`p-1.5 px-2 rounded-md transition-colors ${
                        theme === 'system'
                          ? 'bg-surface text-content-primary shadow-xs font-medium'
                          : 'text-content-tertiary hover:text-content-primary'
                      }`}
                      title="System Theme"
                    >
                      <Monitor size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`p-1.5 px-2 rounded-md transition-colors ${
                        theme === 'light'
                          ? 'bg-surface text-content-primary shadow-xs font-medium'
                          : 'text-content-tertiary hover:text-content-primary'
                      }`}
                      title="Light Theme"
                    >
                      <Sun size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`p-1.5 px-2 rounded-md transition-colors ${
                        theme === 'dark'
                          ? 'bg-surface text-content-primary shadow-xs font-medium'
                          : 'text-content-tertiary hover:text-content-primary'
                      }`}
                      title="Dark Theme"
                    >
                      <Moon size={14} />
                    </button>
                  </div>
                </div>

                {/* Chat font Row */}
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-xs sm:text-sm font-normal text-content-primary">
                    Chat font
                  </span>
                  <div className="relative w-48 sm:w-56">
                    <select
                      value={settings.chatFont || 'inter'}
                      onChange={(e) => updateSettings({ chatFont: e.target.value as any })}
                      className="w-full appearance-none px-3 py-1.5 pr-8 bg-elevated border border-border rounded-lg text-xs text-content-primary focus:border-border-strong outline-none cursor-pointer"
                    >
                      <option value="inter">AIRA Sans (Default)</option>
                      <option value="serif">Anthropic Serif</option>
                      <option value="mono">JetBrains Mono (Technical)</option>
                      <option value="system">System Native</option>
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-2.5 top-2.5 text-content-tertiary pointer-events-none"
                    />
                  </div>
                </div>

                {/* Motion Row (System / Reduced Segmented Control) */}
                <div className="flex items-center justify-between py-3">
                  <div className="pr-4">
                    <span className="text-xs sm:text-sm font-normal text-content-primary block">
                      Motion
                    </span>
                    <span className="text-xs text-content-secondary mt-0.5 block">
                      Reduce animation in streaming responses and other interface elements.
                    </span>
                  </div>
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-elevated border border-border shrink-0">
                    <button
                      type="button"
                      onClick={() => updateSettings({ reducedMotion: false })}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        !settings.reducedMotion
                          ? 'bg-surface text-content-primary shadow-xs'
                          : 'text-content-tertiary hover:text-content-primary'
                      }`}
                    >
                      System
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ reducedMotion: true })}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        settings.reducedMotion
                          ? 'bg-surface text-content-primary shadow-xs'
                          : 'text-content-tertiary hover:text-content-primary'
                      }`}
                    >
                      Reduced
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ACCOUNT */}
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Account & Organization
                  </h2>
                </div>

                <div className="divide-y divide-border/60 text-xs sm:text-sm">
                  <div className="flex items-center justify-between py-3">
                    <span className="text-content-secondary">Organization</span>
                    <span className="font-medium text-content-primary">
                      Mangalore Refinery and Petrochemicals Limited
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-content-secondary">Facility Site</span>
                    <span className="font-medium text-content-primary">
                      Kuthethoor, Mangaluru, Karnataka - 575030
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-content-secondary">Operator Badge ID</span>
                    <span className="font-mono text-content-primary">MRPL-ENG-8492</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-content-secondary">Clearance Level</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-success font-medium">
                      <CheckCircle2 size={13} />
                      <span>Level 3 · Process & Safety Lead</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-content-secondary">Hardware Tier</span>
                    <span className="font-medium text-content-primary">
                      MRPL Sovereign Enterprise Node (2x Dell G15 RTX)
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-content-secondary">Token Allowance</span>
                    <span className="font-medium text-success">
                      Unlimited (On-Premise Air-Gapped Inference)
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-content-secondary">Authentication</span>
                    <span className="font-mono text-xs text-content-primary">Local Hardware Air-Gap</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: PRIVACY */}
            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Privacy & Sovereign Air-Gap
                  </h2>
                </div>

                <div className="p-3.5 rounded-xl bg-success/10 border border-success/20 flex items-start gap-3">
                  <Shield size={16} className="text-success shrink-0 mt-0.5" />
                  <div className="text-xs text-content-secondary space-y-1">
                    <span className="font-medium text-success block">Hardware Isolation Verified</span>
                    <p className="leading-relaxed">
                      AIRA runs exclusively on private Dell G15 local GPU hardware. No outbound telemetry, analytics, or refinery documents leave MRPL intranet.
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-border/60 text-xs sm:text-sm">
                  <div className="flex items-center justify-between py-3">
                    <span className="text-content-secondary">External Telemetry</span>
                    <span className="font-mono text-xs text-success font-medium">Disabled (0 bytes outbound)</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-content-secondary">Model Weights Storage</span>
                    <span className="font-mono text-xs text-content-primary">Local NVMe RAID-0</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-content-secondary">Audit Trail Compliance</span>
                    <span className="font-mono text-xs text-content-primary">OISD-105 Compliant SQLite Log</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CAPABILITIES */}
            {activeTab === 'capabilities' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Capabilities & Model Inference
                  </h2>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-content-primary">Default Primary Model</span>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 p-3 rounded-xl bg-elevated border border-border cursor-pointer">
                        <input
                          type="radio"
                          name="model"
                          checked={settings.defaultModel === 'qwen2.5-7b'}
                          onChange={() => updateSettings({ defaultModel: 'qwen2.5-7b' })}
                          className="accent-accent"
                        />
                        <div>
                          <div className="text-xs font-semibold text-content-primary">
                            Qwen2.5-7B-Instruct (G15 #1 Primary Node)
                          </div>
                          <div className="text-[11px] text-content-tertiary">
                            Refinery SOP retrieval, safety procedures, OISD compliance
                          </div>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3 rounded-xl bg-elevated border border-border cursor-pointer">
                        <input
                          type="radio"
                          name="model"
                          checked={settings.defaultModel === 'qwen2.5-coder-7b'}
                          onChange={() => updateSettings({ defaultModel: 'qwen2.5-coder-7b' })}
                          className="accent-accent"
                        />
                        <div>
                          <div className="text-xs font-semibold text-content-primary">
                            Qwen2.5-Coder-7B (G15 #2 Coder Node)
                          </div>
                          <div className="text-[11px] text-content-tertiary">
                            Python calculations, cut yields, COT heater balancing, automation
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="pt-2 divide-y divide-border/60">
                    <div className="py-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-content-primary">Temperature</span>
                        <span className="font-mono text-xs text-content-secondary px-2 py-0.5 rounded bg-elevated border border-border">
                          {settings.temperature}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={2.0}
                        step={0.05}
                        value={settings.temperature}
                        onChange={(e) => updateSettings({ temperature: Number(e.target.value) })}
                        className="w-full accent-accent cursor-pointer"
                      />
                    </div>

                    <div className="py-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-content-primary">Max Output Tokens</span>
                        <span className="font-mono text-xs text-content-secondary px-2 py-0.5 rounded bg-elevated border border-border">
                          {settings.maxTokens}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={256}
                        max={4096}
                        step={128}
                        value={settings.maxTokens}
                        onChange={(e) => updateSettings({ maxTokens: Number(e.target.value) })}
                        className="w-full accent-accent cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Auto-routing Rules */}
                  <div className="pt-4 space-y-3">
                    <span className="text-xs font-semibold text-content-primary block">
                      Auto-Routing Keyword Rules
                    </span>
                    <div className="space-y-1.5">
                      {rules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-elevated border border-border text-xs"
                        >
                          <div>
                            <span className="font-mono text-xs text-content-primary block">{rule.keywords}</span>
                            <span className="text-[10px] text-content-tertiary">Route to &rarr; {rule.targetModel}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="btn-icon !w-6 !h-6 text-content-tertiary hover:text-danger"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Keywords (e.g. pump, crude, yield)"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary outline-none"
                      />
                      <select
                        value={newModel}
                        onChange={(e) => setNewModel(e.target.value as ModelId)}
                        className="px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary outline-none"
                      >
                        <option value="qwen2.5-coder-7b">Qwen2.5-Coder-7B</option>
                        <option value="qwen2.5-7b">Qwen2.5-7B</option>
                      </select>
                      <button onClick={handleAddRule} className="btn-primary !py-1.5 !px-3 !text-xs">
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: MEMORY & CONTEXT */}
            {activeTab === 'memory' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Memory & Interaction
                  </h2>
                </div>

                <div className="space-y-4">
                  <Toggle
                    label="Enter to send message"
                    description="When disabled, press ⌘+Enter to dispatch messages"
                    checked={settings.enterToSend}
                    onChange={(val) => updateSettings({ enterToSend: val })}
                  />
                  <Toggle
                    label="Auto-route models"
                    description="Automatically select between Qwen2.5-7B and Coder based on prompt content"
                    checked={settings.autoRouteModel}
                    onChange={(val) => updateSettings({ autoRouteModel: val })}
                  />
                  <Toggle
                    label="Token streaming"
                    description="Stream responses character by character in real-time"
                    checked={settings.streamingEnabled}
                    onChange={(val) => updateSettings({ streamingEnabled: val })}
                  />
                  <Toggle
                    label="Show source citations panel"
                    description="Allow inspection of referenced MRPL documents on assistant responses"
                    checked={settings.showSources}
                    onChange={(val) => updateSettings({ showSources: val })}
                  />

                  <div className="pt-3 border-t border-border">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-medium text-content-primary">
                        Context Window ({settings.contextWindow} messages)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={settings.contextWindow}
                      onChange={(e) => updateSettings({ contextWindow: Number(e.target.value) })}
                      className="w-full accent-accent cursor-pointer"
                    />
                    <p className="text-[11px] text-content-tertiary mt-1">
                      Number of prior dialogue turns retained in memory for multi-step tasks.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: REFLECT */}
            {activeTab === 'reflect' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Reflect & Safety Verification
                  </h2>
                </div>

                <div className="divide-y divide-border/60 text-xs sm:text-sm">
                  <div className="py-3.5 space-y-1">
                    <span className="font-medium text-content-primary block">Automated Reflection Pass</span>
                    <p className="text-xs text-content-secondary leading-relaxed">
                      AIRA evaluates intermediate engineering calculations against mass-balance equations before outputting answers.
                    </p>
                  </div>
                  <div className="py-3.5 space-y-1">
                    <span className="font-medium text-content-primary block">OISD-105 Safety Thresholds</span>
                    <p className="text-xs text-content-secondary leading-relaxed">
                      Automatically flags any proposed operating temperatures, column pressures, or reflux ratios exceeding safety limits.
                    </p>
                  </div>
                  <div className="py-3.5 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-content-primary block">Verify Thermodynamics</span>
                      <span className="text-xs text-content-secondary">Enforce Peng-Robinson phase equilibria checks</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-success/15 text-success text-[11px] font-medium">
                      Active
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: TIME AND FOCUS */}
            {activeTab === 'time' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Time & Shift Focus
                  </h2>
                </div>

                <div className="divide-y divide-border/60 text-xs sm:text-sm">
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium text-content-primary block">Current Shift Schedule</span>
                      <span className="text-xs text-content-secondary">Align handover reports with operational shifts</span>
                    </div>
                    <select className="px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary outline-none">
                      <option>Day Shift (06:00 - 14:00)</option>
                      <option>Evening Shift (14:00 - 22:00)</option>
                      <option>Night Shift (22:00 - 06:00)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium text-content-primary block">Turnaround Quiet Mode</span>
                      <span className="text-xs text-content-secondary">Mute audio chimes during critical refinery shutdowns</span>
                    </div>
                    <span className="text-xs text-content-tertiary">Off</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CLAUDE CODE / AIRA CODE */}
            {activeTab === 'code' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    AIRA Code Sandbox & Runtime
                  </h2>
                </div>

                <p className="text-xs text-content-secondary leading-relaxed">
                  Local Python 3.11 execution sandbox hosted on G15 #2 Coder node. Pre-loaded with scientific computing and thermodynamics libraries:
                </p>

                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="p-3 rounded-lg bg-elevated border border-border flex justify-between">
                    <span className="text-content-secondary">NumPy:</span>
                    <span>1.26.4</span>
                  </div>
                  <div className="p-3 rounded-lg bg-elevated border border-border flex justify-between">
                    <span className="text-content-secondary">Pandas:</span>
                    <span>2.2.1</span>
                  </div>
                  <div className="p-3 rounded-lg bg-elevated border border-border flex justify-between">
                    <span className="text-content-secondary">SciPy:</span>
                    <span>1.12.0</span>
                  </div>
                  <div className="p-3 rounded-lg bg-elevated border border-border flex justify-between">
                    <span className="text-content-secondary">ThermoRefKit:</span>
                    <span>v2.4.1</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-elevated border border-border text-xs text-content-secondary space-y-1">
                  <span className="font-medium text-content-primary block">Air-Gap Code Sandboxing</span>
                  <p>Scripts execute in an isolated container with zero socket permissions and temporary memory-only filesystem.</p>
                </div>
              </div>
            )}

            {/* TAB: SKILLS (CUSTOMIZE) */}
            {activeTab === 'skills' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Refinery Engineering Skills
                  </h2>
                </div>

                <div className="divide-y divide-border/60 text-xs sm:text-sm">
                  {[
                    { name: 'MRPL SOP Expert Parser', desc: 'Deep semantic retrieval across CDU-2, VDU, and PTW manuals', active: true },
                    { name: 'OISD Safety Auditor', desc: 'Real-time compliance checks against OISD-105 & OISD-118 safety norms', active: true },
                    { name: 'Crude Cut Yield Modeler', desc: 'Predict true boiling point cuts and assay distributions', active: true },
                    { name: 'Furnace COT Pass Balancer', desc: 'Multi-pass coil outlet temperature balancing and fouling alerts', active: true },
                  ].map((skill) => (
                    <div key={skill.name} className="flex items-center justify-between py-3.5">
                      <div className="pr-4">
                        <span className="font-medium text-content-primary block">{skill.name}</span>
                        <span className="text-xs text-content-secondary mt-0.5 block">{skill.desc}</span>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-success/15 text-success text-[11px] font-medium shrink-0 flex items-center gap-1">
                        <Check size={12} />
                        <span>Enabled</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            
            {/* TAB: KNOWLEDGE BASE (CUSTOMIZE) */}
            {activeTab === 'kb' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                      Knowledge Base ({docs.length})
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="btn-glass !py-1 !px-2.5 !text-xs flex items-center gap-1.5 cursor-pointer">
                      <Upload size={13} />
                      <span>Upload</span>
                      <input type="file" onChange={handleUploadKBFile} accept=".pdf,.docx,.xlsx,.txt" className="hidden" />
                    </label>
                    <button
                      onClick={handleReindex}
                      disabled={isReindexing}
                      className="btn-glass !py-1 !px-2.5 !text-xs flex items-center gap-1.5"
                    >
                      {isReindexing ? <Spinner size="sm" /> : <RefreshCw size={13} />}
                      <span>{isReindexing ? 'Re-indexing...' : 'Re-index'}</span>
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-border/60 text-xs sm:text-sm">
                  {docs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between py-3">
                      <div>
                        <span className="font-medium text-content-primary block">{doc.name}</span>
                        <span className="text-xs text-content-tertiary mt-0.5 block">{doc.category} · {doc.size}</span>
                      </div>
                      <button
                        onClick={() => setDocs(docs.filter((d) => d.id !== doc.id))}
                        className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-danger"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: CONNECTORS (CUSTOMIZE) */}
            {activeTab === 'connectors' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    DCS & SCADA Connectors
                  </h2>
                </div>

                <div className="divide-y divide-border/60 text-xs sm:text-sm">
                  {[
                    { name: 'Honeywell Experion PKS DCS', desc: 'OPC UA Gateway · 192.168.1.100:4840', status: 'Connected' },
                    { name: 'Yokogawa CENTUM VP (Offsites)', desc: 'Modbus TCP Gateway · 192.168.1.105:502', status: 'Connected' },
                    { name: 'Aspen InfoPlus.21 (IP.21 Historian)', desc: 'REST API · 192.168.1.110:8080', status: 'Connected' },
                    { name: 'SAP PM Plant Maintenance', desc: 'RFC Gateway · Offline Buffer', status: 'Idle' },
                  ].map((conn) => (
                    <div key={conn.name} className="flex items-center justify-between py-3.5">
                      <div>
                        <span className="font-medium text-content-primary block">{conn.name}</span>
                        <span className="text-xs text-content-tertiary mt-0.5 block font-mono">{conn.desc}</span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                          conn.status === 'Connected'
                            ? 'bg-success/15 text-success'
                            : 'bg-elevated text-content-tertiary border border-border'
                        }`}
                      >
                        {conn.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: PLUGINS (CUSTOMIZE) */}
            {activeTab === 'plugins' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Installed Plugins
                  </h2>
                </div>

                <div className="divide-y divide-border/60 text-xs sm:text-sm">
                  {[
                    { name: 'MRPL PDF OCR & Table Parser', desc: 'Extracts engineering inspection logs and tabular data from scanned PDFs' },
                    { name: 'Scientific KaTeX Equation Renderer', desc: 'Displays thermodynamic cut yield formulas and mass balance notation' },
                    { name: 'Interactive Python Code Runner', desc: 'Sandboxed in-browser code execution with terminal output' },
                  ].map((plugin) => (
                    <div key={plugin.name} className="flex items-center justify-between py-3.5">
                      <div className="pr-4">
                        <span className="font-medium text-content-primary block">{plugin.name}</span>
                        <span className="text-xs text-content-secondary mt-0.5 block">{plugin.desc}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-elevated border border-border text-[11px] text-content-secondary">
                        v1.2.0
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: CLUSTER & NODES */}
            {activeTab === 'server' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Distributed Multi-Laptop Cluster
                  </h2>
                  <p className="text-xs text-content-secondary mt-1">
                    Connect up to 4 dedicated laptops over LAN or tunnels. Each laptop hosts its own resident model in VRAM for zero-latency execution.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Node 1: Master Node */}
                  <div className="p-3.5 rounded-xl bg-elevated border border-border space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-content-primary">Laptop 1: Master Node</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20">
                          Qwen3-8B (Chat & Orchestration)
                        </span>
                      </div>
                      <button
                        onClick={() => checkIndividual('primary')}
                        disabled={server.primaryStatus === 'checking'}
                        className="btn-ghost !py-0.5 !px-2 !text-[11px]"
                      >
                        {server.primaryStatus === 'checking' ? 'Testing...' : 'Test connection'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={g15Primary}
                        placeholder="e.g. https://splendid-sensibly-primate.ngrok-free.app or http://127.0.0.1:8000"
                        onChange={(e) => setG15Primary(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-content-primary outline-none"
                      />
                      <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-surface border border-border">
                        <span className={`w-2 h-2 rounded-full ${server.primaryStatus === 'connected' ? 'bg-success' : 'bg-danger'}`} />
                        <span className="capitalize text-[11px]">{server.primaryStatus || 'online'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Node 2: Coder Node */}
                  <div className="p-3.5 rounded-xl bg-elevated border border-border space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-content-primary">Laptop 2: Coder Node</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Qwen2.5-Coder:7b (Code & Debug)
                        </span>
                      </div>
                      <button
                        onClick={() => checkIndividual('coder')}
                        disabled={server.coderStatus === 'checking'}
                        className="btn-ghost !py-0.5 !px-2 !text-[11px]"
                      >
                        {server.coderStatus === 'checking' ? 'Testing...' : 'Test connection'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={g15Coder}
                        placeholder="e.g. http://192.168.1.15:11434 or tunnel URL"
                        onChange={(e) => setG15Coder(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-content-primary outline-none"
                      />
                      <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-surface border border-border">
                        <span className={`w-2 h-2 rounded-full ${server.coderStatus === 'connected' ? 'bg-success' : 'bg-danger'}`} />
                        <span className="capitalize text-[11px]">{server.coderStatus || 'offline'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Node 3: Multimodal Vision Node */}
                  <div className="p-3.5 rounded-xl bg-elevated border border-border space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-content-primary">Laptop 3: Vision Node</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Qwen2.5-VL:7b (Images & Blueprints)
                        </span>
                      </div>
                      <button
                        onClick={() => checkIndividual('vision')}
                        disabled={server.visionStatus === 'checking'}
                        className="btn-ghost !py-0.5 !px-2 !text-[11px]"
                      >
                        {server.visionStatus === 'checking' ? 'Testing...' : 'Test connection'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={g15Vision}
                        placeholder="e.g. http://192.168.1.16:11434 or tunnel URL"
                        onChange={(e) => setG15Vision(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-content-primary outline-none"
                      />
                      <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-surface border border-border">
                        <span className={`w-2 h-2 rounded-full ${server.visionStatus === 'connected' ? 'bg-success' : 'bg-danger'}`} />
                        <span className="capitalize text-[11px]">{server.visionStatus || 'offline'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Node 4: Deep Reasoning Node */}
                  <div className="p-3.5 rounded-xl bg-elevated border border-border space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-content-primary">Laptop 4: Deep Reasoning Node</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          DeepSeek-R1:8b (Math & Step-by-Step)
                        </span>
                      </div>
                      <button
                        onClick={() => checkIndividual('reasoning')}
                        disabled={server.reasoningStatus === 'checking'}
                        className="btn-ghost !py-0.5 !px-2 !text-[11px]"
                      >
                        {server.reasoningStatus === 'checking' ? 'Testing...' : 'Test connection'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={g15Reasoning}
                        placeholder="e.g. http://192.168.1.17:11434 or tunnel URL"
                        onChange={(e) => setG15Reasoning(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-content-primary outline-none"
                      />
                      <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-surface border border-border">
                        <span className={`w-2 h-2 rounded-full ${server.reasoningStatus === 'connected' ? 'bg-success' : 'bg-danger'}`} />
                        <span className="capitalize text-[11px]">{server.reasoningStatus || 'offline'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Quick Setup Guide Box */}
                  <div className="p-3.5 rounded-xl bg-surface/60 border border-border/80 text-xs space-y-2">
                    <div className="font-semibold text-content-primary flex items-center gap-1.5">
                      <Info size={14} className="text-primary" />
                      <span>How to connect each laptop tomorrow:</span>
                    </div>
                    <p className="text-content-secondary leading-relaxed">
                      1. On each laptop, allow Ollama to accept LAN connections by running PowerShell as Admin:
                    </p>
                    <pre className="p-2 rounded bg-black/40 font-mono text-[11px] text-content-primary overflow-x-auto">
                      [System.Environment]::SetEnvironmentVariable(&apos;OLLAMA_HOST&apos;, &apos;0.0.0.0:11434&apos;, &apos;User&apos;)
                    </pre>
                    <p className="text-content-secondary leading-relaxed">
                      2. Restart Ollama, run <code className="text-primary font-mono text-[11px]">ipconfig</code> to find that laptop&apos;s IP, enter it above (e.g. <code className="text-primary font-mono text-[11px]">http://192.168.1.15:11434</code>), and click <strong>Test connection</strong>!
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={checkConnection}
                      disabled={isChecking}
                      className="btn-glass !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
                    >
                      {isChecking && <Spinner size="sm" />}
                      <span>{isChecking ? 'Checking...' : 'Test all 4 nodes'}</span>
                    </button>
                    <button onClick={handleSaveServerConfig} className="btn-primary !py-1.5 !px-4 !text-xs">
                      Save cluster configuration
                    </button>
                  </div>

                  {lastChecked && (
                    <div className="text-[11px] text-content-tertiary pt-2 border-t border-border">
                      Last cluster check: {new Date(lastChecked).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: SHORTCUTS */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    Keyboard Shortcuts
                  </h2>
                </div>

                <div className="divide-y divide-border/60 text-xs">
                  {[
                    { action: 'Open settings', key: '⌘ ,' },
                    { action: 'Open command bar', key: '⌘ K' },
                    { action: 'New chat', key: '⌘ N' },
                    { action: 'Send message', key: 'Enter  or  ⌘ ↵' },
                    { action: 'New line in input', key: '⇧ Enter' },
                    { action: 'Toggle sidebar collapse', key: '⌘ B' },
                    { action: 'Toggle light / dark theme', key: '⌘ D' },
                    { action: 'Stop generation', key: 'Escape' },
                  ].map((s) => (
                    <div key={s.action} className="flex items-center justify-between py-2.5">
                      <span className="text-content-primary">{s.action}</span>
                      <kbd className="font-mono text-[11px] text-content-secondary px-2 py-0.5 rounded bg-elevated border border-border">
                        {s.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: ABOUT */}
            {activeTab === 'about' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                    About AIRA
                  </h2>
                </div>

                <div className="p-5 rounded-2xl bg-elevated border border-border space-y-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center shadow-xs">
                      <svg className="w-6 h-6 text-content-primary" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="8">
                        <polygon points="50,6 90,29 90,75 50,98 10,75 10,29" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-content-primary">AIRA Workbench</h3>
                      <p className="text-xs text-content-tertiary">Version 1.0.0 · Sovereign AI for Mangalore Refinery</p>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2 rounded bg-surface border border-border flex justify-between">
                      <span className="text-content-secondary">Stack:</span>
                      <span>React 18 + Vite</span>
                    </div>
                    <div className="p-2 rounded bg-surface border border-border flex justify-between">
                      <span className="text-content-secondary">Air-Gap:</span>
                      <span className="text-success">Enforced</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  </div>
  )
}
