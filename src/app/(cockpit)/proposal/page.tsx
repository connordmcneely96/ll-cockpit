'use client'

import { useState } from 'react'
import { ProposalBrief, buildProposalPrompt, PROPOSAL_SECTIONS } from '@/lib/proposal'
import { ProposalForm } from '@/components/proposal/ProposalForm'
import { AgentRunStream } from '@/components/agentrunner/AgentRunStream'
import { SectionedOutput } from '@/components/agentrunner/SectionedOutput'

type Phase = 'form' | 'running' | 'done'

export default function ProposalPage() {
  const [phase, setPhase] = useState<Phase>('form')
  const [brief, setBrief] = useState<ProposalBrief | null>(null)
  const [result, setResult] = useState<{ full: string; meta: { tokensUsed: number; costUsd: number } } | null>(null)

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.2em] font-mono font-semibold" style={{ color: 'var(--t-p)' }}>
          Proposal / RFQ Generator
        </h1>
        <p className="text-[11px] font-mono mt-1" style={{ color: 'var(--t-tx3)' }}>
          Fill the client brief → HERALD generates a professional engineering services proposal with scoping, milestones, and commercial terms.
        </p>
      </div>

      {phase === 'form' && (
        <ProposalForm
          disabled={false}
          onSubmit={b => { setBrief(b); setPhase('running') }}
        />
      )}

      {phase === 'running' && brief && (
        <AgentRunStream
          agentName="herald"
          prompt={buildProposalPrompt(brief)}
          workingLabel="Drafting proposal…"
          onComplete={(full, meta) => { setResult({ full, meta }); setPhase('done') }}
        />
      )}

      {phase === 'done' && result && (
        <div className="flex flex-col gap-4">
          <SectionedOutput full={result.full} sections={PROPOSAL_SECTIONS} meta={result.meta} />
          <button
            onClick={() => { setResult(null); setBrief(null); setPhase('form') }}
            className="self-start px-4 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all"
            style={{ background: 'var(--d-elevated)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-tx2)', cursor: 'pointer' }}
          >
            New Proposal
          </button>
        </div>
      )}
    </div>
  )
}
