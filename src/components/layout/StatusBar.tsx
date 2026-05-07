'use client'

import { useUiStore } from '@/stores/uiStore'
import { formatCost } from '@/lib/cost'

export function StatusBar() {
  const totalSessionTokens = useUiStore((s) => s.totalSessionTokens)
  const totalSessionCost = useUiStore((s) => s.totalSessionCost)

  return (
    <div className="h-6 shrink-0 flex items-center justify-between px-3 bg-base-1 border-t border-white/[0.06]">
      <div className="flex items-center gap-2 font-mono text-[10px] text-text3">
        <span className="text-green">●</span>
        <span>NEXUS PRIME</span>
        <span className="opacity-30">|</span>
        <span>claude-sonnet-4-5</span>
      </div>
      {totalSessionTokens > 0 && (
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-text3">
          <span>
            {totalSessionTokens >= 1000
              ? `${(totalSessionTokens / 1000).toFixed(1)}k`
              : totalSessionTokens}{' '}
            tok
          </span>
          <span className="opacity-30">·</span>
          <span>{formatCost(totalSessionCost)}</span>
        </div>
      )}
    </div>
  )
}
