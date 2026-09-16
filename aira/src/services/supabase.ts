import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://fxewtefpamnjscaznvgq.supabase.co'
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZXd0ZWZwYW1uanNjYXpudmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NzkyMzUsImV4cCI6MjEwNTE1NTIzNX0.Q9j9oAQzft-MVHTOf5nD2vIV5Q2vth8xSZH3RqCtjGo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
})

export interface UserProfile {
  id: string
  email: string
  display_name: string | null
  preferred_name: string | null
  work_description: string | null
  avatar_url: string | null
  created_at?: string
  updated_at?: string
}

export interface UserSessionRecord {
  id?: string
  user_id: string
  session_token?: string
  user_agent?: string
  ip_address?: string
  created_at?: string
  last_active_at?: string
}

/**
 * Fetch or auto-create profile for a user
 */
export async function getOrCreateProfile(userId: string, email: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.warn('Error fetching profile:', error.message)
    }

    if (data) {
      return data as UserProfile
    }

    // Insert fallback profile if none exists
    const newProfile: Partial<UserProfile> = {
      id: userId,
      email,
      display_name: '',
      work_description: 'Refinery Process Engineer (CDU/VDU)',
    }

    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .upsert(newProfile)
      .select('*')
      .single()

    if (insertError) {
      console.warn('Error creating profile:', insertError.message)
      return null
    }

    return inserted as UserProfile
  } catch (err) {
    console.error('getOrCreateProfile exception:', err)
    return null
  }
}

/**
 * Update user profile details
 */
export async function updateProfile(
  userId: string,
  updates: Partial<UserProfile>
): Promise<{ success: boolean; data?: UserProfile; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*')
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as UserProfile }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Update failed' }
  }
}

/**
 * Record user session with client agent and timestamp
 */
export async function recordUserSession(
  userId: string,
  token?: string
): Promise<void> {
  try {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
    await supabase.from('user_sessions').insert({
      user_id: userId,
      session_token: token || 'browser-session',
      user_agent: userAgent.slice(0, 500),
      last_active_at: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('Could not record user session:', err)
  }
}
