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
import { extractProjectFromMessage, createVirtualProjectFromParsed } from '../utils/multiFileParser'
import { getActiveUserInfo } from '../stores/authStore'
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

      const hasImageFile = Boolean(
        files &&
          (files as any[]).some((f: any) => {
            const type = f.type || (f.rawFile && f.rawFile.type) || ''
            const name = f.name || (f.rawFile && f.rawFile.name) || ''
            return type.startsWith('image/') || /\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(name)
          })
      )

      let detectedTask: TaskType = hasImageFile ? 'vision' : detectTaskType(content || '')
      const isAuto = !forcedModel || forcedModel === 'auto' || forcedModel === 'Auto (Cluster Smart Router)'
      let selectedModel: ModelId = isAuto ? (settings.defaultModel || 'qwen3:8b') : (forcedModel as ModelId)

      // Auto-route to Multimodal (Laptop 2) when an image is uploaded, or Coder for code tasks
      if (hasImageFile) {
        selectedModel = 'qwen2.5vl:3b'
      } else if (settings.autoRouteModel && isAuto) {
        if (detectedTask === 'code') {
          selectedModel = 'qwen2.5-coder:7b'
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
      const effUpper = (effort || 'Fast').toUpperCase()
      const isReasoningEffort =
        effUpper === 'MAX' ||
        effUpper === 'DEEP' ||
        effUpper === 'REASONING' ||
        (Boolean(selectedModel) &&
          (selectedModel.toLowerCase().includes('r1') ||
           selectedModel.toLowerCase().includes('qwen3')))

      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        thinkSteps: [],
        rawThinking: '',
        isThinkingPhase: isReasoningEffort,
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
        // Filter out empty placeholder assistant messages so they do not contaminate the context
        const messagesForContext = (targetChat?.messages || [])
          .filter((m) => m.content && m.content.trim().length > 0)
          .map((m) => ({
            role: m.role,
            content: m.content,
          }))

        let targetNodeUrl: string | undefined = undefined
        if (
          selectedModel === 'qwen2.5vl:3b' ||
          selectedModel === 'qwen2.5-vl:3b' ||
          selectedModel === 'qwen2.5-vl:7b' ||
          detectedTask === 'vision'
        ) {
          targetNodeUrl = server.vision_url || server.g15_2_url || 'http://127.0.0.1:11434'
        } else if (selectedModel.includes('coder')) {
          targetNodeUrl = server.coderStatus === 'connected' ? server.g15_2_url : undefined
        } else if (selectedModel.includes('r1')) {
          targetNodeUrl = server.reasoning_url
        } else if (isAuto) {
          // Provide Laptop 2 URL to the backend so it can dynamically spill over when Laptop 1 is busy!
          targetNodeUrl = server.vision_url || server.g15_2_url || undefined
        }

        const userInfo = getActiveUserInfo()
        const effectiveModel = isAuto && !hasImageFile ? 'auto' : selectedModel

        if (hasFiles) {
          const fd = new FormData()
          const queryText = (content || '').trim() || 'Please analyze the attached document and provide a comprehensive summary and key takeaways.'
          fd.append('user_query', queryText)
          files?.forEach((f: any) => {
            const fileObj = f.rawFile || f
            if (fileObj instanceof File) {
              fd.append('file', fileObj)
            }
          })
          if (effectiveModel) fd.append('model', effectiveModel)
          if (effort) fd.append('effort', effort)
          if (targetNodeUrl) fd.append('node_url', targetNodeUrl)
          fd.append('user', userInfo.userId)
          fd.append('user_name', userInfo.userName)
          fd.append('preferred_name', userInfo.preferredName)
          fd.append('work_role', userInfo.workRole)
          if (userInfo.personalPreferences) fd.append('personal_preferences', userInfo.personalPreferences)
          fd.append('messages', JSON.stringify(messagesForContext))

          body = fd
          const qp = new URLSearchParams({
            stream: 'true',
            user_query: queryText,
            user: userInfo.userId,
            user_name: userInfo.userName,
            preferred_name: userInfo.preferredName,
            work_role: userInfo.workRole,
            model: effectiveModel,
          })
          if (effort) qp.set('effort', effort)
          if (targetNodeUrl) qp.set('node_url', targetNodeUrl)
          qp.set('chat_id', sendToChatId)
          endpoint = `${cleanBaseUrl}/process-and-ask/?${qp.toString()}`
        } else {
          headers['Content-Type'] = 'application/json'
          body = JSON.stringify({
            messages: messagesForContext,
            prompt: content,
            user: userInfo.userId,
            user_name: userInfo.userName,
            preferred_name: userInfo.preferredName,
            work_role: userInfo.workRole,
            personal_preferences: userInfo.personalPreferences || undefined,
            system: systemPrompt || undefined,
            context: projectContextText || undefined,
            stream: true,
            model: effectiveModel,
            effort: effort ?? 'Fast',
            task_type: detectedTask,
            node_url: targetNodeUrl ?? undefined,
            chat_id: sendToChatId,
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
        let resolvedModelUsed: string = selectedModel

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
            modelUsed: (resolvedModelUsed || selectedModel) as ModelId,
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
                if (evt.model) resolvedModelUsed = evt.model
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
                if (rawThinking.trim()) {
                  thinkSteps = [
                    ...thinkSteps,
                    {
                      step_number: thinkSteps.length + 1,
                      content: rawThinking.trim(),
                    },
                  ]
                }
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
                if (evt.model) resolvedModelUsed = evt.model
                isThinkingPhase = false
                if (rawThinking.trim()) {
                  thinkSteps = [
                    ...thinkSteps,
                    {
                      step_number: thinkSteps.length + 1,
                      content: rawThinking.trim(),
                    },
                  ]
                }
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
          // ignore artifact extraction error
        }

        // Automatically detect & catalog multi-file virtual projects for the Live Sandbox
        try {
          const parsedProj = extractProjectFromMessage(answerContent)
          if (parsedProj && (parsedProj.isMultiFile || parsedProj.isInteractiveApp)) {
            const vproj = createVirtualProjectFromParsed(parsedProj, {
              chatId: sendToChatId,
            })
            const projId = useProjectStore.getState().saveVirtualProject(vproj)
            // Auto-open the Claude-style live sandbox canvas
            useProjectStore.getState().openSandboxCanvas(projId)
            addToast({
              type: 'success',
              title: vproj.title,
              message: `App compiled & running in live sandbox (${Object.keys(vproj.files).length} files)`,
            })
          }
        } catch (err) {
          console.error('Virtual project extraction error:', err)
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
