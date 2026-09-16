import React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'accent' | 'outline'
  size?: 'sm' | 'md'
  icon?: React.ReactNode
  className?: string
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  icon,
  className = '',
}) => {
  let styleClass = 'bg-elevated text-content-secondary border border-border'

  switch (variant) {
    case 'success':
      styleClass = 'bg-success/10 text-success border border-success/20'
      break
    case 'warning':
      styleClass = 'bg-warning/10 text-warning border border-warning/20'
      break
    case 'danger':
      styleClass = 'bg-danger/10 text-danger border border-danger/20'
      break
    case 'accent':
      styleClass = 'bg-accent text-accent-text border border-transparent'
      break
    case 'outline':
      styleClass = 'bg-transparent text-content-primary border border-border-strong'
      break
  }

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-pill tracking-tight select-none ${styleClass} ${sizeClass} ${className}`}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  )
}
