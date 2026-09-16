import React, { type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helperText?: string
  error?: string
  icon?: React.ReactNode
}

export const Input: React.FC<InputProps> = ({
  label,
  helperText,
  error,
  icon,
  className = '',
  ...props
}) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-content-secondary tracking-wide">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 text-content-tertiary pointer-events-none flex items-center">
            {icon}
          </div>
        )}
        <input
          className={`input ${icon ? 'pl-9' : ''} ${error ? '!border-danger focus:!ring-danger/20' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {!error && helperText && (
        <p className="text-xs text-content-tertiary">{helperText}</p>
      )}
    </div>
  )
}
