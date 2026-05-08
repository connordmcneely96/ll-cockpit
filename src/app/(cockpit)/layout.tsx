'use client'

import { ActivityRail } from '@/components/layout/ActivityRail'
import { ExplorerPanel } from '@/components/layout/ExplorerPanel'
import { AgentPanel } from '@/components/layout/AgentPanel'
import { StatusBar } from '@/components/layout/StatusBar'
import { TopBar } from '@/components/layout/TopBar'
import { TabBar } from '@/components/layout/TabBar'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { useResizablePanels } from '@/hooks/useResizablePanels'
import type { ReactNode } from 'react'

export default function CockpitLayout({ children }: { children: ReactNode }) {
  const { explorerWidth, agentWidth, beginDragExplorer, beginDragAgent } = useResizablePanels()

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Title bar — full width */}
      <TopBar />

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Activity Rail — 48px icon strip */}
        <ActivityRail />

        {/* Explorer Panel — resizable */}
        <div
          style={{ width: explorerWidth, minWidth: explorerWidth }}
          className="shrink-0 h-full overflow-hidden"
        >
          <ExplorerPanel />
        </div>

        {/* Resizer — Explorer / Center */}
        <div
          onMouseDown={beginDragExplorer}
          className="group relative shrink-0 cursor-col-resize h-full flex items-center justify-center z-10"
          style={{ width: 4, background: 'rgba(255,255,255,0.02)' }}
        >
          <div
            className="absolute pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-full"
            style={{
              width: 2, height: 64,
              background: 'linear-gradient(to bottom, transparent, rgba(59,130,246,0.8), transparent)',
            }}
          />
        </div>

        {/* Center — TabBar on top, content below */}
        <div className="flex flex-col flex-1 overflow-hidden" style={{ minWidth: 380 }}>
          <TabBar />
          <main
            className="flex-1 overflow-auto"
            style={{ background: 'rgba(10, 11, 15, 0.6)' }}
          >
            {children}
          </main>
        </div>

        {/* Resizer — Center / Agent */}
        <div
          onMouseDown={beginDragAgent}
          className="group relative shrink-0 cursor-col-resize h-full flex items-center justify-center z-10"
          style={{ width: 4, background: 'rgba(255,255,255,0.02)' }}
        >
          <div
            className="absolute pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-full"
            style={{
              width: 2, height: 64,
              background: 'linear-gradient(to bottom, transparent, rgba(59,130,246,0.8), transparent)',
            }}
          />
        </div>

        {/* Agent Panel — resizable */}
        <div
          style={{ width: agentWidth, minWidth: agentWidth }}
          className="shrink-0 h-full overflow-hidden"
        >
          <AgentPanel />
        </div>

      </div>

      {/* Status bar — full width */}
      <StatusBar />
      <CommandPalette />
    </div>
  )
}
