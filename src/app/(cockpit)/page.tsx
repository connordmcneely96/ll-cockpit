'use client'

import { useUiStore } from '@/stores/uiStore'
import { useAgentStore } from '@/stores/agentStore'
import { AGENT_LIST } from '@/lib/agents'
import type { AgentConfig } from '@/types'

// ── AgentCard ──────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentConfig }) {
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)
  const hasMessages = useAgentStore(
    (s) => !!(s.sessions[agent.name as keyof typeof s.sessions]?.length)
  )

  const statusDot = hasMessages ? 'bg-green' : 'bg-text3/40'
  const statusLabel = hasMessages ? 'ACTIVE' : 'IDLE'
  const statusColor = hasMessages ? 'text-green' : 'text-text3'

  return (
    <div
      className="bg-base-3 border border-white/[0.06] rounded-lg p-4 flex flex-col gap-3 hover:border-white/[0.12] transition-colors cursor-pointer"
      onClick={() => setSelectedAgent(agent.name)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border border-white/20 flex items-center justify-center shrink-0">
            <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          </div>
          <div>
            <p
              className="font-mono text-sm font-semibold tracking-wide uppercase"
              style={{ color: agent.color }}
            >
              {agent.displayName}
            </p>
            <p className="text-text3 font-mono text-[10px] uppercase tracking-wider">
              {agent.role}
            </p>
          </div>
        </div>
        <span className={`font-mono text-[10px] ${statusColor}`}>{statusLabel}</span>
      </div>

      {/* Activity preview */}
      <div className="bg-base-4 rounded px-3 py-2 min-h-[32px] flex items-center">
        <p className="text-text3 font-mono text-[10px]">
          {hasMessages ? 'Session active' : 'Waiting for task…'}
        </p>
      </div>

      {/* Tool chips + open button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 flex-wrap">
          {agent.tools.slice(0, 3).map((tool) => (
            <span
              key={tool.name}
              className="px-1.5 py-0.5 bg-base-4 border border-white/[0.06] text-text3 font-mono text-[9px] rounded uppercase tracking-wide"
            >
              {tool.name.substring(0, 10)}
            </span>
          ))}
          {agent.tools.length === 0 && (
            <span className="px-1.5 py-0.5 bg-base-4 border border-white/[0.06] text-text3 font-mono text-[9px] rounded">
              READ_ONLY
            </span>
          )}
        </div>
        <button
          className="shrink-0 px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30 hover:bg-blue/5 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            setSelectedAgent(agent.name)
          }}
        >
          OPEN ›
        </button>
      </div>
    </div>
  )
}

// ── DashboardPage ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="h-full flex flex-col overflow-auto">
      {/* Stat cards row */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-px bg-white/[0.04] border-b border-white/[0.06] shrink-0">
        {[
          { label: 'SESSIONS TODAY', value: '0', sub: 'no activity', color: 'text-text1' },
          { label: 'TOKENS USED', value: '0', sub: '/ 100k limit', color: 'text-blue-bright' },
          { label: 'COST TODAY', value: '$0.000', sub: 'USD', color: 'text-green' },
          { label: 'ACTIVE AGENTS', value: String(AGENT_LIST.length), sub: 'configured', color: 'text-cyan' },
          { label: 'PIPELINE TASKS', value: '4', sub: 'in progress', color: 'text-gold' },
          { label: 'HOURS TODAY', value: '0.0h', sub: 'Today: 0.0h', color: 'text-text2' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-base-2 p-4 flex flex-col gap-1">
            <p className="text-text3 font-mono text-[10px] uppercase tracking-wider">{label}</p>
            <p className={`font-mono text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-text3 font-mono text-[10px]">{sub}</p>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left: agent grid */}
        <div className="flex-1 p-4 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-text3 font-mono text-[10px] uppercase tracking-widest">
              AGENT ROSTER
            </p>
            <p className="text-text3 font-mono text-[10px]">{AGENT_LIST.length} configured</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {AGENT_LIST.map((agent) => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        </div>

        {/* Right column: nav + recent activity */}
        <div className="w-56 shrink-0 border-l border-white/[0.06] p-4 flex flex-col gap-4">
          <div>
            <p className="text-text3 font-mono text-[10px] uppercase tracking-widest mb-2">
              WORKSPACE
            </p>
            {[
              { href: '/ide', label: 'IDE', icon: '</>', desc: 'Monaco editor' },
              { href: '/terminal', label: 'Terminal', icon: '>_', desc: 'xterm.js' },
              { href: '/orchestrator', label: 'Orchestrator', icon: '◈', desc: 'Paperclip' },
              { href: '/pipeline', label: 'Pipeline', icon: '⋮⋮', desc: 'Kanban board' },
            ].map(({ href, label, icon, desc }) => (
              <a
                key={href}
                href={href}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded text-text3 hover:text-text1 hover:bg-base-3 transition-colors group"
              >
                <span className="font-mono text-xs w-8 text-center group-hover:text-blue transition-colors">
                  {icon}
                </span>
                <div>
                  <p className="font-mono text-xs text-text2">{label}</p>
                  <p className="font-mono text-[9px] text-text3">{desc}</p>
                </div>
              </a>
            ))}
          </div>

          <div className="h-px bg-white/[0.04]" />

          <div>
            <p className="text-text3 font-mono text-[10px] uppercase tracking-widest mb-2">
              RECENT ACTIVITY
            </p>
            <p className="text-text3/50 font-mono text-[10px]">No recent activity</p>
          </div>
        </div>
      </div>
    </div>
  )
}
