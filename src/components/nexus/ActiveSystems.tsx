import type { ActiveRun } from '@/app/nexus/data'

const STATUS_COLOR: Record<string, string> = {
  running: 'var(--d-success)',
  planning: 'var(--d-info)',
}

interface Props { runs: ActiveRun[] }

function pct(done: number, total: number) {
  if (!total) return 0
  return Math.round((done / total) * 100)
}

export default function ActiveSystems({ runs }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>
        Active Systems
      </h2>
      {runs.length === 0 ? (
        <div className="glass-card px-4 py-3 text-xs" style={{ color: 'var(--t-tx3)' }}>
          No runs currently active.
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--t-tx3)' }}>Run</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--t-tx3)' }}>Status</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--t-tx3)' }}>Progress</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--t-tx3)' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => {
                const progress = pct(run.subtasks_completed, run.subtask_count)
                return (
                  <tr
                    key={run.id}
                    style={{ borderBottom: i < runs.length - 1 ? '1px solid var(--t-glass-bdr)' : undefined }}
                  >
                    <td className="px-3 py-2" style={{ color: 'var(--t-tx1)', maxWidth: 280 }}>
                      <span className="line-clamp-1">{run.summary}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block rounded-full"
                          style={{ width: 6, height: 6, background: STATUS_COLOR[run.status] ?? 'var(--t-tx3)', flexShrink: 0 }}
                        />
                        <span style={{ color: 'var(--t-tx2)' }}>{run.status}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ minWidth: 100 }}>
                      <div className="flex items-center gap-2">
                        <div
                          className="rounded-full overflow-hidden"
                          style={{ height: 4, width: 80, background: 'var(--t-glass-bdr)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${progress}%`, background: 'var(--t-p)' }}
                          />
                        </div>
                        <span style={{ color: 'var(--t-tx3)' }}>{run.subtasks_completed}/{run.subtask_count}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: 'var(--t-tx2)' }}>
                      ${run.actual_cost_usd.toFixed(3)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
