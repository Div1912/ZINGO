import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import {
  supabase,
  getOrCreateProfile,
  updateProfile,
  recordUserSession,
  type UserProfile,
} from '../services/supabase'
import { useSettingsStore } from './settingsStore'
import { useToastStore } from './toastStore'

interface AuthStore {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  isLoading: boolean
  isInitialized: boolean
  isAuthModalOpen: boolean
  isNameModalOpen: boolean
  authModalMode: 'signin' | 'signup'

  // Actions
  initialize: () => Promise<void>
  openAuthModal: (mode?: 'signin' | 'signup') => void
  closeAuthModal: () => void
  openNameModal: () => void
  closeNameModal: () => void
  saveDisplayName: (name: string, preferredName?: string) => Promise<boolean>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  isAuthModalOpen: false,
  isNameModalOpen: false,
  authModalMode: 'signin',

  initialize: async () => {
    if (get().isInitialized) return
    set({ isLoading: true })

    try {
      // 1. Get initial session
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        const profile = await getOrCreateProfile(session.user.id, session.user.email || '')
        set({
          user: session.user,
          session,
          profile,
        })

        // Check if name onboarding is required
        if (!profile?.display_name || profile.display_name.trim() === '') {
          set({ isNameModalOpen: true })
        } else {
          useSettingsStore.getState().updateSettings({
            userName: profile.display_name,
            preferredName: profile.preferred_name || profile.display_name,
          })
        }

        // Record session
        await recordUserSession(session.user.id, session.access_token)
      }
    } catch (err) {
      console.warn('Auth initialization warning:', err)
    } finally {
      set({ isLoading: false, isInitialized: true })
    }

    // 2. Listen to ongoing auth state changes
    supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === 'SIGNED_IN' && newSession?.user) {
        set({ user: newSession.user, session: newSession, isLoading: false })
        const profile = await getOrCreateProfile(newSession.user.id, newSession.user.email || '')
        set({ profile })

        // Check if name is missing after login
        if (!profile?.display_name || profile.display_name.trim() === '') {
          set({ isNameModalOpen: true })
        } else {
          useSettingsStore.getState().updateSettings({
            userName: profile.display_name,
            preferredName: profile.preferred_name || profile.display_name,
          })
        }

        // Record user session in DB
        await recordUserSession(newSession.user.id, newSession.access_token)
      } else if (event === 'SIGNED_OUT') {
        set({
          user: null,
          session: null,
          profile: null,
          isNameModalOpen: false,
        })
      }
    })
  },

  openAuthModal: (mode = 'signin') => {
    set({ isAuthModalOpen: true, authModalMode: mode })
  },

  closeAuthModal: () => {
    set({ isAuthModalOpen: false })
  },

  openNameModal: () => {
    set({ isNameModalOpen: true })
  },

  closeNameModal: () => {
    set({ isNameModalOpen: false })
  },

  saveDisplayName: async (name: string, preferredName?: string) => {
    const user = get().user
    if (!user) return false

    const trimmedName = name.trim()
    if (!trimmedName) return false

    const pref = preferredName?.trim() || trimmedName

    const result = await updateProfile(user.id, {
      display_name: trimmedName,
      preferred_name: pref,
    })

    if (result.success && result.data) {
      set({ profile: result.data, isNameModalOpen: false })

      // Sync with settingsStore
      useSettingsStore.getState().updateSettings({
        userName: trimmedName,
        preferredName: pref,
      })

      useToastStore.getState().addToast({
        type: 'success',
        title: 'Welcome aboard!',
        message: `Profile updated with your name, ${trimmedName}.`,
      })
      return true
    } else {
      useToastStore.getState().addToast({
        type: 'error',
        title: 'Profile Error',
        message: result.error || 'Could not update your name in database.',
      })
      return false
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut()
      set({
        user: null,
        session: null,
        profile: null,
        isNameModalOpen: false,
        isAuthModalOpen: false,
      })
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Signed Out',
        message: 'You have been securely signed out of your session.',
      })
    } catch (err: unknown) {
      console.error('Sign out error:', err)
    }
  },

  refreshProfile: async () => {
    const user = get().user
    if (!user) return
    const profile = await getOrCreateProfile(user.id, user.email || '')
    if (profile) {
      set({ profile })
      if (profile.display_name) {
        useSettingsStore.getState().updateSettings({
          userName: profile.display_name,
          preferredName: profile.preferred_name || profile.display_name,
        })
      }
    }
  },
}))
