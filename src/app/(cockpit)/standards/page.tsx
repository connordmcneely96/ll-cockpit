'use client'

import { useState } from 'react'
import { StandardsBrief, buildStandardsPrompt, STANDARDS_SECTIONS } from '@/lib/standards'
import { StandardsForm } from '@/components/standards/StandardsForm'
import { AgentRunStream } from '@/components/agentrunner/AgentRunStream'
import { SectionedOutput } from '@/components/agentrunner/SectionedOutput'

type Phase = 'form' | 'running' | 'done'

export default function StandardsPage() {
  const [phase, setPhase] = useState<Phase>('form')
  const [brief, setBrief] = useState<StandardsBrief | null>(null)
  const [result, setResult] = useState<{ full: string; meta: { tokensUsed: number; costUsd: number } } | null>(null)

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.2em] font-mono font-semibold" style={{ color: 'var(--t-p)' }}>
          Standards Navigator
        </h1>
        <p className="text-[11px] font-mono mt-1" style={{ color: 'var(--t-tx3)' }}>
          Engineering standards guidance — with source-verification flags.
        </p>
        <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--t-gold, #f59e0b)' }}>
          ⚠ Guidance only — always verify specific clauses against the published standard.
        </p>
      </div>

      {phase === 'form' && (
        <StandardsForm
          disabled={false}
          onSubmit={b => { setBrief(b); setPhase('running') }}
        />
      )}

      {phase === 'running' && brief && (
        <AgentRunStream
          agentName="atlas"
          prompt={buildStandardsPrompt(brief)}
          workingLabel="Researching standards…"
          source="standards"
          onComplete={(full, meta) => { setResult({ full, meta }); setPhase('done') }}
        />
      )}

      {phase === 'done' && result && (
        <div className="flex flex-col gap-4">
          <SectionedOutput full={result.full} sections={STANDARDS_SECTIONS} meta={result.meta} exportTitle="Standards Guidance" exportSubtitle={brief?.discipline ?? ''} />
          <button
            onClick={() => { setResult(null); setBrief(null); setPhase('form') }}
            className="self-start px-4 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all"
            style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-tx2)', cursor: 'pointer' }}
          >
            New Query
          </button>
        </div>
      )}
    </div>
  )
}
