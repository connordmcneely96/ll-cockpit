'use client'

import { useEffect, useMemo, useState } from 'react'

export function TableBrowser({ onSelectTable }: { onSelectTable: (name: string) => void }) {
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    fetch('/api/d1-explorer/tables', { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string; tables?: string[] }>)
      .then((d) => { if (d.ok) setTables(d.tables ?? []); else setError(d.error ?? 'Failed to load') })
      .catch(() => setError('Tables request timed out'))
      .finally(() => { clearTimeout(timer); setLoading(false) })
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [])

  const shown = useMemo(
    () => tables.filter((t) => t.toLowerCase().includes(search.toLowerCase())),
    [tables, search],
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-white/[0.06] shrink-0">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-wider mb-2">Tables</p>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter tables…"
          className="w-full bg-base-3 border border-white/[0.06] rounded px-2 py-1 font-mono text-[10px] text-text1 placeholder:text-text3 outline-none focus:border-blue/30" />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex flex-col gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-6 rounded bg-base-3 animate-pulse" />)}
          </div>
        ) : error ? (
          <p className="font-mono text-[10px] text-red p-2">{error}</p>
        ) : shown.length === 0 ? (
          <p className="font-mono text-[10px] text-text3 p-2">{tables.length === 0 ? 'No tables found' : 'No matches'}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {shown.map((t) => (
              <button key={t} onClick={() => onSelectTable(t)}
                className="text-left px-2 py-1 rounded font-mono text-[10px] text-text2 hover:bg-base-3 hover:text-blue transition-colors truncate"
                title={t}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
