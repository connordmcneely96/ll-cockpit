'use client'

import { useUiStore } from '@/stores/uiStore'
import { AGENT_LIST } from '@/lib/agents'

export function ExplorerPanel() {
  const selectedAgent = useUiStore((s) => s.selectedAgent)
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)

  return (
    <div className="w-[220px] shrink-0 flex flex-col bg-base-2 border-r border-white/[0.06]">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-white/[0.06] shrink-0">
        <span className="text-text3 font-mono text-[10px] uppercase tracking-widest">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            className="w-5 h-5 flex items-center justify-center text-text3 hover:text-text2 transition-colors font-mono text-xs rounded hover:bg-base-3"
            title="Refresh"
          >
            ↻
          </button>
          <button
            className="w-5 h-5 flex items-center justify-center text-text3 hover:text-text2 transition-colors font-mono text-xs rounded hover:bg-base-3"
            title="Collapse all"
          >
            ⊟
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Section: AGENTS */}
        <div className="py-1">
          <p className="text-text3 font-mono uppercase text-[10px] tracking-widest px-3 py-1.5">
            AGENTS
          </p>
          {AGENT_LIST.map((agent) => {
            const isActive = selectedAgent === agent.name
            return (
              <button
                key={agent.name}
                onClick={() => setSelectedAgent(agent.name)}
                className={[
                  'relative w-full flex items-center gap-2 px-3 h-8 transition-colors text-left',
                  isActive
                    ? 'bg-blue/10 text-text1'
                    : 'text-text2 hover:bg-base-3',
                ].join(' ')}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue rounded-r" />
                )}
                <span
                  className={[
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    isActive ? 'animate-pulse' : '',
                  ].join(' ')}
                  style={{ backgroundColor: agent.color }}
                />
                <span className="font-mono text-xs truncate flex-1">
                  {agent.displayName}
                </span>
                <span className="font-mono text-[9px] text-text3 truncate max-w-[70px]">
                  {agent.role}
                </span>
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.04] mx-3 my-1" />

        {/* Section: WORKSPACE */}
        <div className="py-1">
          <p className="text-text3 font-mono uppercase text-[10px] tracking-widest px-3 py-1.5">
            WORKSPACE
          </p>
          <div className="px-3 py-1 flex items-center gap-2 text-text3 hover:bg-base-3 transition-colors cursor-pointer">
            <span className="text-[11px]">📁</span>
            <span className="font-mono text-xs">LOCAL WORKSPACE</span>
          </div>
          <div className="px-5 py-0.5">
            <span className="font-mono text-[10px] text-text3/50">Connect folder</span>
          </div>
          <div className="h-px bg-white/[0.04] mx-3 my-1" />
          <div className="px-3 py-1 flex items-center gap-2 text-text3 hover:bg-base-3 transition-colors cursor-pointer">
            <span className="text-[11px]">☁</span>
            <span className="font-mono text-xs">CLOUDFLARE R2</span>
          </div>
          <div className="px-5 py-0.5">
            <span className="font-mono text-[10px] text-blue/70">ll-cockpit-r2</span>
          </div>
          <div className="px-5 py-0.5">
            <span className="font-mono text-[10px] text-text3/50">cockpit-research</span>
          </div>
        </div>
      </div>
    </div>
  )
}
