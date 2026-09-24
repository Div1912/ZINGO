import React, { useState, useEffect } from 'react'
import {
  Search,
  X,
  User,
  Shield,
  Sliders,
  History,
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
  Moon,
  Monitor,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCircle2,
  AlertTriangle,
  Factory,
  FileText,
  RefreshCcw,
  Network,
  ClipboardList,
  ChevronLeft,
  Plus,
  Edit2,
  MapPin,
  Calendar,
  ExternalLink,
  Sparkles,
  Database,
  Building,
  Radio,
  Lock,
  HardDrive,
  Activity,
  Cpu,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../../stores/settingsStore'
import { useServerStore, DEFAULT_LAPTOP2_VISION_TUNNEL_URL, DEFAULT_QWEN3_4B_TUNNEL_URL } from '../../stores/serverStore'
import { useTheme } from '../../hooks/useTheme'
import { useToastStore } from '../../stores/toastStore'
import { useZingoStore } from '../../stores/zingoStore'
import { useAuthStore, getActiveUserId } from '../../stores/authStore'
import { Toggle } from '../../components/ui/Toggle'
import { Spinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { zingoApi } from '../../services/zingoApi'
import type {
  UserProfile,
  UserCapabilities,
  UserMemoryFile,
  UserPermissions,
  UserConnector,
} from '../../services/zingoApi'

const AlertsPanel = React.lazy(() => import('../../components/zingo/AlertsPanel'))
const PlantHealthMap = React.lazy(() => import('../../components/zingo/PlantHealthMap'))
const DocumentTimeline = React.lazy(() => import('../../components/zingo/DocumentTimeline'))
const ShiftHandover = React.lazy(() => import('../../components/zingo/ShiftHandover'))
const ComplianceMatrix = React.lazy(() => import('../../components/zingo/ComplianceMatrix'))
const KnowledgeGraph = React.lazy(() => import('../../components/zingo/KnowledgeGraph'))
const AuditTrail = React.lazy(() => import('../../components/zingo/AuditTrail'))

export type TabKey =
  | 'profile'
  | 'general'
  | 'account'
  | 'privacy'
  | 'capabilities'
  | 'permissions'
  | 'connectors'
  | 'memory'
  | 'reflect'
  | 'time'
  | 'code'
  | 'skills'
  | 'kb'
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
  initialTab = 'profile',
  onClose,
}) => {
  const navigate = useNavigate()
  const normalizedInitialTab = initialTab === 'general' ? 'profile' : initialTab
  const [activeTab, setActiveTab] = useState<TabKey>(normalizedInitialTab)
  const [mobileView, setMobileView] = useState<'menu' | 'content'>(
    initialTab && initialTab !== 'profile' && initialTab !== 'general' ? 'content' : 'menu'
  )
  const [searchQuery, setSearchQuery] = useState('')

  const { settings, updateSettings } = useSettingsStore()
  const { server, updateServer, checkConnection, checkIndividual, isChecking, lastChecked } = useServerStore()
  const { theme, setTheme } = useTheme()
  const { addToast } = useToastStore()
  const { user: authUser } = useAuthStore()
  const activeUserId = authUser?.id || getActiveUserId()
  const criticalCount = useZingoStore((s) => s.activeAlerts.filter((a) => a.severity === 'CRITICAL').length)
  const isWorkbenchTab = ['alerts', 'health', 'documents', 'shift', 'compliance', 'graph', 'audit'].includes(activeTab)

  // Real SQLite persistent state
  const [userProfile, setUserProfile] = useState<UserProfile>({
    user_id: activeUserId,
    full_name: settings.userName || 'User',
    preferred_name: settings.preferredName || 'User',
    work_role: settings.workDescription || 'Refinery Process Engineer (CDU/VDU)',
    personal_preferences:
      settings.customInstructions ||
      "I'm an AI engineer and developer working with Python, PyTorch, Ollama, and industrial control systems. Provide concise, direct, accurate technical solutions with clean code blocks.",
  })

  const [capabilities, setCapabilities] = useState<UserCapabilities>({
    user_id: activeUserId,
    artifacts_enabled: true,
    inline_visualizations: true,
    code_execution: true,
    switch_models_on_flagged: true,
    generate_memory_from_chats: true,
    include_sensitive_topics: false,
    tool_access_mode: 'auto',
  })

  const [permissions, setPermissions] = useState<UserPermissions>({
    user_id: activeUserId,
    location_permitted: true,
    location_label: 'MRPL Complex, Mangaluru (12.9141° N, 74.8560° E)',
    location_coords: '12.9141,74.8560',
    calendar_permitted: true,
    calendar_account: 'lead.engineer@mrpl.co.in',
  })

  const [connectors, setConnectors] = useState<UserConnector[]>([])
  const [connectorDiscovery, setConnectorDiscovery] = useState(true)
  const [memoryFiles, setMemoryFiles] = useState<UserMemoryFile[]>([])
  const [, setIsLoadingSettings] = useState(false)

  // Modals & sub-dialogs
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false)
  const [isIdentityPromptModalOpen, setIsIdentityPromptModalOpen] = useState(false)
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false)
  const [isAddConnectorModalOpen, setIsAddConnectorModalOpen] = useState(false)
  const [modelIdentityPrompt, setModelIdentityPrompt] = useState('')
  const [isFetchingPrompt, setIsFetchingPrompt] = useState(false)

  // Memory file form state
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null)
  const [memoryTitle, setMemoryTitle] = useState('')
  const [memoryContent, setMemoryContent] = useState('')
  const [memoryCategory, setMemoryCategory] = useState<'general' | 'project' | 'preference' | 'sensitive'>('preference')
  const [memoryIsSensitive, setMemoryIsSensitive] = useState(false)
  const [memoryFilter, setMemoryFilter] = useState<string>('all')

  // Custom connector form state
  const [customConnName, setCustomConnName] = useState('')
  const [customConnDesc, setCustomConnDesc] = useState('')
  const [customConnKey, setCustomConnKey] = useState('')

  // Industrial connector configuration & live testing state
  const [configConnector, setConfigConnector] = useState<UserConnector | null>(null)
  const [configEndpoint, setConfigEndpoint] = useState('')
  const [configApiKey, setConfigApiKey] = useState('')
  const [isTestingConn, setIsTestingConn] = useState(false)
  const [testResult, setTestResult] = useState<{ reachable: boolean; latency_ms: number; error: string | null } | null>(null)

  // Server state
  const [g15Primary, setG15Primary] = useState(server.g15_1_url)
  const [g15Coder, setG15Coder] = useState(server.g15_2_url)
  const [g15Vision, setG15Vision] = useState(server.vision_url || DEFAULT_LAPTOP2_VISION_TUNNEL_URL)
  const [g15Fast4b, setG15Fast4b] = useState(server.fast_4b_url || DEFAULT_QWEN3_4B_TUNNEL_URL)
  const [g15Reasoning, setG15Reasoning] = useState(server.reasoning_url || 'http://192.168.1.17:11434')

  // Knowledge base state
  const [docs, setDocs] = useState(INITIAL_DOCS)
  const [isReindexing, setIsReindexing] = useState(false)


  useEffect(() => {
    if (initialTab) {
      const target = initialTab === 'general' ? 'profile' : initialTab
      setActiveTab(target)
      if (target !== 'profile') {
        setMobileView('content')
      }
    }
  }, [initialTab])

  // Load all authentic settings from SQLite backend on mount
  useEffect(() => {
    let mounted = true
    const fetchSettings = async () => {
      setIsLoadingSettings(true)
      try {
        const [prof, caps, perms, conns, mems] = await Promise.allSettled([
          zingoApi.getProfile(activeUserId),
          zingoApi.getCapabilities(activeUserId),
          zingoApi.getPermissions(activeUserId),
          zingoApi.getConnectors(activeUserId),
          zingoApi.getMemoryFiles(activeUserId),
        ])

        if (mounted) {
          if (prof.status === 'fulfilled' && prof.value) {
            setUserProfile(prof.value)
            // Preserve user-configured name if DB returned unconfigured generic defaults
            const currentName = settings.userName
            const remoteName = prof.value.full_name
            const finalName =
              remoteName && remoteName !== 'User' && remoteName !== 'default_user'
                ? remoteName
                : currentName || 'User'
            const currentPref = settings.preferredName
            const remotePref = prof.value.preferred_name
            const finalPref =
              remotePref && remotePref !== 'User' && remotePref !== 'default_user'
                ? remotePref
                : currentPref || finalName

            updateSettings({
              userName: finalName,
              preferredName: finalPref,
              workDescription: prof.value.work_role || settings.workDescription,
              customInstructions: prof.value.personal_preferences || settings.customInstructions,
            })
          }
          if (caps.status === 'fulfilled' && caps.value) {
            setCapabilities(caps.value)
          }
          if (perms.status === 'fulfilled' && perms.value) {
            setPermissions(perms.value)
          }
          if (conns.status === 'fulfilled' && conns.value?.connectors) {
            setConnectors(conns.value.connectors)
          }
          if (mems.status === 'fulfilled' && mems.value?.memories) {
            setMemoryFiles(mems.value.memories)
          }
        }
      } catch (err) {
        console.error('Failed to load settings from SQLite:', err)
      } finally {
        if (mounted) setIsLoadingSettings(false)
      }
    }

    if (isOpen) {
      fetchSettings()
    }
    return () => {
      mounted = false
    }
  }, [isOpen, activeUserId])

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
      if (
        e.key === 'Escape' &&
        !isMemoryModalOpen &&
        !isIdentityPromptModalOpen &&
        !isDeleteAccountModalOpen &&
        !isAddConnectorModalOpen
      ) {
        handleClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isMemoryModalOpen, isIdentityPromptModalOpen, isDeleteAccountModalOpen, isAddConnectorModalOpen])

  // Profile Save
  const handleSaveProfile = async () => {
    try {
      const updated = await zingoApi.updateProfile({
        user_id: activeUserId,
        full_name: userProfile.full_name,
        preferred_name: userProfile.preferred_name,
        work_role: userProfile.work_role,
        personal_preferences: userProfile.personal_preferences,
      })
      setUserProfile(updated)
      updateSettings({
        userName: updated.full_name,
        preferredName: updated.preferred_name,
        workDescription: updated.work_role,
        customInstructions: updated.personal_preferences,
      })
      addToast({
        type: 'success',
        title: 'Preferences Saved',
        message: 'Personal preferences updated and persisted across conversations.',
      })
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to Save Profile',
        message: 'Could not write updates to SQLite database.',
      })
    }
  }

  // Capability Toggle
  const handleToggleCapability = async (field: keyof UserCapabilities, val: boolean) => {
    try {
      const newCaps = { ...capabilities, [field]: val }
      setCapabilities(newCaps)
      await zingoApi.updateCapabilities({ user_id: activeUserId, [field]: val })
      addToast({
        type: 'success',
        message: `Capability updated: ${String(field).replace(/_/g, ' ')}`,
      })
    } catch (err) {
      console.error('Failed to update capability:', err)
    }
  }

  // Connector Actions
  const handleToggleConnector = async (connectorKey: string, currentStatus: string) => {
    const newStatus = currentStatus === 'connected' ? 'disconnected' : 'connected'
    try {
      const updated = await zingoApi.toggleConnector(connectorKey, { status: newStatus, user_id: activeUserId })
      setConnectors((prev) =>
        prev.map((c) => (c.connector_key === connectorKey ? { ...c, status: updated.status } : c))
      )
      addToast({
        type: 'success',
        title: updated.status === 'connected' ? 'Connector Connected' : 'Connector Disconnected',
        message: `${updated.name} is now ${updated.status}.`,
      })
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: err.message || 'Unable to update connector status.',
      })
    }
  }

  const handleOpenConfigureConnector = (conn: UserConnector) => {
    setConfigConnector(conn)
    const cfg = conn.config || {}
    const defaultEndpoint =
      conn.connector_key === 'aspen_ip21'
        ? 'http://192.168.1.110:8080'
        : conn.connector_key === 'honeywell_dcs'
        ? 'opc.tcp://192.168.1.100:4840'
        : conn.connector_key === 'sap_pm'
        ? 'https://sap-gateway.mrpl.local/sap/opu/odata/sap/PM_ORDERS'
        : ''
    setConfigEndpoint(cfg.endpoint || defaultEndpoint)
    setConfigApiKey(cfg.api_key || '')
    setTestResult(null)
  }

  const handleTestConnector = async () => {
    if (!configConnector || !configEndpoint.trim()) {
      addToast({ type: 'warning', message: 'Endpoint URL is required to test connectivity.' })
      return
    }
    setIsTestingConn(true)
    setTestResult(null)
    try {
      const connType = configConnector.connector_key.includes('honeywell') ? 'opc_ua' : 'http'
      const res = await zingoApi.testConnector(configConnector.connector_key, {
        endpoint: configEndpoint.trim(),
        connector_type: connType,
        api_key: configApiKey.trim() || undefined,
        timeout_ms: 3000,
        user_id: activeUserId,
      })
      setTestResult(res)
      if (res.reachable) {
        addToast({
          type: 'success',
          title: 'Host Reachable',
          message: `Connected successfully (${res.latency_ms}ms latency).`,
        })
      } else {
        addToast({
          type: 'error',
          title: 'Connection Test Failed',
          message: res.error || 'Host unreachable on local network.',
        })
      }
    } catch (err: any) {
      setTestResult({ reachable: false, latency_ms: 0, error: err.message || 'Request failed' })
      addToast({ type: 'error', title: 'Test Failed', message: err.message || 'Connection test failed.' })
    } finally {
      setIsTestingConn(false)
    }
  }

  const handleSaveConnectorConfig = async (desiredStatus: 'connected' | 'disconnected') => {
    if (!configConnector) return
    try {
      const cfg = {
        ...(configConnector.config || {}),
        endpoint: configEndpoint.trim(),
        api_key: configApiKey.trim(),
        last_configured: new Date().toISOString(),
      }
      const updated = await zingoApi.toggleConnector(configConnector.connector_key, {
        status: desiredStatus,
        config: cfg,
        user_id: activeUserId,
      })
      setConnectors((prev) =>
        prev.map((c) =>
          c.connector_key === configConnector.connector_key
            ? { ...c, status: updated.status, config: updated.config }
            : c
        )
      )
      addToast({
        type: 'success',
        title: desiredStatus === 'connected' ? 'Connector Active' : 'Configuration Saved',
        message: `${updated.name} settings saved.`,
      })
      setConfigConnector(null)
    } catch (err: any) {
      addToast({ type: 'error', message: err.message || 'Failed to save configuration.' })
    }
  }

  // Geolocation Request (Real browser API)
  const handleRequestLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude.toFixed(4)
          const lon = position.coords.longitude.toFixed(4)
          const coords = `${lat}° N, ${lon}° E`
          const label = `Current Device Location (${coords})`
          try {
            const res = await zingoApi.updatePermissions({
              user_id: activeUserId,
              location_permitted: true,
              location_label: label,
              location_coords: coords,
            })
            setPermissions(res)
            addToast({
              type: 'success',
              title: 'Location Permitted',
              message: `Live location coordinates saved: ${coords}`,
            })
          } catch (err) {
            console.error(err)
          }
        },
        async () => {
          const defaultLabel = 'MRPL Refinery Complex, Mangaluru (12.9141° N, 74.8560° E)'
          const res = await zingoApi.updatePermissions({
            user_id: activeUserId,
            location_permitted: true,
            location_label: defaultLabel,
            location_coords: '12.9141,74.8560',
          })
          setPermissions(res)
          addToast({
            type: 'info',
            title: 'Sovereign Location Active',
            message: defaultLabel,
          })
        }
      )
    } else {
      addToast({
        type: 'warning',
        message: 'Geolocation API not supported on this device. Using default refinery location.',
      })
    }
  }

  const handleRevokeLocation = async () => {
    try {
      const res = await zingoApi.updatePermissions({
        user_id: activeUserId,
        location_permitted: false,
      })
      setPermissions(res)
      addToast({
        type: 'info',
        title: 'Location Revoked',
        message: 'Location access disabled for the AI model.',
      })
    } catch (err) {
      console.error(err)
    }
  }

  // Calendar permission toggle
  const handleToggleCalendar = async () => {
    try {
      const newStatus = !permissions.calendar_permitted
      const res = await zingoApi.updatePermissions({
        user_id: activeUserId,
        calendar_permitted: newStatus,
        calendar_account: newStatus ? 'lead.engineer@mrpl.co.in' : undefined,
      })
      setPermissions(res)
      addToast({
        type: 'success',
        title: newStatus ? 'Calendar Connected' : 'Calendar Revoked',
        message: newStatus ? 'Google Calendar integration enabled.' : 'Calendar access removed.',
      })
    } catch (err) {
      console.error(err)
    }
  }

  // Memory Files Actions
  const handleSaveMemoryFile = async () => {
    if (!memoryTitle.trim() || !memoryContent.trim()) {
      addToast({ type: 'warning', message: 'Title and content are required for memory files.' })
      return
    }
    try {
      if (editingMemoryId) {
        const updated = await zingoApi.updateMemoryFile(editingMemoryId, {
          title: memoryTitle.trim(),
          content: memoryContent.trim(),
          category: memoryCategory,
          is_sensitive: memoryIsSensitive,
          user_id: activeUserId,
        })
        setMemoryFiles((prev) => prev.map((m) => (m.id === editingMemoryId ? updated : m)))
        addToast({ type: 'success', message: 'Memory file updated successfully.' })
      } else {
        const created = await zingoApi.addMemoryFile({
          title: memoryTitle.trim(),
          content: memoryContent.trim(),
          category: memoryCategory,
          is_sensitive: memoryIsSensitive,
          user_id: activeUserId,
        })
        setMemoryFiles((prev) => [created, ...prev])
        addToast({ type: 'success', message: 'Memory saved to ZINGO context.' })
      }
      setEditingMemoryId(null)
      setMemoryTitle('')
      setMemoryContent('')
      setMemoryCategory('preference')
      setMemoryIsSensitive(false)
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to save memory file.' })
    }
  }

  const handleDeleteMemoryFile = async (id: number) => {
    try {
      await zingoApi.deleteMemoryFile(id)
      setMemoryFiles((prev) => prev.filter((m) => m.id !== id))
      addToast({ type: 'success', message: 'Memory file removed.' })
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to delete memory file.' })
    }
  }

  const handleClearAllMemories = async () => {
    if (!window.confirm('Are you sure you want to delete all remembered memory files?')) return
    try {
      await zingoApi.clearMemoryFiles(activeUserId)
      setMemoryFiles([])
      addToast({ type: 'info', message: 'All remembered files cleared.' })
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to clear memories.' })
    }
  }

  // Delete Account
  const handleConfirmDeleteAccount = async () => {
    try {
      await zingoApi.deleteAccount(activeUserId)
      setIsDeleteAccountModalOpen(false)
      addToast({
        type: 'error',
        title: 'Account Reset',
        message: 'Account data and memory have been wiped from local database.',
      })
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to delete account.' })
    }
  }

  // Add Custom Connector
  const handleAddCustomConnector = async () => {
    if (!customConnName.trim() || !customConnKey.trim()) {
      addToast({ type: 'warning', message: 'Connector name and key are required.' })
      return
    }
    try {
      const res = await zingoApi.toggleConnector(customConnKey.trim().toLowerCase(), {
        status: 'connected',
        config: { custom: true, description: customConnDesc },
        user_id: activeUserId,
      })
      setConnectors((prev) => [...prev, res])
      setIsAddConnectorModalOpen(false)
      setCustomConnName('')
      setCustomConnKey('')
      setCustomConnDesc('')
      addToast({ type: 'success', message: `Custom connector ${res.name} added.` })
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to register custom connector.' })
    }
  }

  // Model Identity Prompt Inspector
  const handleInspectIdentityPrompt = async () => {
    setIsFetchingPrompt(true)
    setIsIdentityPromptModalOpen(true)
    try {
      const res = await zingoApi.getModelIdentityPrompt(activeUserId)
      setModelIdentityPrompt(res.prompt)
    } catch (err) {
      setModelIdentityPrompt('Error fetching model identity prompt from backend.')
    } finally {
      setIsFetchingPrompt(false)
    }
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


  const handleSaveServerConfig = () => {
    updateServer({
      g15_1_url: g15Primary,
      g15_2_url: g15Coder,
      vision_url: g15Vision,
      fast_4b_url: g15Fast4b,
      reasoning_url: g15Reasoning,
    })
    addToast({
      type: 'success',
      title: 'Cluster Configuration Saved',
      message: 'All GPU cluster node endpoints updated.',
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

  // Sidebar navigation sections
  const NAV_SECTIONS = [
    {
      group: 'User Settings',
      items: [
        { id: 'profile' as const, label: 'Profile', icon: <User size={15} /> },
        { id: 'account' as const, label: 'Account', icon: <Building size={15} /> },
        { id: 'privacy' as const, label: 'Privacy', icon: <Shield size={15} /> },
        { id: 'capabilities' as const, label: 'Capabilities', icon: <Sliders size={15} /> },
        { id: 'permissions' as const, label: 'Permissions', icon: <MapPin size={15} /> },
        { id: 'connectors' as const, label: 'Connectors', icon: <Cable size={15} /> },
      ],
    },
    {
      group: 'Workbench & Operations',
      items: [
        {
          id: 'alerts' as const,
          label: 'Incident Alerts',
          icon: <AlertTriangle size={15} />,
          badge: criticalCount > 0 ? String(criticalCount) : undefined,
        },
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
        { id: 'plugins' as const, label: 'Plugins', icon: <Puzzle size={15} /> },
      ],
    },
    {
      group: 'System & Cluster',
      items: [
        { id: 'server' as const, label: 'Cluster Nodes', icon: <Server size={15} /> },
        { id: 'memory' as const, label: 'Chat Context Window', icon: <History size={15} /> },
        { id: 'code' as const, label: 'Code Sandbox', icon: <Code2 size={15} /> },
        { id: 'shortcuts' as const, label: 'Shortcuts', icon: <Keyboard size={15} /> },
        { id: 'about' as const, label: 'About ZINGO', icon: <Info size={15} /> },
      ],
    },
  ]

  // Filter items if searching in sidebar
  const filteredSections = NAV_SECTIONS.map((sec) => ({
    ...sec,
    items: sec.items.filter((i) => i.label.toLowerCase().includes(searchQuery.toLowerCase())),
  })).filter((sec) => sec.items.length > 0)

  const getTabLabel = (tab: TabKey): string => {
    if (tab === 'general' || tab === 'profile') return 'Profile'
    for (const sec of NAV_SECTIONS) {
      for (const item of sec.items) {
        if ((item as any).id === tab) return item.label
      }
    }
    return 'Settings'
  }

  const userInitial = userProfile.full_name?.trim().charAt(0).toUpperCase() || 'D'

  // Filtered memory files for the sub-modal
  const filteredMemories =
    memoryFilter === 'all'
      ? memoryFiles
      : memoryFiles.filter((m) => m.category === memoryFilter || (memoryFilter === 'sensitive' && m.is_sensitive))

  if (!isOpen) return null

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-black/65 backdrop-blur-sm select-none animate-in fade-in duration-200"
    >
      {/* Modal Dialog Window */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${
          isWorkbenchTab ? 'md:max-w-6xl md:h-[840px]' : 'md:max-w-4xl md:h-[720px]'
        } h-full md:max-h-[94vh] bg-surface text-content-primary rounded-none md:rounded-2xl border-0 md:border md:border-border shadow-2xl flex overflow-hidden select-none transition-all duration-200`}
      >
        {/* Left Sidebar */}
        <aside
          className={`w-full md:w-60 border-r-0 md:border-r border-border bg-surface/90 flex flex-col shrink-0 ${
            mobileView === 'content' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Mobile Header for Sidebar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border md:hidden shrink-0">
            <span className="text-sm font-semibold text-content-primary">Settings & Operations</span>
            <button
              type="button"
              onClick={handleClose}
              className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
              title="Close"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Search input at top of sidebar */}
          <div className="p-3.5 pb-2">
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-content-tertiary pointer-events-none" />
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
                    const isTabActive =
                      activeTab === item.id || (item.id === 'profile' && activeTab === 'general')
                    const badge = (item as any).badge
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id)
                          setMobileView('content')
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 md:py-1.5 rounded-lg text-xs font-normal transition-colors border-none bg-transparent cursor-pointer text-left ${
                          isTabActive
                            ? 'bg-elevated text-content-primary font-medium'
                            : 'text-content-secondary hover:bg-elevated/60 hover:text-content-primary'
                        }`}
                      >
                        <span className={isTabActive ? 'text-content-primary' : 'text-content-tertiary'}>
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

          {/* Bottom Identity Inspector Button */}
          <div className="p-3 border-t border-border bg-surface/50">
            <button
              type="button"
              onClick={handleInspectIdentityPrompt}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-accent hover:bg-accent/10 border border-accent/20 transition-colors"
            >
              <Sparkles size={13} />
              <span>Inspect Identity Prompt</span>
            </button>
          </div>
        </aside>

        {/* Right Content Area */}
        <main
          className={`flex-1 flex flex-col h-full overflow-hidden relative bg-surface ${
            mobileView === 'menu' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Mobile Top Navigation Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-surface/95 shrink-0 md:hidden z-30">
            <button
              type="button"
              onClick={() => setMobileView('menu')}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline active:opacity-70 transition-colors"
            >
              <ChevronLeft size={16} />
              <span>All Settings</span>
            </button>
            <span className="text-xs font-semibold text-content-primary truncate max-w-[170px]">
              {getTabLabel(activeTab)}
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
              title="Close"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Desktop Top-Right Close Button */}
          <button
            type="button"
            onClick={handleClose}
            className="hidden md:flex absolute top-5 right-6 z-30 btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary hover:bg-elevated rounded-md transition-colors"
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
              {/* ========================================================================= */}
              {/* SCREEN 1: PROFILE (SCREENSHOT media_1789707191518.png EXACT REPLICA)     */}
              {/* ========================================================================= */}
              {(activeTab === 'profile' || activeTab === 'general') && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                      Profile
                    </h2>
                  </div>

                  {/* Avatar Row */}
                  <div className="flex items-center justify-between py-3.5 border-b border-border">
                    <span className="text-xs sm:text-sm font-normal text-content-primary">
                      Avatar
                    </span>
                    <div className="w-9 h-9 rounded-full bg-accent/20 border border-accent/40 text-accent font-semibold text-sm flex items-center justify-center select-none shadow-xs">
                      {userInitial}
                    </div>
                  </div>

                  {/* Full name Row */}
                  <div className="flex items-center justify-between py-3.5 border-b border-border">
                    <span className="text-xs sm:text-sm font-normal text-content-primary">
                      Full name
                    </span>
                    <input
                      type="text"
                      value={userProfile.full_name}
                      onChange={(e) =>
                        setUserProfile((prev) => ({ ...prev, full_name: e.target.value }))
                      }
                      onBlur={handleSaveProfile}
                      placeholder="User"
                      className="w-56 sm:w-64 px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary focus:border-border-strong outline-none transition-colors"
                    />
                  </div>

                  {/* What should ZINGO call you? Row */}
                  <div className="flex items-center justify-between py-3.5 border-b border-border">
                    <span className="text-xs sm:text-sm font-normal text-content-primary">
                      What should ZINGO call you?
                    </span>
                    <input
                      type="text"
                      value={userProfile.preferred_name}
                      onChange={(e) =>
                        setUserProfile((prev) => ({ ...prev, preferred_name: e.target.value }))
                      }
                      onBlur={handleSaveProfile}
                      placeholder="User"
                      className="w-56 sm:w-64 px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary focus:border-border-strong outline-none transition-colors"
                    />
                  </div>

                  {/* Engineering Role (Process Context) */}
                  <div className="flex items-center justify-between py-3.5 border-b border-border">
                    <span className="text-xs sm:text-sm font-normal text-content-primary">
                      What best describes your work?
                    </span>
                    <div className="relative w-56 sm:w-64">
                      <select
                        value={userProfile.work_role || 'Refinery Process Engineer (CDU/VDU)'}
                        onChange={(e) => {
                          const val = e.target.value
                          setUserProfile((prev) => ({ ...prev, work_role: val }))
                          updateSettings({ workDescription: val })
                          zingoApi.updateProfile({ user_id: activeUserId, work_role: val })
                        }}
                        className="w-full appearance-none px-3 py-1.5 pr-8 bg-elevated border border-border rounded-lg text-xs text-content-primary focus:border-border-strong outline-none cursor-pointer"
                      >
                        <option value="Refinery Process Engineer (CDU/VDU)">
                          Refinery Process Engineer (CDU/VDU)
                        </option>
                        <option value="Mechanical Maintenance Lead">Mechanical Maintenance Lead</option>
                        <option value="Safety & OISD Compliance Officer">
                          Safety & OISD Compliance Officer
                        </option>
                        <option value="Chemical Automation Specialist">
                          Chemical Automation Specialist
                        </option>
                        <option value="Refinery Operations Lead">Refinery Operations Lead</option>
                        <option value="Full-Stack AI Developer">Full-Stack AI Developer</option>
                      </select>
                      <ChevronDown
                        size={14}
                        className="absolute right-2.5 top-2.5 text-content-tertiary pointer-events-none"
                      />
                    </div>
                  </div>

                  {/* Personal Preferences Textarea */}
                  <div className="py-2 space-y-2">
                    <span className="text-xs sm:text-sm font-normal text-content-primary block">
                      What personal preferences should ZINGO consider in responses?
                    </span>
                    <p className="text-xs text-content-secondary leading-relaxed max-w-xl">
                      These will apply across all your conversations and Projects, unless overridden
                      in a specific Project or style.
                    </p>
                    <textarea
                      rows={5}
                      value={userProfile.personal_preferences || ''}
                      onChange={(e) =>
                        setUserProfile((prev) => ({
                          ...prev,
                          personal_preferences: e.target.value,
                        }))
                      }
                      placeholder="e.g. I'm an engineer working with Python and control systems. Be concise, direct, and verify calculation bounds..."
                      className="w-full mt-2 p-3 bg-elevated border border-border rounded-xl text-xs text-content-primary placeholder-content-tertiary focus:border-border-strong outline-none resize-y leading-relaxed transition-colors font-sans"
                    />
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        className="btn-primary !py-1.5 !px-4 !text-xs"
                      >
                        Save preferences
                      </button>
                    </div>
                  </div>

                  {/* Appearance Section */}
                  <div className="pt-4 border-t border-border">
                    <h2 className="text-base sm:text-lg font-semibold text-content-primary mb-3">
                      Preferences
                    </h2>
                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <span className="text-xs sm:text-sm font-normal text-content-primary">
                        Appearance
                      </span>
                      <div className="inline-flex items-center p-0.5 rounded-lg bg-elevated border border-border">
                        <button
                          type="button"
                          onClick={() => setTheme('system')}
                          className={`p-1.5 px-2.5 rounded-md transition-colors ${
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
                          className={`p-1.5 px-2.5 rounded-md transition-colors ${
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
                          className={`p-1.5 px-2.5 rounded-md transition-colors ${
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
                  </div>

                  {/* Delete Account Section */}
                  <div className="pt-6 border-t border-border space-y-2">
                    <h3 className="text-xs sm:text-sm font-semibold text-content-primary">
                      Delete Account
                    </h3>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-content-secondary">
                        Delete your account and account data
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsDeleteAccountModalOpen(true)}
                        className="px-3.5 py-1.5 rounded-lg border border-danger/40 text-danger hover:bg-danger/10 text-xs font-medium transition-colors"
                      >
                        Delete Account
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* SCREEN 2: CAPABILITIES (SCREENSHOT media_1789707212113.png EXACT REPLICA)  */}
              {/* ========================================================================= */}
              {activeTab === 'capabilities' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                      Capabilities
                    </h2>
                  </div>

                  <div className="divide-y divide-border/60">
                    {/* Artifacts Toggle */}
                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <div className="pr-4 space-y-0.5">
                        <span className="text-xs sm:text-sm font-medium text-content-primary block">
                          Artifacts
                        </span>
                        <p className="text-xs text-content-secondary leading-relaxed">
                          Generate and view standalone engineering content alongside conversations. ZINGO
                          can generate calculation sheets, P&ID visualizers, equipment run-sheets, and code.
                        </p>
                      </div>
                      <Toggle
                        checked={capabilities.artifacts_enabled}
                        onChange={(val) => handleToggleCapability('artifacts_enabled', val)}
                      />
                    </div>

                    {/* Inline Visualizations [BETA] */}
                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <div className="pr-4 space-y-0.5">
                        <span className="text-xs sm:text-sm font-medium text-content-primary block">
                          Inline visualizations <span className="text-[10px] text-accent font-semibold px-1.5 py-0.2 rounded bg-accent/10 border border-accent/20 uppercase tracking-wider ml-1">BETA</span>
                        </span>
                        <p className="text-xs text-content-secondary leading-relaxed">
                          View interactive charts, SVGs, and KaTeX mathematical equations directly in conversations.
                        </p>
                      </div>
                      <Toggle
                        checked={capabilities.inline_visualizations}
                        onChange={(val) => handleToggleCapability('inline_visualizations', val)}
                      />
                    </div>

                    {/* Code execution and file creation */}
                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <div className="pr-4 space-y-0.5">
                        <span className="text-xs sm:text-sm font-medium text-content-primary block">
                          Code execution and file creation
                        </span>
                        <p className="text-xs text-content-secondary leading-relaxed">
                          ZINGO can write and run Python code to solve engineering problems, evaluate thermodynamic equations, and create downloadable files.
                        </p>
                      </div>
                      <Toggle
                        checked={capabilities.code_execution}
                        onChange={(val) => handleToggleCapability('code_execution', val)}
                      />
                    </div>

                    {/* Switch models on flagged messages */}
                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <div className="pr-4 space-y-0.5">
                        <span className="text-xs sm:text-sm font-medium text-content-primary block">
                          Dynamic model routing
                        </span>
                        <p className="text-xs text-content-secondary leading-relaxed">
                          Automatically route engineering queries to specialized models (e.g. Qwen2.5-Coder for calculations, DeepSeek for complex logic) based on task intent.
                        </p>
                      </div>
                      <Toggle
                        checked={capabilities.switch_models_on_flagged}
                        onChange={(val) => handleToggleCapability('switch_models_on_flagged', val)}
                      />
                    </div>
                  </div>

                  {/* Section: Memory */}
                  <div className="pt-2">
                    <h3 className="text-sm sm:text-base font-semibold text-content-primary mb-2">
                      Memory
                    </h3>
                    <div className="divide-y divide-border/60">
                      {/* Generate memory from chats */}
                      <div className="py-3.5 flex items-center justify-between gap-4">
                        <div className="pr-4 space-y-0.5">
                          <span className="text-xs sm:text-sm font-medium text-content-primary block">
                            Generate memory from chats
                          </span>
                          <p className="text-xs text-content-secondary leading-relaxed">
                            ZINGO automatically extracts operational facts and preferences from your conversations into persistent memory.
                          </p>
                        </div>
                        <Toggle
                          checked={capabilities.generate_memory_from_chats}
                          onChange={(val) => handleToggleCapability('generate_memory_from_chats', val)}
                        />
                      </div>

                      {/* Include sensitive topics in memory */}
                      <div className="py-3.5 flex items-center justify-between gap-4">
                        <div className="pr-4 space-y-0.5">
                          <span className="text-xs sm:text-sm font-medium text-content-primary block">
                            Include sensitive topics in memory
                          </span>
                          <p className="text-xs text-content-secondary leading-relaxed">
                            ZINGO can remember sensitive operational observations, audit findings, and plant operating boundaries.
                          </p>
                        </div>
                        <Toggle
                          checked={capabilities.include_sensitive_topics}
                          onChange={(val) => handleToggleCapability('include_sensitive_topics', val)}
                        />
                      </div>

                      {/* Memory files (Clickable Row opening manager) */}
                      <button
                        type="button"
                        onClick={() => setIsMemoryModalOpen(true)}
                        className="w-full py-3.5 flex items-center justify-between gap-4 text-left hover:bg-elevated/40 px-2 -mx-2 rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                      >
                        <div className="pr-4 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-medium text-content-primary block">
                              Memory files
                            </span>
                            <span className="px-1.5 py-0.5 rounded-full bg-elevated border border-border text-[10px] font-mono text-content-secondary">
                              {memoryFiles.length}
                            </span>
                          </div>
                          <p className="text-xs text-content-secondary leading-relaxed">
                            Review what ZINGO has remembered about you and your plant units
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-content-tertiary shrink-0" />
                      </button>
                    </div>
                  </div>

                  {/* Section: Tool access */}
                  <div className="pt-2">
                    <h3 className="text-sm sm:text-base font-semibold text-content-primary mb-2">
                      Tool access
                    </h3>
                    <div className="py-3 flex items-center justify-between">
                      <div className="pr-4 space-y-0.5">
                        <span className="text-xs sm:text-sm font-medium text-content-primary block">
                          Auto
                        </span>
                        <p className="text-xs text-content-secondary leading-relaxed">
                          ZINGO autonomously selects engineering tools and calculators based on your request and plant context.
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs text-accent font-medium px-2.5 py-1 rounded-full bg-accent/10 border border-accent/25">
                        <Check size={12} />
                        <span>Active</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* SCREEN 3: PERMISSIONS (SCREENSHOT media_1789707237834.png EXACT REPLICA)   */}
              {/* ========================================================================= */}
              {activeTab === 'permissions' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                      Permissions
                    </h2>
                    <p className="text-xs text-content-secondary mt-1 leading-relaxed">
                      ZINGO can ask your device for permissions. These can be revoked at any time.
                    </p>
                  </div>

                  <div className="divide-y divide-border/60">
                    {/* Location Permission */}
                    <div className="py-4 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 pr-4">
                          <span className="text-xs sm:text-sm font-medium text-content-primary block">
                            Location
                          </span>
                          <p className="text-xs text-content-secondary leading-relaxed">
                            Give ZINGO access to your plant location for geographically-grounded refinery data and weather contexts.
                          </p>
                          {permissions.location_permitted && (
                            <div className="inline-flex items-center gap-1.5 text-[11px] text-success font-mono bg-success/10 px-2 py-0.5 rounded border border-success/20 mt-1">
                              <MapPin size={12} />
                              <span>{permissions.location_label || 'Location Active'}</span>
                            </div>
                          )}
                        </div>
                        {permissions.location_permitted ? (
                          <button
                            type="button"
                            onClick={handleRevokeLocation}
                            className="px-3 py-1.5 rounded-lg border border-border bg-elevated hover:bg-elevated/80 text-xs font-medium text-content-secondary transition-colors shrink-0"
                          >
                            Revoke access
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleRequestLocation}
                            className="btn-primary !py-1.5 !px-3 !text-xs shrink-0"
                          >
                            Enable location permissions
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Calendar Permission */}
                    <div className="py-4 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 pr-4">
                          <span className="text-xs sm:text-sm font-medium text-content-primary block">
                            Plant Schedule & Turnaround Calendar
                          </span>
                          <p className="text-xs text-content-secondary leading-relaxed">
                            Give ZINGO access to shift handovers, maintenance schedules, and plant turnaround milestones.
                          </p>
                          {permissions.calendar_permitted && (
                            <div className="inline-flex items-center gap-1.5 text-[11px] text-success font-mono bg-success/10 px-2 py-0.5 rounded border border-success/20 mt-1">
                              <Calendar size={12} />
                              <span>Synced: {permissions.calendar_account || 'Shift Handover Roster'}</span>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleCalendar}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-elevated hover:bg-elevated/80 text-xs font-medium text-content-primary transition-colors shrink-0"
                        >
                          <span>{permissions.calendar_permitted ? 'Disconnect Calendar' : 'Sync Shift Calendar'}</span>
                          <ExternalLink size={12} className="text-content-tertiary" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* SCREEN 4: CONNECTORS (SCREENSHOT media_1789707241193.png EXACT REPLICA)    */}
              {/* ========================================================================= */}
              {activeTab === 'connectors' && (
                <div className="space-y-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                        Connectors
                      </h2>
                      <p className="text-xs text-content-secondary mt-1 leading-relaxed">
                        Allow ZINGO to search for information and access live process telemetry from plant systems.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddConnectorModalOpen(true)}
                      className="btn-icon !w-8 !h-8 text-content-secondary hover:text-content-primary border border-border rounded-lg"
                      title="Add custom connector"
                      aria-label="Add custom connector"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  {/* Connector discovery toggle */}
                  <div className="py-3 flex items-center justify-between gap-4 border-b border-border">
                    <div className="pr-4 space-y-0.5">
                      <span className="text-xs sm:text-sm font-medium text-content-primary block">
                        Connector discovery
                      </span>
                      <p className="text-xs text-content-secondary leading-relaxed">
                        Allow ZINGO to recommend relevant plant data sources for your prompt in chat.
                      </p>
                    </div>
                    <Toggle
                      checked={connectorDiscovery}
                      onChange={(val) => setConnectorDiscovery(val)}
                    />
                  </div>

                  {/* Connectors List */}
                  <div className="divide-y divide-border/60">
                    {connectors.map((conn) => {
                      const isConn = conn.status === 'connected'
                      const isBuiltin =
                        conn.connector_key === 'document_library' ||
                        conn.connector_key === 'local_file_upload' ||
                        Boolean(conn.config?.builtin)

                      return (
                        <div key={conn.connector_key} className="py-3.5 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Premium Icon */}
                            <div className="w-9 h-9 rounded-xl bg-elevated border border-border flex items-center justify-center shrink-0">
                              {conn.connector_key === 'document_library' ? (
                                <Database size={18} className="text-accent" />
                              ) : conn.connector_key === 'local_file_upload' ? (
                                <HardDrive size={18} className="text-emerald-400" />
                              ) : conn.connector_key.includes('honeywell') ? (
                                <Radio size={18} className="text-amber-500" />
                              ) : conn.connector_key.includes('aspen') ? (
                                <Activity size={18} className="text-blue-400" />
                              ) : conn.connector_key.includes('sap') ? (
                                <Cpu size={18} className="text-purple-400" />
                              ) : (
                                <Cable size={18} className="text-accent" />
                              )}
                            </div>
                            <div className="truncate">
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-medium text-content-primary">
                                  {conn.name}
                                </span>
                                {isBuiltin ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-success font-medium px-1.5 py-0.2 rounded bg-success/10 border border-success/20">
                                    <Lock size={10} />
                                    <span>Core</span>
                                  </span>
                                ) : (
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      isConn ? 'bg-success' : 'bg-content-tertiary'
                                    }`}
                                    title={isConn ? 'Connected' : 'Disconnected'}
                                  />
                                )}
                              </div>
                              <p className="text-xs text-content-secondary truncate max-w-sm">
                                {conn.description}
                              </p>
                            </div>
                          </div>

                          {isBuiltin ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-content-secondary font-medium px-2.5 py-1 rounded-lg bg-elevated border border-border shrink-0">
                              <Check size={12} className="text-success" />
                              <span>Active</span>
                            </span>
                          ) : isConn ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenConfigureConnector(conn)}
                                className="px-2.5 py-1 rounded-lg border border-border bg-elevated hover:bg-elevated/80 text-xs font-medium text-content-secondary hover:text-content-primary transition-colors"
                              >
                                Configure
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleConnector(conn.connector_key, conn.status)}
                                className="px-2.5 py-1 rounded-lg border border-border bg-elevated hover:bg-danger/10 hover:border-danger/30 hover:text-danger text-xs font-medium text-content-secondary transition-colors"
                              >
                                Disconnect
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenConfigureConnector(conn)}
                              className="btn-primary !py-1.5 !px-3 !text-xs shrink-0"
                            >
                              Configure & Connect
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* TAB: ACCOUNT & ORGANIZATION                                               */}
              {/* ========================================================================= */}
              {activeTab === 'account' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                      Account & Organization
                    </h2>
                  </div>

                  <div className="divide-y divide-border/60 text-xs sm:text-sm">
                    <div className="flex items-center justify-between py-3">
                      <span className="text-content-secondary">User Account</span>
                      <span className="font-mono text-content-primary">{authUser?.email || activeUserId}</span>
                    </div>
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
                        Sovereign Local RTX Inference Node
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <span className="text-content-secondary">Token Allowance</span>
                      <span className="font-medium text-success">
                        Unlimited (100% On-Device Sovereign Air-Gap)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* TAB: PRIVACY & AIR-GAP                                                    */}
              {/* ========================================================================= */}
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
                        ZINGO runs exclusively on private local GPU hardware. 0 bytes of prompts, telemetry, or documents ever leave this computer.
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
                      <span className="font-mono text-xs text-content-primary">Local Storage (Ollama / ChromaDB)</span>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <span className="text-content-secondary">Audit Trail Compliance</span>
                      <span className="font-mono text-xs text-content-primary">OISD-105 Compliant SQLite Log</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* TAB: CONTEXT & CHAT SETTINGS                                              */}
              {/* ========================================================================= */}
              {activeTab === 'memory' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                      Context & Chat Settings
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
                      label="Token streaming"
                      description="Stream responses character by character in real-time"
                      checked={settings.streamingEnabled}
                      onChange={(val) => updateSettings({ streamingEnabled: val })}
                    />
                    <Toggle
                      label="Show source citations panel"
                      description="Allow inspection of referenced documents on assistant responses"
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

              {/* ========================================================================= */}
              {/* TAB: CODE SANDBOX                                                         */}
              {/* ========================================================================= */}
              {activeTab === 'code' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                      AIRA Code Sandbox & Runtime
                    </h2>
                  </div>

                  <p className="text-xs text-content-secondary leading-relaxed">
                    Local Python execution sandbox pre-loaded with scientific computing and thermodynamics libraries:
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

              {/* ========================================================================= */}
              {/* TAB: SKILLS                                                               */}
              {/* ========================================================================= */}
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

              {/* ========================================================================= */}
              {/* TAB: KNOWLEDGE BASE                                                       */}
              {/* ========================================================================= */}
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

              {/* ========================================================================= */}
              {/* TAB: PLUGINS                                                              */}
              {/* ========================================================================= */}
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

              {/* ========================================================================= */}
              {/* TAB: CLUSTER NODES                                                        */}
              {/* ========================================================================= */}
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-content-primary">Laptop 1: Master & Fast Synthesis Node</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20">
                            Qwen3-8B (Document Analysis)
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Qwen3-4B (Fast Conversational)
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
                          placeholder="e.g. http://127.0.0.1:8000"
                          onChange={(e) => setG15Primary(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-content-primary outline-none"
                        />
                        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-surface border border-border">
                          <span className={`w-2 h-2 rounded-full ${server.primaryStatus === 'connected' ? 'bg-success' : 'bg-danger'}`} />
                          <span className="capitalize text-[11px]">{server.primaryStatus || 'online'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Node 1b: Qwen3-4B Fast Synthesis Node */}
                    <div className="p-3.5 rounded-xl bg-elevated border border-border space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-content-primary">Laptop 1: Fast Synthesis Node</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Qwen3-4B (Fast Conversational & General QA)
                          </span>
                        </div>
                        <button
                          onClick={() => checkIndividual('fast4b')}
                          disabled={server.fast4bStatus === 'checking'}
                          className="btn-ghost !py-0.5 !px-2 !text-[11px]"
                        >
                          {server.fast4bStatus === 'checking' ? 'Testing...' : 'Test connection'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={g15Fast4b}
                          placeholder="e.g. https://yoyo-evolve-untimed.ngrok-free.dev"
                          onChange={(e) => setG15Fast4b(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-content-primary outline-none"
                        />
                        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-surface border border-border">
                          <span className={`w-2 h-2 rounded-full ${server.fast4bStatus === 'connected' ? 'bg-success' : 'bg-danger'}`} />
                          <span className="capitalize text-[11px]">{server.fast4bStatus || 'online'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Node 2: Multimodal & Vision Node (Laptop 2) */}
                    <div className="p-3.5 rounded-xl bg-elevated border border-border space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-content-primary">Laptop 2: Multimodal & Vision Node</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            Qwen2.5-VL:3b (Images, Blueprints & Vision)
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
                          placeholder="e.g. https://unfailing-idealism-caretaker.ngrok-free.dev"
                          onChange={(e) => setG15Vision(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-content-primary outline-none"
                        />
                        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-surface border border-border">
                          <span className={`w-2 h-2 rounded-full ${server.visionStatus === 'connected' ? 'bg-success' : 'bg-danger'}`} />
                          <span className="capitalize text-[11px]">{server.visionStatus || 'online'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Node 3: Coder Node */}
                    <div className="p-3.5 rounded-xl bg-elevated border border-border space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-content-primary">Laptop 3: Coder Node</span>
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
                          placeholder="e.g. http://192.168.1.15:11434"
                          onChange={(e) => setG15Coder(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-content-primary outline-none"
                        />
                        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-surface border border-border">
                          <span className={`w-2 h-2 rounded-full ${server.coderStatus === 'connected' ? 'bg-success' : 'bg-danger'}`} />
                          <span className="capitalize text-[11px]">{server.coderStatus || 'offline'}</span>
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
                          placeholder="e.g. http://192.168.1.17:11434"
                          onChange={(e) => setG15Reasoning(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-content-primary outline-none"
                        />
                        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-surface border border-border">
                          <span className={`w-2 h-2 rounded-full ${server.reasoningStatus === 'connected' ? 'bg-success' : 'bg-danger'}`} />
                          <span className="capitalize text-[11px]">{server.reasoningStatus || 'offline'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={checkConnection}
                        disabled={isChecking}
                        className="btn-glass !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
                      >
                        {isChecking && <Spinner size="sm" />}
                        <span>{isChecking ? 'Checking...' : 'Test all nodes'}</span>
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

              {/* ========================================================================= */}
              {/* TAB: SHORTCUTS                                                            */}
              {/* ========================================================================= */}
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

              {/* ========================================================================= */}
              {/* TAB: ABOUT                                                                */}
              {/* ========================================================================= */}
              {activeTab === 'about' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-content-primary">
                      About ZINGO
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
                        <h3 className="text-sm font-semibold text-content-primary">ZINGO Autonomous AI Platform</h3>
                        <p className="text-xs text-content-tertiary">Version 2.0.0 · Sovereign AI for Process Engineering</p>
                      </div>
                    </div>

                    <div className="border-t border-border pt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="p-2 rounded bg-surface border border-border flex justify-between">
                        <span className="text-content-secondary">Stack:</span>
                        <span>React 18 + FastApi</span>
                      </div>
                      <div className="p-2 rounded bg-surface border border-border flex justify-between">
                        <span className="text-content-secondary">Air-Gap:</span>
                        <span className="text-success">100% Enforced</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* SUB-MODAL: MEMORY FILES MANAGER (From Capabilities -> Memory files)       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isMemoryModalOpen}
        onClose={() => {
          setIsMemoryModalOpen(false)
          setEditingMemoryId(null)
          setMemoryTitle('')
          setMemoryContent('')
        }}
        title="Memory files"
        description="Review and manage what ZINGO has remembered about you and your plant across conversations."
        maxWidth="xl"
      >
        <div className="space-y-4 pt-2">
          {/* Controls: Filter & Add New */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-border text-xs">
              {(['all', 'preference', 'project', 'general', 'sensitive'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setMemoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                    memoryFilter === cat
                      ? 'bg-elevated text-content-primary font-medium shadow-xs'
                      : 'text-content-tertiary hover:text-content-primary'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {memoryFiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllMemories}
                  className="px-2.5 py-1 text-xs text-danger hover:bg-danger/10 rounded-lg transition-colors border border-transparent hover:border-danger/30"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Add / Edit Memory Form */}
          <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3">
            <span className="text-xs font-semibold text-content-primary block">
              {editingMemoryId ? 'Edit Memory File' : 'Add Memory File'}
            </span>
            <input
              type="text"
              placeholder="Memory title (e.g. Focus area, equipment specialty...)"
              value={memoryTitle}
              onChange={(e) => setMemoryTitle(e.target.value)}
              className="w-full px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary outline-none"
            />
            <textarea
              rows={3}
              placeholder="Memory content (operating boundaries, equipment notes, focus areas ZINGO will remember)..."
              value={memoryContent}
              onChange={(e) => setMemoryContent(e.target.value)}
              className="w-full p-2.5 bg-elevated border border-border rounded-lg text-xs text-content-primary outline-none resize-none"
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-3 text-xs">
                <select
                  value={memoryCategory}
                  onChange={(e) => setMemoryCategory(e.target.value as any)}
                  className="px-2 py-1 bg-elevated border border-border rounded-md text-xs text-content-primary outline-none"
                >
                  <option value="preference">Preference</option>
                  <option value="project">Project</option>
                  <option value="general">General</option>
                  <option value="sensitive">Sensitive</option>
                </select>
                <label className="inline-flex items-center gap-1.5 text-content-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={memoryIsSensitive}
                    onChange={(e) => setMemoryIsSensitive(e.target.checked)}
                    className="accent-accent"
                  />
                  <span>Mark Sensitive</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                {editingMemoryId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMemoryId(null)
                      setMemoryTitle('')
                      setMemoryContent('')
                    }}
                    className="btn-ghost !py-1 !px-2.5 !text-xs"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveMemoryFile}
                  className="btn-primary !py-1 !px-3 !text-xs"
                >
                  {editingMemoryId ? 'Update Memory' : 'Save to Memory'}
                </button>
              </div>
            </div>
          </div>

          {/* List of Memory Files */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {filteredMemories.length === 0 ? (
              <div className="text-center py-8 text-content-tertiary text-xs">
                No memory files found for this filter.
              </div>
            ) : (
              filteredMemories.map((mem) => (
                <div
                  key={mem.id}
                  className="p-3 rounded-xl bg-elevated border border-border flex items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-content-primary truncate">{mem.title}</span>
                      <span className="px-1.5 py-0.2 rounded bg-surface border border-border text-[10px] text-content-tertiary uppercase font-mono">
                        {mem.category}
                      </span>
                      {mem.is_sensitive && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono">
                          sensitive
                        </span>
                      )}
                    </div>
                    <p className="text-content-secondary leading-relaxed whitespace-pre-wrap">
                      {mem.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMemoryId(mem.id)
                        setMemoryTitle(mem.title)
                        setMemoryContent(mem.content)
                        setMemoryCategory(mem.category)
                        setMemoryIsSensitive(mem.is_sensitive)
                      }}
                      className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
                      title="Edit"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemoryFile(mem.id)}
                      className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-danger"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* SUB-MODAL: MODEL IDENTITY PROMPT INSPECTOR                                */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isIdentityPromptModalOpen}
        onClose={() => setIsIdentityPromptModalOpen(false)}
        title="Active Model Identity Injection"
        description="This exact structured context is injected into the model's system prompt on every chat turn."
        maxWidth="2xl"
      >
        <div className="space-y-3 pt-2">
          {isFetchingPrompt ? (
            <div className="flex items-center justify-center p-8">
              <Spinner size="md" />
            </div>
          ) : (
            <div className="relative">
              <pre className="p-4 rounded-xl bg-black/70 border border-border text-[11px] font-mono text-emerald-400 max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                {modelIdentityPrompt || 'No identity prompt configured.'}
              </pre>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-content-tertiary">
            <span>Dynamic compilation from SQLite tables</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(modelIdentityPrompt)
                addToast({ type: 'success', message: 'Identity prompt copied to clipboard.' })
              }}
              className="btn-ghost !py-1 !px-2.5 !text-xs"
            >
              Copy Prompt
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* SUB-MODAL: DELETE ACCOUNT CONFIRMATION                                    */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isDeleteAccountModalOpen}
        onClose={() => setIsDeleteAccountModalOpen(false)}
        title="Delete Account & Local Identity"
        description="Are you sure you want to permanently delete your account?"
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-xs text-danger space-y-1">
            <span className="font-semibold block">Warning: Irreversible Action</span>
            <p>
              This will erase your stored profile preferences, all remembered memory files, and reset your local identity back to default.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsDeleteAccountModalOpen(false)}
              className="btn-ghost !py-1.5 !px-3 !text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteAccount}
              className="px-3.5 py-1.5 rounded-lg bg-danger text-white text-xs font-medium hover:bg-danger/90 transition-colors"
            >
              Confirm Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* SUB-MODAL: ADD CUSTOM CONNECTOR                                           */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddConnectorModalOpen}
        onClose={() => setIsAddConnectorModalOpen(false)}
        title="Add Custom Connector"
        description="Connect ZINGO to a custom internal API, process historian, or plant data service."
        maxWidth="md"
      >
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-xs text-content-secondary mb-1 block">Connector Name</label>
            <input
              type="text"
              placeholder="e.g. Lab Information Management System (LIMS)"
              value={customConnName}
              onChange={(e) => setCustomConnName(e.target.value)}
              className="w-full px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-content-secondary mb-1 block">Connector Key / ID</label>
            <input
              type="text"
              placeholder="e.g. lims_system"
              value={customConnKey}
              onChange={(e) => setCustomConnKey(e.target.value)}
              className="w-full px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary font-mono outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-content-secondary mb-1 block">Description</label>
            <input
              type="text"
              placeholder="e.g. Daily laboratory distillation quality specs and Reid vapor pressure"
              value={customConnDesc}
              onChange={(e) => setCustomConnDesc(e.target.value)}
              className="w-full px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary outline-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setIsAddConnectorModalOpen(false)}
              className="btn-ghost !py-1.5 !px-3 !text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddCustomConnector}
              className="btn-primary !py-1.5 !px-3.5 !text-xs"
            >
              Add Connector
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* SUB-MODAL: CONFIGURE & TEST INDUSTRIAL CONNECTOR                          */}
      {/* ========================================================================= */}
      <Modal
        isOpen={Boolean(configConnector)}
        onClose={() => setConfigConnector(null)}
        title={`Configure ${configConnector?.name || 'Connector'}`}
        description="Configure endpoint URL and authentication for live data ingestion and telemetry."
        maxWidth="md"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-content-secondary mb-1 block">
              {configConnector?.connector_key.includes('honeywell')
                ? 'OPC UA Server Endpoint (TCP)'
                : 'REST API Base URL'}
            </label>
            <input
              type="text"
              placeholder={
                configConnector?.connector_key === 'aspen_ip21'
                  ? 'http://192.168.1.110:8080'
                  : configConnector?.connector_key === 'honeywell_dcs'
                  ? 'opc.tcp://192.168.1.100:4840'
                  : 'http://localhost:8080'
              }
              value={configEndpoint}
              onChange={(e) => setConfigEndpoint(e.target.value)}
              className="w-full px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary font-mono outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-content-secondary mb-1 block">
              API Key / Auth Token (Optional)
            </label>
            <input
              type="password"
              placeholder="Leave blank if using open LAN / Windows Integrated Auth"
              value={configApiKey}
              onChange={(e) => setConfigApiKey(e.target.value)}
              className="w-full px-3 py-1.5 bg-elevated border border-border rounded-lg text-xs text-content-primary outline-none"
            />
          </div>

          {/* Test Connection Button & Live Result Banner */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleTestConnector}
              disabled={isTestingConn}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-border bg-elevated hover:bg-elevated/80 text-xs font-medium text-content-primary transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isTestingConn ? <Spinner size="sm" /> : <RefreshCw size={13} />}
              <span>{isTestingConn ? 'Probing host & port...' : 'Test Connection'}</span>
            </button>

            {testResult && (
              <div
                className={`mt-2.5 p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                  testResult.reachable
                    ? 'bg-success/10 border-success/30 text-success'
                    : 'bg-danger/10 border-danger/30 text-danger'
                }`}
              >
                {testResult.reachable ? (
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-semibold block">
                    {testResult.reachable ? 'Host Reachable' : 'Connection Failed'}
                  </span>
                  <span className="text-[11px] opacity-90 block">
                    {testResult.reachable
                      ? `Latency: ${testResult.latency_ms}ms — verified ready for live telemetry.`
                      : testResult.error}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setConfigConnector(null)}
              className="btn-ghost !py-1.5 !px-3 !text-xs"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              {configConnector?.status === 'connected' && (
                <button
                  type="button"
                  onClick={() => handleSaveConnectorConfig('disconnected')}
                  className="px-3 py-1.5 rounded-lg border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 text-xs font-medium transition-colors"
                >
                  Disconnect
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSaveConnectorConfig('connected')}
                className="btn-primary !py-1.5 !px-3.5 !text-xs"
              >
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
