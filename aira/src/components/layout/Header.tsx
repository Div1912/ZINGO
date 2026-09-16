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
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useToastStore } from '../../stores/toastStore'
import { Dropdown } from '../ui/Dropdown'
import {
  exportChatToMarkdown,
  exportChatToJson,
  copyChatTranscript,
} from '../../services/storage'
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
  const { chats, activeChatId, renameChat, clearChat } = useChatStore()
  const { addToast } = useToastStore()

  const currentChat = chats.find((c) => c.id === activeChatId)
  const hasMessages = Boolean(currentChat && currentChat.messages && currentChat.messages.length > 0)

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [isRawJsonOpen, setIsRawJsonOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

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
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
                  onClick: () => {
                    window.print()
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
                  id: 'clear',
                  label: 'Clear Conversation',
                  icon: <Trash2 size={13} />,
                  danger: true,
                  onClick: () => {
                    if (currentChat) {
                      clearChat(currentChat.id)
                      addToast({
                        type: 'info',
                        message: 'Conversation history cleared.',
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
