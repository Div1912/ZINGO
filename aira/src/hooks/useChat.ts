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
import type { Message, ModelId, TaskType, UploadedFile, CouncilMeta, ThinkStep, PastChatSearchMeta } from '../types'
import { classifyTaskIntensity } from '../services/qwenApi'
import { useMemoryStore } from '../stores/memoryStore'
import { detectPastChatIntent, searchPastChats, formatPastChatsForPrompt } from '../services/chatSearchService'
import { detectFormatSkillIntent } from '../skills/documents/formatSkillResolver'
import { extractDeliverablesFromMessage, buildSandboxDeliverable } from '../services/sandboxDeliverableService'
import type { DeliverableFile } from '../types/deliverable'

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
      thinkingEnabled?: boolean,
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

      const isAuto = !forcedModel || forcedModel === 'auto' || forcedModel === 'Auto (Cluster Smart Router)'
      const taskClassification = classifyTaskIntensity(
        content || '',
        hasImageFile,
        files?.length || 0,
        effort
      )

      let detectedTask: TaskType = taskClassification.taskType
      let selectedModel: ModelId = isAuto ? taskClassification.recommendedModel : (forcedModel as ModelId)

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
      const isThinking =
        thinkingEnabled !== undefined
          ? thinkingEnabled
          : useChatStore.getState().isThinkingEnabled

      const isCouncilActive = Boolean(useChatStore.getState().isCouncilEnabled)

      const activeProject = useProjectStore.getState().getActiveProject()
      const activeProjectId = activeProject?.id || null
      if (activeProject) {
        useProjectStore.getState().linkChatToProject(activeProject.id, sendToChatId)
      }

      // Continuous Memory: Extract explicit triggers right away so memories are saved mid-chat
      try {
        const preExtracted = useMemoryStore
          .getState()
          .extractFromTurn(content, '', activeProjectId, sendToChatId)
        if (preExtracted && preExtracted.length > 0) {
          addToast({
            type: 'info',
            title: 'Memory Saved',
            message: `ZINGO remembered: "${preExtracted[0].title}"`,
          })
        }
      } catch (err) {
        console.warn('Pre-turn memory extraction error:', err)
      }

      // Past Chat Search (Conversational RAG Tool)
      const pastChatIntent = detectPastChatIntent(content)
      let pastChatSearchMeta: PastChatSearchMeta | undefined = undefined
      let pastChatPromptContext = ''

      if (pastChatIntent.isIntent) {
        const searchResults = searchPastChats({
          query: pastChatIntent.query,
          projectId: activeProjectId,
          currentChatId: sendToChatId,
          limit: 4,
        })
        if (searchResults.length > 0) {
          pastChatSearchMeta = {
            query: pastChatIntent.query,
            searchedAt: new Date().toISOString(),
            resultsCount: searchResults.length,
            results: searchResults,
          }
          pastChatPromptContext = formatPastChatsForPrompt(pastChatSearchMeta)
        }
      }

      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        thinkSteps: [],
        rawThinking: '',
        isThinkingPhase: isThinking,
        thinkingEnabled: isThinking,
        isStreaming: true,
        modelUsed: selectedModel,
        taskType: detectedTask,
        effort: effort || 'Fast',
        pastChatSearch: pastChatSearchMeta,
        councilMeta: isCouncilActive
          ? {
              council_active: true,
              nodes_participated: ['Laptop 1 (Master Arbiter · Qwen3-8B)'],
              consensus_score: 96,
              elapsed_seconds: 0,
            }
          : undefined,
      }
      addMessage(sendToChatId, assistantMsg)

      const isComplex = taskClassification.isComplex
      setIsComplexGenerating(isComplex, detectedTask, content, (files?.length || 0) > 0)

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

      // Inject Persistent Memory Context (Continuously Maintained & Project-Isolated)
      const memoryContext = useMemoryStore.getState().formatMemoryContextForPrompt(activeProjectId)
      if (memoryContext) {
        systemPrompt = `${systemPrompt ? systemPrompt + '\n\n' : ''}${memoryContext}`
      }

      // Inject Past Chat Search Context if requested conversationally
      if (pastChatPromptContext) {
        systemPrompt = `${systemPrompt ? systemPrompt + '\n\n' : ''}${pastChatPromptContext}`
      }

      // Append Claude-standard Artifacts protocol
      const artifactsProtocol = `
# Artifacts Protocol
You have the ability to create substantial, self-contained deliverables called "Artifacts" that render in a dedicated side panel next to the chat.

## When to Create an Artifact:
- Substantial content (>15 lines) that the user will edit, run, inspect, or reference repeatedly.
- Self-contained deliverables:
  1. Interactive Web Apps / HTML pages (with inlined CSS & JS; using Tailwind CDN via https://cdn.tailwindcss.com).
  2. React components (JSX/TSX).
  3. SVG graphics (complete standalone vector art).
  4. Flowcharts and architectural diagrams (using Mermaid).
  5. Multi-section documentation, SOPs, or technical specs (Markdown).
  6. Substantial code scripts or computational engineering models (Python, SQL, bash).

## When NOT to Create an Artifact:
- Short code snippets (<15 lines), one-line fixes, simple terminal commands, or conversational answers. Keep these inline in standard markdown code blocks.

## Syntax for Creating an Artifact:
Wrap the deliverable in an <artifact> tag:
<artifact identifier="kebab-case-id" type="html|react|svg|mermaid|markdown|code" title="Concise Descriptive Title">
...complete self-contained content...
</artifact>

## Revising / Updating an Artifact:
- When modifying an artifact from earlier in the conversation, always re-use the EXACT SAME identifier attribute.
- Provide the complete updated version inside the <artifact> tag. The system will automatically track it as a new version (e.g. v2, v3) without overwriting past history.
`.trim()

      const extendedThinkingProtocol = isThinking
        ? `
## Cognitive Deliberation Protocol:
You MUST deliberate and work through your reasoning inside a <think> block first before writing your final response.
- Explore candidate hypotheses, evaluate trade-offs, and verify calculations.
- Work through intermediate steps, check logic, and catch potential errors or unverified assumptions.
- Deliberate deeply, but keep the internal monologue authentic, rigorous, and direct.
- When finished deliberating, close with </think> and immediately provide your verified, well-structured final answer.
`.trim()
        : `
## Direct Response Protocol:
Do NOT output any <think> or reasoning tags. Provide your response directly, concisely, and immediately without internal scratchpad deliberation.
`.trim()

      // Inject Format Skill and Sandboxed File Creation Protocol
      const formatSkillResolution = detectFormatSkillIntent(content)
      let formatSkillPrompt = ''
      if (
        settings.codeExecution !== false &&
        formatSkillResolution.requiresSkill &&
        formatSkillResolution.format &&
        formatSkillResolution.skillPrompt
      ) {
        formatSkillPrompt = `
${formatSkillResolution.skillPrompt}

## Deliverable Generation Directive:
When generating the requested ${formatSkillResolution.format.toUpperCase()} file:
1. Provide a complete, standalone Python script inside a \`\`\`python code block.
2. The script must save the completed file to "output${formatSkillResolution.expectedExtension || `.${formatSkillResolution.format}`}".
3. For scripts >100 lines, use clean modular functions rather than monolithic execution.
4. Our sovereign sandbox will run this script, verify the file creation, and provide an interactive download card directly in chat.
`.trim()
      }

      systemPrompt = `${systemPrompt ? systemPrompt + '\n\n' : ''}${extendedThinkingProtocol}\n\n${artifactsProtocol}${formatSkillPrompt ? '\n\n' + formatSkillPrompt : ''}`.trim()

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
        } else if (selectedModel.includes('4b')) {
          targetNodeUrl = server.fast_4b_url || 'http://127.0.0.1:11434'
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
          if (detectedTask) fd.append('task_type', detectedTask)
          if (targetNodeUrl) fd.append('node_url', targetNodeUrl)
          if (isCouncilActive) fd.append('enable_council', 'true')
          fd.append('enable_subagents', String(settings.subagentsEnabled !== false))
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
            task_type: detectedTask,
          })
          if (effort) qp.set('effort', effort)
          qp.set('enable_thinking', String(isThinking))
          if (targetNodeUrl) qp.set('node_url', targetNodeUrl)
          if (isCouncilActive) qp.set('enable_council', 'true')
          qp.set('enable_subagents', String(settings.subagentsEnabled !== false))
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
            enable_thinking: isThinking,
            thinking_budget: useChatStore.getState().thinkingBudgetTokens,
            task_type: detectedTask,
            node_url: targetNodeUrl ?? undefined,
            chat_id: sendToChatId,
            enable_council: isCouncilActive,
            enable_subagents: settings.subagentsEnabled !== false,
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
        let councilMeta: CouncilMeta | undefined = isCouncilActive
          ? {
              council_active: true,
              nodes_participated: ['Laptop 1 (Master Arbiter · Qwen3-8B)'],
              consensus_score: 96,
              elapsed_seconds: 0,
            }
          : undefined
        let subagentsMeta: import('../types').SubagentExecution[] | undefined = undefined

        const flush = (isStillStreaming: boolean = true) => {
          updateLastAssistantMessage(sendToChatId, {
            content: answerContent,
            thinkSteps: [...thinkSteps],
            rawThinking,
            isThinkingPhase,
            thinkElapsedMs,
            thinkTotalSteps: thinkSteps.length,
            thinkingEnabled: isThinking,
            isThinkingInterrupted: !isStillStreaming && isThinkingPhase && !answerContent,
            sources,
            councilMeta,
            subagents: subagentsMeta,
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
                if (evt.council) councilMeta = evt.council
                if (evt.subagents && Array.isArray(evt.subagents)) subagentsMeta = evt.subagents
                flush()
                break

              case 'council_meta':
                if (evt.council) councilMeta = evt.council
                flush()
                break

              case 'subagents_meta':
                if (evt.subagents && Array.isArray(evt.subagents)) subagentsMeta = evt.subagents
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
            useArtifactStore.getState().openArtifact(extracted[extracted.length - 1].id)
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

        // Sandboxed File Creation & Deliverables Execution
        try {
          if (settings.codeExecution !== false) {
            const rawDeliverables = extractDeliverablesFromMessage(answerContent)
            if (rawDeliverables.length > 0) {
              const initialDeliverables: DeliverableFile[] = rawDeliverables.map((d, idx) => ({
                id: `deliv-${Date.now()}-${idx}`,
                filename: d.filename,
                format: d.format,
                sizeBytes: 0,
                sizeFormatted: 'Compiling in sandbox...',
                createdAt: new Date().toISOString(),
                codeUsed: d.code,
                status: 'compiling',
              }))

              updateLastAssistantMessage(sendToChatId, {
                deliverables: initialDeliverables,
              })

              // Build deliverables in sandbox asynchronously
              initialDeliverables.forEach(async (pendingItem) => {
                try {
                  const completed = await buildSandboxDeliverable({
                    chatId: sendToChatId,
                    code: pendingItem.codeUsed || '',
                    targetFormat: pendingItem.format,
                    expectedFilename: pendingItem.filename,
                    allowNetworkEgress: settings.sandboxNetworkEgress ?? true,
                  })

                  const cChat = useChatStore.getState().getChat(sendToChatId)
                  if (cChat && cChat.messages.length > 0) {
                    const lastMsg = cChat.messages[cChat.messages.length - 1]
                    if (lastMsg && lastMsg.deliverables) {
                      const updated = lastMsg.deliverables.map((d) =>
                        d.id === pendingItem.id ? completed : d
                      )
                      useChatStore.getState().updateLastAssistantMessage(sendToChatId, {
                        deliverables: updated,
                      })
                    }
                  }

                  addToast({
                    type: 'success',
                    title: 'Deliverable Compiled',
                    message: `${completed.filename} (${completed.sizeFormatted}) ready for download.`,
                  })
                } catch (delivErr: any) {
                  console.error('Deliverable compilation error:', delivErr)
                  const cChat = useChatStore.getState().getChat(sendToChatId)
                  if (cChat && cChat.messages.length > 0) {
                    const lastMsg = cChat.messages[cChat.messages.length - 1]
                    if (lastMsg && lastMsg.deliverables) {
                      const updated = lastMsg.deliverables.map((d) =>
                        d.id === pendingItem.id
                          ? {
                              ...d,
                              status: 'failed' as const,
                              error: delivErr?.message || 'Failed to build deliverable in sandbox',
                            }
                          : d
                      )
                      useChatStore.getState().updateLastAssistantMessage(sendToChatId, {
                        deliverables: updated,
                      })
                    }
                  }
                }
              })
            }
          }
        } catch (delivParseErr) {
          console.error('Sandboxed deliverable processing error:', delivParseErr)
        }

        // Continuous Memory: Post-turn extraction for emergent operational constraints & preferences
        try {
          const postExtracted = useMemoryStore
            .getState()
            .extractFromTurn(content, answerContent, activeProjectId, sendToChatId)
          if (postExtracted && postExtracted.length > 0) {
            addToast({
              type: 'info',
              title: 'Saved to Memory',
              message: `ZINGO remembered: "${postExtracted[0].title}"`,
            })
          }
        } catch (memErr) {
          console.warn('Continuous memory extraction skipped:', memErr)
        }
      } catch (err: unknown) {


        const isAbort = err instanceof DOMException && err.name === 'AbortError'
        if (isAbort) {
          updateLastAssistantMessage(sendToChatId, {
            isThinkingPhase: false,
            isThinkingInterrupted: isThinking,
            isStreaming: false,
          })
        } else {
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
