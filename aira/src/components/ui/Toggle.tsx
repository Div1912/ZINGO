import React from 'react'
import { motion } from 'framer-motion'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
}) => {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm font-medium text-content-primary">
              {label}
            </span>
          )}
          {description && (
            <span className="text-xs text-content-tertiary">{description}</span>
          )}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-pill transition-colors duration-200 ease-in-out border-none outline-none focus:outline-none ${
          checked ? 'bg-accent' : 'bg-elevated border border-border'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`pointer-events-none inline-block h-4 w-4 rounded-full shadow-sm ${
            checked ? 'bg-accent-text' : 'bg-content-tertiary'
          }`}
          style={{
            marginLeft: checked ? '24px' : '4px',
          }}
        />
      </button>
    </div>
  )
}
