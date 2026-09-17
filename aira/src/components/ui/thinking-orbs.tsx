import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, ShieldCheck, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ThinkingOrbsProps {
  status?: string
  modelName?: string
  className?: string
  compact?: boolean
  showSteps?: boolean
  taskType?: string
  currentPrompt?: string
  hasFiles?: boolean
  steps?: string[]
}

function getDynamicTaskPlan(
  prompt?: string,
  taskType?: string,
  hasFiles?: boolean
): { currentTaskTitle: string; steps: string[] } {
  const p = (prompt || '').trim()
  const cleanPrompt = p ? (p.length > 44 ? `"${p.slice(0, 41)}..."` : `"${p}"`) : 'current prompt'

  if (hasFiles) {
    return {
      currentTaskTitle: `Processing document & query: ${cleanPrompt}`,
      steps: [
        `Extracting document text via on-premise OCR engine`,
        `Analyzing context against query: ${cleanPrompt}`,
        `Synthesizing verified engineering response`,
      ],
    }
  }

  if (taskType === 'code') {
    return {
      currentTaskTitle: `Synthesizing code for: ${cleanPrompt}`,
      steps: [
        `Parsing algorithmic logic & syntax requirements`,
        `Evaluating edge constraints & execution performance`,
        `Formatting executable code output with type signatures`,
      ],
    }
  }

  if (taskType === 'document') {
    return {
      currentTaskTitle: `Verifying operational procedure for: ${cleanPrompt}`,
      steps: [
        `Retrieving operational SOP documentation & standard envelopes`,
        `Correlating compliance & engineering parameters for ${cleanPrompt}`,
        `Formulating structured technical recommendations`,
      ],
    }
  }

  return {
    currentTaskTitle: `Analyzing task: ${cleanPrompt}`,
    steps: [
      `Deconstructing user prompt intent & constraints: ${cleanPrompt}`,
      `Evaluating reasoning pathway & verifying technical logic`,
      `Formulating comprehensive verified response`,
    ],
  }
}

