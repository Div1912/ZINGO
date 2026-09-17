import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { Message } from '../../types'
import { MessageBubble } from './MessageBubble'
import { FileSearch, Code, BookOpen, FileCheck, ArrowDown } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

interface MessageListProps {
  messages: Message[]
  onSelectSuggestion: (prompt: string) => void
  onRegenerateLast?: () => void
  onRunCode?: (code: string) => void
}

const SUGGESTIONS = [
  {
    icon: <FileSearch size={14} className="text-content-secondary" />,
    text: 'Summarize inspection report',
    prompt: 'Summarize the latest CDU-2 furnace coil ultrasonic thickness inspection report and flag any high corrosion risk areas.',
  },
  {
    icon: <Code size={14} className="text-content-secondary" />,
    text: 'Write a Python script',
    prompt: 'Write a Python script to optimize atmospheric distillation cut points for crude API gravity 33.4.',
  },
  {
    icon: <BookOpen size={14} className="text-content-secondary" />,
    text: 'Search MRPL SOPs',
    prompt: 'What are the required LOTO safety isolation steps under MRPL CDU-2 SOP Rev 4 before pump maintenance?',
  },
  {
    icon: <FileCheck size={14} className="text-content-secondary" />,
    text: 'Draft an approval note',
    prompt: 'Draft an executive approval note for replacing the heat exchanger bundle in CDU-2 preheat train.',
  },
]

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  onSelectSuggestion,
  onRegenerateLast,
  onRunCode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef<boolean>(true)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const prevMessagesLengthRef = useRef<number>(messages.length)
  const { settings } = useSettingsStore()

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const nearBottom = distanceFromBottom < 140
    isNearBottomRef.current = nearBottom
    setShowScrollBottom(!nearBottom)
  }, [])

  // Smart auto-scroll: never lock the user if they scrolled up to read
  useEffect(() => {
    const isNewMessage = messages.length > prevMessagesLengthRef.current
    prevMessagesLengthRef.current = messages.length

    // If a new user message was sent, immediately jump to bottom
    if (isNewMessage && messages[messages.length - 1]?.role === 'user') {
      isNearBottomRef.current = true
      setShowScrollBottom(false)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    // During streaming chunks: only follow down if user was already at the bottom
    if (isNearBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, messages[messages.length - 1]?.content])

  const scrollToBottom = () => {
    isNearBottomRef.current = true
    setShowScrollBottom(false)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Claude-style static timeline greeting based on the hour of the day
  const userName = (settings.preferredName || settings.userName || 'Div').trim()

  const getTimelineGreeting = () => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) {
      return `Good morning, ${userName}`
    } else if (hour >= 12 && hour < 17) {
      return `Good afternoon, ${userName}`
    } else {
      return `Good evening, ${userName}`
    }
  }

  const greeting = getTimelineGreeting()

  // Empty State
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto my-auto select-none">
        {/* Claude editorial serif static greeting */}
        <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal text-content-primary tracking-tight mb-3 select-none leading-tight">
          {greeting}
        </h2>
        <p className="text-xs sm:text-sm text-content-secondary max-w-md mb-8 leading-relaxed font-sans">
          Ask questions against MRPL internal SOPs, write engineering automation scripts, or generate operational reports.
        </p>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-lg">
          {SUGGESTIONS.map((item) => (
            <button
              key={item.text}
              onClick={() => onSelectSuggestion(item.prompt)}
              className="btn-glass !py-2 !px-3.5 !text-xs !rounded-pill flex items-center gap-2 text-content-primary"
            >
              {item.icon}
              <span>{item.text}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Active Messages
  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto py-4"
    >
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onRegenerate={
            message.role === 'assistant' &&
            message.id === messages[messages.length - 1].id
              ? onRegenerateLast
              : undefined
          }
          onRunCode={onRunCode}
        />
      ))}
      <div ref={bottomRef} className="h-4" />

      {/* Floating jump to bottom button when scrolled up */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="fixed bottom-24 right-8 z-30 p-2.5 rounded-full bg-surface-secondary/90 border border-border shadow-xl hover:bg-surface-secondary text-content-primary transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center backdrop-blur-md"
          title="Scroll to bottom"
          aria-label="Scroll to bottom"
        >
          <ArrowDown size={15} />
        </button>
      )}
    </div>
  )
}
