'use client'

import { useState } from 'react'
import { ActivityBar } from '@/components/layout/ActivityBar'
import { SidePanel } from '@/components/layout/SidePanel'
import { StatusBar } from '@/components/layout/StatusBar'
import { TopBar } from '@/components/layout/TopBar'
import { CommandPalette } from '@/components/layout/CommandPalette'
import type { Activity } from '@/components/layout/ActivityBar'
import type { ReactNode } from 'react'

export default function CockpitLayout({ children }: { children: ReactNode }) {
  const [activeActivity, setActiveActivity] = useState<Activity>('agents')

  return (
    <div className="flex flex-col h-screen bg-base overflow-hidden">
      <div className="flex flex-1 min-h-0">
        <ActivityBar
          activeActivity={activeActivity}
          onActivityChange={setActiveActivity}
        />
        <SidePanel activeActivity={activeActivity} />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
      <StatusBar />
      <CommandPalette />
    </div>
  )
}
