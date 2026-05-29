'use client'

export interface LibraryKpi {
  total: number
  active: number
  delivered: number
  validated: number
  unvalidated: number
}

export function LibraryKpis({ kpi }: { kpi: LibraryKpi | null }) {
  const tiles = [
    { label: 'TOTAL', value: kpi?.total ?? 0, color: 'text-text1' },
    { label: 'ACTIVE', value: kpi?.active ?? 0, color: 'text-blue' },
    { label: 'DELIVERED', value: kpi?.delivered ?? 0, color: 'text-green' },
    { label: 'PASSED VALIDATION', value: kpi?.validated ?? 0, color: 'text-cyan' },
    { label: 'UNVALIDATED', value: kpi?.unvalidated ?? 0, color: 'text-gold' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-white/[0.04] border-y border-white/[0.06]">
      {tiles.map(({ label, value, color }) => (
        <div key={label} className="bg-base-2 p-4 flex flex-col gap-1">
          <p className="text-text3 font-mono text-[10px] uppercase tracking-wider">{label}</p>
          <p className={`font-mono text-2xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  )
}
