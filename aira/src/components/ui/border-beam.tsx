import React from 'react'
import { cn } from '@/lib/utils'

export interface BorderBeamProps {
  className?: string
  size?: number
  duration?: number
  borderWidth?: number
  anchor?: number
  colorFrom?: string
  colorTo?: string
  delay?: number
}

export const BorderBeam: React.FC<BorderBeamProps> = ({
  className,
  duration = 8,
  borderWidth = 1.5,
  colorFrom = '#38bdf8',
  colorTo = '#818cf8',
  delay = 0,
}) => {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden z-20',
        className
      )}
      style={{
        padding: `${borderWidth}px`,
        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        maskComposite: 'exclude',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
      }}
    >
      <style>{`
        @keyframes border-beam-spin {
          0% {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          100% {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }
      `}</style>
      <div
        className="pointer-events-none"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '300vmax',
          height: '300vmax',
          transform: 'translate(-50%, -50%)',
          willChange: 'transform',
          animation: `border-beam-spin ${duration}s linear infinite`,
          animationDelay: `-${delay}s`,
          background: `conic-gradient(from 0deg, transparent 0deg 270deg, ${colorFrom} 315deg, ${colorTo} 355deg, transparent 360deg)`,
        }}
      />
    </div>
  )
}
