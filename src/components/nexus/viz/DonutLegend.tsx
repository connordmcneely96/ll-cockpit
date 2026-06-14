export interface DonutSegment {
  label: string
  value: number
}

interface Props {
  segments: DonutSegment[]
  size?: number
  stroke?: number
}

const PALETTE = [
  'var(--t-p)',
  'var(--t-s)',
  'var(--t-gold)',
  'var(--d-info)',
  'var(--d-success)',
]

function buildArcs(segments: DonutSegment[], r: number, stroke: number) {
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  let offset = 0
  return segments.map((seg, i) => {
    const pct = seg.value / total
    const dash = pct * circ
    const arc = { offset, dash, gap: circ - dash, color: PALETTE[i % PALETTE.length] }
    offset += dash
    return arc
  })
}

export default function DonutLegend({ segments, size = 88, stroke = 12 }: Props) {
  if (!segments.length) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t-tx3)' }}>
        <svg width={size} height={size}><circle cx={size/2} cy={size/2} r={(size-stroke)/2} fill="none" stroke="var(--t-bdr)" strokeWidth={stroke} /></svg>
        no data
      </div>
    )
  }

  const r = (size - stroke) / 2
  const cx = size / 2
  const arcs = buildArcs(segments, r, stroke)

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--t-bdr)" strokeWidth={stroke} />
        {arcs.map((arc, i) => (
          <circle
            key={i} cx={cx} cy={cx} r={r} fill="none"
            stroke={arc.color} strokeWidth={stroke}
            strokeDasharray={`${arc.dash.toFixed(2)} ${arc.gap.toFixed(2)}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="flex flex-col gap-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: PALETTE[i % PALETTE.length], display: 'inline-block' }} />
            <span style={{ color: 'var(--t-tx2)' }}>{seg.label}</span>
            <span className="font-semibold" style={{ color: 'var(--t-tx1)' }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
