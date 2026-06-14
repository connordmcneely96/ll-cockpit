interface Props {
  value: number   // e.g. 12.4 for +12.4%
  suffix?: string // default '%'
}

export default function Delta({ value, suffix = '%' }: Props) {
  const up = value >= 0
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium"
      style={{
        borderRadius: 'var(--d-radius-sm)',
        background: up
          ? 'color-mix(in srgb, var(--d-success) 12%, transparent)'
          : 'color-mix(in srgb, var(--d-error) 12%, transparent)',
        color: up ? 'var(--d-success)' : 'var(--d-error)',
      }}
    >
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}{suffix}
    </span>
  )
}
