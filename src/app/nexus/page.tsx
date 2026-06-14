import { getUsageToday, getNeedsAttention, getActiveSystems, getAgentFleet, getRecentArtifacts } from './data'
import UsageStrip from '@/components/nexus/UsageStrip'
import NeedsAttention from '@/components/nexus/NeedsAttention'
import ActiveSystems from '@/components/nexus/ActiveSystems'
import AgentFleet from '@/components/nexus/AgentFleet'
import RecentArtifacts from '@/components/nexus/RecentArtifacts'

export default async function NexusPage() {
  const [usage, attention, activeSystems, agents, artifacts] = await Promise.all([
    getUsageToday(),
    getNeedsAttention(),
    getActiveSystems(),
    getAgentFleet(),
    getRecentArtifacts(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1
          className="text-3xl font-bold"
          style={{ color: 'var(--t-tx1)', fontFamily: 'var(--font-condensed), sans-serif' }}
        >
          Good morning, Connor. NEXUS PRIME is ready.
        </h1>
        <p className="text-sm" style={{ color: 'var(--t-tx2)' }}>
          What are we building, running, or deploying today?
        </p>
      </div>

      <UsageStrip usage={usage} />
      <NeedsAttention items={attention} />
      <ActiveSystems runs={activeSystems} />
      <AgentFleet agents={agents} />
      <RecentArtifacts artifacts={artifacts} />
    </div>
  )
}
