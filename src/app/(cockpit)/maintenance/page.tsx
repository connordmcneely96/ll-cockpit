'use client'

import { useState } from 'react'
import { MaintenanceBrief, buildMaintenancePrompt, MAINTENANCE_SECTIONS } from '@/lib/maintenance'
import { MaintenanceForm } from '@/components/maintenance/MaintenanceForm'
import { AgentRunStream } from '@/components/agentrunner/AgentRunStream'
import { SectionedOutput } from '@/components/agentrunner/SectionedOutput'
import { RunHistory } from '@/components/agentrunner/RunHistory'

type Phase = 'form' | 'running' | 'done'

export default function MaintenancePage() {
  const [phase, setPhase] = useState<Phase>('form')
  const [brief, setBrief] = useState<MaintenanceBrief | null>(null)
  const [result, setResult] = useState<{ full: string; meta: { tokensUsed: number; costUsd: number } } | null>(null)

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.2em] font-mono font-semibold" style={{ color: 'var(--t-p)' }}>
          Maintenance Intelligence
        </h1>
        <p className="text-[11px] font-mono mt-1" style={{ color: 'var(--t-tx3)' }}>
          RCM-based maintenance & reliability planning — criticality, strategy by component, PM tasks, condition monitoring, spares.
        </p>
      </div>

      {phase === 'form' && (
        <>
          <MaintenanceForm
            disabled={false}
            onSubmit={b => { setBrief(b); setPhase('running') }}
          />
          <RunHistory source="maintenance" onLoad={(full, meta) => { setResult({ full, meta }); setPhase('done') }} />
        </>
      )}

      {phase === 'running' && brief && (
        <AgentRunStream
          agentName="atlas"
          prompt={buildMaintenancePrompt(brief)}
          workingLabel="Building the maintenance plan…"
          source="maintenance"
          onComplete={(full, meta) => { setResult({ full, meta }); setPhase('done') }}
        />
      )}

      {phase === 'done' && result && (
        <div className="flex flex-col gap-4">
          <SectionedOutput full={result.full} sections={MAINTENANCE_SECTIONS} meta={result.meta} exportTitle="Maintenance Plan" exportSubtitle={brief?.asset ?? ''} />
          <button
            onClick={() => { setResult(null); setBrief(null); setPhase('form') }}
            className="self-start px-4 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all"
            style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-tx2)', cursor: 'pointer' }}
          >
            New Plan
          </button>
        </div>
      )}
    </div>
  )
}
