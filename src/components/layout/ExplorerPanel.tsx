'use client'

import { useUiStore } from '@/stores/uiStore'
import { AGENT_LIST } from '@/lib/agents'
import { GitBranch, Cloud, RefreshCw } from 'lucide-react'

export function ExplorerPanel() {
  const selectedAgent = useUiStore((s) => s.selectedAgent)
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)

  return (
    <div className="w-full flex flex-col bg-base-2/60 backdrop-blur-xl border-r border-white/[0.06] h-full">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-white/[0.06] shrink-0">
        <span className="panel-section-label !px-0 !py-0">Explorer</span>
        <div className="flex items-center gap-1">
          <button className="text-text3 hover:text-text2 transition-colors font-mono text-xs px-1" title="Refresh">↻</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* Agents section */}
        <div className="py-1">
          <p className="panel-section-label">Agents</p>
          {AGENT_LIST.map((agent) => {
            const isActive = selectedAgent === agent.name
            return (
              <button
                key={agent.name}
                onClick={() => setSelectedAgent(isActive ? null : agent.name)}
                className={[
                  'relative w-full flex items-center gap-2 px-3 h-8 text-left transition-colors',
                  isActive
                    ? 'bg-blue/10 text-text1 shadow-[inset_0_0_12px_rgba(59,130,246,0.05)]'
                    : 'text-text2 hover:bg-base-3 hover:text-text1',
                ].join(' ')}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue rounded-r shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                )}
                <span
                  className={[
                    'w-1.5 h-1.5 rounded-full shrink-0 transition-all',
                    isActive ? 'animate-pulse shadow-[0_0_6px_currentColor]' : '',
                  ].join(' ')}
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
          <p className="panel-section-label">Workspace</p>
          <div className="px-3 py-1">
            <p className="text-text3 font-mono text-[10px] flex items-center gap-1.5">
              <span>📁</span> LOCAL WORKSPACE
            </p>
            <p className="text-text3/40 font-mono text-[9px] pl-5 mt-0.5">Connect folder</p>
          </div>

          <div className="h-px bg-white/[0.04] mx-3 my-1" />

          <div className="px-3 py-1">
            <div className="flex items-center justify-between">
              <p className="text-text3 font-mono text-[10px] flex items-center gap-1.5">
                <span>☁</span> CLOUDFLARE R2
              </p>
              <button
                className="text-text3 hover:text-blue transition-colors"
                title="Refresh R2"
              >
                <RefreshCw size={10} />
              </button>
            </div>
            <p className="text-blue/60 font-mono text-[9px] pl-5 mt-0.5">ll-cockpit-r2</p>
            <p className="text-text3/40 font-mono text-[9px] pl-5">cockpit-research</p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.04] mx-3 my-1" />

        {/* GitHub Sync card */}
        <div className="mx-2 mb-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <GitBranch size={12} className="text-text3" />
            <span className="font-mono text-[10px] text-text3 uppercase tracking-widest">GitHub Sync</span>
          </div>
          <p className="font-mono text-[9px] text-text3/60 mb-2">Connect to browse repos, push commits, open PRs.</p>
          <button className="w-full text-[10px] font-mono py-1 rounded bg-blue/10 border border-blue/20 text-blue/80 hover:bg-blue/20 transition-colors">
            Connect GitHub
          </button>
        </div>

        {/* Google Drive card */}
        <div className="mx-2 mb-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Cloud size={12} className="text-text3" />
            <span className="font-mono text-[10px] text-text3 uppercase tracking-widest">Google Drive</span>
          </div>
          <p className="font-mono text-[9px] text-text3/60 mb-2">Connect to browse files, import docs, sync artifacts.</p>
          <button className="w-full text-[10px] font-mono py-1 rounded bg-blue/10 border border-blue/20 text-blue/80 hover:bg-blue/20 transition-colors">
            Connect Drive
          </button>
        </div>

      </div>
    </div>
  )
}
