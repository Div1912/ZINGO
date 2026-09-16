import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      <AnimatePresence>
        {toasts.map((toast) => {
          let icon = <Info size={16} className="text-accent shrink-0" />
          let borderAccent = 'border-border'

          switch (toast.type) {
            case 'success':
              icon = <CheckCircle2 size={16} className="text-success shrink-0" />
              borderAccent = 'border-success/30'
              break
            case 'error':
              icon = <AlertCircle size={16} className="text-danger shrink-0" />
              borderAccent = 'border-danger/30'
              break
            case 'warning':
              icon = <AlertTriangle size={16} className="text-warning shrink-0" />
              borderAccent = 'border-warning/30'
              break
            case 'info':
              icon = <Info size={16} className="text-content-primary shrink-0" />
              break
          }

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 24, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 16, scale: 0.9 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg bg-surface border ${borderAccent} shadow-md`}
            >
              <div className="mt-0.5">{icon}</div>
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <p className="text-xs font-semibold text-content-primary tracking-tight">
                    {toast.title}
                  </p>
                )}
                <p className="text-xs text-content-secondary leading-snug">
                  {toast.message}
                </p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-content-tertiary hover:text-content-primary p-0.5 rounded transition-colors"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
