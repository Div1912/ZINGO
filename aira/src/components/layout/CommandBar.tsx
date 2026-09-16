import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  MessageSquare,
  Plus,
  BookOpen,
  Upload,
  Settings,
  Sun,
  Moon,
  Download,
  Trash2,
  Activity,
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useTheme } from '../../hooks/useTheme'
import { useServerStore } from '../../stores/serverStore'
import { exportChatToMarkdown } from '../../services/storage'
import { useToastStore } from '../../stores/toastStore'

interface CommandBarProps {
  isOpen: boolean
  onClose: () => void
}

interface ActionItem {
  id: string
  label: string
  section: 'RECENT CHATS' | 'ACTIONS'
  icon: React.ReactNode
  shortcut?: string
  action: () => void
}

export const CommandBar: React.FC<CommandBarProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const { chats, createChat, setActiveChat, clearChat, activeChatId } = useChatStore()
  const { theme, toggleTheme } = useTheme()
  const { checkConnection } = useServerStore()
  const { addToast } = useToastStore()

  const currentChat = chats.find((c) => c.id === activeChatId)

  // Build command items
  const allItems: ActionItem[] = [
    // Recent chats
    ...chats.slice(0, 4).map((c) => ({
      id: `chat-${c.id}`,
      label: c.title || 'New conversation',
      section: 'RECENT CHATS' as const,
      icon: <MessageSquare size={14} className="text-content-secondary" />,
      action: () => {
        setActiveChat(c.id)
        navigate(`/app/chat/${c.id}`)
        onClose()
      },
    })),
    // System Actions
    {
      id: 'action-new-chat',
      label: 'New Chat',
      section: 'ACTIONS',
      icon: <Plus size={14} />,
      shortcut: '⌘ N',
      action: () => {
        const id = createChat()
        navigate(`/app/chat/${id}`)
        onClose()
      },
    },
    {
      id: 'action-search-kb',
      label: 'Search Knowledge Base',
      section: 'ACTIONS',
      icon: <BookOpen size={14} />,
      shortcut: '⌘ S',
      action: () => {
        navigate('/app/settings')
        onClose()
        addToast({ type: 'info', message: 'Navigated to Knowledge Base' })
      },
    },
    {
      id: 'action-upload-doc',
      label: 'Upload Document to MRPL Store',
      section: 'ACTIONS',
      icon: <Upload size={14} />,
      shortcut: '⌘ U',
      action: () => {
        navigate('/app/settings')
        onClose()
        addToast({ type: 'info', message: 'Open Knowledge Base to upload files' })
      },
    },
    {
      id: 'action-settings',
      label: 'Open Settings',
      section: 'ACTIONS',
      icon: <Settings size={14} />,
      shortcut: '⌘ ,',
      action: () => {
        navigate('/app/settings')
        onClose()
      },
    },
    {
      id: 'action-theme',
      label: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`,
      section: 'ACTIONS',
      icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
      shortcut: '⌘ D',
      action: () => {
        toggleTheme()
        onClose()
      },
    },
    {
      id: 'action-export',
      label: 'Export Current Chat as Markdown',
      section: 'ACTIONS',
      icon: <Download size={14} />,
      shortcut: '⌘ E',
      action: () => {
        if (currentChat) {
          exportChatToMarkdown(currentChat)
          addToast({ type: 'success', message: 'Chat exported to Markdown' })
        }
        onClose()
      },
    },
    {
      id: 'action-clear',
      label: 'Clear Current Conversation',
      section: 'ACTIONS',
      icon: <Trash2 size={14} className="text-danger" />,
      action: () => {
        if (currentChat) {
          clearChat(currentChat.id)
          addToast({ type: 'info', message: 'Conversation cleared' })
        }
        onClose()
      },
    },
    {
      id: 'action-server-status',
      label: 'Check Sovereign Server Status',
      section: 'ACTIONS',
      icon: <Activity size={14} />,
      action: () => {
        checkConnection()
        onClose()
      },
    },
  ]

  // Filter items based on query
  const filteredItems = allItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev === 0 ? Math.max(0, filteredItems.length - 1) : prev - 1
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action()
        }
      } else if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredItems, selectedIndex, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Palette Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-xl bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-10"
          >
            {/* Search Input Bar */}
            <div className="flex items-center px-4 py-3 border-b border-border">
              <Search size={16} className="text-content-tertiary mr-3 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelectedIndex(0)
                }}
                placeholder="Search or type a command..."
                className="w-full bg-transparent text-sm text-content-primary placeholder:text-content-tertiary outline-none border-none"
              />
              <kbd className="text-[10px] font-mono text-content-tertiary px-1.5 py-0.5 bg-elevated rounded border border-border">
                ESC
              </kbd>
            </div>

            {/* List */}
            <div className="max-h-[340px] overflow-y-auto p-2">
              {filteredItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-content-tertiary">
                  No matching commands found.
                </div>
              ) : (
                filteredItems.map((item, index) => {
                  const isSelected = index === selectedIndex
                  const isFirstOfSection =
                    index === 0 ||
                    filteredItems[index - 1].section !== item.section

                  return (
                    <React.Fragment key={item.id}>
                      {isFirstOfSection && (
                        <div className="px-3 pt-2.5 pb-1 text-[10px] font-mono font-semibold tracking-wider text-content-tertiary uppercase">
                          {item.section}
                        </div>
                      )}
                      <div
                        onClick={() => item.action()}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-xs transition-colors select-none ${
                          isSelected
                            ? 'bg-elevated text-content-primary font-medium'
                            : 'text-content-secondary hover:text-content-primary'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="shrink-0">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </div>

                        {item.shortcut ? (
                          <span className="text-[10px] font-mono text-content-tertiary px-1.5 py-0.5 bg-elevated rounded border border-border">
                            {item.shortcut}
                          </span>
                        ) : (
                          isSelected && (
                            <span className="text-[10px] font-mono text-content-tertiary">
                              ⏎ Open
                            </span>
                          )
                        )}
                      </div>
                    </React.Fragment>
                  )
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
