import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FileText, ExternalLink } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useToastStore } from '../../stores/toastStore'

export const SourcePanel: React.FC = () => {
  const { isSourcePanelOpen, toggleSourcePanel, activeSources } = useChatStore()
  const { addToast } = useToastStore()

  const sources = activeSources || []

  const handleOpenDocument = (doc: string) => {
    addToast({
      type: 'info',
      title: 'Local Document Viewer',
      message: `Document viewer coming soon for: ${doc}`,
    })
  }

  return (
    <AnimatePresence>
      {isSourcePanelOpen && (
        <motion.aside
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 280 }}
          className="fixed lg:static top-0 right-0 bottom-0 z-30 w-[300px] sm:w-[320px] bg-surface border-l border-border flex flex-col shadow-lg lg:shadow-none h-full"
        >
          {/* Header */}
          <div className="h-[52px] px-4 border-b border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-content-primary">
                Sources ({sources.length})
              </span>
            </div>
            <button
              onClick={() => toggleSourcePanel(false)}
              className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
              aria-label="Close sources panel"
            >
              <X size={15} />
            </button>
          </div>

          {/* Sources List */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {sources.length === 0 ? (
              <div className="p-8 text-center text-xs text-content-tertiary">
                No active document citations for this message.
              </div>
            ) : (
              sources.map((source) => {
                const percentage = Math.round(source.relevanceScore * 100)

                return (
                  <div
                    key={source.id}
                    className="p-3.5 rounded-xl bg-elevated border border-border space-y-2.5 hover:border-border-strong transition-colors"
                  >
                    {/* Header: Icon + Document */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-surface border border-border flex items-center justify-center shrink-0 mt-0.5">
                        <FileText size={13} className="text-content-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-semibold text-content-primary truncate">
                          {source.document}
                        </h4>
                        <div className="flex items-center justify-between text-[11px] text-content-tertiary mt-0.5">
                          <span>Page {source.page || 1}</span>
                          <span className="font-mono">{percentage}% relevance</span>
                        </div>
                      </div>
                    </div>

                    {/* Subtle Progress Bar */}
                    <div className="w-full h-1 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    {/* Excerpt */}
                    <p className="text-xs text-content-secondary leading-relaxed italic border-l-2 border-border pl-2 my-1">
                      &ldquo;{source.excerpt}&rdquo;
                    </p>

                    {/* Open Document CTA */}
                    <button
                      onClick={() => handleOpenDocument(source.document)}
                      className="btn-ghost !text-xs !py-1 !px-2 w-full !justify-between text-content-primary hover:bg-surface border border-border/50 rounded-md"
                    >
                      <span>Open document</span>
                      <ExternalLink size={12} className="text-content-tertiary" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
