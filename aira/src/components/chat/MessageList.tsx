import React, { useEffect, useRef } from 'react'
import type { Message } from '../../types'
import { MessageBubble } from './MessageBubble'
import { FileSearch, Code, BookOpen, FileCheck } from 'lucide-react'
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const { settings } = useSettingsStore()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, messages[messages.length - 1]?.content])

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
    <div className="flex-1 overflow-y-auto py-4">
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
    </div>
  )
}
