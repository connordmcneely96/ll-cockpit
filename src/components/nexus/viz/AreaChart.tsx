interface Props {
  data: number[]
  format?: (n: number) => string
}

export default function AreaChart({ data, format = n => String(n) }: Props) {
  if (!data || data.length < 2) {
    return (
      <svg width="100%" viewBox="0 0 600 200" preserveAspectRatio="none" style={{ display: 'block' }}>
        <text x="300" y="106" textAnchor="middle" fontSize="13" fill="var(--t-tx3)">
          No spend data yet
        </text>
      </svg>
    )
  }

  const W = 600
  const H = 200
  const pad = { top: 16, right: 20, bottom: 24, left: 8 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  const min = 0
  const max = Math.max(...data) || 1

  const pts = data.map((v, i) => ({
    x: pad.left + (i / (data.length - 1)) * innerW,
    y: pad.top + (1 - (v - min) / (max - min)) * innerH,
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath =
    `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${(H - pad.bottom).toFixed(1)} L${pts[0].x.toFixed(1)},${(H - pad.bottom).toFixed(1)} Z`

  const last = pts[pts.length - 1]
  const lastVal = data[data.length - 1]
  const calloutX = Math.min(last.x, W - 60)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="nexus-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--t-p)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--t-p)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Baseline */}
      <line
        x1={pad.left} y1={H - pad.bottom}
        x2={W - pad.right} y2={H - pad.bottom}
        stroke="var(--t-bdr)" strokeWidth="1"
      />
      {/* Area fill */}
      <path d={areaPath} fill="url(#nexus-area-grad)" />
      {/* Line */}
      <path d={linePath} fill="none" stroke="var(--t-p)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last-point dot */}
      <circle cx={last.x} cy={last.y} r="4" fill="var(--t-p)" />
      <circle cx={last.x} cy={last.y} r="7" fill="var(--t-p)" fillOpacity="0.18" />
      {/* Callout value */}
      <text
        x={calloutX}
        y={Math.max(last.y - 10, pad.top + 10)}
        textAnchor="end"
        fontSize="11"
        fontWeight="600"
        fill="var(--t-tx1)"
      >
        {format(lastVal)}
      </text>
    </svg>
  )
}
