import CockpitShell from '@/components/nexus/CockpitShell'
import { getBrainLive } from '@/lib/dashboard-data'

// Renders live D1 data → must render at request time, not at build.
export const dynamic = 'force-dynamic'

export default async function CockpitLayout({ children }: { children: React.ReactNode }) {
  const brain = await getBrainLive()
  return <CockpitShell brain={brain}>{children}</CockpitShell>
}
