interface Props {
  value: number   // 0–100
  size?: number   // px diameter
  stroke?: number // stroke width
  label?: string
  centerLabel?: string
}

export default function Donut({ value, size = 80, stroke = 10, label, centerLabel }: Props) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const dash = (pct / 100) * circ
  const cx = size / 2
  const cy = size / 2

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--t-bdr)" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--t-p)"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
        <text
          x={cx} y={cy}
          textAnchor="middle" dominantBaseline="central"
          fontSize={size * 0.18} fontWeight="700"
          fill="var(--t-tx1)"
          style={{ transform: 'rotate(90deg)', transformOrigin: `${cx}px ${cy}px` }}
        >
          {centerLabel ?? `${pct}%`}
        </text>
      </svg>
      {label && <span className="text-xs" style={{ color: 'var(--t-tx3)' }}>{label}</span>}
    </div>
  )
}
