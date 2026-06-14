import type { UsageToday } from '@/app/nexus/data'
import KpiCard from './KpiCard'
import Donut from './viz/Donut'

interface Props { usage: UsageToday }

export default function UsageStrip({ usage }: Props) {
  const quotaPct = usage.tokens > 0 ? Math.min(100, Math.round(usage.tokens / 1000)) : 0

  return (
    <div className="flex items-stretch gap-3">
      <KpiCard label="Tokens Today" value={usage.tokens.toLocaleString()} series={[]} />
      <KpiCard label="Cost Today" value={`$${usage.cost.toFixed(4)}`} series={[]} />
      <KpiCard label="Providers" value={String(usage.providers)} series={[]} accentBar={false} />
      <div
        className="glass-card flex flex-col items-center justify-center gap-1 px-4"
        style={{ borderRadius: 'var(--d-radius-lg)', flexShrink: 0 }}
      >
        <Donut value={quotaPct} size={72} stroke={9} centerLabel={`${quotaPct}%`} />
        <span className="text-xs" style={{ color: 'var(--t-tx3)' }}>Quota</span>
      </div>
    </div>
  )
}
