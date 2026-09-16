import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.body.style.overflow = 'unset'
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  let widthClass = 'max-w-md'
  switch (maxWidth) {
    case 'sm': widthClass = 'max-w-sm'; break
    case 'md': widthClass = 'max-w-md'; break
    case 'lg': widthClass = 'max-w-lg'; break
    case 'xl': widthClass = 'max-w-xl'; break
    case '2xl': widthClass = 'max-w-2xl'; break
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', duration: 0.25, bounce: 0 }}
            className={`relative w-full ${widthClass} bg-surface border border-border rounded-xl shadow-lg p-6 overflow-hidden z-10`}
          >
            <div className="flex items-start justify-between pb-3 mb-3 border-b border-border">
              <div>
                {title && (
                  <h3 className="text-lg font-semibold text-content-primary tracking-tight">
                    {title}
                  </h3>
                )}
                {description && (
                  <p className="text-xs text-content-tertiary mt-0.5">
                    {description}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary ml-auto"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
