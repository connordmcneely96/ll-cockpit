import type { BrainLive } from '@/app/nexus/data'

interface Props { brain: BrainLive }

type StatusKey = 'success' | 'warning' | 'error' | 'info' | 'neutral'
const STATUS_COLOR: Record<StatusKey, string> = {
  success: 'var(--d-success)',
  warning: 'var(--d-warning)',
  error: 'var(--d-error)',
  info: 'var(--d-info)',
  neutral: 'var(--t-tx3)',
}

function Row({ label, value, status }: { label: string; value: string; status?: StatusKey }) {
  return (
    <div className="glass-card p-3">
      <div className="text-xs mb-1" style={{ color: 'var(--t-tx3)' }}>{label}</div>
      <div className="flex items-center gap-2">
        {status && status !== 'neutral' && (
          <span className="inline-block rounded-full shrink-0" style={{ width: 7, height: 7, background: STATUS_COLOR[status] }} />
        )}
        <span className="text-xs font-medium" style={{ color: 'var(--t-tx1)' }}>{value}</span>
      </div>
    </div>
  )
}

export default function SystemBrain({ brain }: Props) {
  return (
    <aside
      className="glass-panel flex flex-col h-full overflow-y-auto"
      style={{ width: 320, borderLeft: '1px solid var(--t-glass-bdr)', borderRight: 'none' }}
    >
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
        <div className="text-xs font-semibold uppercase" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>
          System Brain
        </div>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <Row label="Active Tenant" value="ConnorPattern · LL Cockpit" />
        <Row
          label="Active Runs"
          value={`${brain.activeRunCount} run${brain.activeRunCount !== 1 ? 's' : ''} in progress`}
          status={brain.activeRunCount > 0 ? 'success' : 'neutral'}
        />
        {brain.latestRunSummary && (
          <Row label="Latest Active Run" value={brain.latestRunSummary} status="info" />
        )}
        <Row label="Agent Fleet" value={`${brain.agentCount} agents active`} status="success" />
        <Row label="Total Run Cost" value={`$${brain.totalCostAllTime.toFixed(4)}`} />
        <Row label="D1 Database" value="Online" status="success" />
        <Row label="Security" value="Auth OK · No alerts" status="success" />
      </div>
    </aside>
  )
}
