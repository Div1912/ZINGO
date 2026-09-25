import type { Message, ModelId, Source, TaskType, UploadedFile } from '../types'

/**
 * Check if the query is requesting a PowerPoint / slide deck / presentation deliverable
 */
export function isPresentationQuery(content: string): boolean {
  if (!content) return false
  const text = content.toLowerCase().trim()
  return /\b(ppt|pptx|powerpoint|presentation|slide deck|slides|pitch deck|deck|keynote|slideshow)\b/i.test(text)
}

/**
 * Detect task category for badge / routing
 */
export function detectTaskType(content: string): TaskType {
  const text = content.toLowerCase()

  if (isPresentationQuery(text)) return 'analysis'

  const codeKeywords = [
    'code', 'script', 'python', 'bash', 'function', 'def ', 'import ', 'sql',
    'algorithm', 'regex', 'curl', 'api', 'calculator', 'formula', 'yield'
  ]
  const documentKeywords = [
    'sop', 'oisd', 'permit', 'manual', 'procedure', 'cdu', 'vdu', 'valve',
    'safety', 'ptw', 'inspection', 'standard', 'flange', 'iso', 'turnaround'
  ]
  const analysisKeywords = [
    'analyze', 'analysis', 'compare', 'trend', 'summary', 'audit', 'findings',
    'corrosion', 'fouling', 'root cause', 'efficiency', 'loss'
  ]

  const visionKeywords = [
    'image', 'picture', 'photo', 'diagram', 'blueprint', 'p&id', 'drawing',
    'schematic', 'visual', 'chart', 'layout'
  ]

  if (visionKeywords.some((k) => text.includes(k))) return 'vision'
  if (codeKeywords.some((k) => text.includes(k))) return 'code'
  if (documentKeywords.some((k) => text.includes(k))) return 'document'
  if (analysisKeywords.some((k) => text.includes(k))) return 'analysis'
  return 'general'
}

/**
 * Determine if a task is complex enough to require the Neural Cluster thinking card
 */
export function isComplexTask(
  content: string,
  filesCount: number = 0,
  effort?: string
): boolean {
  if (isPresentationQuery(content)) return true

  // 1. Files / documents uploaded -> OCR & deep extraction needed
  if (filesCount > 0) return true

  // 2. User explicitly selected Deep Research, Deep Reason, or Max Effort
  const eff = (effort || '').toLowerCase()
  if (eff.includes('deep') || eff.includes('reason') || eff.includes('research') || eff.includes('max')) return true

  const text = content.toLowerCase().trim()

  // 3. Simple greetings and conversational queries are NEVER complex
  const simpleQueries = [
    'hi', 'hii', 'hiii', 'hello', 'hey', 'heyy', 'who are you', 'who r u',
    'what is your name', 'how are you', 'good morning', 'good evening',
    'good afternoon', 'what can you do', 'test', 'ping', 'thanks', 'thank you',
    'ok', 'okay', 'bye', 'good night', 'help', 'sup'
  ]
  if (simpleQueries.includes(text)) return false
  if (text.length <= 15 && !/[0-9=+\-*/^]/.test(text)) return false

  // 4. Non-general tasks (code, document, analysis)
  const task = detectTaskType(content)
  if (task === 'code' || task === 'document' || task === 'analysis') {
    return true
  }

  // 5. Engineering / industrial / complex reasoning keywords
  const complexKeywords = [
    'calculate', 'mass balance', 'heat balance', 'exchanger', 'distillation',
    'refinery', 'oisd', 'cdu', 'vdu', 'pipeline', 'corrosion', 'fouling',
    'algorithm', 'optimize', 'root cause', 'troubleshoot', 'simulation',
    'furnace', 'reboiler', 'hydraulic', 'thermodynamic', 'furnace', 'fraction'
  ]
  if (complexKeywords.some((k) => text.includes(k))) {
    return true
  }

  // 6. Long technical queries (> 180 characters)
  if (text.length > 180) {
    return true
  }

  return false
}

export type TaskIntensity = 'light' | 'moderate' | 'high' | 'code' | 'vision'

