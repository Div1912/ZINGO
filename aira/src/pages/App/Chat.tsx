import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useChat } from '../../hooks/useChat'
import { useChatStore } from '../../stores/chatStore'
import { MessageList } from '../../components/chat/MessageList'
import { InputBar } from '../../components/chat/InputBar'
import { SourcePanel } from '../../components/chat/SourcePanel'
import { CodeRunnerModal } from '../../components/chat/CodeRunnerModal'

export const ChatPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const {
    chats,
    activeChatId,
    setActiveChat,
    createChat,
    isLoadingChats,
  } = useChatStore()

  // Resolve the chat ID directly from route or store fallback
  const resolvedChatId = (id && id !== 'new') ? id : activeChatId

  const {
    activeChat,
    isGenerating,
    sendMessage,
    stopGeneration,
    regenerateLastMessage,
    activeCodeToRun,
    setActiveCodeToRun,
  } = useChat(resolvedChatId)

  const [promptToFill, setPromptToFill] = useState('')

  // Sync route param with store
  useEffect(() => {
    if (isLoadingChats) return

    if (id && id !== activeChatId) {
      const exists = chats.some((c) => c.id === id)
      if (exists) {
        setActiveChat(id)
      } else if (id === 'new') {
        const newId = createChat()
        navigate(`/app/chat/${newId}`, { replace: true })
      }
    } else if (!id) {
      if (chats.length > 0) {
        navigate(`/app/chat/${chats[0].id}`, { replace: true })
      } else {
        const newId = createChat()
        navigate(`/app/chat/${newId}`, { replace: true })
      }
    }
  }, [id, activeChatId, chats, setActiveChat, createChat, navigate, isLoadingChats])

  const handleSelectSuggestion = (prompt: string) => {
    setPromptToFill(prompt)
  }

  return (
    <div className="flex-1 flex min-w-0 h-full overflow-hidden bg-transparent relative">
      {/* Central Chat Stream & Input */}
      <div
        key={resolvedChatId || 'chat-container'}
        className="flex-1 flex flex-col min-w-0 h-full overflow-hidden"
      >
        <MessageList
          messages={activeChat?.messages || []}
          onSelectSuggestion={handleSelectSuggestion}
          onRegenerateLast={regenerateLastMessage}
          onRunCode={(code) => setActiveCodeToRun(code)}
        />

        <InputBar
          onSendMessage={(content, files, model, effort) => {
            sendMessage(content, files, model, effort)
            setPromptToFill('')
          }}
          onStop={stopGeneration}
          isGenerating={isGenerating}
          initialPrompt={promptToFill}
        />
      </div>

      {/* Slide-out Source Panel */}
      <SourcePanel />

      {/* Code Sandbox Runner Modal */}
      <CodeRunnerModal
        code={activeCodeToRun}
        onClose={() => setActiveCodeToRun(null)}
      />
    </div>
  )
}
