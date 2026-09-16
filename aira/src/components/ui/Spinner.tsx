import React from 'react'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className = '' }) => {
  let sizeClass = 'w-4 h-4 border-2'
  if (size === 'sm') sizeClass = 'w-3 h-3 border-2'
  if (size === 'lg') sizeClass = 'w-6 h-6 border-[2.5px]'

  return (
    <div
      className={`inline-block rounded-full border-content-tertiary border-t-accent animate-spin ${sizeClass} ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}
