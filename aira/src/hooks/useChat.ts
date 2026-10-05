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
import type {
  Message,
  ModelId,
  TaskType,
  UploadedFile,
  CouncilMeta,
  ThinkStep,
  PastChatSearchMeta,
  SubagentExecution,
  AgentToolActivity,
  CompletedTool,
} from '../types'
import { classifyTaskIntensity, isPresentationQuery } from '../services/qwenApi'
import { useMemoryStore } from '../stores/memoryStore'
import { detectPastChatIntent, searchPastChats, formatPastChatsForPrompt } from '../services/chatSearchService'
import { detectFormatSkillIntent } from '../skills/documents/formatSkillResolver'
import { extractDeliverablesFromMessage, buildSandboxDeliverable } from '../services/sandboxDeliverableService'
import type { DeliverableFile } from '../types/deliverable'
import { processUserUploadedFile, type ProcessedUploadedFile } from '../services/fileProcessingService'

interface ClusterTargetCandidate {
  url: string
  model: string
  label: string
}

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
            const type = (f.type || (f.rawFile && f.rawFile.type) || '').toLowerCase()
            const name = (f.name || (f.rawFile && f.rawFile.name) || '').toLowerCase()
            return type === 'image' || type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|svg)$/i.test(name)
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

      // Dynamic Cluster Failover across nodes (Auto ONLY):
      // When the user explicitly selects a model, NEVER mutate or override their choice!
      const isPrimaryDown = server.primaryStatus === 'disconnected'
      const isFast4bDown = server.fast4bStatus === 'disconnected' || !server.fast_4b_url
      const isVisionAlive = server.visionStatus === 'connected'

      if (isAuto) {
        // If Vision (Laptop 2) is the only node confirmed alive, or if both 8B and 4B are down:
        if ((isPrimaryDown && isFast4bDown && isVisionAlive) || (isVisionAlive && isPrimaryDown && !server.fast_4b_url)) {
          selectedModel = 'qwen2.5vl:3b'
        } else if (isPrimaryDown && (selectedModel === 'qwen3:8b' || selectedModel === 'qwen3-8b')) {
          if (!isFast4bDown) {
            selectedModel = 'qwen3:4b'
          } else if (isVisionAlive) {
            selectedModel = 'qwen2.5vl:3b'
          }
        } else if (isFast4bDown && (selectedModel === 'qwen3:4b' || selectedModel === 'qwen3-4b')) {
          if (!isPrimaryDown) {
            selectedModel = 'qwen3:8b'
          } else if (isVisionAlive) {
            selectedModel = 'qwen2.5vl:3b'
          }
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
      const targetChat = getChat(sendToChatId)
      // Only bind project knowledge if this chat explicitly belongs to a project
      const chatProjectId = targetChat?.projectId
      const activeProject = chatProjectId ? useProjectStore.getState().getProject(chatProjectId) : undefined
      const activeProjectId = activeProject?.id || null

      const isGreeting = /^(hi|hello|hey|hii|hiii|heyy|greetings|good\s+(morning|afternoon|evening)|yo|sup|who are you|who r u|test|ping)\b/i.test(content.trim())
      const isFastOrGreeting = isGreeting || detectedTask === 'fast' || effort === 'Fast'

      const assistantId = 'ast-' + Date.now()
      const isThinking = isFastOrGreeting ? false : (
        thinkingEnabled !== undefined
          ? thinkingEnabled
          : useChatStore.getState().isThinkingEnabled
      )

      const isCouncilActive = isFastOrGreeting ? false : Boolean(useChatStore.getState().isCouncilEnabled)

      // Continuous Memory: Extract explicit triggers right away so memories are saved mid-chat
      try {
        if (!isGreeting) {
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
        }
      } catch (err) {
        console.warn('Pre-turn memory extraction error:', err)
      }

      // Past Chat Search (Conversational RAG Tool)
      const pastChatIntent = isGreeting ? { isIntent: false } : detectPastChatIntent(content)
      let pastChatSearchMeta: PastChatSearchMeta | undefined = undefined
      let pastChatPromptContext = ''

      if (pastChatIntent.isIntent) {
        const searchResults = searchPastChats({
          query: (pastChatIntent as any).query,
          projectId: activeProjectId,
          currentChatId: sendToChatId,
          limit: 4,
        })
        if (searchResults.length > 0) {
          pastChatSearchMeta = {
            query: (pastChatIntent as any).query,
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
        taskType: isGreeting ? 'fast' : detectedTask,
        effort: isGreeting ? 'Fast' : (effort || 'Fast'),
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

      const isComplex = !isFastOrGreeting && taskClassification.isComplex
      setIsComplexGenerating(isComplex, detectedTask, content, (files?.length || 0) > 0)

      // Build active project system prompt & knowledge base context
      let systemPrompt = settings.systemPrompt || ''
      let projectContextText = ''

      if (activeProject && !isGreeting) {
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
      if (!isGreeting) {
        const memoryContext = useMemoryStore.getState().formatMemoryContextForPrompt(activeProjectId)
        if (memoryContext) {
          systemPrompt = `${systemPrompt ? systemPrompt + '\n\n' : ''}${memoryContext}`
        }
      }

      // Inject Past Chat Search Context if requested conversationally
      if (pastChatPromptContext && !isGreeting) {
        systemPrompt = `${systemPrompt ? systemPrompt + '\n\n' : ''}${pastChatPromptContext}`
      }

      // Append Claude-standard Artifacts protocol for substantive tasks (skip for greetings)
      const artifactsProtocol = isGreeting ? '' : `
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
        : (isGreeting ? 'You are AIRA. Reply directly in 1 short friendly sentence. Do not reason.' : `
## Direct Response Protocol:
Do NOT output any <think> or reasoning tags. Provide your response directly, concisely, and immediately without internal scratchpad deliberation.
`.trim())

      // Inject Format Skill and Sandboxed File Creation Protocol
      const formatSkillResolution = isGreeting ? { requiresSkill: false } : detectFormatSkillIntent(content)
      let formatSkillPrompt = ''
      if (
        !isGreeting &&
        settings.codeExecution !== false &&
        (formatSkillResolution as any).requiresSkill &&
        (formatSkillResolution as any).format &&
        (formatSkillResolution as any).skillPrompt
      ) {
        formatSkillPrompt = `
${(formatSkillResolution as any).skillPrompt}

## Deliverable Generation Directive:
When generating the requested ${(formatSkillResolution as any).format.toUpperCase()} file:
1. Provide a complete, standalone Python script inside a \`\`\`python code block.
2. The script must save the completed file to "output${(formatSkillResolution as any).expectedExtension || `.${(formatSkillResolution as any).format}`}".
3. For scripts >100 lines, use clean modular functions rather than monolithic execution.
4. Our sovereign sandbox will run this script, verify the file creation, and provide an interactive download card directly in chat.
`.trim()
      }

      if (isGreeting) {
        systemPrompt = 'You are AIRA, a helpful and polite AI assistant. Respond warmly and concisely in 1-2 short sentences. Do not introduce yourself unless asked.'
      } else {
        systemPrompt = `${systemPrompt ? systemPrompt + '\n\n' : ''}${extendedThinkingProtocol}${artifactsProtocol ? '\n\n' + artifactsProtocol : ''}${formatSkillPrompt ? '\n\n' + formatSkillPrompt : ''}`.trim()
      }

      const controller = new AbortController()
      abortRef.current = controller
      startGenerating(sendToChatId, controller)

      try {
        const rawBaseUrl = server.g15_1_url || (import.meta.env.VITE_API_URL ?? '')
        const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, '')

        let endpoint: string
        let body: BodyInit
        let headers: Record<string, string> = {}

        const targetChat = getChat(sendToChatId)
        // Filter out empty placeholder assistant messages so they do not contaminate the context
        const messagesForContext = (targetChat?.messages || [])
          .filter((m) => m.content && m.content.trim().length > 0)
          .map((m) => ({
            role: m.role,
            content: m.content,
          }))

        const isPresentation = isPresentationQuery(content || '')

        let targetNodeUrl: string | undefined = undefined
        if (isPresentation) {
          // Presentations MUST route through Primary Master Node (Laptop 1: Qwen3-8B)
          // to orchestrate the 3-node cluster synergy on the server
          targetNodeUrl = undefined
          selectedModel = 'qwen3:8b'
        } else if (
          selectedModel === 'qwen2.5vl:3b' ||
          selectedModel === 'qwen2.5-vl:3b' ||
          selectedModel === 'qwen2.5-vl:7b' ||
          (detectedTask === 'vision' && (isAuto || hasImageFile))
        ) {
          targetNodeUrl = server.vision_url || server.g15_2_url || 'http://127.0.0.1:11434'
        } else if (selectedModel.includes('4b')) {
          targetNodeUrl = server.fast_4b_url || 'http://127.0.0.1:11434'
        } else if (selectedModel.includes('coder')) {
          targetNodeUrl = server.coderStatus === 'connected' ? server.g15_2_url : undefined
        } else if (selectedModel.includes('r1')) {
          targetNodeUrl = server.reasoning_url
        } else if (selectedModel === 'qwen3:8b') {
          // Explicit Laptop 1 Qwen3-8B selection: NEVER route to remote worker nodes
          targetNodeUrl = undefined
        } else if (isAuto) {
          if (hasImageFile) {
            targetNodeUrl = server.vision_url || server.g15_2_url || undefined
          } else if (detectedTask === 'fast') {
            targetNodeUrl = server.fast_4b_url || undefined
          } else {
            // General text, analysis, code, and document queries default to Master Node (Laptop 1: Qwen3-8B)
            targetNodeUrl = undefined
          }
        }

        const userInfo = getActiveUserInfo()
        const effectiveModel = isAuto && !hasImageFile ? 'auto' : selectedModel

        // Universally process any attached files (images to base64, PDFs to extracted text, etc.)
        let base64Images: string[] = []
        let documentContext = ''

        if (hasFiles) {
          const processedResults = await Promise.all(
            (files || []).map(async (f: any) => {
              const fileObj = f.rawFile || f
              if (fileObj instanceof File) {
                return processUserUploadedFile(fileObj)
              }
              return null
            })
          )
          const valid = processedResults.filter(Boolean) as ProcessedUploadedFile[]
          base64Images = valid.filter((p) => p.isImage && p.base64Image).map((p) => p.base64Image!)
          const docSections = valid
            .filter((p) => !p.isImage && p.extractedText)
            .map((p) => `=== Attached Document: ${p.name} ===\n${p.extractedText}`.trim())
          if (docSections.length > 0) {
            documentContext = docSections.join('\n\n')
          }
        }

        const effectivePrompt = documentContext
          ? `${documentContext}\n\nUser Question/Request: ${(content || '').trim() || 'Please analyze the attached document and provide a comprehensive summary and key takeaways.'}`
          : (content || (base64Images.length > 0 ? 'Please inspect and analyze this image in detail.' : ''))

        if (hasFiles) {
          const fd = new FormData()
          const queryText = effectivePrompt
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
          endpoint = `/process-and-ask/?${qp.toString()}`
        } else {
          headers['Content-Type'] = 'application/json'
          body = JSON.stringify({
            messages: messagesForContext,
            prompt: effectivePrompt,
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
          endpoint = `/api/chat`
        }

        const candidates: ClusterTargetCandidate[] = []

        // If user specifically selected or query is Vision / Multimodal:
        if (selectedModel.includes('vl') || selectedModel.includes('vision') || (detectedTask === 'vision' && (isAuto || hasImageFile))) {
          if (server.vision_url) {
            candidates.push({ url: server.vision_url, model: 'qwen2.5-vl:3b', label: 'Laptop 2 (Vision Tunnel)' })
          }
          // Resident local Ollama instance (on Laptop 2 with Qwen2.5-VL)
          candidates.push({ url: 'http://127.0.0.1:11434', model: 'qwen2.5-vl:3b', label: 'Local Ollama (Vision Node)' })
          if (server.fast_4b_url) candidates.push({ url: server.fast_4b_url, model: 'qwen3:4b', label: 'Laptop 3 (Fast)' })
        } else if (selectedModel.includes('4b')) {
          if (server.fast_4b_url) candidates.push({ url: server.fast_4b_url, model: 'qwen3:4b', label: 'Laptop 3 (Fast)' })
          candidates.push({ url: 'http://127.0.0.1:11434', model: 'qwen3:8b', label: 'Laptop 1 (Local Ollama)' })
          if (server.vision_url && server.visionStatus === 'connected') candidates.push({ url: server.vision_url, model: 'qwen2.5-vl:3b', label: 'Laptop 2 (Vision)' })
        } else if (selectedModel.includes('coder')) {
          candidates.push({ url: 'http://127.0.0.1:11434', model: 'qwen2.5-coder:7b', label: 'Laptop 1 (Local Ollama - Coder)' })
          candidates.push({ url: 'http://127.0.0.1:11434', model: 'qwen3:8b', label: 'Laptop 1 (Local Ollama - Master)' })
        } else {
          // General / Auto / 8B / Master / Default:
          candidates.push({ url: 'http://127.0.0.1:11434', model: selectedModel === 'auto' ? 'qwen3:8b' : selectedModel, label: 'Laptop 1 (Local Ollama)' })
          if (server.fast4bStatus === 'connected' && server.fast_4b_url) {
            candidates.push({ url: server.fast_4b_url, model: 'qwen3:4b', label: 'Laptop 3 (Fast)' })
          }
          if (server.visionStatus === 'connected' && server.vision_url) {
            candidates.push({ url: server.vision_url, model: 'qwen2.5-vl:3b', label: 'Laptop 2 (Vision)' })
          }
          if (server.fast_4b_url && !candidates.some((c) => c.url === server.fast_4b_url)) {
            candidates.push({ url: server.fast_4b_url, model: 'qwen3:4b', label: 'Laptop 3 (Fast)' })
          }
        }

        // Add any remaining nodes to candidate pool for absolute failover safety
        if (server.vision_url && !candidates.some((c) => c.url === server.vision_url)) {
          candidates.push({ url: server.vision_url, model: 'qwen2.5-vl:3b', label: 'Laptop 2 (Vision)' })
        }
        if (server.fast_4b_url && !candidates.some((c) => c.url === server.fast_4b_url)) {
          candidates.push({ url: server.fast_4b_url, model: 'qwen3:4b', label: 'Laptop 3 (Fast)' })
        }

        const doDirectOllamaFetch = async (target: ClusterTargetCandidate): Promise<Response> => {
          const directNodeBase = target.url.replace(/\/+$/, '')
          const directEndpoint = `${directNodeBase}/api/chat?ngrok-skip-browser-warning=true`
          const directMessages: { role: string; content: string; images?: string[] }[] = []
          if (systemPrompt) {
            directMessages.push({ role: 'system', content: systemPrompt })
          }

          // Exclude the current user message if already in messagesForContext to prevent duplicate turns
          const priorMessages =
            messagesForContext.length > 0 &&
            messagesForContext[messagesForContext.length - 1].role === 'user' &&
            messagesForContext[messagesForContext.length - 1].content === content
              ? messagesForContext.slice(0, -1)
              : messagesForContext

          priorMessages.forEach((m) => {
            directMessages.push({ role: m.role, content: m.content })
          })

          const userMsgObj: { role: string; content: string; images?: string[] } = {
            role: 'user',
            content: effectivePrompt || (base64Images.length > 0 ? 'Please inspect and analyze this image in detail.' : 'Hello'),
          }
          if (base64Images.length > 0) {
            userMsgObj.images = base64Images
          }
          directMessages.push(userMsgObj)

          const directHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          }
          const directBody = JSON.stringify({
            model: target.model,
            messages: directMessages,
            stream: true,
            options: {
              temperature: 0.3,
              num_predict: 3072,
              num_ctx: 16384,
            },
          })

          return fetch(directEndpoint, {
            method: 'POST',
            headers: directHeaders,
            body: directBody,
            signal: controller.signal,
          })
        }

        let response: Response | null = null
        let resolvedModelUsed: string = selectedModel

        // Attempt 1: Route through Primary Gateway (server.py)
        // Presentations, explicit 8B, Auto mode without dedicated image nodes, or general queries try primary first.
        // Explicit worker targets (e.g. Vision or 4B) prioritize direct worker cascading.
        const isExplicitWorker =
          Boolean(targetNodeUrl) &&
          (selectedModel.includes('vl') || selectedModel.includes('vision') || selectedModel.includes('4b') || hasImageFile)

        const shouldTryPrimaryFirst =
          !isExplicitWorker &&
          (isPresentation ||
            selectedModel === 'qwen3:8b' ||
            selectedModel === 'qwen3-8b' ||
            (isAuto && !hasImageFile) ||
            !targetNodeUrl ||
            server.primaryStatus !== 'disconnected')

        const primaryGateways = [cleanBaseUrl, 'http://127.0.0.1:8000'].filter(
          (u, idx, arr) => Boolean(u) && arr.indexOf(u) === idx
        )

        if (shouldTryPrimaryFirst) {
          for (const gwUrl of primaryGateways) {
            try {
              const sep = endpoint.includes('?') ? '&' : '?'
              const gwEndpoint = `${gwUrl.replace(/\/+$/, '')}${endpoint}${sep}ngrok-skip-browser-warning=true`
              console.log(`[useChat] Connecting to primary gateway (${gwEndpoint})...`)
              const primaryRes = await fetch(gwEndpoint, {
                method: 'POST',
                headers,
                body,
                signal: controller.signal,
              })
              if (primaryRes.ok && primaryRes.body) {
                response = primaryRes
                break
              } else {
                console.warn(`[useChat] Primary gateway (${gwUrl}) returned HTTP ${primaryRes.status}`)
              }
            } catch (err: any) {
              if (controller.signal.aborted) throw err
              console.warn(`[useChat] Primary gateway (${gwUrl}) failed (${err.message})...`)
            }
          }
        }

        // Attempt 2: Cascade through worker nodes ONLY if not a presentation query
        if (!response) {
          if (isPresentation) {
            throw new Error('AIRA Primary Presentation Engine is unreachable. Please verify server.py is running.')
          }
          let lastErr: any = null
          for (const cand of candidates) {
            if (controller.signal.aborted) break
            console.log(`[useChat] Connecting to cluster node: ${cand.label} (${cand.url})...`)
            try {
              const candRes = await doDirectOllamaFetch(cand)
              if (candRes.ok && candRes.body) {
                response = candRes
                resolvedModelUsed = cand.model as ModelId
                updateLastAssistantMessage(sendToChatId, {
                  modelUsed: cand.model as ModelId,
                })
                break
              } else {
                const errText = await candRes.text().catch(() => '')
                let parsedErr = ''
                try {
                  const jsonErr = JSON.parse(errText)
                  parsedErr = jsonErr.error || jsonErr.message || ''
                } catch {
                  parsedErr = errText
                }
                const msg = `${cand.label} returned HTTP ${candRes.status}${parsedErr ? `: ${parsedErr}` : ''}`
                console.warn(`[useChat] ${msg}`)
                lastErr = new Error(msg)
              }
            } catch (candErr: any) {
              if (controller.signal.aborted) throw candErr
              console.warn(`[useChat] ${cand.label} failed: ${candErr.message}. Trying next candidate...`)
              lastErr = candErr
            }
          }

          if (!response) {
            throw lastErr || new Error('All cluster nodes are currently unreachable. Please check node connectivity.')
          }
        }

        if (!response || !response.body) {
          throw new Error('No readable response stream received from cluster.')
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
        // resolvedModelUsed already declared above
        let councilMeta: CouncilMeta | undefined = isCouncilActive
          ? {
              council_active: true,
              nodes_participated: ['Laptop 1 (Master Arbiter · Qwen3-8B)'],
              consensus_score: 96,
              elapsed_seconds: 0,
            }
          : undefined
        let subagentsMeta: SubagentExecution[] | undefined = undefined
        let activeTool: AgentToolActivity | undefined = undefined
        let completedTools: CompletedTool[] = []

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
            activeTool,
            completedTools: [...completedTools],
            isStreaming: isStillStreaming,
            tokensUsed: evalCount || Math.max(1, Math.floor(answerContent.length / 4)),
            latencyMs: thinkElapsedMs,
            modelUsed: (resolvedModelUsed || selectedModel) as ModelId,
          })
        }

        let inOllamaThink = false

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
            if (!trimmed) continue

            const isSse = trimmed.startsWith('data:')
            const raw = isSse ? trimmed.replace(/^data:\s*/, '') : trimmed
            if (!raw) continue

            let evt: any
            try {
              evt = JSON.parse(raw)
            } catch {
              continue
            }

            // Direct Ollama NDJSON chunk support:
            if (!isSse && (evt.message !== undefined || evt.response !== undefined || evt.done !== undefined)) {
              if (evt.model) {
                resolvedModelUsed = evt.model
              }
              const chunkText = evt.message?.content ?? evt.response ?? ''
              if (chunkText) {
                let textToProcess = chunkText
                while (textToProcess) {
                  if (inOllamaThink) {
                    const closeIdx = textToProcess.indexOf('</think>')
                    if (closeIdx !== -1) {
                      rawThinking += textToProcess.slice(0, closeIdx)
                      textToProcess = textToProcess.slice(closeIdx + 8)
                      inOllamaThink = false
                      isThinkingPhase = false
                      if (rawThinking.trim()) {
                        thinkSteps = [
                          ...thinkSteps,
                          { step_number: thinkSteps.length + 1, content: rawThinking.trim() },
                        ]
                        rawThinking = ''
                      }
                      flush()
                    } else {
                      rawThinking += textToProcess
                      textToProcess = ''
                      flush()
                    }
                  } else {
                    const openIdx = textToProcess.indexOf('<think>')
                    if (openIdx !== -1) {
                      answerContent += textToProcess.slice(0, openIdx)
                      textToProcess = textToProcess.slice(openIdx + 7)
                      inOllamaThink = true
                      isThinkingPhase = true
                      if (!thinkStartTime) thinkStartTime = Date.now()
                      flush()
                    } else {
                      answerContent += textToProcess
                      textToProcess = ''
                      flush()
                    }
                  }
                }
              }
              if (evt.done) {
                evalCount = evt.eval_count ?? evalCount
                isThinkingPhase = false
                flush(false)
              }
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

              case 'tool_activity':
                activeTool = {
                  tool: evt.tool || 'agent_tool',
                  action: evt.action || 'Executing background action...',
                  status: evt.status || 'running',
                }
                flush()
                break

              case 'tool_done':
                if (activeTool && activeTool.tool === evt.tool) {
                  activeTool = undefined
                }
                completedTools = [
                  ...completedTools,
                  {
                    tool: evt.tool || 'agent_tool',
                    summary: evt.summary || evt.action || 'Completed action',
                    durationMs: evt.duration_ms,
                  },
                ]
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
                activeTool = undefined
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
