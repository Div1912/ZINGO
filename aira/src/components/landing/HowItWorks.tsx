import React from 'react'
import { motion } from 'framer-motion'
import { UploadCloud, Cpu, FileCheck } from 'lucide-react'

const STEPS = [
  {
    step: '01',
    icon: <UploadCloud size={22} className="text-content-primary" />,
    title: 'You ask',
    description: 'Type a question or upload a document. Everything stays on the local network.',
  },
  {
    step: '02',
    icon: <Cpu size={22} className="text-content-primary" />,
    title: 'AIRA processes',
    description: "Models run locally on MRPL's GPU servers. No cloud. No internet.",
  },
  {
    step: '03',
    icon: <FileCheck size={22} className="text-content-primary" />,
    title: 'You receive',
    description: 'Streaming answer with cited sources, or a downloadable file.',
  },
]

export const HowItWorks: React.FC = () => {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <div className="text-center mb-16">
        <h2 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight">
          How It Works
        </h2>
        <p className="text-sm sm:text-base text-content-secondary mt-2">
          Three air-gapped steps. Absolute sovereignty.
        </p>
      </div>

      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Connecting line on desktop */}
        <div className="hidden md:block absolute top-12 left-20 right-20 h-[1px] bg-border z-0" />

        {STEPS.map((s, idx) => (
          <motion.div
            key={s.step}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: idx * 0.15 }}
            className="relative z-10 flex flex-col items-center text-center p-6 sm:p-7 bg-surface/80 dark:bg-surface/75 backdrop-blur-xl border border-border/80 rounded-2xl shadow-xs hover:border-border-strong hover:bg-surface/95 hover:shadow-md transition-all duration-300"
          >
            {/* Pill & Icon */}
            <div className="w-12 h-12 rounded-2xl bg-elevated/90 border border-border/80 flex items-center justify-center mb-4 shadow-xs">
              {s.icon}
            </div>

            <span className="text-[11px] font-mono tracking-widest text-content-tertiary uppercase mb-1">
              Step {s.step}
            </span>

            <h3 className="text-lg font-semibold text-content-primary tracking-tight mb-2">
              {s.title}
            </h3>

            <p className="text-sm text-content-secondary font-normal leading-relaxed">
              {s.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
