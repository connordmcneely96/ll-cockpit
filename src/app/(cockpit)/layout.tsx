
import { ExplorerPanel } from '@/components/layout/ExplorerPanel'
import { AgentPanel } from '@/components/layout/AgentPanel'
import { StatusBar } from '@/components/layout/StatusBar'
import { TopBar } from '@/components/layout/TopBar'
import { CommandPalette } from '@/components/layout/CommandPalette'
import type { ReactNode } from 'react'

export default function CockpitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen bg-base overflow-hidden">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <ExplorerPanel />
        <div className="flex flex-col flex-1 min-w-0 border-x border-white/[0.06]">
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
        <AgentPanel />
      </div>
      <StatusBar />
      <CommandPalette />
    </div>
  )
}
