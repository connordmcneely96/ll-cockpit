import TopCommandBar from '@/components/nexus/TopCommandBar'
import SidebarNav from '@/components/nexus/SidebarNav'
import SystemBrain from '@/components/nexus/SystemBrain'
import { mockTenant, mockNavGroups } from '@/components/nexus/mock'
import { getBrainLive } from './data'

export default async function NexusLayout({ children }: { children: React.ReactNode }) {
  const brain = await getBrainLive()
  return (
    <div
      className="flex flex-col"
      style={{ height: '100vh', overflow: 'hidden' }}
    >
      <TopCommandBar tenant={mockTenant} />
      <div className="flex flex-1 overflow-hidden">
        <SidebarNav navGroups={mockNavGroups} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
        <SystemBrain brain={brain} />
      </div>
    </div>
  )
}
