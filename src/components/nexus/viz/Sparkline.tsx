interface Props {
  data: number[]
  width?: number
  height?: number
  color?: string
}

export default function Sparkline({ data, width = 120, height = 48, color = 'var(--t-p)' }: Props) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <text x={width / 2} y={height / 2 + 4} textAnchor="middle" fontSize="9" fill="var(--t-tx3)">
          no data
        </text>
      </svg>
    )
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 4

  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: pad + ((1 - (v - min) / range) * (height - pad * 2)),
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath =
    `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${height - pad} L${pts[0].x.toFixed(1)},${height - pad} Z`

  const gradId = `sg-${Math.random().toString(36).slice(2, 7)}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
