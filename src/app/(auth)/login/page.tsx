'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  const [loading, setLoading] = useState<'google' | 'github' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const signIn = async (provider: 'google' | 'github') => {
    setLoading(provider)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(null)
    }
  }

  return (
    <div className="bg-navy-3 border border-gold/12 rounded-xl p-8 shadow-2xl">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="text-gold font-condensed font-bold text-3xl tracking-widest uppercase mb-1">
          LL COCKPIT
        </div>
        <p className="text-text3 font-mono text-xs uppercase tracking-wider">
          NEXUS PRIME // Phase 1
        </p>
      </div>

      {/* OAuth buttons */}
      <div className="space-y-3">
        <Button
          variant="secondary"
          className="w-full justify-center gap-3"
          loading={loading === 'google'}
          onClick={() => signIn('google')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 11v2.4h6.8c-.3 1.7-2 5-6.8 5-4.1 0-7.4-3.4-7.4-7.4s3.3-7.4 7.4-7.4c2.3 0 3.9.99 4.8 1.84l3.3-3.18C18.1 1.0 15.3 0 12 0 5.4 0 0 5.4 0 12s5.4 12 12 12c6.9 0 11.5-4.9 11.5-11.7 0-.8-.1-1.4-.2-2.1H12z"/>
          </svg>
          Continue with Google
        </Button>

        <Button
          variant="secondary"
          className="w-full justify-center gap-3"
          loading={loading === 'github'}
          onClick={() => signIn('github')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          Continue with GitHub
        </Button>
      </div>

      {error && (
        <p className="mt-4 text-red text-xs font-mono text-center">{error}</p>
      )}

      <p className="mt-6 text-text3 text-xs font-mono text-center">
        Leadership Legacy Digital — Internal Use Only
      </p>
    </div>
  )
}
