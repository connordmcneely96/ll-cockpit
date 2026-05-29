'use client'

import { useEffect, useState } from 'react'
import { formatCost } from '@/lib/cost'

interface Summary {
  aiSpendMtd: number
  tokensMtd: number
  mrr: number
  netCashflow: number
}

function fmtTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function FinanceKpis() {
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    fetch('/api/finance/summary', { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string } & Summary>)
      .then((d) => { if (d.ok) setData(d); else setError(d.error ?? 'Failed to load') })
      .catch(() => setError('Finance summary timed out'))
      .finally(() => { clearTimeout(timer); setLoading(false) })
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.04] border-b border-white/[0.06]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-base-2 p-4 flex flex-col gap-2">
            <div className="h-2 w-20 rounded bg-base-4 animate-pulse" />
            <div className="h-6 w-24 rounded bg-base-4 animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-base-2 border-b border-white/[0.06] px-4 py-3">
        <p className="font-mono text-[10px] text-red">{error ?? 'No data'}</p>
      </div>
    )
  }

  const cards = [
    { label: 'AI SPEND MTD', value: formatCost(data.aiSpendMtd), color: 'text-blue' },
    { label: 'TOTAL TOKENS MTD', value: fmtTokens(data.tokensMtd), color: 'text-cyan' },
    { label: 'MRR', value: formatCost(data.mrr), color: 'text-green' },
    { label: 'NET CASHFLOW', value: formatCost(data.netCashflow), color: data.netCashflow >= 0 ? 'text-green' : 'text-gold' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.04] border-b border-white/[0.06]">
      {cards.map(({ label, value, color }) => (
        <div key={label} className="bg-base-2 p-4 flex flex-col gap-1">
          <p className="text-text3 font-mono text-[10px] uppercase tracking-wider">{label}</p>
          <p className={`font-mono text-2xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  )
}
