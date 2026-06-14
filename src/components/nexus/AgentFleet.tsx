import type { AgentRow } from '@/app/nexus/data'

const BADGE_COLOR: Record<string, string> = {
  DEPLOY: 'var(--d-error)',
  WRITE:  'var(--t-p)',
  READ:   'var(--t-tx3)',
}

interface Props { agents: AgentRow[] }

export default function AgentFleet({ agents }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>
        Agent Fleet <span style={{ color: 'var(--t-tx3)', fontWeight: 400 }}>· runtime=Ready [stub]</span>
      </h2>
      {agents.length === 0 ? (
        <div className="glass-card px-4 py-3 text-xs" style={{ color: 'var(--t-tx3)' }}>No active agents.</div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--t-tx3)' }}>Agent</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--t-tx3)' }}>Role</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--t-tx3)' }}>Badge</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--t-tx3)' }}>Model</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--t-tx3)' }}>Runtime</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => (
                <tr key={a.id} style={{ borderBottom: i < agents.length - 1 ? '1px solid var(--t-glass-bdr)' : undefined }}>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--t-tx1)' }}>{a.display_name}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t-tx2)' }}>{a.role}</td>
                  <td className="px-3 py-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-xs font-mono"
                      style={{
                        borderRadius: 'var(--d-radius-sm)',
                        color: BADGE_COLOR[a.badge] ?? 'var(--t-tx3)',
                        border: `1px solid ${BADGE_COLOR[a.badge] ?? 'var(--t-glass-bdr)'}`,
                        background: 'color-mix(in srgb, currentColor 8%, transparent)',
                      }}
                    >
                      {a.badge}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono" style={{ color: 'var(--t-tx3)', fontSize: '0.7rem' }}>{a.model_default.replace('claude-','')}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t-tx3)' }}>{a.runtime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
