'use client'

import { useState } from 'react'
import { TableBrowser } from '@/components/d1explorer/TableBrowser'
import { ResultsGrid } from '@/components/d1explorer/ResultsGrid'

interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

export default function D1ExplorerPage() {
  const [source, setSource] = useState<'d1' | 'supabase'>('d1')
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const run = async () => {
    if (!sql.trim() || running) return
    setRunning(true); setError(null)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    try {
      const res = await fetch('/api/d1-explorer/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }), signal: ctrl.signal,
      })
      const d = await res.json() as { ok: boolean; error?: string } & QueryResult
      if (!d.ok) { setError(d.error ?? 'Query failed'); setResult(null) }
      else setResult({ columns: d.columns, rows: d.rows, rowCount: d.rowCount, durationMs: d.durationMs })
    } catch {
      setError('Query timed out'); setResult(null)
    } finally {
      clearTimeout(timer); setRunning(false)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] shrink-0 flex items-center justify-between gap-3">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-widest">D1 Explorer</p>
        <div className="flex rounded overflow-hidden border border-white/[0.06]">
          {(['d1', 'supabase'] as const).map((s) => (
            <button key={s} onClick={() => setSource(s)}
              className={`px-2.5 py-1 font-mono text-[9px] uppercase transition-colors ${source === s ? 'bg-blue/10 text-blue' : 'bg-base-3 text-text3 hover:text-text2'}`}>
              {s === 'd1' ? 'D1' : 'Supabase'}
            </button>
          ))}
        </div>
      </div>

      {source === 'supabase' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <p className="font-mono text-xs font-semibold text-text2">Supabase explorer coming soon</p>
          <p className="font-mono text-[10px] text-text3">Switch back to D1 to run queries.</p>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          <div className="w-56 shrink-0 border-r border-white/[0.06]">
            <TableBrowser onSelectTable={(t) => setSql(`SELECT * FROM ${t} LIMIT 100`)} />
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-3 border-b border-white/[0.06] shrink-0 flex flex-col gap-2">
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run() } }}
                placeholder="SELECT * FROM ..."
                rows={4}
                spellCheck={false}
                className="w-full bg-base-3 border border-white/[0.06] rounded px-3 py-2 font-mono text-[11px] text-text1 placeholder:text-text3 resize-y outline-none focus:border-blue/30"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] text-text3">Read-only · SELECT queries only · ⌘/Ctrl+Enter to run</span>
                <button onClick={run} disabled={!sql.trim() || running}
                  className="px-3 py-1 rounded font-mono text-[10px] bg-blue/10 text-blue border border-blue/30 hover:bg-blue/20 transition-colors disabled:opacity-40">
                  {running ? 'Running…' : 'Run'}
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              {error ? (
                <div className="m-3 rounded border border-red/30 bg-red/5 px-3 py-2">
                  <p className="font-mono text-[10px] text-red">{error}</p>
                </div>
              ) : running ? (
                <div className="m-3 h-24 rounded bg-base-3 animate-pulse" />
              ) : result ? (
                <ResultsGrid columns={result.columns} rows={result.rows} rowCount={result.rowCount} durationMs={result.durationMs} />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center">
                  <p className="font-mono text-xs font-semibold text-text2">No query run yet</p>
                  <p className="font-mono text-[10px] text-text3">Pick a table or write a SELECT, then Run.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
