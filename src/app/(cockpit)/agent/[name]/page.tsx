import { notFound } from 'next/navigation'
import { getAgent } from '@/lib/agents'
import { AgentChat } from './AgentChat'

interface AgentPageProps {
  params: Promise<{ name: string }>
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { name } = await params
  const agent = getAgent(name)
  if (!agent) notFound()

  return (
    <div className="h-full">
      <AgentChat agent={agent} />
    </div>
  )
}

export async function generateStaticParams() {
  const agents = ['nexus', 'scout', 'intake', 'forge', 'builder', 'atlas', 'herald', 'reel', 'sentinel', 'dispatch', 'anchor']
  return agents.map((name) => ({ name }))
}
