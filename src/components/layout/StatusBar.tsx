'use client'

import { useUiStore } from '@/stores/uiStore'
import { formatCost } from '@/lib/cost'
import { GitBranch } from 'lucide-react'

export function StatusBar() {
  const totalSessionTokens = useUiStore((s) => s.totalSessionTokens)
  const totalSessionCost = useUiStore((s) => s.totalSessionCost)

  return (
    <div
      className="flex items-center justify-between px-2 shrink-0 font-mono"
      style={{
        height: 22,
        background: '#1a2a4a',
        borderTop: '1px solid rgba(59,130,246,0.2)',
      }}
    >
      {/* Left side — Cursor blue status sections */}
      <div className="flex items-center gap-3" style={{ fontSize: 11 }}>
        <div
          className="flex items-center gap-1.5 px-2 h-full"
          style={{ color: '#93c5fd' }}
        >
          <GitBranch size={11} strokeWidth={1.5} />
          <span>main</span>
        </div>
        <span style={{ color: 'rgba(147,197,253,0.5)' }}>|</span>
        <span style={{ color: '#93c5fd' }}>NEXUS PRIME</span>
        <span style={{ color: 'rgba(147,197,253,0.5)' }}>|</span>
        <span style={{ color: '#93c5fd' }}>claude-sonnet-4-5</span>
      </div>

      {/* Right side — tokens + cost */}
      <div className="flex items-center gap-3" style={{ fontSize: 11, color: '#93c5fd' }}>
        {totalSessionTokens > 0 && (
          <>
            <span>
              {totalSessionTokens >= 1000
                ? `${(totalSessionTokens / 1000).toFixed(1)}k`
                : totalSessionTokens} tok
            </span>
            <span style={{ color: 'rgba(147,197,253,0.5)' }}>·</span>
            <span>{formatCost(totalSessionCost)}</span>
          </>
        )}
        <span style={{ color: 'rgba(147,197,253,0.5)' }}>UTF-8</span>
        <span style={{ color: 'rgba(147,197,253,0.5)' }}>TypeScript</span>
      </div>
    </div>
  )
}
