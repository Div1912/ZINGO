import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  X,
  Pin,
  MoreVertical,
  Edit2,
  Trash2,
  Download,
  Settings as SettingsIcon,
  Sun,
  Moon,
  PanelLeftClose,
  MessageSquare,
  Loader2,
  LogIn,
  LogOut,
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useServerStore } from '../../stores/serverStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAuthStore } from '../../stores/authStore'
import { useArtifactStore } from '../../stores/artifactStore'
import { useTheme } from '../../hooks/useTheme'
import { Dropdown } from '../ui/Dropdown'
import { exportChatToMarkdown } from '../../services/storage'
import { useToastStore } from '../../stores/toastStore'
import type { Chat } from '../../types'

interface SidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (collapsed: boolean) => void
  isMobileOpen: boolean
  setIsMobileOpen: (open: boolean) => void
  onOpenSettings?: (tab?: string) => void
  onOpenCodeRunner?: () => void
  onOpenProjects?: () => void
  onOpenArtifacts?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
  onOpenSettings,
  onOpenCodeRunner,
  onOpenProjects,
  onOpenArtifacts,
}) => {
  const navigate = useNavigate()
  const {
    chats,
    activeChatId,
    createChat,
    setActiveChat,
    pinChat,
    renameChat,
    deleteChat,
    isChatGenerating,
    isLoadingChats,
    seedSampleChats,
  } = useChatStore()

  const { server } = useServerStore()
  const { settings } = useSettingsStore()
  const { theme, toggleTheme } = useTheme()
  const { addToast } = useToastStore()
  const { isViewerOpen, artifacts } = useArtifactStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  // Filter chats: ONLY chats with messages appear in the history list
  const validChats = useMemo(() => {
    return chats.filter((c) => c.messages && c.messages.length > 0)
  }, [chats])

  // Filter valid chats by query
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return validChats
    const q = searchQuery.toLowerCase()
    return validChats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    )
  }, [validChats, searchQuery])

  // Group chats by date
  const groupedChats = useMemo(() => {
    const pinned: Chat[] = []
    const today: Chat[] = []
    const yesterday: Chat[] = []
    const thisWeek: Chat[] = []
    const older: Chat[] = []

    const now = new Date()
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterdayMidnight = todayMidnight - 86400000
    const weekAgo = todayMidnight - 86400000 * 6

    filteredChats.forEach((chat) => {
      if (chat.pinned) {
        pinned.push(chat)
        return
      }
      const chatTime = new Date(chat.updatedAt || chat.createdAt).getTime()
      if (chatTime >= todayMidnight) {
        today.push(chat)
      } else if (chatTime >= yesterdayMidnight) {
        yesterday.push(chat)
      } else if (chatTime >= weekAgo) {
        thisWeek.push(chat)
      } else {
        older.push(chat)
      }
    })

    return { pinned, today, yesterday, thisWeek, older }
  }, [filteredChats])

  const handleStartNewChat = () => {
    const newId = createChat()
    navigate(`/app/chat/${newId}`)
    setIsMobileOpen(false)
  }

  const handleSelectChat = (id: string) => {
    setActiveChat(id)
    navigate(`/app/chat/${id}`)
    setIsMobileOpen(false)
  }

  const startRenaming = (chat: Chat) => {
    setEditingChatId(chat.id)
    setEditTitle(chat.title)
  }

  const saveRenaming = (id: string) => {
    if (editTitle.trim()) {
      renameChat(id, editTitle.trim())
    }
    setEditingChatId(null)
  }

  const { user, profile, signOut, openAuthModal } = useAuthStore()

  const isServerOnline = server.connectionStatus === 'connected'
  const displayName = profile?.display_name || user?.email?.split('@')[0] || settings.userName || 'Guest Engineer'
  const userInitial = displayName.trim().charAt(0).toUpperCase() || 'G'
  const userSubtext = user?.email || 'MRPL Sovereign Hub'

  const renderChatItem = (chat: Chat) => {
    const isActive = chat.id === activeChatId
    const isEditing = editingChatId === chat.id
    const isGenerating = isChatGenerating(chat.id)

    return (
      <div
        key={chat.id}
        onDoubleClick={() => startRenaming(chat)}
        onClick={() => !isEditing && handleSelectChat(chat.id)}
        className={`group relative h-9 flex items-center gap-2.5 px-3 rounded-lg cursor-pointer transition-colors select-none text-xs ${
          isActive
            ? 'bg-elevated text-content-primary font-medium shadow-xs'
            : 'text-content-secondary hover:bg-elevated/60 hover:text-content-primary'
        }`}
      >
        <MessageSquare size={13} className="shrink-0 text-content-tertiary group-hover:text-content-secondary" />

        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => saveRenaming(chat.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveRenaming(chat.id)
              if (e.key === 'Escape') setEditingChatId(null)
            }}
            autoFocus
            className="flex-1 bg-surface border border-border px-1.5 py-0.5 rounded text-xs text-content-primary outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">
            {chat.title || 'New conversation'}
          </span>
        )}

        {/* Generating indicator */}
        {isGenerating && !isEditing && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-medium shrink-0 animate-pulse select-none"
            title="AIRA is generating in this conversation..."
          >
            <Loader2 size={10} className="animate-spin" />
            <span>AI active</span>
          </span>
        )}

        {/* Pin icon indicator if pinned */}
        {chat.pinned && !isEditing && (
          <Pin size={11} className="shrink-0 text-content-tertiary" />
        )}

        {/* Kebab action dropdown */}
        <div
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Dropdown
            trigger={
              <button
                className="btn-icon !w-6 !h-6 sm:!w-5 sm:!h-5 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-content-tertiary hover:text-content-primary"
                aria-label="Chat options"
              >
                <MoreVertical size={13} />
              </button>
            }
            items={[
              {
                id: 'rename',
                label: 'Rename',
                icon: <Edit2 size={13} />,
                onClick: () => startRenaming(chat),
              },
              {
                id: 'pin',
                label: chat.pinned ? 'Unpin' : 'Pin to top',
                icon: <Pin size={13} />,
                onClick: () => {
                  pinChat(chat.id)
                  addToast({
                    type: 'info',
                    message: chat.pinned ? 'Chat unpinned' : 'Chat pinned to top',
                  })
                },
              },
              {
                id: 'export',
                label: 'Export Markdown',
                icon: <Download size={13} />,
                onClick: () => {
                  exportChatToMarkdown(chat)
                  addToast({
                    type: 'success',
                    message: 'Chat exported to Markdown file',
                  })
                },
              },
              {
                id: 'delete',
                label: 'Delete',
                danger: true,
                icon: <Trash2 size={13} />,
                onClick: () => {
                  deleteChat(chat.id)
                  addToast({
                    type: 'info',
                    message: 'Chat deleted',
                  })
                },
              },
            ]}
          />
        </div>
      </div>
    )
  }

  const renderSection = (title: string, items: Chat[]) => {
    if (items.length === 0) return null
    return (
      <div className="mb-3">
        <div className="px-3 py-1 text-[10px] font-mono font-semibold tracking-wider text-content-tertiary uppercase">
          {title}
        </div>
        <div className="space-y-0.5 mt-0.5">{items.map(renderChatItem)}</div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-200"
        />
      )}

      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 flex flex-col bg-surface/95 dark:bg-[#111111]/95 backdrop-blur-xl border-r border-black/[0.06] dark:border-white/[0.06] transition-transform lg:transition-all duration-200 ease-in-out shrink-0 ${
          isMobileOpen
            ? 'translate-x-0 w-[280px] max-w-[85vw] opacity-100 pointer-events-auto shadow-2xl visible'
            : '-translate-x-full w-[280px] opacity-0 pointer-events-none invisible'
        } ${
          isCollapsed
            ? 'lg:w-0 lg:translate-x-0 lg:overflow-hidden lg:border-r-0 lg:p-0 lg:pointer-events-none lg:opacity-0 lg:visible'
            : 'lg:w-64 lg:translate-x-0 lg:opacity-100 lg:pointer-events-auto lg:overflow-visible lg:visible'
        }`}
      >
        {/* Compact Header with Branding & Sidebar Toggle */}
        <div className="h-12 flex items-center justify-between px-3 shrink-0">
          <div
            onClick={() => navigate('/app')}
            className="flex items-center gap-2 overflow-hidden text-content-primary cursor-pointer select-none"
          >
            <div className="w-6 h-6 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center shrink-0">
              <svg
                className="w-3.5 h-3.5 text-content-primary"
                viewBox="0 0 100 100"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
              >
                <polygon points="50,6 90,29 90,75 50,98 10,75 10,29" />
              </svg>
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="font-semibold text-xs tracking-tight">AIRA</span>
                <span className="text-[10px] text-content-tertiary font-mono tracking-wider">
                  MRPL
                </span>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="hidden lg:flex btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
            aria-label="Collapse sidebar"
            title="Collapse sidebar (⌘B)"
          >
            <PanelLeftClose size={15} />
          </button>

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-content-tertiary hover:text-content-primary hover:bg-elevated transition-colors"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* TOP NAVIGATION SECTION */}
        <div className="p-3 pb-2 space-y-1 shrink-0">
          {(!isCollapsed || isMobileOpen) ? (
            <>
              {/* + New Button */}
              <button
                type="button"
                onClick={handleStartNewChat}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-content-primary text-sm font-medium transition-all cursor-pointer mb-1 shadow-none border-none"
              >
                <Plus size={16} strokeWidth={2.2} className="text-content-primary" />
                <span>New</span>
              </button>

              {/* Projects Item */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileOpen(false)
                  if (onOpenProjects) onOpenProjects()
                  else addToast({ type: 'info', title: 'Refinery Projects', message: 'Active workspaces: CDU-2 Revamp, VDU Revamp, OISD PTW Audit' })
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-elevated/60 transition-colors border-none bg-transparent cursor-pointer text-left font-normal"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-content-tertiary"
                >
                  <line x1="7" y1="5" x2="17" y2="5" />
                  <line x1="5" y1="8" x2="19" y2="8" />
                  <path d="M4 11h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7z" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
                <span>Projects</span>
              </button>

              {/* Artifacts Item */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileOpen(false)
                  if (onOpenArtifacts) onOpenArtifacts()
                  else addToast({ type: 'info', title: 'Generated Artifacts', message: 'Access generated Python models, P&ID scripts, and checklists.' })
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors border-none cursor-pointer text-left font-normal ${
                  isViewerOpen
                    ? 'text-violet-300 bg-violet-600/15 border border-violet-500/30'
                    : 'text-content-secondary hover:text-content-primary hover:bg-elevated/60 bg-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 ${isViewerOpen ? 'text-violet-400' : 'text-content-tertiary'}`}
                  >
                    <circle cx="8" cy="14" r="4.5" />
                    <path d="M8 5.5a4.5 4.5 0 0 0-4.5 4.5c0 1.8 1.1 3.3 2.7 4" />
                    <rect x="13.5" y="9" width="7" height="10" rx="1" />
                    <ellipse cx="17" cy="9" rx="3.5" ry="1.5" />
                  </svg>
                  <span>Artifacts</span>
                </div>
                {artifacts.length > 0 && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                      isViewerOpen ? 'bg-violet-500/30 text-violet-200' : 'bg-surface text-content-tertiary'
                    }`}
                  >
                    {artifacts.length}
                  </span>
                )}
              </button>

              {/* Code Item with [Upgrade] pill */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileOpen(false)
                  if (onOpenCodeRunner) onOpenCodeRunner()
                  else addToast({ type: 'info', title: 'Code Runtime', message: 'G15 #2 Python 3.11 sandbox available.' })
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-elevated/60 transition-colors border-none bg-transparent cursor-pointer text-left font-normal"
              >
                <div className="flex items-center gap-3">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-content-tertiary"
                  >
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  <span>Code</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[#4d8eff] dark:text-[#60a5fa] text-[11px] font-medium">
                  Upgrade
                </span>
              </button>

              {/* Customize Item */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileOpen(false)
                  if (onOpenSettings) onOpenSettings('skills')
                  else navigate('/app/settings')
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-elevated/60 transition-colors border-none bg-transparent cursor-pointer text-left font-normal"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-content-tertiary"
                >
                  <rect x="3" y="7" width="18" height="13" rx="2" />
                  <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <path d="M10 12v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2" />
                </svg>
                <span>Customize</span>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={handleStartNewChat}
                className="btn-icon !w-9 !h-9 bg-elevated text-content-primary rounded-xl"
                title="New Chat"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => onOpenProjects ? onOpenProjects() : addToast({ type: 'info', message: 'Projects' })}
                className="btn-icon !w-8 !h-8 text-content-tertiary hover:text-content-primary"
                title="Projects"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="7" y1="5" x2="17" y2="5" />
                  <line x1="5" y1="8" x2="19" y2="8" />
                  <path d="M4 11h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7z" />
                </svg>
              </button>
              <button
                onClick={() => onOpenArtifacts ? onOpenArtifacts() : addToast({ type: 'info', message: 'Artifacts' })}
                className={`btn-icon !w-8 !h-8 ${isViewerOpen ? 'text-violet-300 bg-violet-600/20 border border-violet-500/30' : 'text-content-tertiary hover:text-content-primary'}`}
                title="Artifacts"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="8" cy="14" r="4.5" />
                  <rect x="13.5" y="9" width="7" height="10" rx="1" />
                </svg>
              </button>
              <button
                onClick={() => onOpenCodeRunner ? onOpenCodeRunner() : addToast({ type: 'info', message: 'Code Runtime' })}
                className="btn-icon !w-8 !h-8 text-content-tertiary hover:text-content-primary"
                title="Code Sandbox"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </button>
              <button
                onClick={() => onOpenSettings ? onOpenSettings('skills') : navigate('/app/settings')}
                className="btn-icon !w-8 !h-8 text-content-tertiary hover:text-content-primary"
                title="Customize"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="7" width="18" height="13" rx="2" />
                  <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Clean Spacing */}
        {(!isCollapsed || isMobileOpen) && (
          <div className="my-1 shrink-0" />
        )}

        {/* Search Bar */}
        {(!isCollapsed || isMobileOpen) && (
          <div className="px-3 py-1 shrink-0">
            <div className="relative flex items-center">
              <Search
                size={13}
                className="absolute left-2.5 text-content-tertiary pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full py-1.5 pl-8 pr-7 text-xs bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.06] rounded-lg text-content-primary placeholder-content-tertiary focus:border-black/20 dark:focus:border-white/20 outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-content-tertiary hover:text-content-primary"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Chat History */}
        <div className="flex-1 overflow-y-auto px-2 py-1 select-none">
          {(!isCollapsed || isMobileOpen) ? (
            <>
              {renderSection('PINNED', groupedChats.pinned)}
              {renderSection('TODAY', groupedChats.today)}
              {renderSection('YESTERDAY', groupedChats.yesterday)}
              {renderSection('THIS WEEK', groupedChats.thisWeek)}
              {renderSection('OLDER', groupedChats.older)}

              {isLoadingChats && (
                <div className="p-4 text-center text-xs text-content-tertiary flex flex-col items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  <span>Syncing your chats...</span>
                </div>
              )}

              {!isLoadingChats && filteredChats.length === 0 && (
                <div className="p-4 text-center text-xs text-content-tertiary space-y-2">
                  <p>{searchQuery ? 'No matching chats found' : 'No conversations yet'}</p>
                  {!searchQuery && (
                    <button
                      type="button"
                      onClick={() => seedSampleChats()}
                      className="text-[11px] text-accent hover:underline block mx-auto mt-1 cursor-pointer"
                    >
                      Load sample refinery SOPs
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              {chats.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectChat(c.id)}
                  title={c.title}
                  className={`btn-icon !w-9 !h-9 ${
                    c.id === activeChatId ? 'bg-elevated text-content-primary' : 'text-content-tertiary'
                  }`}
                >
                  <MessageSquare size={16} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Bar: Profile Card, Settings, Theme Toggle, Server Status */}
        <div className="p-2 shrink-0 space-y-1">
          {(!isCollapsed || isMobileOpen) ? (
            <>
              {/* User Profile & Settings Row */}
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors">
                <div
                  onClick={() => {
                    setIsMobileOpen(false)
                    if (onOpenSettings) onOpenSettings('general')
                    else navigate('/app/settings')
                  }}
                  className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
                >
                  <div className="w-7 h-7 rounded-full bg-black/[0.06] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] text-content-primary flex items-center justify-center font-semibold text-xs shrink-0 select-none">
                    {userInitial}
                  </div>
                  <div className="truncate flex-1">
                    <span className="text-xs font-medium text-content-primary block truncate">
                      {displayName}
                    </span>
                    <span className="text-[10px] text-content-tertiary block truncate">
                      {userSubtext}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileOpen(false)
                      if (onOpenSettings) onOpenSettings('general')
                      else navigate('/app/settings')
                    }}
                    className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
                    title="Settings (⌘,)"
                  >
                    <SettingsIcon size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
                    title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                  >
                    {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  </button>
                  {user ? (
                    <button
                      type="button"
                      onClick={() => signOut()}
                      className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-danger transition-colors"
                      title="Sign out of Supabase session"
                    >
                      <LogOut size={13} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openAuthModal('signin')}
                      className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-accent transition-colors"
                      title="Sign in with Supabase"
                    >
                      <LogIn size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Server Online Status Pill */}
              <div className="flex items-center justify-between px-2.5 py-1 text-[11px] text-content-secondary">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isServerOnline ? 'bg-success' : 'bg-danger'
                    }`}
                  />
                  <span className="text-[10px] font-medium">
                    {isServerOnline ? 'Qwen Online' : 'Offline'}
                  </span>
                </span>
                <span className="font-mono text-[9px] text-content-tertiary">
                  Tunnel
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-1">
              <button
                type="button"
                onClick={() => (onOpenSettings ? onOpenSettings('general') : navigate('/app/settings'))}
                className="w-7 h-7 rounded-full bg-[#262626] border border-border text-content-primary flex items-center justify-center font-semibold text-xs"
                title="Settings (⌘,)"
              >
                {userInitial}
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="btn-icon !w-7 !h-7 text-content-secondary hover:text-content-primary"
                title="Toggle Theme"
              >
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              </button>
              <div
                className={`w-2 h-2 rounded-full my-0.5 ${
                  isServerOnline ? 'bg-success' : 'bg-danger'
                }`}
                title={isServerOnline ? 'Qwen Model Connected' : 'Disconnected'}
              />
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
