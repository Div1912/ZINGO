import React from 'react'

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-border py-12 px-4 sm:px-6 lg:px-8 bg-surface">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <svg
            className="w-6 h-6 text-content-primary shrink-0"
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
          >
            <polygon points="50,6 90,29 90,75 50,98 10,75 10,29" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-content-primary">
              MRPL AIRA
            </div>
            <div className="text-xs text-content-tertiary">
              Mangalore Refinery and Petrochemicals Limited · On-Premise Sovereign AI
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-content-tertiary">
          <span>&copy; {new Date().getFullYear()} MRPL. All rights reserved.</span>
          <span className="hidden sm:inline">&middot;</span>
          <span className="font-mono">Version 1.0.0 &middot; Internal Use Only</span>
        </div>
      </div>
    </footer>
  )
}
