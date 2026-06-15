import Link from 'next/link'
import { AGENT_LIST } from '@/lib/agents'

export default function AgentIndexPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold" style={{ color: 'var(--t-tx1)', fontFamily: 'var(--font-condensed), sans-serif' }}>Agents</h1>
        <p className="text-xs" style={{ color: 'var(--t-tx3)' }}>{AGENT_LIST.length} agents · open a conversation</p>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {AGENT_LIST.map(a => (
          <Link
            key={a.name}
            href={`/agent/${a.name}`}
            className="glass-card flex flex-col gap-2 p-3 transition-transform hover:-translate-y-0.5"
            style={{ borderRadius: 'var(--d-radius-lg)' }}
          >
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-full shrink-0" style={{ width: 8, height: 8, background: a.color }} />
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--t-tx1)', fontFamily: 'var(--font-condensed), sans-serif' }}>{a.displayName}</span>
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--t-tx2)' }}>{a.role}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
