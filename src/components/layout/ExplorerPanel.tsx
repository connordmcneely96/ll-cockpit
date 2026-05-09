'use client'

import { useUiStore } from '@/stores/uiStore'
import { AGENT_LIST } from '@/lib/agents'
import { GitBranch, HardDrive, RefreshCcw, FolderOpen } from 'lucide-react'

export function ExplorerPanel() {
  const selectedAgent = useUiStore((s) => s.selectedAgent)
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{
      background: 'var(--d-explorer)',
      backdropFilter: 'blur(var(--t-blur))',
      WebkitBackdropFilter: 'blur(var(--t-blur))',
      borderRight: '1px solid var(--t-glass-bdr)',
      boxShadow: 'var(--t-shadow)',
    }}>
      <div className="h-10 flex items-center justify-between px-3 shrink-0" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Explorer</span>
        <button className="font-mono text-xs" style={{ color: 'var(--t-tx3)' }} title="Refresh">↻</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="py-1">
          <p className="font-mono uppercase text-[9px] tracking-widest px-3 py-2" style={{ color: 'var(--t-tx3)' }}>Agents</p>
          {AGENT_LIST.map(agent => {
            const isActive = selectedAgent === agent.name
            return (
              <button key={agent.name} onClick={() => setSelectedAgent(isActive ? null : agent.name)}
                className="relative w-full flex items-center gap-2.5 px-3 h-8 text-left transition-all duration-150"
                style={{ background: isActive ? 'var(--t-p-glass)' : 'transparent', color: isActive ? 'var(--t-tx1)' : 'var(--t-tx2)' }}>
                {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r" style={{ width:2,height:20,background:'var(--t-p)',boxShadow:'0 0 8px var(--t-p-glow)' }} />}
                <span className="shrink-0 rounded-full" style={{ width:6,height:6,backgroundColor:agent.color,boxShadow:isActive?`0 0 8px ${agent.color}`:'none',animation:isActive?'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite':'none' }} />
                <span className="font-mono text-[11px] flex-1 truncate font-medium">{agent.displayName}</span>
                <span className="font-mono text-[9px] truncate max-w-[68px]" style={{ color: 'var(--t-tx3)' }}>{agent.role}</span>
              </button>
            )
          })}
        </div>
        <div className="mx-3 my-2" style={{ height:1, background:'var(--t-bdr)' }} />
        <div className="py-1">
          <p className="font-mono uppercase text-[9px] tracking-widest px-3 py-2" style={{ color: 'var(--t-tx3)' }}>Workspace</p>
          {[{ icon:HardDrive, label:'Cloudflare R2', sub:'ll-cockpit-r2', btn:<><RefreshCcw size={9}/> Refresh</> },
            { icon:GitBranch, label:'GitHub Sync', sub:'Connect to browse repos, push commits.', btn:<>Connect GitHub</> },
            { icon:FolderOpen, label:'Google Drive', sub:'Authorize to browse and index docs.', btn:<>Connect Google</> },
          ].map(({ icon:Icon, label, sub, btn }) => (
            <div key={label} className="mx-2 mb-2 rounded-xl p-2.5" style={{ background:'var(--d-card)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', border:'1px solid var(--t-glass-bdr)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon size={11} style={{ color:'var(--t-tx3)' }} />
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color:'var(--t-tx2)' }}>{label}</span>
              </div>
              <p className="font-mono text-[9px] mb-2" style={{ color:'var(--t-tx3)' }}>{sub}</p>
              <button className="flex items-center gap-1 w-full justify-center text-[9px] font-mono py-1 rounded-lg transition-all"
                style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-glass-bdr)', color:'var(--t-p)', boxShadow:'0 0 8px var(--t-p-glow)' }}>
                {btn}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
