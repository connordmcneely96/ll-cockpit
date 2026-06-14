import type { UsageToday } from '@/app/nexus/data'

interface Props { usage: UsageToday }

export default function UsageStrip({ usage }: Props) {
  return (
    <div
      className="glass-card flex items-center gap-6 px-4 py-3"
      style={{ flexShrink: 0 }}
    >
      <span className="text-xs font-semibold uppercase" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>Today</span>
      <span className="text-xs" style={{ color: 'var(--t-tx2)' }}>
        <span style={{ color: 'var(--t-tx1)', fontWeight: 600 }}>{usage.tokens.toLocaleString()}</span> tokens
      </span>
      <span className="text-xs" style={{ color: 'var(--t-tx2)' }}>
        <span style={{ color: 'var(--t-tx1)', fontWeight: 600 }}>${usage.cost.toFixed(4)}</span> cost
      </span>
      <span className="text-xs" style={{ color: 'var(--t-tx2)' }}>
        <span style={{ color: 'var(--t-tx1)', fontWeight: 600 }}>{usage.providers}</span> provider{usage.providers !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
