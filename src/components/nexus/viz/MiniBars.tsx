interface Props {
  data: number[]
  width?: number
  height?: number
  color?: string
}

export default function MiniBars({ data, width = 48, height = 20, color = 'var(--t-p)' }: Props) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data) || 1
  const barW = (width / data.length) * 0.65
  const gap = (width / data.length) * 0.35
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * height)
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            rx="1"
            fill={color}
            opacity="0.75"
          />
        )
      })}
    </svg>
  )
}
