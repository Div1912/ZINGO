import React, { useState } from 'react'
import { User, Sparkles, ArrowRight, Loader2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useAuthStore } from '../../stores/authStore'

export const NamePromptModal: React.FC = () => {
  const { isNameModalOpen, saveDisplayName, user } = useAuthStore()
  const [name, setName] = useState('')
  const [preferredName, setPreferredName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please enter your name.')
      return
    }

    setError(null)
    setIsSubmitting(true)
    try {
      const success = await saveDisplayName(name.trim(), preferredName.trim() || undefined)
      if (!success) {
        setError('Could not save to database. Please check connection.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save name')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isNameModalOpen}
      onClose={() => {
        // Modal remains until name is saved for clean onboarding
      }}
      title=""
      maxWidth="sm"
    >
      <div className="p-2 sm:p-4 space-y-5">
        {/* Header icon & greeting */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/25 text-accent mx-auto flex items-center justify-center shadow-inner">
            <Sparkles size={22} className="text-blue-500 animate-pulse" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary tracking-tight">
            Welcome to AIRA
          </h2>
          <p className="text-xs text-content-secondary max-w-xs mx-auto leading-relaxed">
            Please tell us your name so we can personalize your sovereign workbench and AI sessions.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs text-center animate-in fade-in">
              {error}
            </div>
          )}

          <div className="space-y-1.5 text-left">
            <label className="text-xs font-medium text-content-secondary flex items-center gap-1.5">
              <User size={13} className="text-content-tertiary" />
              <span>Full Name</span>
              <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Divyanshu Sharma"
              autoFocus
              required
              className="input w-full !text-sm !py-2.5"
            />
          </div>

          <div className="space-y-1.5 text-left">
            <label className="text-xs font-medium text-content-secondary flex items-center justify-between">
              <span>Preferred Name (Optional)</span>
              <span className="text-[10px] text-content-tertiary">Short name for chats</span>
            </label>
            <input
              type="text"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              placeholder="e.g. Div"
              className="input w-full !text-sm !py-2"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="btn-primary w-full !py-2.5 !text-sm flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Saving to Database...</span>
                </>
              ) : (
                <>
                  <span>Continue to Workspace</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>

          {user?.email && (
            <p className="text-center text-[11px] text-content-tertiary font-mono pt-1">
              Signed in as: <span className="text-content-secondary">{user.email}</span>
            </p>
          )}
        </form>
      </div>
    </Modal>
  )
}
