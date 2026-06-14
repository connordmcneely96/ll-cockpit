interface Props {
  value: number   // 0–100
  height?: number // px, default 4
  color?: string
}

export default function ProgressBar({ value, height = 4, color = 'var(--t-p)' }: Props) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: 'var(--t-bdr)' }}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: color, transition: 'width var(--d-transition)' }}
      />
    </div>
  )
}
