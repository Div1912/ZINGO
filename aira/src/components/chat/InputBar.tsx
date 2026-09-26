import React from 'react'
import type { ModelId, UploadedFile } from '../../types'
import { PromptInput } from '../ui/ai-chat-input'
import { useChatStore } from '../../stores/chatStore'

interface InputBarProps {
  onSendMessage: (
    content: string,
    files: UploadedFile[],
    model?: ModelId,
    effort?: string,
    thinkingEnabled?: boolean
  ) => void
  onStop: () => void
  isGenerating: boolean
  initialPrompt?: string
}

export const InputBar: React.FC<InputBarProps> = ({
  onSendMessage,
  onStop,
  isGenerating,
  initialPrompt = '',
}) => {
  const {
    isComplexGenerating,
    currentTaskType,
    activePrompt,
    hasFilesGenerating,
    isCouncilEnabled,
    toggleCouncil,
    isThinkingEnabled,
    toggleThinking,
    thinkingBudgetTokens,
    setThinkingBudgetTokens,
  } = useChatStore()

  const handleSendMessage = (
    message: string,
    meta: {
      model: string
      effort: string
      attachments: File[]
      enableCouncil?: boolean
      enableThinking?: boolean
      thinkingBudget?: number
    }
  ) => {
    let modelId: ModelId = 'auto'
    if (meta.model.includes('Vision') || meta.model.includes('VL') || meta.model.includes('Multimodal')) {
      modelId = 'qwen2.5vl:3b'
    } else if (meta.model.includes('4B') || meta.model.includes('4b')) {
      modelId = 'qwen3:4b'
    } else if (meta.model.includes('Qwen3') || meta.model.includes('Master') || meta.model.includes('8B') || meta.model.includes('8b')) {
      modelId = 'qwen3:8b'
    } else {
      modelId = 'auto'
    }

    const uploadedFiles: UploadedFile[] = (meta.attachments || []).map((file) => {
      let ext: UploadedFile['type'] = 'txt'
      if (file.name.endsWith('.pdf')) ext = 'pdf'
      else if (file.name.endsWith('.docx')) ext = 'docx'
      else if (file.name.endsWith('.xlsx')) ext = 'xlsx'
      else if (file.type.startsWith('image/')) ext = 'image'

      return {
        id: Math.random().toString(36).substring(2, 9),
        name: file.name,
        type: ext,
        size: file.size,
        previewUrl: file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined,
        rawFile: file,
      }
    })

    onSendMessage(message, uploadedFiles, modelId, meta.effort, meta.enableThinking)
  }

  return (
    <div className="border-t border-border bg-page/75 backdrop-blur-md dark:bg-page/75 px-4 sm:px-8 py-3.5 shrink-0 flex flex-col items-center">
      <div className="w-full flex flex-col items-center">
        <PromptInput
          defaultValue={initialPrompt}
          onSubmit={handleSendMessage}
          isGenerating={isGenerating}
          isComplexTask={isComplexGenerating}
          taskType={currentTaskType || undefined}
          activePrompt={activePrompt || undefined}
          hasFiles={hasFilesGenerating}
          onStop={onStop}
          isCouncilEnabled={isCouncilEnabled}
          onToggleCouncil={toggleCouncil}
          isThinkingEnabled={isThinkingEnabled}
          onToggleThinking={toggleThinking}
          thinkingBudgetTokens={thinkingBudgetTokens}
          onSetThinkingBudget={setThinkingBudgetTokens}
          enableBorderBeam={true}
          placeholder="Ask AIRA anything... (Shift+Enter for new line)"
          models={[
            'Auto (Cluster Smart Router)',
            'Qwen3-8B (Laptop 1 - Master Node)',
            'Qwen3-4B (Laptop 1 - Fast Synthesis Node)',
            'Qwen2.5-VL Multimodal (Laptop 2 - Vision Node)',
          ]}
          efforts={['Fast', 'Balanced', 'Deep Research']}
          maxWidthCollapsed={560}
          maxWidthExpanded={820}
          className="mx-auto"
        />

        {/* Subtle helper text below input */}
        <div className="flex items-center justify-center gap-3 pt-2 text-[11px] font-mono text-content-tertiary select-none">
          <span>↵ Send</span>
          <span>&middot;</span>
          <span>Shift+↵ New line</span>
          <span>&middot;</span>
          <span>⌘K Commands</span>
        </div>
      </div>
    </div>
  )
}
export default InputBar
