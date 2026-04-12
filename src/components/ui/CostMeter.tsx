'use client'

import { useCostTracker } from '@/hooks/useCostTracker'

export function CostMeter() {
  const { totalTokens, formattedCost, percent, color, limit } = useCostTracker()

  const barColor =
    color === 'red'
      ? 'bg-red'
      : color === 'yellow'
        ? 'bg-gold'
        : 'bg-green'

  const textColor =
    color === 'red'
      ? 'text-red'
      : color === 'yellow'
        ? 'text-gold'
        : 'text-green'

  return (
    <div className="flex items-center gap-2 font-mono text-xs" title={`Session budget: ${totalTokens.toLocaleString()} / ${limit.toLocaleString()} tokens`}>
      {/* Bar */}
      <div className="w-20 h-1.5 bg-navy-4 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {/* Tokens */}
      <span className={`${textColor} tabular-nums`}>
        {totalTokens >= 1000
          ? `${(totalTokens / 1000).toFixed(1)}k`
          : totalTokens}
        <span className="text-text3">/100k</span>
      </span>
      {/* Cost */}
      <span className="text-text3">{formattedCost}</span>
    </div>
  )
}
