'use client'

import { useEffect } from 'react'

export default function CockpitError({
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
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
      <p className="text-[#00d4ff] font-mono text-xs tracking-widest uppercase">✗ Error</p>
      <h2 className="text-[#e2e8f0] text-xl font-semibold">Something went wrong</h2>
      <p className="text-[#64748b] text-sm max-w-md">
        {error.message || 'An unexpected error occurred in this panel.'}
      </p>
      {error.digest && (
        <p className="text-[#64748b] font-mono text-xs">ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-2 px-4 py-2 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-sm font-mono rounded-lg hover:bg-[#00d4ff]/20 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
