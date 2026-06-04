'use client'

import { useCallback, useEffect, useState } from 'react'

interface RunRow {
  id: string
  agent_name: string
  input_preview: string
  tokens_used: number | null
  cost_usd: number | null
  created_at: number
}

interface Props {
  source: string
  onLoad: (full: string, meta: { tokensUsed: number; costUsd: number }) => void
}

function relativeTime(epoch: number): string {
  const diff = Date.now() / 1000 - epoch
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(epoch * 1000).toLocaleDateString()
}

export function RunHistory({ source, onLoad }: Props) {
  const [open, setOpen] = useState(false)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const fetchRuns = useCallback(() => {
    setLoading(true); setError(null)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    fetch(`/api/runs?source=${encodeURIComponent(source)}`, { signal: ctrl.signal })
      .then(r => r.json() as Promise<{ ok: boolean; runs?: RunRow[]; error?: string }>)
      .then(d => { if (d.ok) setRuns(d.runs ?? []); else setError(d.error ?? 'Failed to load') })
      .catch(() => setError('History request timed out'))
      .finally(() => { clearTimeout(timer); setLoading(false) })
  }, [source])

  useEffect(() => { fetchRuns() }, [fetchRuns])

  const onClick = async (id: string) => {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/runs/${id}`)
      const d = await res.json() as { ok: boolean; run?: { output: string; tokens_used: number | null; cost_usd: number | null } }
      if (d.ok && d.run) onLoad(d.run.output, { tokensUsed: d.run.tokens_used ?? 0, costUsd: d.run.cost_usd ?? 0 })
    } finally { setLoadingId(null) }
  }

  return (
    <div className="w-full max-w-2xl rounded-lg" style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-mono uppercase tracking-widest"
        style={{ color: 'var(--t-tx3)', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <span>{open ? '▾' : '▸'} History ({loading ? '…' : runs.length})</span>
        {open && <span onClick={(e) => { e.stopPropagation(); fetchRuns() }} className="hover:underline" style={{ color: 'var(--t-p)' }}>refresh</span>}
      </button>
      {open && (
        <div className="border-t" style={{ borderColor: 'var(--t-glass-bdr)' }}>
          {loading ? (
            <div className="p-4 flex flex-col gap-2">
              {[0,1,2].map(i => <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--t-glass-bdr)' }} />)}
            </div>
          ) : error ? (
            <p className="font-mono text-[10px] px-4 py-6 text-center" style={{ color: 'var(--t-red)' }}>{error}</p>
          ) : runs.length === 0 ? (
            <p className="font-mono text-[10px] px-4 py-6 text-center" style={{ color: 'var(--t-tx3)' }}>
              No saved runs yet — completed analyses are saved here automatically.
            </p>
          ) : (
            <div className="flex flex-col">
              {runs.map(r => (
                <button
                  key={r.id}
                  onClick={() => onClick(r.id)}
                  disabled={loadingId === r.id}
                  className="text-left px-4 py-2.5 flex items-center justify-between gap-3 border-b transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--t-glass-bdr)', background: 'none', cursor: loadingId === r.id ? 'wait' : 'pointer' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] truncate" style={{ color: 'var(--t-tx1)' }}>{r.input_preview}</p>
                    <p className="font-mono text-[9px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>
                      {r.agent_name.toUpperCase()} · {relativeTime(r.created_at)} · {(r.tokens_used ?? 0).toLocaleString()} tokens · ${(r.cost_usd ?? 0).toFixed(4)}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--t-p)' }}>{loadingId === r.id ? '…' : 'load →'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
