'use client'

import { useUiStore } from '@/stores/uiStore'
import { formatCost } from '@/lib/cost'
import { GitBranch, Cloud } from 'lucide-react'

export function StatusBar() {
  const totalSessionTokens = useUiStore((s) => s.totalSessionTokens)
  const totalSessionCost = useUiStore((s) => s.totalSessionCost)
  const currentWorkspace = useUiStore((s) => s.currentWorkspace)

  return (
    <div
      className="flex items-center justify-between px-3 shrink-0 font-mono"
      style={{
        height: 22,
        background: 'var(--t-sb-bg)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        zIndex: 20,
      }}
    >
      <div className="flex items-center gap-3" style={{ fontSize: 11, color: 'var(--t-sb-tx)' }}>
        <div className="flex items-center gap-1.5 px-1.5 rounded" style={{ background:'rgba(16,185,129,0.15)', color:'#10b981' }}>
          <Cloud size={10} strokeWidth={1.5} />
          <span style={{ fontWeight: 600 }}>production</span>
        </div>
        <div className="flex items-center gap-1.5">
          <GitBranch size={11} strokeWidth={1.5} />
          <span>main</span>
        </div>
        <span style={{ opacity: 0.4 }}>|</span>
        <span>{currentWorkspace}</span>
        <span style={{ opacity: 0.4 }}>|</span>
        <span>claude-sonnet-4-5</span>
      </div>
      <div className="flex items-center gap-3" style={{ fontSize: 11, color: 'var(--t-sb-tx)', opacity: 0.8 }}>
        {totalSessionTokens > 0 && (
          <>
            <span>{totalSessionTokens >= 1000 ? `${(totalSessionTokens / 1000).toFixed(1)}k` : totalSessionTokens} tok</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{formatCost(totalSessionCost)}</span>
            <span style={{ opacity: 0.4 }}>|</span>
          </>
        )}
        <span style={{ opacity: 0.6 }}>UTF-8</span>
        <span style={{ opacity: 0.6 }}>TypeScript</span>
      </div>
    </div>
  )
}
