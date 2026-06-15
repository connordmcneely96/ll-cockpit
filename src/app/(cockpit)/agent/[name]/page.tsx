import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getAgent } from '@/lib/agents'
import { AgentChat } from './AgentChat'

export default async function AgentPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const agent = getAgent(name)
  if (!agent) notFound()
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><p className="font-mono text-xs" style={{ color: 'var(--t-tx3)' }}>Loading agent…</p></div>}>
      <div className="h-full" style={{ marginTop: '-1.5rem', marginLeft: '-1.5rem', marginRight: '-1.5rem', marginBottom: '-1.5rem' }}>
        <AgentChat agent={agent} />
      </div>
    </Suspense>
  )
}
