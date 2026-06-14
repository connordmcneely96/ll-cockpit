import type { HeadlineStats } from '@/app/nexus/data'
import KpiCard from './KpiCard'
import Donut from './viz/Donut'

interface Props { stats: HeadlineStats }

function pct(a: number, b: number) {
  if (!b) return 0
  return Math.round((a / b) * 100)
}

export default function UsageStrip({ stats }: Props) {
  const successPct = pct(stats.completed, stats.total)

  return (
    <div className="flex items-stretch gap-3">
      <KpiCard
        label="Total Spend"
        value={`$${stats.totalSpend.toFixed(2)}`}
        series={stats.costSeries}
      />
      <KpiCard
        label="Active Runs"
        value={String(stats.activeRuns)}
        series={stats.activeSeries}
        accentBar={false}
      />
      <KpiCard
        label="Success Rate"
        value={`${successPct}%`}
        series={stats.successSeries}
        accentBar={false}
      />
      <div
        className="glass-card flex flex-col items-center justify-center gap-1 px-4"
        style={{ borderRadius: 'var(--d-radius-lg)', flexShrink: 0 }}
      >
        <Donut value={successPct} size={72} stroke={9} centerLabel={`${successPct}%`} />
        <span className="text-xs" style={{ color: 'var(--t-tx3)' }}>Success</span>
      </div>
    </div>
  )
}
