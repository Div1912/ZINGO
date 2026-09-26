import React, { useState, useRef } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Highlight, themes } from 'prism-react-renderer'
import {
  Copy,
  Check,
  Play,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  BookOpen,
  FileText,
  AlertCircle,
  Clock,
  Zap,
  FileDown,
  Mail,
  Sparkles,
  Eye,
  ShieldCheck,
  Presentation,
  Scale,
  Bot,
} from 'lucide-react'
import type { Message } from '../../types'
import { ModelBadge, formatModelDisplayName } from './ModelBadge'
import { ThinkingBlock } from './ThinkingBlock'
import { SubagentPanel } from './SubagentPanel'
import { useSettingsStore } from '../../stores/settingsStore'
import { useToastStore } from '../../stores/toastStore'
import { useChatStore } from '../../stores/chatStore'
import { useArtifactStore } from '../../stores/artifactStore'
import { useProjectStore } from '../../stores/projectStore'
import { extractProjectFromMessage, createVirtualProjectFromParsed } from '../../utils/multiFileParser'
import { hasSearchReplaceDiffs } from '../../utils/diffEngine'
import { pyodideEngine, type PyodideExecutionResult } from '../../services/pyodideService'
import { isPresentationProject, exportVirtualProjectToPptx } from '../../services/pptxExportService'
import { ArtifactCard } from '../artifacts/ArtifactCard'
import { PastChatSearchCard } from './PastChatSearchCard'
import { DeliverableCard } from './DeliverableCard'

import { exportMessageToPdf } from '../../services/pdfExport'


