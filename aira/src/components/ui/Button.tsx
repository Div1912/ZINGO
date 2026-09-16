import React, { type ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'glass' | 'ghost' | 'icon' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  icon?: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'glass',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  let baseClass = ''

  switch (variant) {
    case 'primary':
      baseClass = 'btn-primary'
      break
    case 'glass':
      baseClass = 'btn-glass'
      break
    case 'ghost':
      baseClass = 'btn-ghost'
      break
    case 'icon':
      baseClass = 'btn-icon'
      break
    case 'danger':
      baseClass = 'bg-danger text-white hover:opacity-90 rounded-pill px-4 py-2 font-medium text-sm transition-all border-none cursor-pointer'
      break
  }

  // Size modifications for non-icon buttons
  let sizeClass = ''
  if (variant !== 'icon') {
    if (size === 'sm') sizeClass = '!py-1.5 !px-3 !text-xs'
    if (size === 'lg') sizeClass = '!py-3 !px-6 !text-base'
  }

  return (
    <button
      className={`${baseClass} ${sizeClass} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon && <span className="inline-flex shrink-0">{icon}</span>
      )}
      {children && <span>{children}</span>}
    </button>
  )
}
