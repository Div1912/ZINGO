import React, { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  ChevronDown,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message } from '../../types'
import { ModelBadge } from './ModelBadge'
import { ThinkingOrbs } from '../ui/thinking-orbs'
import { useSettingsStore } from '../../stores/settingsStore'
import { useToastStore } from '../../stores/toastStore'
import { useChatStore } from '../../stores/chatStore'

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
  const { toggleSourcePanel, setActiveSources, activePrompt, hasFilesGenerating } = useChatStore()

  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null)
  const [showThinking, setShowThinking] = useState(true)

  // Parse <think>...</think> reasoning blocks if present
  let thinkingText = ''
  let finalContent = message.content || ''
  let isThinkingComplete = false
  let hasThinking = false

  if (message.content && message.content.includes('<think>')) {
    hasThinking = true
    const thinkEndIndex = message.content.indexOf('</think>')
    if (thinkEndIndex !== -1) {
      thinkingText = message.content.substring(
        message.content.indexOf('<think>') + 7,
        thinkEndIndex
      ).trim()
      finalContent = message.content.substring(thinkEndIndex + 8).trim()
      isThinkingComplete = true
    } else {
      thinkingText = message.content.substring(
        message.content.indexOf('<think>') + 7
      ).trim()
      finalContent = ''
      isThinkingComplete = false
    }
  }

  const isUser = message.role === 'user'

  const copyMessageContent = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    addToast({ type: 'info', message: 'Message copied to clipboard' })
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
      <div className="flex flex-col items-end my-5 px-4 sm:px-6">
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
    <div className="flex gap-3 sm:gap-4 my-6 px-4 sm:px-6 max-w-4xl mx-auto w-full">
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
        </div>

        {/* Content Body / Streaming Indicator / Error */}
        {message.isStreaming && !message.content ? (
          <div className="py-2 animate-in fade-in duration-300">
            {message.taskType && message.taskType !== 'general' ? (
              <ThinkingOrbs
                modelName={
                  message.modelUsed === 'qwen3:8b'
                    ? 'Qwen3-8B'
                    : message.modelUsed === 'qwen2.5-coder-7b'
                    ? 'Qwen2.5-Coder-7B'
                    : message.modelUsed === 'qwen2.5-7b'
                    ? 'Qwen2.5-7B'
                    : 'AIRA Cognition'
                }
                taskType={message.taskType}
                currentPrompt={activePrompt || undefined}
                hasFiles={hasFilesGenerating}
                showSteps={true}
              />
            ) : (
              <ThinkingOrbs compact status="Synthesizing response..." />
            )}
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
          <div className="markdown-body select-text">
            {hasThinking && (
              <div className="mb-3 rounded-lg border border-border/70 bg-surface-secondary/40 backdrop-blur-sm overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setShowThinking(!showThinking)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-surface-secondary/60 hover:bg-surface-secondary/90 transition-colors select-none text-content-secondary"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={13} className={!isThinkingComplete ? "text-primary animate-pulse" : "text-content-tertiary"} />
                    <span className="font-semibold text-content-primary">
                      {!isThinkingComplete ? 'Reasoning & Researching...' : 'Thought Process'}
                    </span>
                    {message.effort && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-primary/10 text-primary border border-primary/20">
                        {message.effort}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-content-tertiary">
                    <span className="text-[11px] font-mono">
                      {showThinking ? 'Hide' : 'Show'}
                    </span>
                    <ChevronDown size={13} className={cn("transition-transform duration-200", showThinking ? "rotate-180" : "")} />
                  </div>
                </button>
                {showThinking && (
                  <div className="p-3 border-t border-border/50 font-mono text-[11.5px] leading-relaxed text-content-secondary bg-surface-primary/50 max-h-64 overflow-y-auto whitespace-pre-wrap select-text">
                    {thinkingText || 'Deconstructing problem constraints & evaluating operational parameters...'}
                    {!isThinkingComplete && (
                      <span className="inline-block w-1.5 h-3 ml-1 bg-primary/70 animate-pulse" />
                    )}
                  </div>
                )}
              </div>
            )}

            {finalContent ? (
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '')
                    const codeText = String(children).replace(/\n$/, '')

                    if (!inline && match) {
                      const lang = match[1]
                      const codeIndex = Math.random()

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

                              {onRunCode && (lang === 'python' || lang === 'bash' || lang === 'py') && (
                                <button
                                  onClick={() => onRunCode(codeText)}
                                  className="btn-glass !py-1 !px-2.5 !text-[11px] !rounded-md flex items-center gap-1 text-content-primary"
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
              hasThinking && !isThinkingComplete && (
                <div className="text-xs text-content-tertiary font-mono italic flex items-center gap-2 py-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary animate-ping" />
                  <span>Formulating verified engineering answer...</span>
                </div>
              )
            )}

            {message.isStreaming && (
              <div className="pt-2">
                <ThinkingOrbs compact status={hasThinking && !isThinkingComplete ? "Synthesizing deep reasoning tokens..." : "Synthesizing response stream..."} />
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
