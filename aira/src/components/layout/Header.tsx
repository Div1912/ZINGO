import React, { useState } from 'react'
import {
  Menu,
  PanelLeft,
  Download,
  Share2,
  MoreHorizontal,
  Trash2,
  Code2,
  Copy,
  Archive,
  Printer,
  FileText,
  FileJson,
  Check,
  Plus,
  FolderKanban,
  ChevronDown,
  Bell,
  CheckCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useChatStore } from '../../stores/chatStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useToastStore } from '../../stores/toastStore'
import { useArtifactStore } from '../../stores/artifactStore'
import { Dropdown } from '../ui/Dropdown'
import { zingoApi, type RoleNotification } from '../../services/zingoApi'
import {
  exportChatToMarkdown,
  exportChatToJson,
  copyChatTranscript,
} from '../../services/storage'
import { exportChatToPdf } from '../../services/pdfExport'
import { Modal } from '../ui/Modal'

interface HeaderProps {
  onToggleSidebar: () => void
  isSidebarCollapsed?: boolean
  isMobileSidebarOpen?: boolean
  onNewChat?: () => void
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  isSidebarCollapsed,
  isMobileSidebarOpen,
  onNewChat,
}) => {
  const { chats, activeChatId, renameChat, clearChat, deleteChat } = useChatStore()
  const { projects, activeProjectId, setActiveProject } = useProjectStore()
  const { addToast } = useToastStore()
  const { settings } = useSettingsStore()
  const { artifacts, activeArtifactId, isViewerOpen, openArtifact, closeArtifact } = useArtifactStore()

  const activeProject = projects.find((p) => p.id === activeProjectId)
  const currentChat = chats.find((c) => c.id === activeChatId)
  const hasMessages = Boolean(currentChat && currentChat.messages && currentChat.messages.length > 0)

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [isRawJsonOpen, setIsRawJsonOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [notifications, setNotifications] = useState<RoleNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const navigate = useNavigate()

  const fetchNotifs = async () => {
    try {
      const res = await zingoApi.notifications({ limit: 10 })
      setNotifications(res.notifications || [])
      setUnreadCount(res.unread || 0)
    } catch {
      // ignore
    }
  }

  React.useEffect(() => {
    fetchNotifs()
    const interval = setInterval(fetchNotifs, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleMarkAllRead = async () => {
    try {
      await zingoApi.markAllNotificationsRead()
      setUnreadCount(0)
      fetchNotifs()
    } catch {
      // ignore
    }
  }

  const handleStartRename = () => {
    if (!currentChat) return
    setTitleInput(currentChat.title)
    setIsEditingTitle(true)
  }

  const handleSaveRename = () => {
    if (currentChat && titleInput.trim()) {
      renameChat(currentChat.id, titleInput.trim())
    }
    setIsEditingTitle(false)
  }

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      addToast({
        type: 'success',
        title: 'Link Copied',
        message: 'Internal sovereign link copied to clipboard.',
      })
    } catch {
      addToast({
        type: 'info',
        message: 'Internal session address ready for sharing.',
      })
    }
  }

  return (
    <>
      <header
        className={`h-[52px] px-3 sm:px-4 flex items-center justify-between gap-3 shrink-0 transition-colors border-b border-border/50 bg-surface/85 dark:bg-page/85 backdrop-blur-md z-30`}
      >
        {/* Left: Sidebar Toggle, Mobile Branding, & Chat Title */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`btn-icon !w-8 !h-8 text-content-secondary hover:text-content-primary rounded-lg transition-colors inline-flex ${
              !isSidebarCollapsed ? 'lg:hidden' : 'lg:inline-flex'
            }`}
            aria-label="Toggle sidebar (⌘B)"
            aria-expanded={isMobileSidebarOpen}
            title="Toggle sidebar (⌘B)"
          >
            <span className="flex lg:hidden items-center justify-center">
              <Menu size={18} />
            </span>
            <span className="hidden lg:flex items-center justify-center">
              <PanelLeft size={18} />
            </span>
          </button>

          {/* Mobile brand badge when no conversation has messages */}
          {!hasMessages && (
            <div className="flex lg:hidden items-center gap-2 select-none">
              <div className="w-5 h-5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center shrink-0">
                <svg
                  className="w-3 h-3 text-content-primary"
                  viewBox="0 0 100 100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="10"
                >
                  <polygon points="50,6 90,29 90,75 50,98 10,75 10,29" />
                </svg>
              </div>
              <span className="font-semibold text-xs text-content-primary tracking-tight">AIRA</span>
              <span className="text-[10px] text-content-tertiary font-mono">Qwen</span>
            </div>
          )}

          {hasMessages && (
            isEditingTitle ? (
              <div className="flex items-center gap-1.5 max-w-sm">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={handleSaveRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename()
                    if (e.key === 'Escape') setIsEditingTitle(false)
                  }}
                  autoFocus
                  className="input !py-1 !px-2 !text-xs !bg-elevated"
                />
                <button
                  onClick={handleSaveRename}
                  className="btn-icon !w-6 !h-6 text-success hover:bg-success/10"
                >
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <div
                onClick={handleStartRename}
                className="cursor-pointer group flex items-center gap-1.5 min-w-0"
                title="Click to rename"
              >
                <h2 className="text-xs sm:text-sm font-medium text-content-primary truncate tracking-tight">
                  {currentChat?.title || 'New conversation'}
                </h2>
                <span className="text-[10px] text-content-tertiary opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
                  (rename)
                </span>
              </div>
            )
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Active Project Workspace Dropdown Selector */}
          <Dropdown
            trigger={
              <button
                type="button"
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                  activeProject
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-surface text-content-secondary hover:text-content-primary border border-border'
                }`}
                title="Switch Active Project Context"
              >
                <FolderKanban size={13} className={activeProject ? 'text-accent' : 'text-content-tertiary'} />
                <span className="max-w-[120px] sm:max-w-[150px] truncate hidden xs:inline">
                  {activeProject ? activeProject.title : 'General Workspace'}
                </span>
                <ChevronDown size={11} className="opacity-70" />
              </button>
            }
            items={[
              {
                id: 'general',
                label: 'General Workspace (No Project)',
                icon: <FolderKanban size={13} />,
                onClick: () => {
                  setActiveProject(null)
                  addToast({ type: 'info', message: 'Switched to General Workspace' })
                },
              },
              ...projects.map((p) => ({
                id: p.id,
                label: p.title,
                icon: <FolderKanban size={13} />,
                onClick: () => {
                  setActiveProject(p.id)
                  addToast({ type: 'success', message: `Active workspace: ${p.title}` })
                },
              })),
            ]}
          />
          {/* Quick Mobile New Chat Button */}
          {onNewChat && (
            <button
              type="button"
              onClick={onNewChat}
              className="lg:hidden btn-icon !w-8 !h-8 text-content-secondary hover:text-content-primary rounded-lg"
              title="New chat"
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>
          )}

          {/* Artifact Side Panel Toggle (Claude Style) */}
          {artifacts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (isViewerOpen) {
                  closeArtifact()
                } else {
                  const chatArtifacts = activeChatId ? artifacts.filter((a) => a.chatId === activeChatId) : []
                  const target = chatArtifacts[0] || (activeArtifactId && artifacts.find((a) => a.id === activeArtifactId)) || artifacts[0]
                  if (target) openArtifact(target.id)
                }
              }}
              className={`btn-glass !py-1 !px-2.5 !text-xs flex items-center gap-1.5 transition ${
                isViewerOpen
                  ? 'text-violet-200 border-violet-500/50 bg-violet-600/20 shadow-xs'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
              title="Toggle Artifact Workspace Side Panel"
            >
              <Sparkles size={13} className={isViewerOpen ? 'text-violet-400' : 'text-content-tertiary'} />
              <span className="hidden sm:inline">Artifacts</span>
              <span className="px-1 py-0.2 rounded text-[10px] font-mono bg-surface border border-border">
                {artifacts.filter((a) => !activeChatId || a.chatId === activeChatId).length || artifacts.length}
              </span>
            </button>
          )}

          {/* Role Notification Dispatch Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="btn-icon !w-8 !h-8 text-content-secondary hover:text-content-primary relative"
              title="Engineer Role Notifications"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 top-10 z-50 w-80 sm:w-96 rounded-2xl bg-surface border border-border p-3 space-y-2 shadow-2xl animate-in fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-border text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-content-primary">
                    <Bell size={13} className="text-accent" />
                    <span>Role Notifications ({unreadCount} unread)</span>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[11px] text-content-tertiary hover:text-accent flex items-center gap-1"
                    >
                      <CheckCheck size={12} />
                      <span>Mark all read</span>
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-content-tertiary">
                      No notifications dispatched.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={async () => {
                          await zingoApi.markNotificationRead(n.id)
                          setIsNotifOpen(false)
                          if (n.action_note_id) {
                            navigate('/app/action-notes')
                          } else {
                            navigate('/app/alerts')
                          }
                        }}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer text-xs space-y-1 ${
                          n.status === 'UNREAD'
                            ? 'bg-accent/10 border-accent/30'
                            : 'bg-elevated/40 border-border/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-content-primary truncate">{n.title}</span>
                          <span className="text-[10px] font-mono uppercase text-accent shrink-0">
                            {n.recipient_role}
                          </span>
                        </div>
                        <p className="text-xs text-content-secondary line-clamp-2">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {hasMessages && (
            <>
              {/* Share Button */}
              <button
                onClick={handleShare}
                className="btn-ghost !py-1.5 !px-2.5 !text-xs hidden sm:inline-flex items-center gap-1.5"
                title="Share session link"
              >
                <Share2 size={13} />
                <span>Share</span>
              </button>

            {/* Export Dropdown */}
            <Dropdown
              trigger={
                <button className="btn-glass !py-1.5 !px-3 !text-xs !rounded-md flex items-center gap-1.5">
                  <Download size={13} />
                  <span className="hidden sm:inline">Export</span>
                </button>
              }
              items={[
                {
                  id: 'export-md',
                  label: 'Export as Markdown (.md)',
                  icon: <FileText size={13} />,
                  onClick: () => {
                    if (currentChat) {
                      exportChatToMarkdown(currentChat)
                      addToast({
                        type: 'success',
                        message: 'Markdown document downloaded successfully.',
                      })
                    }
                  },
                },
                {
                  id: 'export-pdf',
                  label: 'Print / Export as PDF',
                  icon: <Printer size={13} />,
                  onClick: async () => {
                    if (currentChat && currentChat.messages && currentChat.messages.length > 0) {
                      addToast({
                        type: 'info',
                        message: 'Formatting engineering document for print / PDF...',
                      })
                      try {
                        const success = await exportChatToPdf(currentChat, settings)
                        if (success) {
                          addToast({
                            type: 'success',
                            message: 'Print dialog opened — select "Save as PDF".',
                          })
                        }
                      } catch (err) {
                        console.error('PDF export error:', err)
                        addToast({
                          type: 'error',
                          message: 'Failed to format document for export.',
                        })
                      }
                    } else {
                      addToast({
                        type: 'warning',
                        message: 'No messages to export in the current session.',
                      })
                    }
                  },
                },
                {
                  id: 'export-json',
                  label: 'Export as JSON (.json)',
                  icon: <FileJson size={13} />,
                  onClick: () => {
                    if (currentChat) {
                      exportChatToJson(currentChat)
                      addToast({
                        type: 'success',
                        message: 'JSON transcript downloaded successfully.',
                      })
                    }
                  },
                },
                {
                  id: 'copy-transcript',
                  label: 'Copy All Messages',
                  icon: <Copy size={13} />,
                  onClick: async () => {
                    if (currentChat) {
                      await copyChatTranscript(currentChat)
                      addToast({
                        type: 'success',
                        message: 'Conversation transcript copied to clipboard.',
                      })
                    }
                  },
                },
              ]}
            />

            {/* Kebab Options Dropdown */}
            <Dropdown
              trigger={
                <button
                  className="btn-icon !w-8 !h-8 text-content-secondary hover:text-content-primary"
                  aria-label="More options"
                >
                  <MoreHorizontal size={16} />
                </button>
              }
              items={[
                {
                  id: 'delete-conversation',
                  label: 'Delete Conversation',
                  icon: <Trash2 size={13} />,
                  danger: true,
                  onClick: () => {
                    if (currentChat) {
                      deleteChat(currentChat.id)
                      addToast({
                        type: 'info',
                        message: 'Conversation permanently deleted.',
                      })
                    }
                  },
                },
                {
                  id: 'clear-messages',
                  label: 'Clear Messages',
                  icon: <RotateCcw size={13} />,
                  onClick: () => {
                    if (currentChat) {
                      clearChat(currentChat.id)
                      addToast({
                        type: 'info',
                        message: 'Conversation messages cleared.',
                      })
                    }
                  },
                },
                {
                  id: 'raw-json',
                  label: 'View Raw JSON',
                  icon: <Code2 size={13} />,
                  onClick: () => setIsRawJsonOpen(true),
                },
                {
                  id: 'copy-full',
                  label: 'Copy Full Transcript',
                  icon: <Copy size={13} />,
                  onClick: async () => {
                    if (currentChat) {
                      await copyChatTranscript(currentChat)
                      addToast({
                        type: 'success',
                        message: 'Transcript copied to clipboard.',
                      })
                    }
                  },
                },
                {
                  id: 'archive',
                  label: 'Archive Chat',
                  icon: <Archive size={13} />,
                  onClick: () => {
                    addToast({
                      type: 'info',
                      message: 'Chat safely preserved in local cold storage.',
                    })
                  },
                },
              ]}
            />
          </>
        )}
        </div>
      </header>

      {/* Raw JSON Modal */}
      <Modal
        isOpen={isRawJsonOpen}
        onClose={() => setIsRawJsonOpen(false)}
        title="Raw Chat JSON Schema"
        description="Local telemetry and state object for this session"
        maxWidth="lg"
      >
        <div className="relative">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(
                JSON.stringify(currentChat, null, 2)
              )
              setIsCopied(true)
              setTimeout(() => setIsCopied(false), 2000)
            }}
            className="absolute top-2 right-2 btn-glass !py-1 !px-2.5 !text-[11px] !rounded-md"
          >
            {isCopied ? 'Copied!' : 'Copy JSON'}
          </button>
          <pre className="max-h-[380px] overflow-auto p-4 rounded-lg bg-elevated border border-border text-xs font-mono text-content-primary">
            {JSON.stringify(currentChat, null, 2)}
          </pre>
        </div>
      </Modal>
    </>
  )
}