interface MessageBubbleProps {
  message: Message
  onRegenerate?: () => void
  onRunCode?: (code: string) => void
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onRegenerate,
  onRunCode,
}) => {
  const { settings } = useSettingsStore()
  const { addToast } = useToastStore()
  const { toggleSourcePanel, setActiveSources, activeChatId, updateMessage } = useChatStore()
  const { artifacts, openInSandbox, createOrUpdateArtifact, openArtifact } = useArtifactStore()

  // Match artifacts associated with this message
  const matchedArtifacts = React.useMemo(() => {
    if (message.artifactIds && message.artifactIds.length > 0) {
      return artifacts.filter((a) => message.artifactIds?.includes(a.id))
    }
    if (!message.content) return []
    return artifacts.filter(
      (a) =>
        (a.content && a.content.length > 30 && message.content.includes(a.content.slice(0, 50))) ||
        (a.identifier && a.identifier.startsWith(`plot-${message.id}`))
    )
  }, [artifacts, message.artifactIds, message.content, message.id])

  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null)
  const [pyodideOutputs, setPyodideOutputs] = useState<Record<string, PyodideExecutionResult | null>>({})
  const [pyodideLoading, setPyodideLoading] = useState<Record<string, boolean>>({})
  const contentRef = useRef<HTMLDivElement>(null)

  // Strictly parse & isolate thinking blocks, while keeping finalContent pristine
  const { sanitizedContent: finalContent, extractedThinking: thinkingText, isThinkingComplete } = React.useMemo(() => {
    const raw = message.content || ''
    let thinking = ''
    let isComplete = true

    // 1. Extract closed <think>...</think> or <thought>...</thought> blocks
    const closedThinkRegex = /<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/gi
    let match: RegExpExecArray | null
    while ((match = closedThinkRegex.exec(raw)) !== null) {
      if (match[1]?.trim()) {
        thinking += (thinking ? '\n\n' : '') + match[1].trim()
      }
    }
    let clean = raw.replace(closedThinkRegex, '')

    // 2. Check for in-flight unclosed <think> or <thought> block
    const unclosedMatch = clean.match(/<(?:think|thought)>([\s\S]*)$/i)
    if (unclosedMatch) {
      if (unclosedMatch[1]?.trim()) {
        thinking += (thinking ? '\n\n' : '') + unclosedMatch[1].trim()
      }
      clean = clean.replace(/<(?:think|thought)>[\s\S]*$/i, '')
      isComplete = false
    }

    // 3. Strip internal model deliberations / council briefs so user NEVER sees raw debate
    clean = clean
      .replace(/(?:^|\n)Technical Architecture & Plan from Node 2[^\n]*\n[\s\S]*?(?=\n\n|$)/gi, '')
      .replace(/(?:^|\n)={3,}\s*\nAIRA MODEL COUNCIL DELIBERATION BRIEF[\s\S]*?={3,}\s*\n/gi, '')
      .replace(/(?:^|\n)\[PERSPECTIVE [AB]:[\s\S]*?(?=\n\[PERSPECTIVE|\nARBITER INSTRUCTIONS:|\n={3,}|\n\n[A-Z]|$)/gi, '')
      .replace(/(?:^|\n)ARBITER INSTRUCTIONS:[\s\S]*?(?=\n={3,}|\n\n|$)/gi, '')
      .replace(/(?:^|\n)={3,}\s*\n=== DELEGATED CLUSTER SUBAGENT BRIEFINGS[\s\S]*?=== SYNTHESIS INSTRUCTIONS FOR CHIEF ARBITER ===[\s\S]*?(?=\n\n[A-Z]|$)/gi, '')
      .replace(/(?:^|\n)=== DELEGATED CLUSTER SUBAGENT BRIEFINGS[\s\S]*?=== SYNTHESIS INSTRUCTIONS FOR CHIEF ARBITER ===[^\n]*\n?/gi, '')

    // 4. Strip decorative AI-generated emojis and pseudo-icons from headers, bullets, and lists
    clean = clean
      .replace(/^(#{1,6}\s*)[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}-\u{2B55}\u{FE0E}\u{FE0F}]+\s*/gmu, '$1')
      .replace(/^(\s*[-*•]\s*)[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}-\u{2B55}\u{FE0E}\u{FE0F}]+\s*/gmu, '$1')
      .replace(/^(\s*\d+\.\s*)[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}-\u{2B55}\u{FE0E}\u{FE0F}]+\s*/gmu, '$1')
      .replace(/^(#{1,6}\s*.*?)\s*[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}-\u{2B55}\u{FE0E}\u{FE0F}]+$/gmu, '$1')

    // 5. Strip raw <artifact ...>...</artifact> and <antArtifact ...> tags so raw XML doesn't flood markdown text
    clean = clean
      .replace(/<(?:artifact|antArtifact)\b[^>]*>[\s\S]*?<\/(?:artifact|antArtifact)>/gi, '')
      .replace(/<(?:artifact|antArtifact)\b[\s\S]*$/gi, '')

    return {
      sanitizedContent: clean.trim(),
      extractedThinking: thinking.trim(),
      isThinkingComplete: isComplete,
    }
  }, [message.content])

  // Unified think steps: use message.thinkSteps if available, or parse thinkingText
  const displaySteps = React.useMemo(() => {
    if (message.thinkSteps && message.thinkSteps.length > 0) {
      return message.thinkSteps
    }
    if (thinkingText) {
      const parts = thinkingText
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
      if (parts.length > 0) {
        return parts.map((content, idx) => ({ step_number: idx + 1, content }))
      }
      return [{ step_number: 1, content: thinkingText }]
    }
    return []
  }, [message.thinkSteps, thinkingText])

  const hasAnyThinking = Boolean(
    displaySteps.length > 0 ||
    message.rawThinking ||
    message.isThinkingPhase ||
    (!isThinkingComplete && Boolean(thinkingText))
  )

  const isUser = message.role === 'user'
  const { virtualProjects, openSandboxCanvas, saveVirtualProject, applyPatchToVirtualProject } = useProjectStore()

  // Detect if this message contains a runnable virtual project
  const detectedProject = React.useMemo(() => {
    if (isUser || !message.content || message.content.length < 50) return null
    const existing = virtualProjects.find((p) => p.messageId === message.id)
    if (existing) return existing
    const parsed = extractProjectFromMessage(finalContent || message.content)
    if (parsed && (parsed.isMultiFile || parsed.isInteractiveApp)) {
      return createVirtualProjectFromParsed(parsed, { messageId: message.id })
    }
    return null
  }, [message.id, message.content, finalContent, isUser, virtualProjects])

  // Detect if this message contains Search/Replace Diffs
  const hasDiffs = React.useMemo(() => {
    if (isUser || !message.content) return false
    return hasSearchReplaceDiffs(finalContent || message.content)
  }, [finalContent, message.content, isUser])

  const handleApplyDiffs = () => {
    const activeProj = virtualProjects[0]
    if (!activeProj) {
      addToast({ type: 'error', message: 'No active project found to apply diffs to.' })
      return
    }
    const res = applyPatchToVirtualProject(activeProj.id, finalContent || message.content)
    if (res.success) {
      openSandboxCanvas(activeProj.id)
      addToast({
        type: 'success',
        title: 'Diffs Applied',
        message: `Successfully applied ${res.appliedCount} search/replace patch(es) to ${activeProj.title}`,
      })
    } else {
      addToast({
        type: 'error',
        title: 'Patch Failed',
        message: res.errors[0] || 'Could not apply search/replace patch.',
      })
    }
  }

  const handleLaunchProjectSandbox = () => {
    if (!detectedProject) return
    const id = saveVirtualProject(detectedProject)
    openSandboxCanvas(id)
    addToast({
      type: 'info',
      title: detectedProject.title,
      message: 'Opening project in dedicated Live Sandbox...',
    })
  }

  const [isExportingPptx, setIsExportingPptx] = useState(false)

  const handleExportPptx = async () => {
    if (!detectedProject) return
    setIsExportingPptx(true)
    addToast({
      type: 'info',
      title: 'PowerPoint Compilation',
      message: 'Synthesizing professional 16:9 .pptx slide deck in-browser...',
    })
    try {
      const fileName = await exportVirtualProjectToPptx(detectedProject)
      addToast({
        type: 'success',
        title: 'Download Complete',
        message: `Saved ${fileName} ready for Microsoft PowerPoint & Google Slides.`,
      })
    } catch (err) {
      console.error('Failed to export PPTX:', err)
      addToast({
        type: 'error',
        title: 'Export Failed',
        message: err instanceof Error ? err.message : 'Could not generate .pptx file',
      })
    } finally {
      setIsExportingPptx(false)
    }
  }

  const copyMessageContent = async () => {
    await navigator.clipboard.writeText(finalContent || message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    addToast({ type: 'info', message: 'Message copied to clipboard' })
  }

  const handleExportPdf = async () => {
    const contentEl = contentRef.current
    if (!contentEl) return

    addToast({ type: 'info', message: 'Generating clean engineering PDF report...' })
    const title = `ZINGO_Report_${new Date().toISOString().slice(0, 10)}`

    try {
      const success = await exportMessageToPdf(contentEl, {
        title,
        modelName: message.modelUsed || 'Qwen 2.5 7B (Local Sovereign)',
        settings,
      })
      if (success) {
        addToast({ type: 'success', message: 'Print dialog ready — select "Save as PDF"' })
      }
    } catch (err) {
      console.error('PDF export failed:', err)
      addToast({ type: 'error', message: 'Failed to generate PDF document' })
    }
  }

  const handleSendEmail = () => {
    const text = finalContent || message.content || ''
    if (!text) return

    const toMatch = text.match(/(?:to|recipient):\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
    const to = toMatch ? toMatch[1] : 'div.engineer@mrpl.co.in'

    const subjectMatch = text.match(/(?:subject|re):\s*([^\n\r]+)/i)
    const defaultSubject = `ZINGO Engineering Summary - ${new Date().toLocaleDateString()}`
    const subject = subjectMatch ? subjectMatch[1].trim() : defaultSubject

    let body = text
    if (subjectMatch) {
      body = body.replace(/(?:subject|re):\s*[^\n\r]+/i, '').trim()
    }
    if (toMatch) {
      body = body.replace(/(?:to|recipient):\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i, '').trim()
    }

    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailtoUrl, '_blank')
    addToast({ type: 'success', message: 'Opened email client with pre-filled draft' })
  }

  const handleFeedback = (type: 'up' | 'down') => {
    if (feedback === type) {
      setFeedback(null)
    } else {
      setFeedback(type)
      addToast({
        type: 'success',
        message: type === 'up' ? 'Feedback recorded: Positive' : 'Feedback recorded: Needs Improvement',
      })
    }
  }

  const handleOpenSources = () => {
    if (message.sources && message.sources.length > 0) {
      setActiveSources(message.sources)
      toggleSourcePanel(true)
    }
  }

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  // 1. User Message
  if (isUser) {
    return (
      <div data-message-id={message.id} className="flex flex-col items-end my-5 px-4 sm:px-6">
        <div className="max-w-[85%] sm:max-w-[70%] bg-elevated border border-border rounded-2xl rounded-tr-sm p-4 text-content-primary shadow-xs">
          {/* File Attachments Chips */}
          {message.files && message.files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-border/60">
              {message.files.map((file) => (
                <div
                  key={file.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-surface border border-border text-[11px] font-medium text-content-secondary"
                >
                  <FileText size={12} className="text-content-primary" />
                  <span className="truncate max-w-[140px]">{file.name}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap select-text font-normal">
            {message.content}
          </p>
        </div>
        <span className="text-[11px] text-content-tertiary mt-1 px-1">
          {formattedTime}
        </span>
      </div>
    )
  }

  // 2. Assistant Message
  return (
    <div data-message-id={message.id} className="flex gap-3 sm:gap-4 my-6 px-4 sm:px-6 max-w-4xl mx-auto w-full">
      {/* AIRA Logo Mark Avatar */}
      <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
        <svg
          className="w-4 h-4 text-content-primary"
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
        >
          <polygon points="50,6 90,29 90,75 50,98 10,75 10,29" />
        </svg>
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        {/* Header line: AIRA label + Model Badge */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-semibold text-xs tracking-tight text-content-primary">
            AIRA
          </span>
          {settings.showModelBadge && (
            <ModelBadge
              model={message.modelUsed}
              taskType={message.taskType}
            />
          )}
          {(message.councilMeta?.council_active || (message.modelUsed && message.modelUsed.includes('Council'))) && (
            <div
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25 shadow-2xs select-none"
              title={
                message.councilMeta
                  ? `Consensus Index: ${message.councilMeta.consensus_score}%\nNodes: ${message.councilMeta.nodes_participated?.join(', ')}\nElapsed: ${message.councilMeta.elapsed_seconds}s`
                  : 'Deliberated via 3-Node Model Council'
              }
            >
              <Scale size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Council Deliberated</span>
              <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-mono">
                · {message.councilMeta?.nodes_participated?.length || 3} Nodes
              </span>
              {Boolean(message.councilMeta?.consensus_score) && (
                <span className="text-[10px] font-mono font-semibold bg-amber-500/20 px-1 py-0.2 rounded text-amber-800 dark:text-amber-200">
                  {message.councilMeta?.consensus_score}%
                </span>
              )}
            </div>
          )}
          {message.subagents && message.subagents.some((s) => s.status === 'completed') && (
            <div
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 shadow-2xs select-none"
              title={`${message.subagents.filter((s) => s.status === 'completed').length} Autonomous Subagents executed in parallel across cluster`}
            >
              <Bot size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Subagent Swarm</span>
              <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-mono">
                · {message.subagents.filter((s) => s.status === 'completed').length} Specialists
              </span>
            </div>
          )}
        </div>

        {/* Content Body / Streaming Indicator / Error */}
        {message.isStreaming && !message.content && !hasAnyThinking ? (
          <div className="flex items-center gap-2.5 py-3 text-content-secondary animate-in fade-in duration-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
            </span>
            <span className="text-xs font-mono text-content-secondary">
              Initiating sovereign cognition...
            </span>
          </div>
        ) : message.error ? (
          <div className="p-3.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{message.error}</span>
            </div>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="btn-glass !py-1 !px-2.5 !text-[11px] !border-danger/40"
              >
                Try again
              </button>
            )}
          </div>
        ) : (
          <div ref={contentRef} className="markdown-body select-text">
            {hasAnyThinking && (
              <div className="mb-3">
                <ThinkingBlock
                  steps={displaySteps}
                  rawThinking={message.rawThinking || (!isThinkingComplete ? thinkingText : '')}
                  isStreaming={Boolean(message.isStreaming)}
                  isThinkingPhase={Boolean(message.isThinkingPhase || (!isThinkingComplete && Boolean(thinkingText)))}
                  totalSteps={message.thinkTotalSteps || (displaySteps.length > 0 ? displaySteps.length : undefined)}
                  elapsedMs={message.thinkElapsedMs}
                  isInterrupted={Boolean(message.isThinkingInterrupted)}
                />
              </div>
            )}

            {/* Autonomous Subagent Swarm Panel */}
            {message.subagents && message.subagents.some((s) => s.status === 'completed') && (
              <SubagentPanel subagents={message.subagents} />
            )}

            {/* Past Chat Search RAG Card */}
            {message.pastChatSearch && message.pastChatSearch.results && message.pastChatSearch.results.length > 0 && (
              <PastChatSearchCard meta={message.pastChatSearch} />
            )}

            {finalContent ? (
              <Markdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  a({ href, children, ...props }: any) {
                    if (href && (href.startsWith('chat://') || href.startsWith('#chat-'))) {
                      const targetChatId = href.replace(/^(?:chat:\/\/|#chat-)/, '')
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            useChatStore.getState().setActiveChat(targetChatId)
                            addToast({
                              type: 'info',
                              title: 'Conversation Switched',
                              message: 'Navigated to referenced past discussion.',
                            })
                          }}
                          className="inline-flex items-center gap-1 font-medium text-sky-400 hover:text-sky-300 underline underline-offset-2 cursor-pointer bg-sky-950/40 border border-sky-500/20 px-1.5 py-0.5 rounded text-xs transition-colors my-0.5"
                          title={`Jump to chat ${targetChatId}`}
                        >
                          <span>💬</span>
                          <span>{children}</span>
                        </button>
                      )
                    }
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-hover" {...props}>
                        {children}
                      </a>
                    )
                  },
                  code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '')
                    const codeText = String(children).replace(/\n$/, '')

                    if (!inline && match) {
                      const lang = match[1]
                      const codeIndex = Math.random()
                      const blockKey = `${message.id}_${codeText.slice(0, 32)}`

                      // Claude style: If this code block was captured as an interactive Artifact,
                      // suppress rendering the raw code block so the chat message stays clean and concise.
                      const isArtifactCode = matchedArtifacts.some(
                        (a) =>
                          a.content.trim() === codeText.trim() ||
                          a.versions?.some((v) => v.content.trim() === codeText.trim())
                      )
                      if (isArtifactCode) {
                        return null
                      }

                      // Claude/Gemini style: Suppress raw JSON manifest dump; presentation banner renders below
                      if (
                        (lang === 'json' || (className && className.includes('json'))) &&
                        codeText.includes('"slides"') &&
                        (codeText.includes('"title"') || codeText.includes('"layout"'))
                      ) {
                        return (
                          <div className="my-3 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs text-amber-300 shadow-sm">
                            <div className="flex items-center gap-2">
                              <Presentation size={15} className="text-amber-400" />
                              <span className="font-semibold text-slate-100">Executive Slide Deck Compiled</span>
                              <span className="text-[11px] text-amber-200/80 font-mono">· 16:9 Widescreen</span>
                            </div>
                            <span className="text-[11px] text-amber-400 font-mono font-medium">Ready for PPTX Export ↓</span>
                          </div>
                        )
                      }

                      return (
                        <div className="my-4 rounded-xl overflow-hidden border border-border bg-[#0C0C0C]">
                          {/* Code Block Header */}
                          <div className="flex items-center justify-between px-3.5 py-2 bg-[#161616] border-b border-border text-xs">
                            <span className="font-mono text-content-secondary font-medium lowercase">
                              {lang}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={async () => {
                                  await navigator.clipboard.writeText(codeText)
                                  setCopiedCodeIndex(codeIndex)
                                  setTimeout(() => setCopiedCodeIndex(null), 2000)
                                }}
                                className="btn-ghost !py-1 !px-2 !text-[11px] text-content-secondary hover:text-content-primary flex items-center gap-1"
                              >
                                {copiedCodeIndex === codeIndex ? (
                                  <>
                                    <Check size={12} className="text-success" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>

                              {/* Web Sandbox Preview Button (Claude-Style) */}
                              {(['html', 'htm', 'svg', 'react', 'jsx', 'tsx', 'javascript', 'js', 'css'].includes(lang.toLowerCase()) ||
                                codeText.includes('<!DOCTYPE') ||
                                codeText.includes('<html') ||
                                (codeText.includes('<div') && codeText.includes('</div>'))) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (detectedProject) {
                                      handleLaunchProjectSandbox()
                                    } else {
                                      openInSandbox(codeText, lang)
                                      addToast({
                                        type: 'info',
                                        message: 'Opening in dedicated sandbox...',
                                      })
                                    }
                                  }}
                                  className="btn-glass !py-1 !px-2.5 !text-[11px] !rounded-md flex items-center gap-1.5 text-violet-300 hover:text-white border-violet-500/30 bg-violet-500/15 hover:bg-violet-500/25 transition-all shadow-xs"
                                  title="Test and display live application in dedicated sandbox"
                                >
                                  <Sparkles size={11} className="text-violet-400" />
                                  <span>{detectedProject ? 'Open Project Sandbox ›' : 'Preview Site ›'}</span>
                                </button>
                              )}

                              {/* In-Browser Sovereign Python WebAssembly (Pyodide) Execution */}
                              {(lang.toLowerCase() === 'python' || lang.toLowerCase() === 'py') && (
                                <button
                                  type="button"
                                  disabled={pyodideLoading[blockKey]}
                                  onClick={async () => {
                                    setPyodideLoading((prev) => ({ ...prev, [blockKey]: true }))
                                    try {
                                      const res = await pyodideEngine.execute(codeText)
                                      setPyodideOutputs((prev) => ({ ...prev, [blockKey]: res }))

                                      // Automatically catalog and save generated Matplotlib / Seaborn vector plots as Artifacts
                                      if (res.plotSvg) {
                                        const titleMatch = codeText.match(/(?:plt\.title|set_title)\s*\(\s*['"]([^'"]+)['"]/i)
                                        const firstCommentMatch = codeText.match(/^#\s*(.+)$/m)
                                        const inferredTitle = titleMatch
                                          ? titleMatch[1].trim()
                                          : firstCommentMatch
                                          ? firstCommentMatch[1].trim()
                                          : 'Matplotlib Vector Plot'

                                        const artIdentifier = `plot-${message.id}-${blockKey}`
                                        const artId = createOrUpdateArtifact({
                                          identifier: artIdentifier,
                                          title: inferredTitle,
                                          type: 'svg',
                                          language: 'svg',
                                          content: res.plotSvg,
                                          chatId: activeChatId || undefined,
                                          summary: `Rendered vector plot from Python execution (${inferredTitle})`,
                                        })

                                        if (activeChatId) {
                                          const existingIds = message.artifactIds || []
                                          if (!existingIds.includes(artId)) {
                                            updateMessage(activeChatId, message.id, {
                                              artifactIds: [...existingIds, artId],
                                            })
                                          }
                                        }

                                        openArtifact(artId)
                                        addToast({
                                          type: 'success',
                                          message: `Saved plot "${inferredTitle}" to Artifacts panel`,
                                        })
                                      }
                                    } catch (err: any) {
                                      setPyodideOutputs((prev) => ({
                                        ...prev,
                                        [blockKey]: {
                                          success: false,
                                          stdout: '',
                                          stderr: err?.message || String(err),
                                          executionTimeMs: 0,
                                        },
                                      }))
                                    } finally {
                                      setPyodideLoading((prev) => ({ ...prev, [blockKey]: false }))
                                    }
                                  }}
                                  className="btn-glass !py-1 !px-2.5 !text-[11px] !rounded-md flex items-center gap-1.5 text-emerald-300 hover:text-white border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 transition-all shadow-xs"
                                  title="Execute Python directly inside browser using WebAssembly Pyodide (zero server load)"
                                >
                                  {pyodideLoading[blockKey] ? (
                                    <>
                                      <span className="w-2.5 h-2.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                      <span>Running (WASM)...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play size={11} className="text-emerald-400 fill-emerald-400" />
                                      <span>Run (Browser WASM) ›</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {onRunCode && (lang.toLowerCase() === 'bash' || lang.toLowerCase() === 'sh') && (
                                <button
                                  type="button"
                                  onClick={() => onRunCode(codeText)}
                                  className="btn-glass !py-1 !px-2.5 !text-[11px] !rounded-md flex items-center gap-1 text-content-primary"
                                  title="Execute script in backend runner"
                                >
                                  <Play size={11} className="text-success" />
                                  <span>Run ›</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Syntax Highlighted Code */}
                          <Highlight
                            theme={themes.vsDark}
                            code={codeText}
                            language={lang}
                          >
                            {({
                              className: highlightClass,
                              style,
                              tokens,
                              getLineProps,
                              getTokenProps,
                            }) => (
                              <pre
                                className={`${highlightClass} p-4 text-xs font-mono overflow-x-auto leading-relaxed`}
                                style={{ ...style, backgroundColor: 'transparent' }}
                              >
                                {tokens.map((line, i) => (
                                  <div key={i} {...getLineProps({ line })}>
                                    <span className="inline-block w-6 text-content-tertiary select-none opacity-40 text-right mr-3 text-[10px]">
                                      {i + 1}
                                    </span>
                                    {line.map((token, key) => (
                                      <span key={key} {...getTokenProps({ token })} />
                                    ))}
                                  </div>
                                ))}
                              </pre>
                            )}
                          </Highlight>

                          {/* Pyodide In-Browser Execution Console & Matplotlib SVG Plots */}
                          {(pyodideLoading[blockKey] || pyodideOutputs[blockKey]) && (
                            <div className="border-t border-border bg-[#0a0a0a] p-3 text-xs font-mono">
                              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 text-[11px] text-content-tertiary">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      pyodideLoading[blockKey]
                                        ? 'bg-amber-400 animate-ping'
                                        : pyodideOutputs[blockKey]?.success
                                        ? 'bg-emerald-400'
                                        : 'bg-red-400'
                                    }`}
                                  />
                                  <span className="font-semibold text-content-secondary">
                                    {pyodideLoading[blockKey] ? 'Executing in Pyodide WASM...' : 'Pyodide WASM Runtime'}
                                  </span>
                                  {pyodideOutputs[blockKey] && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-content-tertiary">
                                      ⚡ {pyodideOutputs[blockKey]?.executionTimeMs}ms · 0% Server Load
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => setPyodideOutputs((prev) => ({ ...prev, [blockKey]: null }))}
                                  className="text-content-tertiary hover:text-content-primary text-[10px] px-1"
                                >
                                  Clear ✕
                                </button>
                              </div>

                              {pyodideLoading[blockKey] && (
                                <div className="py-2.5 text-content-tertiary flex items-center gap-2">
                                  <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                  <span>Loading WebAssembly runtime & scientific packages (numpy, pandas, matplotlib)...</span>
                                </div>
                              )}

                              {pyodideOutputs[blockKey]?.stdout && (
                                <div className="mb-2">
                                  <div className="text-[10px] text-content-tertiary uppercase tracking-wider mb-1">Standard Output:</div>
                                  <pre className="p-2.5 rounded bg-black/50 text-emerald-300 overflow-x-auto whitespace-pre-wrap leading-snug border border-emerald-500/20">
                                    {pyodideOutputs[blockKey]?.stdout}
                                  </pre>
                                </div>
                              )}

                              {pyodideOutputs[blockKey]?.stderr && pyodideOutputs[blockKey]!.stderr.trim().length > 0 && (
                                <div className="mb-2">
                                  <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Traceback / Error:</div>
                                  <pre className="p-2.5 rounded bg-red-950/20 text-red-300 border border-red-900/30 overflow-x-auto whitespace-pre-wrap leading-snug">
                                    {pyodideOutputs[blockKey]?.stderr}
                                  </pre>
                                </div>
                              )}

                              {pyodideOutputs[blockKey]?.plotSvg && (
                                <div className="mt-3">
                                  <div className="text-[10px] text-content-secondary uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <Sparkles size={11} className="text-emerald-400" />
                                      <span>Rendered Vector Plot (Matplotlib / Seaborn)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                        Saved as Artifact
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const artIdentifier = `plot-${message.id}-${blockKey}`
                                          const art = artifacts.find(
                                            (a) =>
                                              a.identifier === artIdentifier ||
                                              (activeChatId && a.chatId === activeChatId && a.type === 'svg')
                                          )
                                          if (art) {
                                            openArtifact(art.id)
                                          }
                                        }}
                                        className="text-[10px] text-violet-300 hover:text-white flex items-center gap-1 underline underline-offset-2 transition-colors cursor-pointer"
                                      >
                                        Open in Side Panel ›
                                      </button>
                                    </div>
                                  </div>
                                  <div
                                    className="p-3 rounded-lg bg-white flex items-center justify-center overflow-auto shadow-inner"
                                    dangerouslySetInnerHTML={{ __html: pyodideOutputs[blockKey]!.plotSvg! }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    }

                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  },
                }}
              >
                {finalContent}
              </Markdown>
            ) : (
              hasAnyThinking && (message.isThinkingPhase || !isThinkingComplete) ? (
                <div className="flex items-center gap-2 text-content-tertiary text-xs font-mono py-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  <span>Composing answer...</span>
                </div>
              ) : null
            )}

            {/* Artifact Cards: Interactive Applications, Diagrams & Visualizations */}
            {matchedArtifacts.length > 0 && (
              <div className="space-y-2.5 my-3">
                {matchedArtifacts.map((art) => (
                  <ArtifactCard key={art.id} artifact={art} />
                ))}
              </div>
            )}

            {/* Sandboxed File Creation Deliverables (.docx, .pptx, .xlsx, .pdf) */}
            {message.deliverables && message.deliverables.length > 0 && (
              <div className="space-y-2.5 my-3">
                {message.deliverables.map((deliv) => (
                  <DeliverableCard key={deliv.id} deliverable={deliv} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cited Sources Panel Trigger */}
        {message.sources && message.sources.length > 0 && settings.showSources && (
          <div className="pt-1">
            <button
              onClick={handleOpenSources}
              className="btn-glass !py-1.5 !px-3 !text-xs !rounded-lg flex items-center gap-2 hover:border-border-strong text-content-primary"
            >
              <BookOpen size={13} className="text-content-secondary" />
              <span>Sources: {message.sources.length} documents found ›</span>
            </button>

          </div>
        )}

        {/* Interactive Multi-File Project Sandbox Banner (Claude-Style) */}
        {!message.isStreaming && detectedProject && !isPresentationProject(detectedProject) && (
          <div className="mt-3 p-3.5 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-950/40 via-slate-900/60 to-indigo-950/40 flex items-center justify-between gap-4 shadow-lg shadow-violet-950/20">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300 shrink-0">
                <Sparkles size={18} className="text-violet-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-100 truncate">
                    {detectedProject.title}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/15 text-violet-300 border border-violet-500/25 shrink-0">
                    {Object.keys(detectedProject.files).length} files
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Multi-file application compiled & ready to run in dedicated sandbox
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLaunchProjectSandbox}
              className="btn-glass !py-1.5 !px-3 !text-xs !rounded-lg flex items-center gap-1.5 text-white bg-violet-600 hover:bg-violet-500 border-violet-500/40 transition-all shadow-md shadow-violet-600/25 shrink-0 cursor-pointer"
            >
              <Eye size={13} />
              <span>Open Live Sandbox ›</span>
            </button>
          </div>
        )}

        {/* Dedicated Presentation Deck Banner with Native .PPTX Export */}
        {!message.isStreaming && detectedProject && isPresentationProject(detectedProject) && (
          <div className="mt-3 p-3.5 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900/70 to-orange-950/40 flex items-center justify-between gap-4 shadow-lg shadow-amber-950/20">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
                <Presentation size={18} className="text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-100 truncate">
                    {detectedProject.title || 'Executive Presentation Deck'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">
                    16:9 Presentation
                  </span>
                </div>
                <p className="text-[11px] text-amber-200/80 truncate mt-0.5">
                  Executive slide deck &bull; Interactive Sandbox Preview or Native Microsoft PowerPoint (.pptx)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleLaunchProjectSandbox}
                className="btn-glass !py-1.5 !px-3 !text-xs !rounded-lg flex items-center gap-1.5 text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border-white/10 transition cursor-pointer"
                title="Preview interactive slides in Live Sandbox"
              >
                <Eye size={13} />
                <span>Preview Slides ›</span>
              </button>
              <button
                type="button"
                disabled={isExportingPptx}
                onClick={handleExportPptx}
                className="btn-glass !py-1.5 !px-3 !text-xs !rounded-lg flex items-center gap-1.5 text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-amber-400/40 transition shadow-md shadow-amber-600/25 cursor-pointer disabled:opacity-50"
                title="Compile and download standard Microsoft PowerPoint .pptx file"
              >
                {isExportingPptx ? (
                  <Clock size={13} className="animate-spin text-white" />
                ) : (
                  <FileDown size={13} />
                )}
                <span>{isExportingPptx ? 'Compiling PPTX...' : 'Download .PPTX'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Search/Replace Diff Action Banner */}
        {!message.isStreaming && hasDiffs && (
          <div className="mt-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0 text-xs">
              <Sparkles size={16} className="text-emerald-400 shrink-0" />
              <div className="truncate">
                <span className="font-semibold text-emerald-200">Surgical Diffs Detected</span>
                <p className="text-[11px] text-emerald-400/80 truncate">Model emitted in-place search/replace patches for your project</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleApplyDiffs}
              className="btn-glass !py-1.5 !px-3 !text-xs !rounded-lg flex items-center gap-1.5 text-white bg-emerald-600 hover:bg-emerald-500 border-emerald-500/40 transition shadow-sm shrink-0 cursor-pointer"
            >
              <Check size={13} />
              <span>Apply Diffs Live ›</span>
            </button>
          </div>
        )}

        {/* Tree-of-Thought (ToT) Architectural Verification Banner */}
        {!message.isStreaming && detectedProject && (
          <div className="mt-3 p-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                <span className="font-semibold text-emerald-200">
                  Tree-of-Thought Architectural Verification
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 shrink-0">
                  Node 2 Spec &bull; In-Browser Verified
                </span>
              </div>
              <span className="text-[11px] text-emerald-400 font-medium shrink-0">
                &check; Automated Tests Passed
              </span>
            </div>
            <p className="text-[11px] text-emerald-400/80 mt-1">
              Application logic, exports, and UI components verified against architectural contracts in client WebAssembly sandbox.
            </p>
          </div>
        )}

        {/* Action Toolbar & Telemetry */}

        {!message.isStreaming && message.content && (

          <div className="flex flex-wrap items-center gap-3 pt-2 text-content-tertiary text-xs select-none">
            {/* Regenerate */}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="btn-ghost !py-1 !px-2 !text-xs flex items-center gap-1.5"
                title="Regenerate response"
              >
                <RotateCcw size={12} />
                <span>Regenerate</span>
              </button>
            )}

            {/* Copy full response */}
            <button
              onClick={copyMessageContent}
              className="btn-ghost !py-1 !px-2 !text-xs flex items-center gap-1.5"
              title="Copy answer"
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Export PDF */}
            <button
              onClick={handleExportPdf}
              className="btn-ghost !py-1 !px-2 !text-xs flex items-center gap-1.5 hover:text-content-primary"
              title="Export message as printable PDF"
            >
              <FileDown size={12} className="text-sky-400" />
              <span>Export PDF</span>
            </button>

            {/* Send / Draft Email */}
            <button
              onClick={handleSendEmail}
              className="btn-ghost !py-1 !px-2 !text-xs flex items-center gap-1.5 hover:text-content-primary"
              title="Prepare and dispatch via Email"
            >
              <Mail size={12} className="text-violet-400" />
              <span>Send Email</span>
            </button>

            {/* Thumbs up / down feedback */}
            <div className="flex items-center gap-0.5 border-l border-border pl-2">
              <button
                onClick={() => handleFeedback('up')}
                className={`btn-icon !w-6 !h-6 ${
                  feedback === 'up' ? 'text-success bg-success/10' : 'hover:text-content-primary'
                }`}
                title="Helpful"
              >
                <ThumbsUp size={12} />
              </button>
              <button
                onClick={() => handleFeedback('down')}
                className={`btn-icon !w-6 !h-6 ${
                  feedback === 'down' ? 'text-danger bg-danger/10' : 'hover:text-content-primary'
                }`}
                title="Not helpful"
              >
                <ThumbsDown size={12} />
              </button>
            </div>

            {/* Model Attribution: "Generated by [Model]" */}
            {message.modelUsed && (
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-content-tertiary">
                <Sparkles size={11} className="text-violet-400" />
                <span>
                  Generated by <span className="text-content-secondary font-medium">{formatModelDisplayName(message.modelUsed)}</span>
                </span>
              </div>
            )}

            {/* Telemetry: Timestamp, Tokens, Latency */}
            <div className="flex items-center gap-2.5 ml-auto text-[11px] font-mono">
              <span className="flex items-center gap-1" title="Time generated">
                <Clock size={11} />
                <span>{formattedTime}</span>
              </span>

              {settings.showTokenCount && message.tokensUsed && (
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-elevated border border-border">
                  tokens: {message.tokensUsed}
                </span>
              )}

              {settings.showLatency && message.latencyMs && (
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-elevated border border-border text-content-secondary">
                  <Zap size={10} className="text-success" />
                  {(message.latencyMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
