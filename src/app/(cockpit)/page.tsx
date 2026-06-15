import { getNeedsAttention, getActiveSystems, getAgentFleet, getRecentArtifacts, getRunsByStatus, getHeadlineStats, getSpendTimeline } from '@/lib/dashboard-data'
import HeroCoreLazy from '@/components/nexus/HeroCoreLazy'
import UsageStrip from '@/components/nexus/UsageStrip'
import NeedsAttention from '@/components/nexus/NeedsAttention'
import ActiveSystems from '@/components/nexus/ActiveSystems'
import AgentFleet from '@/components/nexus/AgentFleet'
import RecentArtifacts from '@/components/nexus/RecentArtifacts'
import FeatureCard from '@/components/nexus/FeatureCard'
import AreaChart from '@/components/nexus/viz/AreaChart'

export default async function CockpitHome() {
  const [stats, attention, activeSystems, runsByStatus, agents, artifacts, spendTimeline] = await Promise.all([
    getHeadlineStats(),
    getNeedsAttention(),
    getActiveSystems(),
    getRunsByStatus(),
    getAgentFleet(),
    getRecentArtifacts(),
    getSpendTimeline(),
  ])

  return (
    <div className="flex flex-col gap-4">
      {/* Animated hero band — full-bleed across the top */}
      <div
        className="relative -mx-4 md:-mx-6 -mt-4 md:-mt-6 mb-2 overflow-hidden"
        style={{ height: 'clamp(300px, 42vh, 460px)' }}
      >
        <HeroCoreLazy />
      </div>

      {/* Compact hero row */}
      <div className="flex items-center gap-4" style={{ minHeight: 64 }}>
        <div className="flex-1 min-w-0">
          <span
            className="text-base font-semibold"
            style={{ color: 'var(--t-tx1)', fontFamily: 'var(--font-condensed), sans-serif' }}
          >
            Good morning, Connor — NEXUS PRIME is live.
          </span>
          <span className="ml-3 text-xs" style={{ color: 'var(--t-tx3)' }}>
            What are we building today?
          </span>
        </div>
        <div style={{ width: 200, flexShrink: 0 }}>
          <FeatureCard
            title="Launch a Build"
            subtitle="BUILDER → SENTINEL → deploy"
            cta="Start"
            href="/orchestrator"
          />
        </div>
      </div>

      {/* KPI strip */}
      <UsageStrip stats={stats} />

      {/* Hero area chart */}
      <div className="glass-card" style={{ borderRadius: 'var(--d-radius-lg)', padding: '1rem 1.25rem' }}>
        <div className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>
          Spend over time
        </div>
        <AreaChart data={spendTimeline} format={n => `$${n.toFixed(2)}`} />
      </div>

      {/* Densified 2-col row: Needs Attention + Active Systems */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <NeedsAttention items={attention} />
        <ActiveSystems runs={activeSystems} runsByStatus={runsByStatus} />
      </div>

      <AgentFleet agents={agents} />
      <RecentArtifacts artifacts={artifacts} />
    </div>
  )
}
