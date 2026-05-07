'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUiStore } from '@/stores/uiStore'

export default function AgentPage({ params }: { params: Promise<{ name: string }> }) {
  const router = useRouter()
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)

  useEffect(() => {
    params.then(({ name }) => {
      setSelectedAgent(name)
      router.replace('/')
    })
  }, [params, setSelectedAgent, router])

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-text3 font-mono text-xs">Loading agent…</p>
    </div>
  )
}
