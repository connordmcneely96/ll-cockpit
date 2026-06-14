import TopCommandBar from '@/components/nexus/TopCommandBar'
import SidebarNav from '@/components/nexus/SidebarNav'
import SystemBrain from '@/components/nexus/SystemBrain'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { mockTenant, mockNavGroups } from '@/components/nexus/mock'
import { getBrainLive } from '@/lib/dashboard-data'

// These routes render live D1 data and must render at request time, not during
// the build (where no D1 binding exists). Without this, next build tries to
// statically prerender cockpit pages and the layout's getBrainLive() query
// fails with "no such table: orchestrator_runs", aborting the build.
export const dynamic = 'force-dynamic'

export default async function CockpitLayout({ children }: { children: React.ReactNode }) {
  const brain = await getBrainLive()
  return (
    <div className="flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      <TopCommandBar tenant={mockTenant} />
      <div className="flex flex-1 overflow-hidden">
        <SidebarNav navGroups={mockNavGroups} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <SystemBrain brain={brain} />
      </div>
      <CommandPalette />
    </div>
  )
}
