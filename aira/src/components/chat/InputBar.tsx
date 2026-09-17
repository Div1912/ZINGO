import React from 'react'
import type { ModelId, UploadedFile } from '../../types'
import { PromptInput } from '../ui/ai-chat-input'
import { useChatStore } from '../../stores/chatStore'

interface InputBarProps {
  onSendMessage: (
    content: string,
    files: UploadedFile[],
    model?: ModelId,
    effort?: string
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
  const { isComplexGenerating, currentTaskType } = useChatStore()
  const handleSendMessage = (
    message: string,
    meta: { model: string; effort: string; attachments: File[] }
  ) => {
    let modelId: ModelId | undefined = undefined
    if (meta.model.includes('Coder')) {
      modelId = 'qwen2.5-coder-7b'
    } else if (meta.model.includes('Qwen3') || meta.model.includes('8B')) {
      modelId = 'qwen3:8b'
    } else if (meta.model.includes('7B')) {
      modelId = 'qwen2.5-7b'
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

    onSendMessage(message, uploadedFiles, modelId, meta.effort)
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
          onStop={onStop}
          enableBorderBeam={true}
          placeholder="Ask AIRA anything... (Shift+Enter for new line)"
          models={['Auto (Recommended)', 'Qwen3-8B (Live Tunnel)', 'Qwen2.5-Coder-7B']}
          efforts={['Fast', 'Deep Research', 'Max Effort']}
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
