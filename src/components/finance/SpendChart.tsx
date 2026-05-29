'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatCost } from '@/lib/cost'

interface Point { day: string; cost: number; tokens: number }
type Range = '7d' | '30d' | 'MTD'

export function SpendChart() {
  const [series, setSeries] = useState<Point[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('30d')

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    fetch('/api/finance/spend-series', { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string; series?: Point[] }>)
      .then((d) => { if (d.ok) setSeries(d.series ?? []); else setError(d.error ?? 'Failed to load') })
      .catch(() => setError('Spend series timed out'))
      .finally(() => { clearTimeout(timer); setLoading(false) })
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [])

  const filtered = useMemo(() => {
    if (range === '7d') return series.slice(-7)
    if (range === 'MTD') { const m = new Date().toISOString().slice(0, 7); return series.filter((p) => p.day.startsWith(m)) }
    return series
  }, [series, range])

  const w = 640, h = 160, pad = 4
  const path = useMemo(() => {
    if (filtered.length === 0) return { line: '', area: '' }
    const max = Math.max(...filtered.map((p) => p.cost), 0.000001)
    const stepX = filtered.length > 1 ? (w - pad * 2) / (filtered.length - 1) : 0
    const pts = filtered.map((p, i) => {
      const x = pad + i * stepX
      const y = h - pad - (p.cost / max) * (h - pad * 2)
      return [x, y] as const
    })
    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`
    return { line, area }
  }, [filtered])

  const total = filtered.reduce((s, p) => s + p.cost, 0)

  return (
    <div className="bg-base-2 border border-white/[0.06] rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <p className="text-text3 font-mono text-[10px] uppercase tracking-wider">Daily AI Spend</p>
          <span className="font-mono text-[10px] text-blue-bright">{formatCost(total)}</span>
        </div>
        <div className="flex gap-1">
          {(['7d', '30d', 'MTD'] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2 py-0.5 rounded font-mono text-[9px] border border-white/[0.06] transition-colors ${range === r ? 'bg-blue/10 text-blue' : 'bg-base-3 text-text3 hover:text-text2'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="h-40 rounded bg-base-3 animate-pulse" />
      ) : error ? (
        <p className="font-mono text-[10px] text-red py-12 text-center">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="font-mono text-[10px] text-text3 py-12 text-center">No spend recorded for this range</p>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 160 }} preserveAspectRatio="none">
          <path d={path.area} fill="#3b82f6" opacity="0.12" />
          <path d={path.line} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}