export const ThinkingOrbs: React.FC<ThinkingOrbsProps> = ({
  status,
  modelName = 'AIRA Cognition',
  className,
  compact = false,
  showSteps = true,
  taskType,
  currentPrompt,
  hasFiles = false,
  steps,
}) => {
  const dynamicPlan = getDynamicTaskPlan(currentPrompt, taskType, hasFiles)
  const activeSteps = steps || dynamicPlan.steps
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev + 1) % activeSteps.length)
    }, 2400)
    return () => clearInterval(interval)
  }, [activeSteps.length])

  const currentAction = status || activeSteps[currentStepIndex]

  if (compact) {
    return (
      <div className={cn('inline-flex items-center gap-2.5 py-1 px-1 select-none', className)}>
        {/* Compact Orbs Cluster */}
        <div className="relative w-7 h-7 flex items-center justify-center">
          {/* Azure / Cyan Intelligence Orb */}
          <motion.div
            animate={{
              scale: [1, 1.25, 0.95, 1],
              x: [-2, 3, -1, -2],
              y: [1, -2, 2, 1],
              opacity: [0.8, 1, 0.75, 0.8],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute w-3.5 h-3.5 rounded-full bg-[#38bdf8] blur-[2px] shadow-[0_0_10px_#38bdf8]"
          />
          {/* Emerald Safety Orb */}
          <motion.div
            animate={{
              scale: [1.1, 0.85, 1.2, 1.1],
              x: [2, -2, 1, 2],
              y: [-1, 2, -2, -1],
              opacity: [0.75, 1, 0.7, 0.75],
            }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            className="absolute w-3 h-3 rounded-full bg-[#34d399] blur-[2px] shadow-[0_0_8px_#34d399]"
          />
          {/* Violet Coder Orb */}
          <motion.div
            animate={{
              scale: [0.9, 1.2, 0.9, 0.9],
              x: [0, 2, -2, 0],
              y: [2, -1, 1, 2],
              opacity: [0.7, 0.95, 0.65, 0.7],
            }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
            className="absolute w-2.5 h-2.5 rounded-full bg-[#a855f7] blur-[1.5px] shadow-[0_0_8px_#a855f7]"
          />
        </div>

        <span className="text-xs text-content-secondary font-medium tracking-tight animate-pulse">
          {currentAction}
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl sm:rounded-2xl bg-surface/95 dark:bg-[#111113]/95 backdrop-blur-md border border-border p-3.5 sm:p-4 shadow-sm space-y-3',
        className
      )}
    >
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-[#38bdf8]/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 rounded-full bg-[#a855f7]/10 blur-3xl pointer-events-none" />

      {/* Header with Orbs Cluster & Model Identity */}
      <div className="flex items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3">
          {/* Multi-Orb Plasma Sphere Container */}
          <div className="relative w-10 h-10 rounded-xl bg-elevated/80 border border-border flex items-center justify-center overflow-hidden shadow-inner">
            {/* Core Glow */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[#38bdf8]/20 via-[#34d399]/20 to-[#a855f7]/20 blur-sm" />

            {/* Orb 1: Azure Process Intelligence */}
            <motion.div
              animate={{
                x: [-4, 5, -2, -4],
                y: [3, -4, 2, 3],
                scale: [1, 1.3, 0.9, 1],
              }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute w-4 h-4 rounded-full bg-[#38bdf8] blur-[2px] opacity-80 mix-blend-screen shadow-[0_0_12px_#38bdf8]"
            />

            {/* Orb 2: Emerald OISD Safety Protocol */}
            <motion.div
              animate={{
                x: [5, -4, 3, 5],
                y: [-3, 3, -4, -3],
                scale: [1.1, 0.85, 1.25, 1.1],
              }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
              className="absolute w-3.5 h-3.5 rounded-full bg-[#34d399] blur-[2px] opacity-80 mix-blend-screen shadow-[0_0_10px_#34d399]"
            />

            {/* Orb 3: Violet Neural Reasoning */}
            <motion.div
              animate={{
                x: [1, 3, -5, 1],
                y: [4, -2, 3, 4],
                scale: [0.9, 1.25, 0.85, 0.9],
              }}
              transition={{ duration: 4.1, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
              className="absolute w-3 h-3 rounded-full bg-[#a855f7] blur-[2px] opacity-85 mix-blend-screen shadow-[0_0_10px_#a855f7]"
            />

            {/* Center Nexus Pulse */}
            <motion.div
              animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="w-1.5 h-1.5 rounded-full bg-white z-10 shadow-[0_0_8px_white]"
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-content-primary tracking-tight">
                {modelName}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20">
                <Sparkles size={9} />
                <span>Thinking</span>
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-content-tertiary mt-0.5 font-mono truncate max-w-[280px] sm:max-w-md">
              {dynamicPlan.currentTaskTitle}
            </p>
          </div>
        </div>

        {/* Action badges */}
        <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-content-tertiary">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-elevated border border-border">
            <Cpu size={11} className="text-[#38bdf8]" />
            <span>GPU Active</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-elevated border border-border">
            <ShieldCheck size={11} className="text-[#34d399]" />
            <span>Air-Gapped</span>
          </span>
        </div>
      </div>

      {/* Active Thought Stream */}
      <div className="space-y-2 pt-1 border-t border-border/50">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-ping" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-semibold">Active:</span>
          <span className="text-xs font-medium text-content-primary truncate">
            {currentAction}
          </span>
        </div>

        {showSteps && (
          <div className="space-y-1.5 pl-3.5 border-l-2 border-border/70 max-h-[135px] overflow-y-auto pt-0.5">
            <span className="text-[9.5px] font-mono text-content-tertiary uppercase tracking-wider block mb-1">
              Planned Steps:
            </span>
            {activeSteps.map((step, idx) => {
              const isPast = idx < currentStepIndex
              const isCurrent = idx === currentStepIndex
              return (
                <div
                  key={step}
                  className={cn(
                    'text-[11px] transition-colors leading-relaxed flex items-center gap-2',
                    isCurrent
                      ? 'text-content-primary font-medium'
                      : isPast
                      ? 'text-content-tertiary line-through opacity-70'
                      : 'text-content-tertiary/70 opacity-60'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      isCurrent
                        ? 'bg-[#38bdf8] shadow-[0_0_6px_#38bdf8]'
                        : isPast
                        ? 'bg-[#34d399]'
                        : 'bg-border'
                    )}
                  />
                  <span>
                    {isCurrent ? step : isPast ? `${step} (Done)` : step}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