export interface TaskClassification {
  intensity: TaskIntensity
  recommendedModel: ModelId
  taskType: TaskType
  reason: string
  isComplex: boolean
}

/**
 * Intelligent Complexity & Intensity Classifier
 * Classifies incoming query based on cognitive load, technical depth, and domain context
 * to allocate the optimal node across the cluster:
 *  - Low intensity / conversational / fast queries -> Node 3 (Qwen3-4B Fast Synthesis)
 *  - Moderate & High intensity / engineering / reasoning -> Node 1 (Qwen3-8B Master Arbiter)
 *  - Code syntax & implementation -> Qwen2.5-Coder-7B
 *  - Visuals, OCR & schematics -> Qwen2.5-VL Multimodal
 */
export function classifyTaskIntensity(
  content: string,
  hasImages: boolean = false,
  filesCount: number = 0,
  effort?: string
): TaskClassification {
  const text = (content || '').toLowerCase().trim()
  const detectedTask = detectTaskType(content || '')
  const eff = (effort || '').toLowerCase()

  // 0. Presentation & Slide Deck Intent -> Always 3-Node Cluster Synergy on Master Node (Qwen3-8B)
  // Coordinates: Node 3 (Qwen3-4B Outline) + Node 2 (Qwen2.5-VL Layout) + Node 1 (Qwen3-8B Synthesis)
  if (isPresentationQuery(content)) {
    return {
      intensity: 'high',
      recommendedModel: 'qwen3:8b',
      taskType: 'analysis',
      reason: '3-Node Collaborative PPT Engine (Node 3 Ideation + Node 2 Layout + Node 1 Synthesis)',
      isComplex: true,
    }
  }

  // 1. Multimodal / Vision
  if (hasImages || detectedTask === 'vision') {
    return {
      intensity: 'vision',
      recommendedModel: 'qwen2.5vl:3b',
      taskType: 'vision',
      reason: 'Visual inspection, diagram analysis & OCR extraction',
      isComplex: true,
    }
  }

  // 2. Code implementation & debugging
  if (detectedTask === 'code') {
    return {
      intensity: 'code',
      recommendedModel: 'qwen2.5-coder:7b',
      taskType: 'code',
      reason: 'Programming syntax, script generation & code debugging',
      isComplex: true,
    }
  }

  // 3. User explicitly requested Deep Research / Max Effort
  if (eff.includes('deep') || eff.includes('reason') || eff.includes('research') || eff.includes('max')) {
    return {
      intensity: 'high',
      recommendedModel: 'qwen3:8b',
      taskType: detectedTask,
      reason: 'Deep multi-step reasoning & thorough cognitive synthesis',
      isComplex: true,
    }
  }

  // 4. File attachments -> Requires Master reasoning & document extraction
  if (filesCount > 0) {
    return {
      intensity: 'high',
      recommendedModel: 'qwen3:8b',
      taskType: 'document',
      reason: 'Document grounding, structural extraction & cross-referencing',
      isComplex: true,
    }
  }

  // 5. Engineering, Industrial, Regulatory, Mathematical, or System Troubleshooting keywords
  const heavyKeywords = [
    'calculate', 'formula', 'mass balance', 'heat balance', 'pressure drop',
    'exchanger', 'cdu', 'vdu', 'distillation', 'refinery', 'oisd', 'pipeline',
    'corrosion', 'fouling', 'root cause', 'troubleshoot', 'simulation',
    'reboiler', 'hydraulic', 'thermodynamic', 'furnace', 'flange', 'iso',
    'turnaround', 'inspection', 'hazard', 'safety limit', 'interlock', 'trips',
    'step by step', 'compare', 'contrast', 'explain how', 'why does', 'architecture',
    'specification', 'standard', 'sop', 'permit', 'ptw'
  ]

  const matchesHeavy = heavyKeywords.some((k) => text.includes(k))
  const hasFormulasOrMath = /[0-9]+\s*[\+\-\*\/\^=><]\s*[0-9]+/.test(text)
  const isLongDetailedQuery = text.length > 130

  if (matchesHeavy || hasFormulasOrMath || isLongDetailedQuery) {
    return {
      intensity: 'high',
      recommendedModel: 'qwen3:8b',
      taskType: detectedTask === 'general' ? 'analysis' : detectedTask,
      reason: 'High-intensity industrial engineering, calculations & technical reasoning',
      isComplex: true,
    }
  }

  // 6. Fast / Lightweight queries -> Route to Qwen3-4B to save time and give ultra-fast sub-second answers!
  // Simple greetings, casual chit-chat, quick factual questions, short summaries, or simple definitions
  const simpleGreetings = [
    'hi', 'hii', 'hiii', 'hello', 'hey', 'heyy', 'who are you', 'who r u',
    'what is your name', 'how are you', 'good morning', 'good evening',
    'good afternoon', 'what can you do', 'test', 'ping', 'thanks', 'thank you',
    'ok', 'okay', 'bye', 'good night', 'help', 'sup'
  ]

  const isGreeting = simpleGreetings.includes(text) || (text.length <= 15 && !/[0-9]/.test(text))
  const isShortLookup = text.length <= 70 && !matchesHeavy && !hasFormulasOrMath

  if (isGreeting || isShortLookup || eff.includes('fast')) {
    return {
      intensity: 'light',
      recommendedModel: 'qwen3:4b',
      taskType: 'fast',
      reason: 'Fast synthesis, low-latency response & conversational agility',
      isComplex: false,
    }
  }

  // 7. Moderate queries: Default to Master Node (Qwen3-8B) for high-quality standard responses
  return {
    intensity: 'moderate',
    recommendedModel: 'qwen3:8b',
    taskType: detectedTask,
    reason: 'Standard knowledge synthesis & balanced cognitive response',
    isComplex: isComplexTask(content, filesCount, effort),
  }
}

