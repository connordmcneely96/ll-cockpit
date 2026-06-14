import type { AttentionItem } from '@/app/nexus/data'

const STATUS_COLOR: Record<string, string> = {
  failed: 'var(--d-error)',
  paused: 'var(--d-warning)',
  planning: 'var(--d-info)',
}

interface Props { items: AttentionItem[] }

export default function NeedsAttention({ items }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>
        Needs Attention
      </h2>
      {items.length === 0 ? (
        <div className="glass-card px-4 py-3 text-xs" style={{ color: 'var(--t-tx3)' }}>
          All systems nominal — nothing needs attention.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map(item => (
            <div key={item.id} className="glass-card flex items-center gap-3 px-3 py-2">
              <span
                className="inline-block rounded-full shrink-0"
                style={{ width: 7, height: 7, background: STATUS_COLOR[item.status] ?? 'var(--t-tx3)' }}
              />
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--t-tx1)' }}>{item.label}</span>
              <span
                className="text-xs px-2 py-0.5 rounded shrink-0"
                style={{
                  borderRadius: 'var(--d-radius-sm)',
                  background: 'color-mix(in srgb, var(--d-error) 12%, transparent)',
                  color: STATUS_COLOR[item.status] ?? 'var(--t-tx3)',
                }}
              >
                {item.status}
              </span>
              <span className="text-xs shrink-0" style={{ color: 'var(--t-tx3)' }}>${item.cost.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
