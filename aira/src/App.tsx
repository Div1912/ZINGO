import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Spinner } from './components/ui/Spinner'
import { AppShell } from './pages/App/index'

// Lazy-loaded routes for performance & code-splitting
const Landing = lazy(() => import('./pages/Landing').then((m) => ({ default: m.Landing })))
const ChatPage = lazy(() => import('./pages/App/Chat').then((m) => ({ default: m.ChatPage })))

import { ProtectedRoute } from './components/auth/ProtectedRoute'

const LoadingFallback = () => (
  <div className="flex-1 h-full w-full flex items-center justify-center p-8 bg-page">
    <div className="flex flex-col items-center gap-3">
      <Spinner size="lg" />
      <span className="text-xs font-mono text-content-tertiary tracking-wider uppercase">
        Loading AIRA...
      </span>
    </div>
  </div>
)

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public Landing Page */}
          <Route path="/" element={<Landing />} />

          {/* Authenticated Sovereign Workbench Shell guarded by Supabase */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<ChatPage />} />
            <Route path="chat/:id" element={<ChatPage />} />
            <Route path="settings" element={<ChatPage />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
