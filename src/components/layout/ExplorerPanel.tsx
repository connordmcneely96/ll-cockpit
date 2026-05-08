'use client'

import { useUiStore } from '@/stores/uiStore'
import { AGENT_LIST } from '@/lib/agents'
import { GitBranch, HardDrive, RefreshCcw, FolderOpen } from 'lucide-react'

export function ExplorerPanel() {
  const selectedAgent = useUiStore((s) => s.selectedAgent)
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        background: 'rgba(11, 13, 22, 0.75)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Header */}
      <div
        className="h-10 flex items-center justify-between px-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.4)' }}>
          Explorer
        </span>
        <button
          className="transition-colors font-mono text-xs px-1"
          style={{ color: 'rgba(148,163,184,0.3)' }}
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

        {/* Agents section */}
        <div className="py-1">
          <p
            className="font-mono uppercase text-[9px] tracking-widest px-3 py-2"
            style={{ color: 'rgba(148,163,184,0.3)' }}
          >
            Agents
          </p>

          {AGENT_LIST.map((agent) => {
            const isActive = selectedAgent === agent.name
            return (
              <button
                key={agent.name}
                onClick={() => setSelectedAgent(isActive ? null : agent.name)}
                className="relative w-full flex items-center gap-2.5 px-3 h-8 text-left transition-all duration-150"
                style={{
                  background: isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
                  color: isActive ? '#e2e8f0' : '#64748b',
                }}
              >
                {/* Active left border */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
                    style={{
                      width: 2,
                      height: 20,
                      background: '#3b82f6',
                      boxShadow: '0 0 8px rgba(59,130,246,0.6)',
                    }}
                  />
                )}

                {/* Agent color dot */}
                <span
                  className="shrink-0 rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    backgroundColor: agent.color,
                    boxShadow: isActive ? `0 0 6px ${agent.color}` : 'none',
                    animation: isActive ? 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' : 'none',
                  }}
                />

                <span className="font-mono text-[11px] flex-1 truncate font-medium">
                  {agent.displayName}
                </span>
                <span
                  className="font-mono text-[9px] truncate max-w-[68px]"
                  style={{ color: 'rgba(148,163,184,0.35)' }}
                >
                  {agent.role}
                </span>
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="mx-3 my-2" style={{ height: 1, background: 'rgba(255,255,255,0.04)' }} />

        {/* Workspace section */}
        <div className="py-1">
          <p
            className="font-mono uppercase text-[9px] tracking-widest px-3 py-2"
            style={{ color: 'rgba(148,163,184,0.3)' }}
          >
            Workspace
          </p>

          {/* R2 bucket */}
          <div
            className="mx-2 mb-2 rounded-lg p-2.5"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <HardDrive size={11} style={{ color: '#4b5563' }} />
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.5)' }}>
                Cloudflare R2
              </span>
            </div>
            <p className="font-mono text-[10px] mb-2" style={{ color: '#3b82f6', opacity: 0.7 }}>ll-cockpit-r2</p>
            <button
              className="flex items-center gap-1.5 w-full text-[9px] font-mono py-1 px-2 rounded transition-colors"
              style={{
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.15)',
                color: 'rgba(96,165,250,0.7)',
              }}
            >
              <RefreshCcw size={9} />
              Refresh objects
            </button>
          </div>

          {/* GitHub Sync */}
          <div
            className="mx-2 mb-2 rounded-lg p-2.5"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <GitBranch size={11} style={{ color: '#4b5563' }} />
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.5)' }}>
                GitHub Sync
              </span>
            </div>
            <p className="font-mono text-[9px] mb-2" style={{ color: 'rgba(148,163,184,0.3)' }}>
              Connect to browse repos, push commits, open PRs.
            </p>
            <button
              className="w-full text-[9px] font-mono py-1 rounded transition-colors"
              style={{
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.15)',
                color: 'rgba(96,165,250,0.7)',
              }}
            >
              Connect GitHub
            </button>
          </div>

          {/* Google Drive */}
          <div
            className="mx-2 mb-2 rounded-lg p-2.5"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <FolderOpen size={11} style={{ color: '#4b5563' }} />
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.5)' }}>
                Google Drive
              </span>
            </div>
            <p className="font-mono text-[9px] mb-2" style={{ color: 'rgba(148,163,184,0.3)' }}>
              Authorize to browse folders, upload, and index docs.
            </p>
            <button
              className="w-full text-[9px] font-mono py-1 rounded transition-colors"
              style={{
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.15)',
                color: 'rgba(96,165,250,0.7)',
              }}
            >
              Connect Google
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
