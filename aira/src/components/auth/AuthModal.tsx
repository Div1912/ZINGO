import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Mail, User, ArrowRight, Loader2, KeyRound } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { supabase, updateProfile } from '../../services/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'

export const AuthModal: React.FC = () => {
  const navigate = useNavigate()
  const { isAuthModalOpen, closeAuthModal, authModalMode, openAuthModal, refreshProfile } = useAuthStore()
  const { addToast } = useToastStore()

  const isSignUp = authModalMode === 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all required fields.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setIsLoading(true)
    try {
      if (isSignUp) {
        // Sign Up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: {
              display_name: displayName.trim() || undefined,
            },
          },
        })

        if (signUpError) {
          throw signUpError
        }

        let userSession = data.session

        // If session was not immediately returned by signUp, sign in directly with credentials
        if (!userSession) {
          const { data: signInData, error: autoSignInErr } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password.trim(),
          })
          if (!autoSignInErr && signInData.session) {
            userSession = signInData.session
          }
        }

        const userId = data.user?.id || userSession?.user?.id
        if (userId && displayName.trim()) {
          await updateProfile(userId, { display_name: displayName.trim() })
          await refreshProfile()
        }

        addToast({
          type: 'success',
          title: 'Account Created',
          message: 'Welcome! Directing you to your sovereign workspace...',
        })
        closeAuthModal()
        navigate('/app')
      } else {
        // Sign In
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        })

        if (signInError) {
          throw signInError
        }

        addToast({
          type: 'success',
          title: 'Welcome Back',
          message: 'Signed in successfully. Opening workspace...',
        })
        closeAuthModal()
        navigate('/app')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={closeAuthModal}
      title=""
      maxWidth="sm"
    >
      <div className="p-2 sm:p-4 space-y-5">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] border border-border text-content-primary mx-auto flex items-center justify-center">
            <KeyRound size={22} className="text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary tracking-tight">
            {isSignUp ? 'Create AIRA Account' : 'Sign In to Sovereign Hub'}
          </h2>
          <p className="text-xs text-content-secondary max-w-xs mx-auto">
            {isSignUp
              ? 'Register with Supabase to sync your sovereign models, sessions, and preferences.'
              : 'Enter your credentials to access your persistent research sessions.'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-1 bg-elevated/70 rounded-xl border border-border/60 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setError(null)
              openAuthModal('signin')
            }}
            className={`py-1.5 rounded-lg transition-all ${
              !isSignUp
                ? 'bg-surface text-content-primary shadow-xs'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null)
              openAuthModal('signup')
            }}
            className={`py-1.5 rounded-lg transition-all ${
              isSignUp
                ? 'bg-surface text-content-primary shadow-xs'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs text-center animate-in fade-in">
              {error}
            </div>
          )}

          {isSignUp && (
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-medium text-content-secondary flex items-center gap-1.5">
                <User size={13} className="text-content-tertiary" />
                <span>Your Name</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex Morgan"
                className="input w-full !text-sm !py-2"
              />
            </div>
          )}

          <div className="space-y-1.5 text-left">
            <label className="text-xs font-medium text-content-secondary flex items-center gap-1.5">
              <Mail size={13} className="text-content-tertiary" />
              <span>Email Address</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@mrpl.co.in"
              autoFocus={!isSignUp}
              required
              className="input w-full !text-sm !py-2"
            />
          </div>

          <div className="space-y-1.5 text-left">
            <label className="text-xs font-medium text-content-secondary flex items-center gap-1.5">
              <Lock size={13} className="text-content-tertiary" />
              <span>Password</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="input w-full !text-sm !py-2"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full !py-2.5 !text-sm flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>{isSignUp ? 'Create Sovereign Account' : 'Sign In'}</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
