import { projectBadge, statusDetailFor, type BadgeState } from '@/lib/cad/project-badge'

type Marker = 'round' | 'diamond' | 'square' | 'bar'

const SPEC: Record<BadgeState, { border: string; color: string; marker: Marker }> = {
  pending:    { border: 'border-dotted border-pending', color: 'text-pending', marker: 'round'   },
  running:    { border: 'border-solid  border-blue',    color: 'text-blue',    marker: 'round'   },
  converged:  { border: 'border-solid  border-green',   color: 'text-green',   marker: 'round'   },
  infeasible: { border: 'border-dashed border-verdict', color: 'text-verdict', marker: 'diamond' },
  exhausted:  { border: 'border-solid  border-gold',    color: 'text-gold',    marker: 'bar'     },
  failed:     { border: 'border-solid  border-red',     color: 'text-red',     marker: 'square'  },
}
const MARKER_SHAPE: Record<Marker, string> = {
  round: 'rounded-full',
  diamond: 'rotate-45',
  square: '',
  bar: 'w-3 h-1',
}

export default function CadStatusChip({
  runStatus, designStatus, cycle, maxCycles,
}: {
  runStatus: string | null; designStatus: string | null
  cycle?: number | null; maxCycles?: number | null
}) {
  const state = projectBadge(runStatus, designStatus)
  const detail = statusDetailFor({ runStatus, designStatus, cycle, maxCycles })
  const s = SPEC[state]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${s.border} ${s.color}`}>
      <span className={`inline-block h-2 w-2 ${MARKER_SHAPE[s.marker]}`} style={{ backgroundColor: 'currentColor' }} />
      <span>{state}</span>
      {detail && <span className="normal-case opacity-70">{detail}</span>}
    </span>
  )
}
