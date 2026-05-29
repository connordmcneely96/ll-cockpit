'use client'

import { useMemo, useState } from 'react'

const PAGE_SIZE = 25

function renderCell(v: unknown): { text: string; muted: boolean } {
  if (v === null || v === undefined) return { text: 'NULL', muted: true }
  if (typeof v === 'object') return { text: JSON.stringify(v), muted: false }
  return { text: String(v), muted: false }
}

export function ResultsGrid({ columns, rows, rowCount, durationMs }: {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const slice = useMemo(
    () => rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [rows, safePage],
  )

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-1 py-12 text-center">
        <p className="font-mono text-xs font-semibold text-text2">No rows</p>
        <p className="font-mono text-[10px] text-text3">The query returned 0 rows.</p>
      </div>
    )
  }

  const th = 'text-left font-mono text-[9px] uppercase tracking-wider text-text3 px-2 py-1.5 whitespace-nowrap bg-base-3'
  const td = 'font-mono text-[10px] px-2 py-1.5 border-t border-white/[0.06] max-w-[280px] truncate'

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0"><tr>{columns.map((c) => <th key={c} className={th}>{c}</th>)}</tr></thead>
          <tbody>
            {slice.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => {
                  const { text, muted } = renderCell(row[c])
                  return <td key={c} className={`${td} ${muted ? 'text-text3 italic' : 'text-text2'}`} title={text}>{text}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-white/[0.06]">
        <span className="font-mono text-[10px] text-text3">{rowCount} rows · {durationMs} ms</span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}
              className="px-2 py-0.5 rounded font-mono text-[9px] bg-base-3 border border-white/[0.06] text-text2 hover:text-blue transition-colors disabled:opacity-40">Prev</button>
            <span className="font-mono text-[10px] text-text3">{safePage + 1} / {pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
              className="px-2 py-0.5 rounded font-mono text-[9px] bg-base-3 border border-white/[0.06] text-text2 hover:text-blue transition-colors disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  )
}
