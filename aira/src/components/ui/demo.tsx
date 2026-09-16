import { useState } from 'react'
import { PromptInput } from './ai-chat-input'
import { BorderBeam } from './border-beam'
import { ThinkingOrbs } from './thinking-orbs'

export function ChatInputDemo() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastPrompt, setLastPrompt] = useState<string>('')
  const [selectedMeta, setSelectedMeta] = useState<{
    model: string
    effort: string
    attachments: number
  } | null>(null)

  const handleSubmit = (
    text: string,
    meta: { model: string; effort: string; attachments: File[] }
  ) => {
    setLastPrompt(text)
    setSelectedMeta({
      model: meta.model,
      effort: meta.effort,
      attachments: meta.attachments.length,
    })
    setIsGenerating(true)

    // Simulate response delay
    setTimeout(() => {
      setIsGenerating(false)
    }, 4500)
  }

  return (
    <div className="w-full max-w-3xl mx-auto p-6 space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-bold tracking-tight text-content-primary">
          AIRA Sovereign Input & Thinking Orbs
        </h2>
        <p className="text-sm text-content-secondary">
          Integrated with animated BorderBeam & real-time cognitive orbital physics.
        </p>
      </div>

      {/* Input container with animated BorderBeam */}
      <div className="relative rounded-3xl p-1 bg-surface border border-border shadow-lg">
        <BorderBeam
          duration={6}
          borderWidth={1.5}
          colorFrom="#38bdf8"
          colorTo="#a855f7"
        />
        <PromptInput
          onSubmit={handleSubmit}
          isGenerating={isGenerating}
          onStop={() => setIsGenerating(false)}
          enableBorderBeam={false}
          placeholder="Ask CDU-2 process parameters, OISD standards, or refinery telemetry..."
        />
      </div>

      {/* Model Performing Action Thinking Orbs */}
      {isGenerating && (
        <div className="pt-2 animate-in fade-in duration-300">
          <ThinkingOrbs
            modelName={selectedMeta?.model || 'AIRA Qwen2.5-7B'}
            status="Synthesizing crude assay mass balance & safety bounds..."
            showSteps={true}
          />
        </div>
      )}

      {/* History recap */}
      {lastPrompt && !isGenerating && (
        <div className="p-4 rounded-xl bg-elevated border border-border text-xs space-y-1">
          <div className="font-semibold text-content-primary">Last Dispatched Prompt:</div>
          <p className="text-content-secondary">{lastPrompt}</p>
          {selectedMeta && (
            <div className="flex gap-3 text-content-tertiary pt-1 font-mono text-[10px]">
              <span>Model: {selectedMeta.model}</span>
              <span>Effort: {selectedMeta.effort}</span>
              <span>Attachments: {selectedMeta.attachments}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { GradientWave } from './gradient-wave'

export function DemoOne() {
  return (
    <div className="relative h-screen w-full flex items-center justify-center overflow-hidden">
      <GradientWave />
      <h1 className="text-black dark:text-white tracking-tighter text-7xl font-bold text-center z-10 select-none">
        Gradient Wave
      </h1>
    </div>
  )
}

export default ChatInputDemo
