'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ background: '#0a0e1a', margin: 0, fontFamily: 'Barlow, sans-serif' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: '16px',
          textAlign: 'center',
          padding: '24px',
        }}>
          <p style={{ color: '#00d4ff', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>
            ✗ System Error
          </p>
          <h1 style={{ color: '#e2e8f0', fontSize: '24px', fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '400px', margin: 0 }}>
            {error.message || 'An unexpected error occurred. Please try again.'}
          </p>
          {error.digest && (
            <p style={{ color: '#64748b', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', margin: 0 }}>
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: '8px',
              padding: '8px 20px',
              background: 'rgba(0,212,255,0.1)',
              border: '1px solid rgba(0,212,255,0.3)',
              color: '#00d4ff',
              fontSize: '13px',
              fontFamily: 'JetBrains Mono, monospace',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
