import React from 'react'
import { motion } from 'framer-motion'
import { Shield, Zap, FileSearch, Layers, Eye, FileOutput } from 'lucide-react'

const FEATURES = [
  {
    icon: <Shield className="text-content-primary" size={22} />,
    title: 'Air-Gapped by Design',
    body: "Zero external API calls. Every query, every document, every response stays on MRPL's infrastructure.",
  },
  {
    icon: <Zap className="text-content-primary" size={22} />,
    title: 'Automatic Model Routing',
    body: 'Code request? Routed to the coder model. Document search? Routed to the reasoning model. Automatic, instant.',
  },
  {
    icon: <FileSearch className="text-content-primary" size={22} />,
    title: 'Internal Knowledge Base',
    body: 'Searches MRPL SOPs, P&IDs, inspection reports, and manuals. Answers grounded in your own documents.',
  },
  {
    icon: <Layers className="text-content-primary" size={22} />,
    title: 'Multi-step Agent Tasks',
    body: 'Read a scanned report. Extract findings. Draft an approval note. All in one request, end to end.',
  },
  {
    icon: <Eye className="text-content-primary" size={22} />,
    title: 'Multimodal Input',
    body: 'Upload scanned PDFs, engineering drawings, photographs. On-device OCR processes everything locally.',
  },
  {
    icon: <FileOutput className="text-content-primary" size={22} />,
    title: 'Real File Output',
    body: 'Generates Word documents, Excel sheets, formatted code files. Not just chat — actual deliverables.',
  },
]

export const Features: React.FC = () => {
  return (
    <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h2 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight">
          Everything you need. Nothing you don&apos;t.
        </h2>
        <p className="text-sm sm:text-base text-content-secondary mt-3">
          Built for the complexity of refinery operations.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: index * 0.08 }}
            className="card !rounded-2xl !p-7 bg-surface/80 dark:bg-surface/75 backdrop-blur-xl border border-border/80 flex flex-col justify-between hover:border-border-strong hover:bg-surface/95 hover:shadow-md transition-all duration-300 shadow-xs"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-elevated/90 border border-border/80 flex items-center justify-center mb-6 shadow-xs">
                {item.icon}
              </div>
              <h3 className="text-base font-semibold text-content-primary tracking-tight mb-2">
                {item.title}
              </h3>
              <p className="text-sm text-content-secondary leading-relaxed font-normal">
                {item.body}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