/**
 * Ping backend node health directly with server proxy fallback to bypass CORS
 */
export async function checkServerHealth(
  baseUrl: string,
  proxyHost?: string
): Promise<{ connected: boolean; model?: string; error?: string }> {
  const cleanUrl = (baseUrl || '').trim().replace(/\/+$/, '')
  if (!cleanUrl) {
    return { connected: false, error: 'Empty URL' }
  }

  // 1. Direct fetch attempts
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    // Probe 1: Ollama tags
    try {
      const tagRes = await fetch(`${cleanUrl}/api/tags`, {
        method: 'GET',
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: controller.signal,
      })
      if (tagRes.ok) {
        clearTimeout(timeoutId)
        const data = await tagRes.json()
        const models = (data.models || []).map((m: any) => m.name)
        return { connected: true, model: models[0] || 'Ollama Node' }
      }
    } catch {
      // Continue to next probe
    }

    // Probe 2: FastAPI health
    const res = await fetch(`${cleanUrl}/api/health`, {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      return {
        connected: true,
        model: data.model || 'qwen3:8b',
      }
    }
  } catch {
    // Direct browser fetch failed (common with cross-origin LAN IPs)
  }

  // 2. Fallback: Query master node proxy to ping the target node without browser CORS
  const master = (proxyHost || 'http://127.0.0.1:8000').replace(/\/+$/, '')
  try {
    const proxyRes = await fetch(`${master}/api/cluster/ping?node_url=${encodeURIComponent(cleanUrl)}`, {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true' },
    })
    if (proxyRes.ok) {
      const data = await proxyRes.json()
      if (data.connected) {
        return { connected: true, model: data.active || data.model || 'ready' }
      }
    }
  } catch {
    // Both failed
  }

  return {
    connected: false,
    error: 'Node unreachable or offline',
  }
}

/**
 * Real-time SSE streaming from distributed Qwen/Cluster model backend via tunnel or LAN
 */
