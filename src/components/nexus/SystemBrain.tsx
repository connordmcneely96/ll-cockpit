import type { BrainSection } from './mock'

interface Props {
  sections: BrainSection[]
}

const STATUS_COLOR: Record<string, string> = {
  success: 'var(--d-success)',
  warning: 'var(--d-warning)',
  error: 'var(--d-error)',
  info: 'var(--d-info)',
  neutral: 'var(--t-tx3)',
}

export default function SystemBrain({ sections }: Props) {
  return (
    <aside
      className="glass-panel flex flex-col h-full overflow-y-auto"
      style={{
        width: 320,
        borderLeft: '1px solid var(--t-glass-bdr)',
        borderRight: 'none',
      }}
    >
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
        <div className="text-xs font-semibold uppercase" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>
          System Brain
        </div>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {sections.map(section => (
          <div key={section.id} className="glass-card p-3">
            <div className="text-xs mb-1" style={{ color: 'var(--t-tx3)' }}>
              {section.label}
            </div>
            <div className="flex items-center gap-2">
              {section.status && section.status !== 'neutral' && (
                <span
                  className="inline-block rounded-full shrink-0"
                  style={{
                    width: 7,
                    height: 7,
                    background: STATUS_COLOR[section.status] ?? 'var(--t-tx3)',
                  }}
                />
              )}
              <span className="text-xs font-medium" style={{ color: 'var(--t-tx1)' }}>
                {section.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
