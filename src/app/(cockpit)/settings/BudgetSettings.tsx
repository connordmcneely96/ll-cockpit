'use client'

import { SESSION_TOKEN_LIMIT } from '@/lib/cost'
import { useCostTracker } from '@/hooks/useCostTracker'

export function BudgetSettings() {
  const { totalTokens, formattedCost, percent, color } = useCostTracker()

  const barColor =
    color === 'red' ? 'bg-red' : color === 'yellow' ? 'bg-gold' : 'bg-green'

  return (
    <div>
      <h2 className="text-text2 font-condensed font-semibold text-sm uppercase tracking-wider mb-3">
        Session Budget
      </h2>
      <div className="bg-navy-3 border border-gold/12 rounded-xl p-4 space-y-4">
        {/* Model */}
        <div className="flex items-center justify-between">
          <span className="text-text3 font-mono text-xs">Model</span>
          <code className="text-cyan text-xs font-mono">claude-sonnet-4-6</code>
        </div>

        {/* Token limit */}
        <div className="flex items-center justify-between">
          <span className="text-text3 font-mono text-xs">Session limit</span>
          <span className="text-text2 font-mono text-xs">
            {SESSION_TOKEN_LIMIT.toLocaleString()} tokens
          </span>
        </div>

        {/* Pricing */}
        <div className="flex items-center justify-between">
          <span className="text-text3 font-mono text-xs">Pricing</span>
          <span className="text-text2 font-mono text-xs">$3 in / $15 out per 1M tokens</span>
        </div>

        {/* Current usage */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-text3 font-mono text-xs">This session</span>
            <span className="text-text2 font-mono text-xs">
              {totalTokens.toLocaleString()} / {SESSION_TOKEN_LIMIT.toLocaleString()} tokens
              {' '}·{' '}
              <span className="text-gold">{formattedCost}</span>
            </span>
          </div>
          <div className="w-full h-2 bg-navy-4 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <p className="text-text3 text-xs font-mono">
          Budget resets each session. Monthly cost target: $0 fixed (free tier).
        </p>
      </div>
    </div>
  )
}
