import React from 'react'
import { motion } from 'framer-motion'

export const TypingIndicator: React.FC = () => {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="w-1.5 h-1.5 rounded-full bg-content-secondary block"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.15, 0.85] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            delay: dot * 0.22,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}
