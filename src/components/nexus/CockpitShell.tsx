'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import TopCommandBar from './TopCommandBar'
import SidebarNav from './SidebarNav'
import SystemBrain from './SystemBrain'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { mockTenant, mockNavGroups } from './mock'
import type { BrainLive } from '@/lib/dashboard-data'

export default function CockpitShell({ brain, children }: { brain: BrainLive; children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)
  const [brainOpen, setBrainOpen] = useState(false)
  const pathname = usePathname()

  // Close any open drawer when the route changes.
  useEffect(() => { setNavOpen(false); setBrainOpen(false) }, [pathname])

  const drawerBase = 'h-full shrink-0 transition-transform duration-200 ease-out'

  return (
    <div className="flex flex-col" style={{ height: '100dvh', overflow: 'hidden' }}>
      <TopCommandBar
        tenant={mockTenant}
        onMenuClick={() => { setNavOpen(v => !v); setBrainOpen(false) }}
        onBrainClick={() => { setBrainOpen(v => !v); setNavOpen(false) }}
      />

      <div className="relative flex flex-1 overflow-hidden">
        {/* Sidebar: static at lg+, left drawer below lg */}
        <div
          className={[
            drawerBase,
            'max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-40',
            navOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          ].join(' ')}
          style={{ background: 'var(--t-base)' }}
        >
          <SidebarNav navGroups={mockNavGroups} />
        </div>

        {/* Main content */}
        <main
          className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {children}
        </main>

        {/* SystemBrain: static at xl+, right slide-over below xl */}
        <div
          className={[
            drawerBase,
            'max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-40',
            brainOpen ? 'max-xl:translate-x-0' : 'max-xl:translate-x-full',
          ].join(' ')}
          style={{ background: 'var(--t-base)' }}
        >
          <SystemBrain brain={brain} />
        </div>

        {/* Overlay (below xl) when a drawer is open */}
        {(navOpen || brainOpen) && (
          <div
            className="xl:hidden absolute inset-0 z-30"
            style={{ background: 'color-mix(in srgb, var(--t-base) 60%, transparent)' }}
            onClick={() => { setNavOpen(false); setBrainOpen(false) }}
            aria-hidden="true"
          />
        )}
      </div>

      <CommandPalette />
    </div>
  )
}
