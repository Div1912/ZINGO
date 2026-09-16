import { useEffect } from 'react'

interface KeyShortcuts {
  onNewChat?: () => void
  onToggleSidebar?: () => void
  onOpenCommandBar?: () => void
  onToggleTheme?: () => void
  onStopGeneration?: () => void
  onOpenSettings?: () => void
}

export function useKeyboard(shortcuts: KeyShortcuts) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey

      // Cmd+,: Open settings
      if (isCmdOrCtrl && e.key === ',') {
        e.preventDefault()
        shortcuts.onOpenSettings?.()
      }

      // Cmd+K: Command bar
      if (isCmdOrCtrl && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        shortcuts.onOpenCommandBar?.()
      }

      // Cmd+B: Toggle sidebar
      if (isCmdOrCtrl && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        shortcuts.onToggleSidebar?.()
      }

      // Cmd+D: Toggle theme
      if (isCmdOrCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        shortcuts.onToggleTheme?.()
      }

      // Escape: Stop generation
      if (e.key === 'Escape') {
        shortcuts.onStopGeneration?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
