import React, { useState } from 'react'
import { Search, ChevronDown, ChevronUp, MessageSquare, ExternalLink } from 'lucide-react'
import type { PastChatSearchMeta } from '../../types/memory'
import { useChatStore } from '../../stores/chatStore'
import { useToastStore } from '../../stores/toastStore'

interface PastChatSearchCardProps {
  meta: PastChatSearchMeta
}

export const PastChatSearchCard: React.FC<PastChatSearchCardProps> = ({ meta }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { setActiveChat } = useChatStore()
  const { addToast } = useToastStore()

  if (!meta.results || meta.results.length === 0) return null

  const handleOpenChat = (chatId: string, title: string) => {
    setActiveChat(chatId)
    addToast({
      type: 'info',
      title: 'Switched Conversation',
      message: `Opened "${title}"`,
    })
  }

  return (
    <div className="my-2.5 rounded-xl border border-sky-500/25 bg-sky-950/20 backdrop-blur-xs overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-sky-500/10 transition-colors border-none bg-transparent cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
            <Search size={12} />
          </div>
          <span className="font-medium text-sky-300">Referenced past discussions:</span>
          <span className="text-content-secondary truncate max-w-[200px] sm:max-w-xs italic">
            "{meta.query}"
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-mono">
            {meta.results.length} found
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-content-tertiary shrink-0">
          <span className="text-[11px] hidden sm:inline">{isExpanded ? 'Hide' : 'View references'}</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {isExpanded && (
        <div className="p-3 border-t border-sky-500/15 space-y-2 bg-black/20">
          {meta.results.map((res, i) => (
            <div
              key={`${res.chatId}-${res.messageId}-${i}`}
              onClick={() => handleOpenChat(res.chatId, res.chatTitle)}
              className="p-2.5 rounded-lg border border-border/60 bg-surface/80 hover:bg-elevated hover:border-sky-500/40 transition-all cursor-pointer group space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-content-primary font-medium truncate">
                  <MessageSquare size={12} className="text-sky-400 shrink-0" />
                  <span className="truncate">{res.chatTitle}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-content-tertiary shrink-0">
                  <span className="capitalize px-1 rounded bg-elevated border border-border">
                    {res.role}
                  </span>
                  <span>
                    {new Date(res.timestamp).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <ExternalLink
                    size={10}
                    className="text-content-tertiary group-hover:text-sky-400 transition-colors ml-0.5"
                  />
                </div>
              </div>
              <p className="text-[11px] text-content-secondary line-clamp-2 leading-relaxed">
                "{res.snippet}"
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
