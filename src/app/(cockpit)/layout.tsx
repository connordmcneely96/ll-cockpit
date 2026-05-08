'use client'

import { ExplorerPanel } from '@/components/layout/ExplorerPanel'
import { AgentPanel } from '@/components/layout/AgentPanel'
import { StatusBar } from '@/components/layout/StatusBar'
import { TopBar } from '@/components/layout/TopBar'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { ActivityRail } from '@/components/layout/ActivityRail'
import { useResizablePanels } from '@/hooks/useResizablePanels'
import type { ReactNode } from 'react'

export default function CockpitLayout({ children }: { children: ReactNode }) {
  const { explorerWidth, agentWidth, beginDragExplorer, beginDragAgent } = useResizablePanels()

  return (
    <div className="flex flex-col h-screen bg-base overflow-hidden">
      <TopBar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Activity Rail */}
        <ActivityRail />

        {/* Explorer — dynamic width */}
        <div
          style={{ width: explorerWidth, minWidth: explorerWidth }}
          className="shrink-0 h-full overflow-hidden"
        >
          <ExplorerPanel />
        </div>

        {/* Resizer — Explorer/Main */}
        <div
          onMouseDown={beginDragExplorer}
          className="ia-resizer group w-1 shrink-0 cursor-col-resize h-full relative flex items-center justify-center hover:w-[3px] transition-all"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <div
            className="absolute w-[3px] h-16 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(59,130,246,0.6), transparent)' }}
          />
        </div>

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-[400px] overflow-hidden">
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>

        {/* Resizer — Main/Agent */}
        <div
          onMouseDown={beginDragAgent}
          className="ia-resizer group w-1 shrink-0 cursor-col-resize h-full relative flex items-center justify-center hover:w-[3px] transition-all"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <div
            className="absolute w-[3px] h-16 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(59,130,246,0.6), transparent)' }}
          />
        </div>

        {/* Agent Panel — dynamic width */}
        <div
          style={{ width: agentWidth, minWidth: agentWidth }}
          className="shrink-0 h-full overflow-hidden"
        >
          <AgentPanel />
        </div>
      </div>

      <StatusBar />
      <CommandPalette />
    </div>
  )
}
