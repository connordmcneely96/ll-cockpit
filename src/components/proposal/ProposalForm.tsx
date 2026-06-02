'use client'

import { useState } from 'react'
import { ProposalBrief, EXAMPLE_PROPOSAL } from '@/lib/proposal'

const FIELD_STYLE = {
  background: 'var(--d-elevated)',
  border: '1px solid var(--t-glass-bdr)',
  color: 'var(--t-tx1)',
  borderRadius: 8,
  fontFamily: 'inherit',
  fontSize: 11,
  padding: '8px 12px',
  width: '100%',
  resize: 'vertical' as const,
  outline: 'none',
}

const LABEL_STYLE = { color: 'var(--t-tx3)', fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }

interface Props { onSubmit: (brief: ProposalBrief) => void; disabled: boolean }

export function ProposalForm({ onSubmit, disabled }: Props) {
  const [form, setForm] = useState<ProposalBrief>({ clientName: '', projectDescription: '', requirements: '', budget: '', timeline: '', companyBackground: '' })

  const set = (k: keyof ProposalBrief) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const canSubmit = !disabled && form.clientName.trim() && form.projectDescription.trim()

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Client Name *</span>
        <input type="text" style={{ ...FIELD_STYLE, resize: undefined }} value={form.clientName} onChange={set('clientName')} placeholder="e.g. Offshore Operations Ltd" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Project Description *</span>
        <textarea rows={3} style={FIELD_STYLE} value={form.projectDescription} onChange={set('projectDescription')} placeholder="Describe the project, technology scope, and objectives…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Requirements</span>
        <textarea rows={3} style={FIELD_STYLE} value={form.requirements} onChange={set('requirements')} placeholder="Technical requirements, SLAs, integrations, compliance…" disabled={disabled} />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <span style={LABEL_STYLE}>Budget</span>
          <input type="text" style={{ ...FIELD_STYLE, resize: undefined }} value={form.budget} onChange={set('budget')} placeholder="e.g. $200,000–$280,000" disabled={disabled} />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <span style={LABEL_STYLE}>Timeline</span>
          <input type="text" style={{ ...FIELD_STYLE, resize: undefined }} value={form.timeline} onChange={set('timeline')} placeholder="e.g. Kick-off Q3 2026, go-live Q2 2027" disabled={disabled} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Company Background</span>
        <textarea rows={2} style={FIELD_STYLE} value={form.companyBackground} onChange={set('companyBackground')} placeholder="Your firm's relevant expertise and differentiators…" disabled={disabled} />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => canSubmit && onSubmit(form)}
          disabled={!canSubmit}
          className="px-5 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all disabled:opacity-40"
          style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-p)', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        >
          Generate Proposal
        </button>
        <button
          onClick={() => setForm(EXAMPLE_PROPOSAL)}
          disabled={disabled}
          className="text-[10px] font-mono transition-colors disabled:opacity-40"
          style={{ color: 'var(--t-tx3)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Load example
        </button>
      </div>
    </div>
  )
}
