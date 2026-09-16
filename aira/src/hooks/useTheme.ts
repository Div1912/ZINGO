import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

export function useTheme() {
  const { settings, updateSettings } = useSettingsStore()
  const theme = settings.theme

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const resolved = systemDark ? 'dark' : 'light'
      root.setAttribute('data-theme', resolved)
      root.classList.toggle('dark', resolved === 'dark')
      root.style.colorScheme = resolved
      
      const listener = (e: MediaQueryListEvent) => {
        const nextResolved = e.matches ? 'dark' : 'light'
        root.setAttribute('data-theme', nextResolved)
        root.classList.toggle('dark', nextResolved === 'dark')
        root.style.colorScheme = nextResolved
      }
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', listener)
      return () => mediaQuery.removeEventListener('change', listener)
    } else {
      root.setAttribute('data-theme', theme)
      root.classList.toggle('dark', theme === 'dark')
      root.style.colorScheme = theme
    }
  }, [theme])

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    updateSettings({ theme: nextTheme })
  }

  return { theme, toggleTheme, setTheme: (newTheme: 'light' | 'dark' | 'system') => updateSettings({ theme: newTheme }) }
}
