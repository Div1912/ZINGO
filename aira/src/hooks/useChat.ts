/**
 * ZINGO — useChat hook with Chain of Thought support
 * ====================================================
 * Parses 6 SSE event types: thinking_start, thinking, think_step, thinking_end, chunk, done
 * Builds thinkSteps[] and rawThinking on the message object as they stream
 * Sets isThinkingPhase flag so the UI shows live reasoning steps
 */

import { useCallback, useRef, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useServerStore } from '../stores/serverStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useToastStore } from '../stores/toastStore'
import { useProjectStore } from '../stores/projectStore'
import { useArtifactStore } from '../stores/artifactStore'
import type { ThinkStep } from '../components/chat/ThinkingBlock'
import type { Message, ModelId, TaskType, UploadedFile } from '../types'
import { detectTaskType, isComplexTask } from '../services/qwenApi'

export function useChat(chatId?: string | null) {
  const {
    chats,
    activeChatId,
    getChat,
    createChat,
    addMessage,
    updateLastAssistantMessage,
    setActiveSources,
    startGenerating,
    stopGenerating,
    isChatGenerating,
    setIsComplexGenerating,
  } = useChatStore()

  const { server } = useServerStore()
  const { settings } = useSettingsStore()
  const { addToast } = useToastStore()

  const [activeCodeToRun, setActiveCodeToRun] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const currentChatId = chatId || activeChatId
  const activeChat = currentChatId ? getChat(currentChatId) : chats[0]
  const isGenerating = Boolean(currentChatId && isChatGenerating(currentChatId))

  // ─── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (
      content: string,
      files?: UploadedFile[] | File[],
      forcedModel?: ModelId | string,
      effort?: string,
    ) => {
      const hasContent = Boolean(content && content.trim())
      const hasFiles = Boolean(files && files.length > 0)
      if (!hasContent && !hasFiles) return

      let sendToChatId = currentChatId
      if (!sendToChatId || !getChat(sendToChatId)) {
        sendToChatId = createChat()
      }

      if (isChatGenerating(sendToChatId)) return

      const detectedTask: TaskType = detectTaskType(content || '')
      let selectedModel: ModelId = (forcedModel as ModelId) || settings.defaultModel || 'qwen3:8b'

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
        files: files as any,
      }
      addMessage(sendToChatId, userMsg)

      // 2. Add Assistant Message placeholder
      const assistantId = 'ast-' + Date.now()
      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        thinkSteps: [],
        rawThinking: '',
        isThinkingPhase: false,
        isStreaming: true,
        modelUsed: selectedModel,
        taskType: detectedTask,
        effort: effort || 'Fast',
      }
      addMessage(sendToChatId, assistantMsg)

      const isComplex = isComplexTask(content, files?.length || 0, effort)
      setIsComplexGenerating(isComplex, detectedTask, content, (files?.length || 0) > 0)

      const activeProject = useProjectStore.getState().getActiveProject()
      if (activeProject) {
        useProjectStore.getState().linkChatToProject(activeProject.id, sendToChatId)
      }

      // Build active project system prompt & knowledge base context
      let systemPrompt = settings.systemPrompt || ''
      let projectContextText = ''

      if (activeProject) {
        if (activeProject.customInstructions) {
          systemPrompt = `PROJECT WORKSPACE: ${activeProject.title}\n${activeProject.customInstructions}\n\n${systemPrompt}`
        }
        if (activeProject.files && activeProject.files.length > 0) {
          projectContextText = activeProject.files
            .map((f) => `=== Project Knowledge File: ${f.name} ===\n${f.content}`)
            .join('\n\n')
        }
      }

      const controller = new AbortController()
      abortRef.current = controller
      startGenerating(sendToChatId, controller)

      try {
        const rawBaseUrl = server.g15_1_url || (import.meta.env.VITE_API_URL ?? '')
        const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, '')

        let endpoint: string
        let body: BodyInit
        let headers: Record<string, string> = {
          'ngrok-skip-browser-warning': 'true',
        }

        const targetChat = getChat(sendToChatId)
        const messagesForContext = (targetChat?.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
        }))

        if (hasFiles) {
          const fd = new FormData()
          fd.append('user_query', content)
          files?.forEach((f: any) => {
            const fileObj = f.rawFile || f
            if (fileObj instanceof File) {
              fd.append('file', fileObj)
            }
          })
          if (selectedModel) fd.append('model', selectedModel)
          if (effort) fd.append('effort', effort)
          fd.append('messages', JSON.stringify(messagesForContext))

          body = fd
          endpoint = `${cleanBaseUrl}/process-and-ask/?stream=true`
        } else {
          headers['Content-Type'] = 'application/json'
          body = JSON.stringify({
            messages: messagesForContext,
            prompt: content,
            system: systemPrompt || undefined,
            context: projectContextText || undefined,
            stream: true,
            model: selectedModel ?? undefined,
            effort: effort ?? 'Fast',
            task_type: detectedTask,
          })
          endpoint = `${cleanBaseUrl}/api/chat`
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        // ── SSE parser ───────────────────────────────────────────────────────
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        let answerContent = ''
        let thinkSteps: ThinkStep[] = []
        let rawThinking = ''
        let isThinkingPhase = false
        let thinkStartTime: number | null = null
        let thinkElapsedMs = 0
        let sources: any[] = []
        let evalCount = 0

        const flush = (isStillStreaming: boolean = true) => {
          updateLastAssistantMessage(sendToChatId, {
            content: answerContent,
            thinkSteps: [...thinkSteps],
            rawThinking,
            isThinkingPhase,
            thinkElapsedMs,
            thinkTotalSteps: thinkSteps.length,
            sources,
            isStreaming: isStillStreaming,
            tokensUsed: evalCount || Math.max(1, Math.floor(answerContent.length / 4)),
            latencyMs: thinkElapsedMs,
          })
        }

        while (true) {
          if (controller.signal.aborted) {
            await reader.cancel()
            break
          }

          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue

            const raw = trimmed.replace(/^data:\s*/, '')
            if (!raw) continue

            let evt: any
            try {
              evt = JSON.parse(raw)
            } catch {
              continue
            }

            switch (evt.type) {
              case 'meta':
                if (evt.sources) sources = evt.sources
                flush()
                break

              case 'context':
                if (evt.sources) sources = evt.sources
                if (useChatStore.getState().activeChatId === sendToChatId && sources.length > 0) {
                  setActiveSources(sources)
                }
                flush()
                break

              case 'thinking_start':
                isThinkingPhase = true
                thinkStartTime = Date.now()
                rawThinking = ''
                flush()
                break

              case 'thinking':
                rawThinking += evt.chunk ?? ''
                flush()
                break

              case 'think_step':
                thinkSteps = [
                  ...thinkSteps,
                  {
                    step_number: evt.step_number,
                    content: evt.content,
                  },
                ]
                rawThinking = ''
                flush()
                break

              case 'thinking_end':
                isThinkingPhase = false
                thinkElapsedMs = thinkStartTime ? Date.now() - thinkStartTime : 0
                rawThinking = ''
                flush()
                break

              case 'chunk':
                answerContent += evt.chunk ?? ''
                if (evt.eval_count) evalCount = evt.eval_count
                flush()
                break

              case 'sources':
                if (evt.sources) sources = evt.sources
                flush()
                break

              case 'done':
                thinkElapsedMs = thinkStartTime
                  ? Date.now() - thinkStartTime
                  : evt.elapsed_ms ?? thinkElapsedMs
                evalCount = evt.eval_count ?? evalCount
                isThinkingPhase = false
                rawThinking = ''
                flush(false)
                break

              case 'error':
                answerContent += `\n\n[Error: ${evt.error || 'Unknown error'}]`
                flush(false)
                break
            }
          }
        }

        // Final completion flush
        flush(false)

        // Automatically detect & catalog interactive artifacts from the response
        try {
          const extracted = useArtifactStore.getState().extractArtifactsFromMessage(answerContent, sendToChatId)
          if (extracted && extracted.length > 0) {
            updateLastAssistantMessage(sendToChatId, {
              artifactIds: extracted.map((a) => a.id),
            })
          }
        } catch {
          // ignore parsing error
        }

      } catch (err: unknown) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError'
        if (!isAbort) {
          const errorMsg = err instanceof Error ? err.message : 'Error communicating with backend.'
          updateLastAssistantMessage(sendToChatId, {
            content: `[Connection error: ${errorMsg}]`,
            thinkSteps: [],
            isThinkingPhase: false,
            isStreaming: false,
            error: errorMsg,
          })
        }
      } finally {
        stopGenerating(sendToChatId)
        setIsComplexGenerating(false, null, null, false)
        abortRef.current = null
      }
    },
    [
      currentChatId,
      getChat,
      createChat,
      addMessage,
      updateLastAssistantMessage,
      setActiveSources,
      startGenerating,
      stopGenerating,
      isChatGenerating,
      setIsComplexGenerating,
      server.g15_1_url,
      settings.defaultModel,
      settings.autoRouteModel,
      addToast,
    ],
  )

  // ─── Stop generation ───────────────────────────────────────────────────────

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
    if (currentChatId) {
      stopGenerating(currentChatId)
    }
    setIsComplexGenerating(false, null, null, false)
  }, [currentChatId, stopGenerating, setIsComplexGenerating])

  // ─── Regenerate last message ───────────────────────────────────────────────

  const regenerateLastMessage = useCallback(() => {
    if (!activeChat || isGenerating) return
    const msgs = activeChat.messages
    if (msgs.length < 2) return

    const lastAssistant = msgs[msgs.length - 1]
    if (lastAssistant.role !== 'assistant') return

    const previousUserMsg = msgs[msgs.length - 2]
    if (previousUserMsg && previousUserMsg.role === 'user') {
      sendMessage(
        previousUserMsg.content,
        previousUserMsg.files,
        lastAssistant.modelUsed,
        lastAssistant.effort,
      )
    }
  }, [activeChat, isGenerating, sendMessage])

  return {
    activeChat,
    isGenerating,
    sendMessage,
    stopGeneration,
    regenerateLastMessage,
    activeCodeToRun,
    setActiveCodeToRun,
  }
}
