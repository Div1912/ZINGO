import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface DropdownItem {
  id: string
  label: string
  icon?: React.ReactNode
  danger?: boolean
  divider?: boolean
  onClick: () => void
}

interface DropdownProps {
  trigger: React.ReactNode
  items: DropdownItem[]
  align?: 'left' | 'right'
  direction?: 'up' | 'down'
  className?: string
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  align = 'right',
  direction = 'down',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const isUp = direction === 'up'

  return (
    <div className={`relative inline-block ${className}`} ref={menuRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: isUp ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: isUp ? 4 : -4 }}
            transition={{ duration: 0.12 }}
            className={`absolute z-50 ${
              isUp ? 'bottom-full mb-2' : 'top-full mt-1.5'
            } min-w-[220px] max-w-[280px] rounded-xl bg-white dark:bg-[#1c1c1f] border border-border-strong shadow-2xl ring-1 ring-black/10 dark:ring-white/10 py-1.5 overflow-hidden ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {items.map((item, idx) => (
              <React.Fragment key={item.id || idx}>
                {item.divider && <div className="my-1 border-t border-border" />}
                <button
                  type="button"
                  onClick={() => {
                    item.onClick()
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-normal text-left transition-colors border-none bg-transparent cursor-pointer ${
                    item.danger
                      ? 'text-danger hover:bg-danger/10'
                      : 'text-content-primary hover:bg-elevated'
                  }`}
                >
                  {item.icon && (
                    <span className="shrink-0 text-content-secondary">
                      {item.icon}
                    </span>
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              </React.Fragment>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
