'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatCost } from '@/lib/cost'

interface Txn {
  id: string
  date: string
  description: string
  amount_usd: number
  direction: string
  category: string | null
}
type Filter = 'all' | 'in' | 'out'

interface CsvRow { date: string; description: string; amount: number; direction: string }

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const di = headers.indexOf('date'), ci = headers.indexOf('description')
  const ai = headers.indexOf('amount'), ri = headers.indexOf('direction')
  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',')
    const date = c[di]?.trim(), description = c[ci]?.trim()
    const amount = Number(c[ai]?.trim()), direction = (c[ri]?.trim() || 'out').toLowerCase()
    if (!date || !description || Number.isNaN(amount)) continue
    rows.push({ date, description, amount, direction: direction === 'in' ? 'in' : 'out' })
  }
  return rows
}

export function TransactionsPanel() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback((dir: Filter) => {
    setLoading(true)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    fetch(`/api/finance/transactions?direction=${dir}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string; transactions?: Txn[] }>)
      .then((d) => { if (d.ok) { setTxns(d.transactions ?? []); setError(null) } else setError(d.error ?? 'Failed to load') })
      .catch(() => setError('Transactions timed out'))
      .finally(() => { clearTimeout(timer); setLoading(false) })
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const rows = parseCsv(await file.text())
      if (rows.length === 0) { setError('No valid rows in CSV (need date, description, amount, direction)'); return }
      const res = await fetch('/api/finance/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }),
      })
      const d = await res.json() as { ok: boolean; error?: string }
      if (!d.ok) setError(d.error ?? 'Import failed')
      else load(filter)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const pill = (f: Filter, label: string) => (
    <button onClick={() => setFilter(f)}
      className={`px-2 py-0.5 rounded-full font-mono text-[9px] border border-white/[0.06] transition-colors ${filter === f ? 'bg-blue/10 text-blue' : 'bg-base-3 text-text3 hover:text-text2'}`}>
      {label}
    </button>
  )
  const th = 'text-left font-mono text-[9px] uppercase tracking-wider text-text3 px-2 py-1.5'
  const td = 'font-mono text-[10px] text-text2 px-2 py-1.5 border-t border-white/[0.06]'

  return (
    <div className="bg-base-2 border border-white/[0.06] rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-text3 font-mono text-[10px] uppercase tracking-wider">Transactions</p>
          <div className="flex gap-1">{pill('all', 'All')}{pill('in', 'In')}{pill('out', 'Out')}</div>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={importing}
          className="px-2 py-0.5 rounded font-mono text-[9px] border border-white/[0.06] bg-base-3 text-blue hover:bg-blue/5 transition-colors disabled:opacity-50">
          {importing ? 'Importing…' : 'Import CSV'}
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
      </div>
      {error && <p className="font-mono text-[10px] text-red">{error}</p>}
      {loading ? (
        <div className="h-24 rounded bg-base-3 animate-pulse" />
      ) : txns.length === 0 ? (
        <p className="font-mono text-[10px] text-text3 py-8 text-center">No transactions yet — import a CSV to get started</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>Date</th><th className={th}>Description</th><th className={th}>Amount</th><th className={th}>Category</th></tr></thead>
            <tbody>{txns.map((t) => (
              <tr key={t.id}>
                <td className={td}>{t.date}</td>
                <td className={`${td} text-text1`}>{t.description}</td>
                <td className={`${td} ${t.direction === 'in' ? 'text-green' : 'text-red'}`}>{t.direction === 'in' ? '+' : '−'}{formatCost(t.amount_usd)}</td>
                <td className={td}>{t.category ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
