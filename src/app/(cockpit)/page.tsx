'use client'

import { AGENT_LIST } from '@/lib/agents'
import { useUiStore } from '@/stores/uiStore'
import { useAgentStore } from '@/stores/agentStore'
import type { AgentConfig } from '@/types'
import { CronHeatmap } from '@/components/dashboard/CronHeatmap'

function AgentCard({ agent }: { agent: AgentConfig }) {
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)
  const hasMessages = useAgentStore((s) => !!(s.sessions[agent.name]?.length))
  const status = hasMessages ? 'ACTIVE' : 'IDLE'
  const statusDot = hasMessages ? 'bg-green' : 'bg-base-5'

  return (
    <div
      className="bg-base-3 border border-white/[0.06] rounded-lg p-4 flex flex-col gap-3 hover:border-white/[0.12] transition-colors cursor-pointer"
      onClick={() => setSelectedAgent(agent.name)}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full border border-white/20 flex items-center justify-center shrink-0">
            <div className={`w-2 h-2 rounded-full ${statusDot}`} />
          </div>
          <div>
            <p className="font-mono text-xs font-semibold tracking-wide" style={{ color: agent.color }}>
              {agent.displayName}
            </p>
            <p className="text-text3 font-mono text-[10px] uppercase tracking-wide">{agent.role}</p>
          </div>
        </div>
        <span className={`font-mono text-[10px] ${hasMessages ? 'text-green' : 'text-text3'}`}>{status}</span>
      </div>

      {/* Activity preview */}
      <div className="bg-base-4 rounded px-3 py-2 min-h-[28px] flex items-center">
        <p className="text-text3 font-mono text-[10px]">
          {hasMessages ? 'Session active' : 'Waiting for task…'}
        </p>
      </div>

      {/* Tool chips + OPEN */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 flex-wrap flex-1 min-w-0">
          {agent.tools.length === 0 ? (
            <span className="px-1.5 py-0.5 bg-base-4 border border-white/[0.06] text-text3 font-mono text-[9px] rounded">READ_ONLY</span>
          ) : (
            agent.tools.slice(0, 3).map((t) => (
              <span key={t.name} className="px-1.5 py-0.5 bg-base-4 border border-white/[0.06] text-text3 font-mono text-[9px] rounded uppercase truncate max-w-[80px]">
                {t.name.replace(/_/g, '_')}
              </span>
            ))
          )}
        </div>
        <button
          className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30 hover:bg-blue/5 transition-colors shrink-0"
          onClick={(e) => { e.stopPropagation(); setSelectedAgent(agent.name) }}
        >
          OPEN ›
        </button>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="h-full flex flex-col overflow-auto">

      {/* Stat cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-px bg-white/[0.04] border-b border-white/[0.06] shrink-0">
        {[
          { label: 'SESSIONS TODAY', value: '0', sub: 'start an agent session', color: 'text-text1' },
          { label: 'TOKENS USED', value: '0', sub: '/ 100k limit', color: 'text-blue-bright' },
          { label: 'COST TODAY', value: '$0.000', sub: 'USD', color: 'text-green' },
          { label: 'ACTIVE AGENTS', value: String(AGENT_LIST.length), sub: 'configured', color: 'text-cyan' },
          { label: 'PIPELINE TASKS', value: '0', sub: 'no tasks yet', color: 'text-gold' },
          { label: 'HOURS TODAY', value: '0.0h', sub: 'Today: 0.0h', color: 'text-text2' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-base-2 p-4 flex flex-col gap-1">
            <p className="text-text3 font-mono text-[10px] uppercase tracking-wider">{label}</p>
            <p className={`font-mono text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-text3 font-mono text-[10px]">{sub}</p>
          </div>
        ))}
      </div>

      {/* System Health */}
      <div className="px-4 pt-4">
        <CronHeatmap />
      </div>

      {/* Body: agent grid + right column */}
      <div className="flex flex-1 min-h-0">

        {/* Agent roster grid */}
        <div className="flex-1 p-4 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-text3 font-mono text-[10px] uppercase tracking-widest">Agent Roster</p>
            <p className="text-text3 font-mono text-[10px]">{AGENT_LIST.length} configured</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {AGENT_LIST.map((agent) => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="w-52 shrink-0 border-l border-white/[0.06] p-4 flex flex-col gap-4">
          <div>
            <p className="text-text3 font-mono text-[10px] uppercase tracking-widest mb-2">Workspace</p>
            {[
              { href: '/ide', label: 'IDE', icon: '</>', desc: 'Monaco editor' },
              { href: '/terminal', label: 'Terminal', icon: '>_', desc: 'xterm.js' },
              { href: '/orchestrator', label: 'Orchestrator', icon: '◈', desc: 'Paperclip' },
              { href: '/pipeline', label: 'Pipeline', icon: '⋮⋮', desc: 'Kanban board' },
            ].map(({ href, label, icon, desc }) => (
              <a key={href} href={href}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded text-text3 hover:text-text1 hover:bg-base-3 transition-colors group">
                <span className="font-mono text-[10px] w-7 text-center group-hover:text-blue transition-colors">{icon}</span>
                <div>
                  <p className="font-mono text-[10px] text-text2">{label}</p>
                  <p className="font-mono text-[9px] text-text3">{desc}</p>
                </div>
              </a>
            ))}
          </div>
          <div className="h-px bg-white/[0.04]" />
          <div>
            <p className="text-text3 font-mono text-[10px] uppercase tracking-widest mb-2">Recent Activity</p>
            <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-4 flex flex-col items-center gap-1.5 text-center">
              <p className="font-mono text-[10px] text-text3">No activity yet</p>
              <p className="font-mono text-[9px] text-text3/50">Agent sessions will appear here</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
