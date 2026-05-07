'use client'

import { useUiStore } from '@/stores/uiStore'
import { AGENT_LIST } from '@/lib/agents'

export function ExplorerPanel() {
  const selectedAgent = useUiStore((s) => s.selectedAgent)
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)

  return (
    <div className="w-[220px] shrink-0 flex flex-col bg-base-2 border-r border-white/[0.06] h-full">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-white/[0.06] shrink-0">
        <span className="text-text3 font-mono text-[10px] uppercase tracking-widest">Explorer</span>
        <div className="flex items-center gap-1">
          <button className="text-text3 hover:text-text2 transition-colors font-mono text-xs px-1" title="Refresh">↻</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* Agents section */}
        <div className="py-1">
          <p className="text-text3 font-mono uppercase text-[10px] tracking-widest px-3 py-1.5">Agents</p>
          {AGENT_LIST.map((agent) => {
            const isActive = selectedAgent === agent.name
            return (
              <button
                key={agent.name}
                onClick={() => setSelectedAgent(isActive ? null : agent.name)}
                className={[
                  'relative w-full flex items-center gap-2 px-3 h-8 text-left transition-colors',
                  isActive ? 'bg-blue/10 text-text1' : 'text-text2 hover:bg-base-3 hover:text-text1',
                ].join(' ')}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue rounded-r" />
                )}
                <span
                  className={['w-1.5 h-1.5 rounded-full shrink-0 transition-all', isActive ? 'animate-pulse' : ''].join(' ')}
                  style={{ backgroundColor: agent.color }}
                />
                <span className="font-mono text-xs flex-1 truncate">{agent.displayName}</span>
                <span className="font-mono text-[9px] text-text3 truncate max-w-[68px]">{agent.role}</span>
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.04] mx-3 my-1" />

        {/* Workspace section */}
        <div className="py-1">
          <p className="text-text3 font-mono uppercase text-[10px] tracking-widest px-3 py-1.5">Workspace</p>
          <div className="px-3 py-1">
            <p className="text-text3 font-mono text-[10px] flex items-center gap-1.5">
              <span>📁</span> LOCAL WORKSPACE
            </p>
            <p className="text-text3/40 font-mono text-[9px] pl-5 mt-0.5">Connect folder</p>
          </div>
          <div className="h-px bg-white/[0.04] mx-3 my-1" />
          <div className="px-3 py-1">
            <p className="text-text3 font-mono text-[10px] flex items-center gap-1.5">
              <span>☁</span> CLOUDFLARE R2
            </p>
            <p className="text-blue/60 font-mono text-[9px] pl-5 mt-0.5">ll-cockpit-r2</p>
            <p className="text-text3/40 font-mono text-[9px] pl-5">cockpit-research</p>
          </div>
        </div>
      </div>
    </div>
  )
}
