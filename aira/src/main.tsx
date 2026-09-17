import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/**
 * Keep --app-vh pinned to the real visible viewport height, not the
 * mobile-browser-inflated `100vh`. `visualViewport` reports the height
 * that's actually on screen right now (address bar / keyboard included);
 * `window.innerHeight` is the fallback for browsers without it.
 */
function syncAppViewportHeight() {
  const vv = window.visualViewport
  const h = vv ? vv.height : window.innerHeight
  document.documentElement.style.setProperty('--app-vh', `${h}px`)
}

syncAppViewportHeight()
window.addEventListener('resize', syncAppViewportHeight)
window.addEventListener('orientationchange', syncAppViewportHeight)
window.visualViewport?.addEventListener('resize', syncAppViewportHeight)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
