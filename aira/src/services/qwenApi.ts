import type { Message, ModelId, Source, TaskType, UploadedFile } from '../types'

/**
 * Detect task category for badge / routing
 */
export function detectTaskType(content: string): TaskType {
  const text = content.toLowerCase()

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
  // 1. Files / documents uploaded -> OCR & deep extraction needed
  if (filesCount > 0) return true

  // 2. User explicitly selected Deep Reason or Max Effort
  if (effort === 'Deep Reason' || effort === 'Max Effort') return true

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

/**
 * Ping backend node health directly
 */
export async function checkServerHealth(
  baseUrl: string
): Promise<{ connected: boolean; model?: string; error?: string }> {
  const cleanUrl = baseUrl.replace(/\/+$/, '')
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(`${cleanUrl}/health`, {
      method: 'GET',
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

    // Fallback check on root /
    const rootRes = await fetch(`${cleanUrl}/`, { method: 'GET' })
    if (rootRes.ok) {
      return { connected: true, model: 'qwen3:8b' }
    }
    return { connected: false, error: `HTTP ${res.status}` }
  } catch (err: unknown) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : 'Connection failed',
    }
  }
}

/**
 * Real-time SSE streaming from Qwen model backend via Cloudflare tunnel
 */
export async function streamChatResponse(
  messages: Message[],
  _taskType: TaskType,
  serverUrl: string,
  files: UploadedFile[] = [],
  onChunk: (chunk: string) => void,
  onSources: (sources: Source[]) => void,
  onDone: (meta: { tokensUsed: number; latencyMs: number; modelUsed: ModelId }) => void,
  signal?: AbortSignal
): Promise<void> {
  const startTime = Date.now()
  const cleanUrl = (serverUrl || 'https://oasis-modular-card-symbol.trycloudflare.com').replace(/\/+$/, '')
  const modelUsed: ModelId = 'qwen3:8b'

  // Extract latest user prompt
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

  // Build FormData for file attachments or OCR
  const formData = new FormData()
  let hasRawFile = false

  for (const f of files) {
    if (f.rawFile) {
      formData.append('file', f.rawFile)
      hasRawFile = true
      break
    }
  }

  const endpointUrl = `${cleanUrl}/process-and-ask/?user_query=${encodeURIComponent(lastUserMsg)}&stream=true`

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      body: hasRawFile ? formData : undefined,
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
