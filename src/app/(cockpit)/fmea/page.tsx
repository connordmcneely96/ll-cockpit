'use client'

import { useState } from 'react'
import { FmeaBrief, buildFmeaPrompt, FMEA_SECTIONS } from '@/lib/fmea'
import { FmeaForm } from '@/components/fmea/FmeaForm'
import { AgentRunStream } from '@/components/agentrunner/AgentRunStream'
import { SectionedOutput } from '@/components/agentrunner/SectionedOutput'

type Phase = 'form' | 'running' | 'done'

export default function FmeaPage() {
  const [phase, setPhase] = useState<Phase>('form')
  const [brief, setBrief] = useState<FmeaBrief | null>(null)
  const [result, setResult] = useState<{ full: string; meta: { tokensUsed: number; costUsd: number } } | null>(null)

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.2em] font-mono font-semibold" style={{ color: 'var(--t-p)' }}>
          FMEA / 8D Copilot
        </h1>
        <p className="text-[11px] font-mono mt-1" style={{ color: 'var(--t-tx3)' }}>
          Describe equipment and failure modes → NEXUS generates a structured FMEA with RPN scoring and corrective actions.
        </p>
      </div>

      {phase === 'form' && (
        <FmeaForm
          disabled={false}
          onSubmit={b => { setBrief(b); setPhase('running') }}
        />
      )}

      {phase === 'running' && brief && (
        <AgentRunStream
          agentName="atlas"
          prompt={buildFmeaPrompt(brief)}
          workingLabel="Analyzing failure modes…"
          onComplete={(full, meta) => { setResult({ full, meta }); setPhase('done') }}
        />
      )}

      {phase === 'done' && result && (
        <div className="flex flex-col gap-4">
          <SectionedOutput full={result.full} sections={FMEA_SECTIONS} meta={result.meta} />
          <button
            onClick={() => { setResult(null); setBrief(null); setPhase('form') }}
            className="self-start px-4 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all"
            style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-tx2)', cursor: 'pointer' }}
          >
            New FMEA
          </button>
        </div>
      )}
    </div>
  )
}
