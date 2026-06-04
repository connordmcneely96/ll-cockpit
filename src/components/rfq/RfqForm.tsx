'use client'

import { useState } from 'react'
import { RfqBrief, EXAMPLE_RFQ } from '@/lib/rfq'

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

interface Props { onSubmit: (brief: RfqBrief) => void; disabled: boolean }

export function RfqForm({ onSubmit, disabled }: Props) {
  const [form, setForm] = useState<RfqBrief>(EXAMPLE_RFQ)

  const set = (k: keyof RfqBrief) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const canSubmit = !disabled && form.rfqText.trim()

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>RFQ / Spec Text *</span>
        <textarea rows={14} style={{ ...FIELD_STYLE, fontFamily: 'monospace' }} value={form.rfqText} onChange={set('rfqText')} placeholder="Paste the full RFQ / scope / spec language from the client…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Client Context</span>
        <textarea rows={2} style={FIELD_STYLE} value={form.clientContext} onChange={set('clientContext')} placeholder="Who they are, industry, decision-maker, history…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Our Capabilities</span>
        <textarea rows={2} style={FIELD_STYLE} value={form.ourCapabilities} onChange={set('ourCapabilities')} placeholder="What we can realistically deliver — relevant expertise…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Our Constraints</span>
        <textarea rows={2} style={FIELD_STYLE} value={form.constraints} onChange={set('constraints')} placeholder="Team size, geography, PE stamping, certifications we lack…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Bid Deadline</span>
        <input type="text" style={{ ...FIELD_STYLE, resize: undefined }} value={form.deadline} onChange={set('deadline')} placeholder="e.g. 21 days from RFQ issue" disabled={disabled} />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => canSubmit && onSubmit(form)}
          disabled={!canSubmit}
          className="px-5 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all disabled:opacity-40"
          style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-p)', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        >
          Analyze RFQ
        </button>
        <button
          onClick={() => setForm(EXAMPLE_RFQ)}
          disabled={disabled}
          className="text-[10px] font-mono transition-colors disabled:opacity-40"
          style={{ color: 'var(--t-tx3)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Reset to example
        </button>
      </div>
    </div>
  )
}
