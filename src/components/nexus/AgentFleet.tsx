'use client'

import type { AgentRow } from '@/lib/dashboard-data'

const BADGE_COLOR: Record<string, string> = {
  DEPLOY: 'var(--d-error)',
  WRITE:  'var(--t-p)',
  READ:   'var(--t-tx3)',
}

const STATUS_DOT: Record<string, string> = {
  active: 'var(--d-success)',
  idle:   'var(--t-tx3)',
  error:  'var(--d-error)',
}

interface Props { agents: AgentRow[] }

export default function AgentFleet({ agents }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>
        Agent Fleet
      </h2>
      {agents.length === 0 ? (
        <div className="glass-card px-4 py-3 text-xs" style={{ color: 'var(--t-tx3)' }}>No active agents.</div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {agents.map(a => (
            <div
              key={a.id}
              className="glass-card flex flex-col gap-2 p-3"
              style={{
                borderRadius: 'var(--d-radius-lg)',
                background: 'color-mix(in srgb, var(--t-p) 5%, var(--d-card))',
                transition: 'box-shadow var(--d-transition), transform var(--d-transition)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.boxShadow = 'var(--t-shadow-hover)'
                el.style.transform = 'var(--d-hover-lift)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.boxShadow = ''
                el.style.transform = ''
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block rounded-full shrink-0"
                  style={{
                    width: 7,
                    height: 7,
                    background: STATUS_DOT[a.status] ?? 'var(--t-tx3)',
                    boxShadow: a.status === 'active' ? '0 0 6px var(--d-success)' : undefined,
                  }}
                />
                <span className="text-xs font-semibold truncate" style={{ color: 'var(--t-tx1)', fontFamily: 'var(--font-condensed), sans-serif' }}>
                  {a.display_name}
                </span>
                <span
                  className="ml-auto shrink-0 px-1.5 py-0.5 font-mono text-xs"
                  style={{
                    borderRadius: 'var(--d-radius-sm)',
                    color: BADGE_COLOR[a.badge] ?? 'var(--t-tx3)',
                    border: `1px solid ${BADGE_COLOR[a.badge] ?? 'var(--t-glass-bdr)'}`,
                    background: 'color-mix(in srgb, currentColor 8%, transparent)',
                  }}
                >
                  {a.badge}
                </span>
              </div>
              <div className="text-xs truncate" style={{ color: 'var(--t-tx2)' }}>{a.role}</div>
              <div className="flex items-center justify-between">
                <span className="font-mono" style={{ color: 'var(--t-tx3)', fontSize: '0.68rem' }}>
                  {a.model_default.replace('claude-', '')}
                </span>
                <span style={{ color: 'var(--t-tx3)', fontSize: '0.68rem' }}>{a.runtime}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
