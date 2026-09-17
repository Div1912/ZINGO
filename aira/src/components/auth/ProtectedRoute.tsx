import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { Spinner } from '../ui/Spinner'
import { AuthModal } from './AuthModal'
import { ShieldAlert, LogIn, ArrowLeft } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading, isInitialized, initialize, isAuthModalOpen, openAuthModal } = useAuthStore()

  useEffect(() => {
    if (!isInitialized) {
      initialize()
    }
  }, [isInitialized, initialize])

  // While checking auth status on page load
  if (isLoading || !isInitialized) {
    return (
      <div className="min-h-app-screen w-full flex items-center justify-center bg-[#090b10] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 animate-pulse flex items-center justify-center">
              <span className="font-mono font-black text-xl text-black">A</span>
            </div>
            <div className="absolute -inset-1 rounded-xl bg-cyan-500/20 blur-md -z-10 animate-pulse" />
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 tracking-wider uppercase">
            <Spinner size="sm" />
            <span>Validating sovereign session...</span>
          </div>
        </div>
      </div>
    )
  }

  // If user is not authenticated, block access and present login gateway
  if (!user) {
    return (
      <div className="min-h-app-screen w-full flex items-center justify-center bg-[#090b10] p-4 text-white relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full border border-white/10 rounded-2xl bg-[#0f131a]/90 backdrop-blur-xl p-8 text-center relative z-10 shadow-2xl shadow-cyan-950/20">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto mb-5 shadow-inner">
            <ShieldAlert size={28} />
          </div>

          <h2 className="text-xl font-bold font-mono tracking-tight text-white mb-2">
            Authentication Required
          </h2>
          <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
            The AIRA Sovereign Workspace requires an authenticated session. Sign in to access your private neural models and isolated chat histories.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => openAuthModal('signin')}
              className="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 active:scale-[0.98]"
            >
              <LogIn size={16} />
              <span>Sign In / Create Account</span>
            </button>

            <Link
              to="/"
              className="w-full py-2.5 px-4 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-neutral-300 font-medium text-xs transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft size={14} />
              <span>Back to Landing Page</span>
            </Link>
          </div>
        </div>

        {/* Ensure AuthModal is present */}
        {isAuthModalOpen && <AuthModal />}
      </div>
    )
  }

  // User is authenticated
  return <>{children}</>
}
