'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatCost } from '@/lib/cost'

interface ModelRow {
  model_key: string
  calls: number
  cost: number
  avg_latency: number
  tokens: number
}
type Tab = 'provider' | 'cost' | 'full'

function providerOf(key: string) {
  return (key.split(/[/:]/)[0] || 'unknown').toLowerCase()
}

export function ModelIntelligence() {
  const [models, setModels] = useState<ModelRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('provider')

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    fetch('/api/finance/model-intelligence', { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string; models?: ModelRow[] }>)
      .then((d) => { if (d.ok) setModels(d.models ?? []); else setError(d.error ?? 'Failed to load') })
      .catch(() => setError('Model intelligence timed out'))
      .finally(() => { clearTimeout(timer); setLoading(false) })
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [])

  const byProvider = useMemo(() => {
    const map = new Map<string, { calls: number; cost: number; tokens: number }>()
    for (const m of models) {
      const p = providerOf(m.model_key)
      const cur = map.get(p) ?? { calls: 0, cost: 0, tokens: 0 }
      map.set(p, { calls: cur.calls + m.calls, cost: cur.cost + m.cost, tokens: cur.tokens + m.tokens })
    }
    return [...map.entries()].sort((a, b) => b[1].cost - a[1].cost)
  }, [models])

  const tabs: [Tab, string][] = [['provider', 'By Provider'], ['cost', 'Cost & Latency'], ['full', 'Full Table']]
  const th = 'text-left font-mono text-[9px] uppercase tracking-wider text-text3 px-2 py-1.5'
  const td = 'font-mono text-[10px] text-text2 px-2 py-1.5 border-t border-white/[0.06]'

  return (
    <div className="bg-base-2 border border-white/[0.06] rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-wider">Model Intelligence</p>
        <div className="flex gap-1">
          {tabs.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2 py-0.5 rounded font-mono text-[9px] border border-white/[0.06] transition-colors ${tab === t ? 'bg-blue/10 text-blue' : 'bg-base-3 text-text3 hover:text-text2'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="h-32 rounded bg-base-3 animate-pulse" />
      ) : error ? (
        <p className="font-mono text-[10px] text-red py-8 text-center">{error}</p>
      ) : models.length === 0 ? (
        <p className="font-mono text-[10px] text-text3 py-8 text-center">No model usage recorded</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            {tab === 'provider' && (
              <>
                <thead><tr><th className={th}>Provider</th><th className={th}>Calls</th><th className={th}>Cost</th><th className={th}>Tokens</th></tr></thead>
                <tbody>{byProvider.map(([p, v]) => (
                  <tr key={p}><td className={`${td} text-text1`}>{p}</td><td className={td}>{v.calls}</td><td className={`${td} text-blue`}>{formatCost(v.cost)}</td><td className={td}>{v.tokens}</td></tr>
                ))}</tbody>
              </>
            )}
            {tab === 'cost' && (
              <>
                <thead><tr><th className={th}>Model</th><th className={th}>Cost</th><th className={th}>Avg Latency</th></tr></thead>
                <tbody>{models.map((m) => (
                  <tr key={m.model_key}><td className={`${td} text-text1`}>{m.model_key}</td><td className={`${td} text-blue`}>{formatCost(m.cost)}</td><td className={td}>{Math.round(m.avg_latency)}ms</td></tr>
                ))}</tbody>
              </>
            )}
            {tab === 'full' && (
              <>
                <thead><tr><th className={th}>Model</th><th className={th}>Calls</th><th className={th}>Cost</th><th className={th}>Avg Latency</th><th className={th}>Tokens</th></tr></thead>
                <tbody>{models.map((m) => (
                  <tr key={m.model_key}><td className={`${td} text-text1`}>{m.model_key}</td><td className={td}>{m.calls}</td><td className={`${td} text-blue`}>{formatCost(m.cost)}</td><td className={td}>{Math.round(m.avg_latency)}ms</td><td className={td}>{m.tokens}</td></tr>
                ))}</tbody>
              </>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
