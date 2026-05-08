'use client'

import { ExplorerPanel } from '@/components/layout/ExplorerPanel'
import { AgentPanel } from '@/components/layout/AgentPanel'
import { StatusBar } from '@/components/layout/StatusBar'
import { TopBar } from '@/components/layout/TopBar'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { useResizablePanels } from '@/hooks/useResizablePanels'
import type { ReactNode } from 'react'

export default function CockpitLayout({ children }: { children: ReactNode }) {
  const { explorerWidth, agentWidth, startDragExplorer, startDragAgent } = useResizablePanels()

  return (
    <div className="flex flex-col h-screen bg-base overflow-hidden">
      <TopBar />
      <div className="flex flex-1 min-h-0 select-none">

        {/* Explorer panel — dynamic width */}
        <div style={{ width: explorerWidth, minWidth: explorerWidth }} className="shrink-0 h-full">
          <ExplorerPanel />
        </div>

        {/* Drag divider — Explorer/Main */}
        <div
          onMouseDown={startDragExplorer}
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-blue/20 active:bg-blue/40 transition-colors h-full"
        />

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0">
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>

        {/* Drag divider — Main/Agent */}
        <div
          onMouseDown={startDragAgent}
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-blue/20 active:bg-blue/40 transition-colors h-full"
        />

        {/* Agent panel — dynamic width */}
        <div style={{ width: agentWidth, minWidth: agentWidth }} className="shrink-0 h-full">
          <AgentPanel />
        </div>

      </div>
      <StatusBar />
      <CommandPalette />
    </div>
  )
}
