'use client'

import type { ActiveRun, RunsByStatus } from '@/lib/dashboard-data'
import ProgressBar from './viz/ProgressBar'
import DonutLegend from './viz/DonutLegend'

const STATUS_COLOR: Record<string, string> = {
  running: 'var(--d-success)',
  planning: 'var(--d-info)',
}

interface Props {
  runs: ActiveRun[]
  runsByStatus: RunsByStatus[]
}

function pct(done: number, total: number) {
  if (!total) return 0
  return Math.round((done / total) * 100)
}

export default function ActiveSystems({ runs, runsByStatus }: Props) {
  const segments = runsByStatus.map(r => ({ label: r.status, value: r.n }))

  return (
    <div className="flex flex-col gap-3">
      {/* Runs-by-status donut */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h2 className="text-xs font-semibold uppercase" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>
            Runs by Status
          </h2>
          <div className="glass-card p-3">
            <DonutLegend segments={segments} />
          </div>
        </div>
      </div>

      {/* Active runs table */}
      <div>
        <h2 className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>
          Active Systems
        </h2>
        {runs.length === 0 ? (
          <div className="glass-card px-4 py-3 text-xs" style={{ color: 'var(--t-tx3)' }}>
            No runs currently active.
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            {runs.map((run, i) => {
              const progress = pct(run.subtasks_completed, run.subtask_count)
              const isLast = i === runs.length - 1
              return (
                <div
                  key={run.id}
                  className="px-3 py-2.5"
                  style={{
                    borderBottom: isLast ? undefined : '1px solid var(--t-bdr)',
                    transition: 'background var(--d-transition)',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--t-p) 4%, transparent)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                >
                  <div className="flex items-center gap-3 text-xs mb-1.5">
                    <span
                      className="inline-block rounded-full shrink-0"
                      style={{ width: 6, height: 6, background: STATUS_COLOR[run.status] ?? 'var(--t-tx3)' }}
                    />
                    <span className="flex-1 truncate" style={{ color: 'var(--t-tx1)' }}>{run.summary}</span>
                    <span style={{ color: 'var(--t-tx3)' }}>${run.actual_cost_usd.toFixed(3)}</span>
                    <span style={{ color: 'var(--t-tx3)' }}>{run.subtasks_completed}/{run.subtask_count}</span>
                  </div>
                  <ProgressBar value={progress} height={3} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