export async function streamChatResponse(
  messages: Message[],
  _taskType: TaskType,
  serverUrl: string,
  files: UploadedFile[] = [],
  onChunk: (chunk: string) => void,
  onSources: (sources: Source[]) => void,
  onDone: (meta: { tokensUsed: number; latencyMs: number; modelUsed: ModelId }) => void,
  signal?: AbortSignal,
  effort?: string,
  targetModel?: ModelId,
  targetNodeUrl?: string
): Promise<void> {
  const startTime = Date.now()
  const cleanUrl = (serverUrl || 'https://splendid-sensibly-primate.ngrok-free.app').replace(/\/+$/, '')
  let modelUsed: ModelId = targetModel || 'qwen3:8b'

  // Extract latest user prompt
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

  // Build FormData for conversation history + file attachments
  const formData = new FormData()

  for (const f of files) {
    if (f.rawFile) {
      formData.append('file', f.rawFile)
      break
    }
  }

  // Include multi-turn conversation history so follow-up questions are understood in context
  const history = messages.slice(-16).map((m) => ({
    role: m.role,
    content: m.content,
  }))
  formData.append('messages', JSON.stringify(history))

  const effortParam = encodeURIComponent(effort || 'Fast')
  const modelParam = targetModel && targetModel !== 'auto' ? `&model=${encodeURIComponent(targetModel)}` : ''
  const nodeParam = targetNodeUrl ? `&node_url=${encodeURIComponent(targetNodeUrl)}` : ''
  const endpointUrl = `${cleanUrl}/process-and-ask/?user_query=${encodeURIComponent(lastUserMsg)}&stream=true&effort=${effortParam}${modelParam}${nodeParam}`

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      body: formData,
      signal,
    })

    if (!response.ok) {
      throw new Error(`Model server returned HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''

    // 1. If server responded with SSE stream
    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let accumulated = ''
      let evalCount = 0
      let buffer = ''

      while (true) {
        if (signal?.aborted) {
          await reader.cancel()
          break
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep the last partial line in buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const jsonStr = trimmed.replace(/^data:\s*/, '')
          try {
            const data = JSON.parse(jsonStr)

            if (data.type === 'meta') {
              if (data.model) {
                modelUsed = data.model as ModelId
              }
              if (data.ocr_context_found) {
                onSources([
                  {
                    id: 'src-ocr-extract',
                    title: 'Live OCR Document Text',
                    document: files[0]?.name || 'Attached Document',
                    excerpt: `Extracted ${data.context_length || 0} characters using EasyOCR on on-premise GPU node.`,
                    relevanceScore: 1.0,
                  },
                ])
              }
            } else if (data.type === 'chunk') {
              if (data.chunk) {
                accumulated += data.chunk
                onChunk(accumulated)
              }
              if (data.eval_count) {
                evalCount = data.eval_count
              }
              if (data.done) {
                break
              }
            } else if (data.type === 'error') {
              throw new Error(data.error || 'Server error during inference')
            }
          } catch (pErr) {
            // Ignore JSON parse err for non-JSON lines
          }
        }
      }

      const latencyMs = Math.max(200, Date.now() - startTime)
      const tokensUsed = evalCount || Math.max(1, Math.floor(accumulated.length / 4))

      onDone({
        tokensUsed,
        latencyMs,
        modelUsed,
      })
      return
    }

    // 2. Fallback: Non-streaming JSON response
    const json = await response.json()
    const answer = json.answer || json.response || 'No response received from model.'

    if (json.ocr_context_found) {
      onSources([
        {
          id: 'src-ocr-extract',
          title: 'Live OCR Document Text',
          document: files[0]?.name || 'Attached Document',
          excerpt: `Extracted ${json.context_length || 0} characters using EasyOCR on on-premise GPU node.`,
          relevanceScore: 1.0,
        },
      ])
    }

    // Smoothly stream out non-streaming responses for consistent UX
    const words = answer.split(/(\s+)/)
    let accumulated = ''
    for (const word of words) {
      if (signal?.aborted) break
      accumulated += word
      onChunk(accumulated)
      await new Promise((r) => setTimeout(r, 20))
    }

    const latencyMs = Math.max(200, Date.now() - startTime)
    const tokensUsed = json.eval_count || Math.max(1, Math.floor(answer.length / 4))

    onDone({
      tokensUsed,
      latencyMs,
      modelUsed,
    })
  } catch (err: unknown) {
    if (signal?.aborted) return
    throw err
  }
}
