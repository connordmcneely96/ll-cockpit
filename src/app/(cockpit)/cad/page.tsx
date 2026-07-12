'use client'

import { useEffect, useState } from 'react'

interface Run {
  run_id: string
  spec: string
  max_cycles: number
  cycle: number
  status: string
  created_at: number
}
interface ApiResponse { ok: boolean; error?: string; runs?: Run[] }

const STATUS_COLOR: Record<string, string> = {
  converged: 'text-green border-green/30 bg-green/5',
  running: 'text-blue border-blue/30 bg-blue/5',
  exhausted: 'text-gold border-gold/30 bg-gold/5',
  failed: 'text-red border-red/30 bg-red/5',
}
function fmtDate(sec: number): string {
  if (!sec) return '—'
  return new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export default function CadIndexPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/cad/runs')
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((d) => {
        if (!alive) return
        if (!d.ok) { setError(d.error ?? 'Failed to load'); return }
        setError(null)
        setRuns(d.runs ?? [])
      })
      .catch(() => alive && setError('Failed to load runs'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const badge = 'px-1.5 py-0.5 font-mono text-[9px] rounded uppercase border'

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-widest">CAD Runs</p>
      </div>
      <div className="p-4 flex-1">
        {loading ? (
          <p className="font-mono text-[10px] text-text3">Loading runs…</p>
        ) : error ? (
          <p className="font-mono text-[10px] text-red py-12 text-center">{error}</p>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-base-3 border border-white/[0.06] flex items-center justify-center text-2xl">📐</div>
            <p className="font-mono text-xs font-semibold text-text2">No CAD runs yet</p>
            <p className="font-mono text-[10px] text-text3 max-w-xs">Submit a spec to the CAD pipeline and runs will appear here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {runs.map((r) => (
              <a
                key={r.run_id}
                href={`/cad/${r.run_id}`}
                className="flex items-center gap-3 bg-base-3 border border-white/[0.06] rounded-lg px-3 py-2.5 hover:border-white/[0.12] transition-colors"
              >
                <span className="font-mono text-[11px] text-text1 truncate flex-1">{r.spec}</span>
                <span className={`${badge} ${STATUS_COLOR[r.status] ?? 'text-text3 border-white/[0.06] bg-base-4'} shrink-0`}>{r.status}</span>
                <span className="font-mono text-[10px] text-text3 shrink-0">cycle {r.cycle}/{r.max_cycles}</span>
                <span className="font-mono text-[10px] text-text3 shrink-0 hidden sm:inline">{fmtDate(r.created_at)}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
