'use client'

import { useState } from 'react'
import { RfqBrief, buildRfqPrompt, RFQ_SECTIONS } from '@/lib/rfq'
import { RfqForm } from '@/components/rfq/RfqForm'
import { AgentRunStream } from '@/components/agentrunner/AgentRunStream'
import { SectionedOutput } from '@/components/agentrunner/SectionedOutput'
import { RunHistory } from '@/components/agentrunner/RunHistory'

type Phase = 'form' | 'running' | 'done'

export default function RfqPage() {
  const [phase, setPhase] = useState<Phase>('form')
  const [brief, setBrief] = useState<RfqBrief | null>(null)
  const [result, setResult] = useState<{ full: string; meta: { tokensUsed: number; costUsd: number } } | null>(null)

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.2em] font-mono font-semibold" style={{ color: 'var(--t-p)' }}>
          RFQ Deep-Dive
        </h1>
        <p className="text-[11px] font-mono mt-1" style={{ color: 'var(--t-tx3)' }}>
          Analyze an inbound RFQ before you bid — requirement breakdown, risk flags, clarifying questions, and a go/no-go read.
        </p>
      </div>

      {phase === 'form' && (
        <>
          <RfqForm
            disabled={false}
            onSubmit={b => { setBrief(b); setPhase('running') }}
          />
          <RunHistory source="rfq" onLoad={(full, meta) => { setResult({ full, meta }); setPhase('done') }} />
        </>
      )}

      {phase === 'running' && brief && (
        <AgentRunStream
          agentName="atlas"
          prompt={buildRfqPrompt(brief)}
          workingLabel="Analyzing the RFQ…"
          source="rfq"
          onComplete={(full, meta) => { setResult({ full, meta }); setPhase('done') }}
        />
      )}

      {phase === 'done' && result && (
        <div className="flex flex-col gap-4">
          <SectionedOutput full={result.full} sections={RFQ_SECTIONS} meta={result.meta} exportTitle="RFQ Analysis" exportSubtitle={brief?.clientContext ?? ''} />
          <button
            onClick={() => { setResult(null); setBrief(null); setPhase('form') }}
            className="self-start px-4 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all"
            style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-tx2)', cursor: 'pointer' }}
          >
            New Analysis
          </button>
        </div>
      )}
    </div>
  )
}
