'use client'

import { useState } from 'react'
import { LaunchBrief } from '@/lib/launch-desk'
import { IntakeForm } from '@/components/launchdesk/IntakeForm'
import { RunStream } from '@/components/launchdesk/RunStream'
import { StructuredOutput } from '@/components/launchdesk/StructuredOutput'

type Phase = 'form' | 'running' | 'done'

export default function LaunchDeskPage() {
  const [phase, setPhase] = useState<Phase>('form')
  const [brief, setBrief] = useState<LaunchBrief | null>(null)
  const [result, setResult] = useState<{ full: string; meta: { tokensUsed: number; costUsd: number } } | null>(null)

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.2em] font-mono font-semibold" style={{ color: 'var(--t-p)' }}>
          Launch Desk
        </h1>
        <p className="text-[11px] font-mono mt-1" style={{ color: 'var(--t-tx3)' }}>
          Fill the brief → HERALD generates a structured go-to-market plan in real time.
        </p>
      </div>

      {phase === 'form' && (
        <IntakeForm
          disabled={false}
          onSubmit={b => { setBrief(b); setPhase('running') }}
        />
      )}

      {phase === 'running' && brief && (
        <RunStream
          brief={brief}
          onComplete={(full, meta) => { setResult({ full, meta }); setPhase('done') }}
        />
      )}

      {phase === 'done' && result && (
        <div className="flex flex-col gap-4">
          <StructuredOutput full={result.full} meta={result.meta} />
          <button
            onClick={() => { setResult(null); setPhase('form') }}
            className="self-start px-4 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all"
            style={{
              background: 'var(--d-elevated)',
              border: '1px solid var(--t-glass-bdr)',
              color: 'var(--t-tx2)',
              cursor: 'pointer',
            }}
          >
            New Launch Plan
          </button>
        </div>
      )}
    </div>
  )
}
