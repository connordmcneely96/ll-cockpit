import TopCommandBar from '@/components/nexus/TopCommandBar'
import SidebarNav from '@/components/nexus/SidebarNav'
import SystemBrain from '@/components/nexus/SystemBrain'
import { mockTenant, mockNavGroups, mockBrain } from '@/components/nexus/mock'

export default function NexusLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col"
      style={{ height: '100vh', background: 'var(--t-body)', overflow: 'hidden' }}
    >
      <TopCommandBar tenant={mockTenant} />
      <div className="flex flex-1 overflow-hidden">
        <SidebarNav navGroups={mockNavGroups} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
        <SystemBrain sections={mockBrain} />
      </div>
    </div>
  )
}
