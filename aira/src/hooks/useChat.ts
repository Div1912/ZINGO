import { useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useServerStore } from '../stores/serverStore'
import { useToastStore } from '../stores/toastStore'
import { detectTaskType, isComplexTask, streamChatResponse } from '../services/qwenApi'
import type { Message, ModelId, TaskType, UploadedFile } from '../types'

export function useChat(targetChatId?: string | null) {
  const {
    chats,
    activeChatId,
    createChat,
    addMessage,
    updateMessage,
    setActiveSources,
    stopGeneration: storeStopGeneration,
    startGenerating,
    stopGenerating,
    isChatGenerating,
    setIsComplexGenerating,
  } = useChatStore()

  const { settings } = useSettingsStore()
  const { server } = useServerStore()
  const { addToast } = useToastStore()
  const [activeCodeToRun, setActiveCodeToRun] = useState<string | null>(null)

  const currentChatId = targetChatId || activeChatId
  const activeChat = currentChatId ? chats.find((c) => c.id === currentChatId) : chats[0]
  const isThisChatGenerating = Boolean(currentChatId && isChatGenerating(currentChatId))

  const sendMessage = async (
    content: string,
    files: UploadedFile[] = [],
    forcedModel?: ModelId,
    effort?: string
  ) => {
    if (!content.trim() && files.length === 0) return

    let sendToChatId = currentChatId
    if (!sendToChatId || !chats.some((c) => c.id === sendToChatId)) {
      sendToChatId = createChat()
    }

    // Only prevent sending if THIS chat is already actively generating
    if (isChatGenerating(sendToChatId)) return

    const targetChat = chats.find((c) => c.id === sendToChatId)
    const detectedTask: TaskType = detectTaskType(content)
    let selectedModel: ModelId = forcedModel || settings.defaultModel

    if (settings.autoRouteModel && !forcedModel) {
      if (detectedTask === 'code') {
        selectedModel = 'qwen2.5-coder-7b'
        addToast({
          type: 'info',
          title: 'Auto-Routed to Coder',
          message: 'Switched to Qwen2.5-Coder-7B for calculation/code workload.',
        })
      } else {
        selectedModel = 'qwen3:8b'
      }
    }

    // 1. Add User Message
    const userMsgId = 'usr-' + Date.now()
    const userMsg: Message = {
      id: userMsgId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      files,
    }
    addMessage(sendToChatId, userMsg)

    // 2. Add empty streaming Assistant message
    const assistantMsgId = 'ast-' + Date.now()
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      modelUsed: selectedModel,
      taskType: detectedTask,
    }
    addMessage(sendToChatId, assistantMsg)

    const isComplex = isComplexTask(content, files.length, effort)
    setIsComplexGenerating(isComplex, detectedTask)

    const controller = new AbortController()
    startGenerating(sendToChatId, controller)

    try {
      const messagesForContext = [
        ...(targetChat?.messages || []),
        userMsg,
      ].slice(-settings.contextWindow)

      const targetEndpoint = server.g15_1_url || 'https://splendid-sensibly-primate.ngrok-free.app'

      await streamChatResponse(
        messagesForContext,
        detectedTask,
        targetEndpoint,
        files,
        (chunk) => {
          updateMessage(sendToChatId, assistantMsgId, {
            content: chunk,
            isStreaming: true,
          })
        },
        (sources) => {
          // Only update the active sources panel if the user is currently viewing this chat
          if (useChatStore.getState().activeChatId === sendToChatId) {
            setActiveSources(sources)
          }
          updateMessage(sendToChatId, assistantMsgId, {
            sources,
          })
        },
        (meta) => {
          updateMessage(sendToChatId, assistantMsgId, {
            isStreaming: false,
            tokensUsed: meta.tokensUsed,
            latencyMs: meta.latencyMs,
            modelUsed: meta.modelUsed,
          })

          // Notify user if response completed while they were in a different conversation
          if (useChatStore.getState().activeChatId !== sendToChatId) {
            const finishedChat = useChatStore.getState().chats.find((c) => c.id === sendToChatId)
            addToast({
              type: 'success',
              title: 'Response Complete',
              message: `AIRA finished synthesizing in "${finishedChat?.title || 'conversation'}".`,
            })
          }
        },
        controller.signal
      )
    } catch (err: unknown) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      if (!isAbort) {
        const errorMsg = err instanceof Error ? err.message : 'Error communicating with live Qwen node.'
        updateMessage(sendToChatId, assistantMsgId, {
          isStreaming: false,
          error: errorMsg,
        })
      }
    } finally {
      stopGenerating(sendToChatId)
      setIsComplexGenerating(false, null)
    }
  }

  const stopGeneration = () => {
    if (currentChatId) {
      storeStopGeneration(currentChatId)
    }
  }

  const regenerateLastMessage = async () => {
    if (!activeChat || isThisChatGenerating) return
    const messages = activeChat.messages
    if (messages.length < 2) return

    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role !== 'assistant') return

    const previousUserMsg = messages[messages.length - 2]
    if (previousUserMsg.role === 'user') {
      // Re-trigger with user message content
      sendMessage(previousUserMsg.content, previousUserMsg.files)
    }
  }

  return {
    activeChat,
    isGenerating: isThisChatGenerating,
    sendMessage,
    stopGeneration,
    regenerateLastMessage,
    activeCodeToRun,
    setActiveCodeToRun,
  }
}
