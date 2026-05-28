'use client'

import { useEffect, useState } from 'react'

type CronStatus = 'ok' | 'failed' | 'skip' | 'running' | 'empty'

interface CronRun {
  id: string
  status: string
  run_at: number
  duration_ms: number | null
  log_ref: string | null
  error_msg: string | null
}

interface CronJob {
  job_name: string
  display: string
  schedule: string
  runs: CronRun[]
}

const STATUS_COLOR: Record<CronStatus, string> = {
  ok:      '#10b981',
  failed:  '#ef4444',
  skip:    '#6b7280',
  running: '#3b82f6',
  empty:   'rgba(255,255,255,0.06)',
}

const STATUS_LABEL: Record<CronStatus, string> = {
  ok:      'OK',
  failed:  'FAILED',
  skip:    'SKIPPED',
  running: 'RUNNING',
  empty:   'No data',
}

function HeatCell({ run, jobDisplay }: { run: CronRun | null; jobDisplay: string }) {
  const [tooltip, setTooltip] = useState(false)
  const status: CronStatus = run ? (run.status as CronStatus) : 'empty'
  const color = STATUS_COLOR[status]

  return (
    <div className="relative" onMouseEnter={() => setTooltip(true)} onMouseLeave={() => setTooltip(false)}>
      <div
        className="w-5 h-5 rounded-sm cursor-default transition-opacity hover:opacity-80"
        style={{ background: color, boxShadow: status !== 'empty' ? `0 0 6px ${color}60` : 'none' }}
      />
      {tooltip && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 rounded-lg px-2.5 py-2 whitespace-nowrap pointer-events-none"
          style={{
            background: 'var(--d-elevated)',
            border: '1px solid var(--t-glass-bdr)',
            boxShadow: 'var(--t-shadow)',
            minWidth: 160,
          }}
        >
          <p className="font-mono text-[10px] font-semibold mb-0.5" style={{ color: color }}>
            {STATUS_LABEL[status]}
          </p>
          <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx2)' }}>{jobDisplay}</p>
          {run && (
            <>
              <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>
                {new Date(run.run_at).toLocaleString()}
              </p>
              {run.duration_ms !== null && (
                <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>
                  {run.duration_ms}ms
                </p>
              )}
              {run.error_msg && (
                <p className="font-mono text-[9px] mt-0.5" style={{ color: '#ef4444' }}>
                  {run.error_msg.slice(0, 60)}
                </p>
              )}
              {run.log_ref && (
                <p className="font-mono text-[9px] mt-0.5" style={{ color: 'var(--t-p)' }}>
                  {run.log_ref}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function CronHeatmap() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    fetch('/api/health/cron', { signal: controller.signal })
      .then(r => r.json() as Promise<{ ok: boolean; jobs?: CronJob[]; error?: string }>)
      .then(data => {
        if (data.ok && data.jobs) setJobs(data.jobs)
        else setError(data.error ?? 'Failed to load cron data')
      })
      .catch(err => {
        if (err.name !== 'AbortError') setError(String(err))
        else setError('Cron health timed out')
      })
      .finally(() => { clearTimeout(timeout); setLoading(false) })
  }, [])

  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background: 'var(--d-card)',
      border: '1px solid var(--t-glass-bdr)',
      boxShadow: 'var(--t-shadow)',
    }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none"
        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--t-glass-bdr)' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>
            System Health
          </span>
          {!loading && !error && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full" style={{
              background: 'var(--t-p-glass)',
              color: 'var(--t-p)',
              border: '1px solid var(--t-glass-bdr)',
            }}>
              {jobs.length} jobs · last 7 runs
            </span>
          )}
        </div>
        <span className="font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>
          {collapsed ? '›' : '‹'}
        </span>
      </div>

      {!collapsed && (
        <div className="px-4 py-3">
          {loading ? (
            <div className="flex gap-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-5 flex-1 rounded-sm" style={{ background: 'var(--t-bdr-s)' }} />
              ))}
            </div>
          ) : error ? (
            <p className="font-mono text-[10px]" style={{ color: '#ef4444' }}>{error}</p>
          ) : (
            <div className="space-y-2">
              {jobs.map(job => {
                // Pad to 7 cells — empty cells on left if fewer than 7 runs
                const cells: (CronRun | null)[] = Array(7).fill(null)
                job.runs.forEach((run, i) => { cells[7 - job.runs.length + i] = run })

                return (
                  <div key={job.job_name} className="flex items-center gap-3">
                    <span className="font-mono text-[9px] w-28 truncate shrink-0" style={{ color: 'var(--t-tx2)' }}>
                      {job.display}
                    </span>
                    <div className="flex items-center gap-1">
                      {cells.map((run, i) => (
                        <HeatCell key={i} run={run} jobDisplay={job.display} />
                      ))}
                    </div>
                    <span className="font-mono text-[9px] shrink-0" style={{ color: 'var(--t-tx3)' }}>
                      {job.schedule}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
