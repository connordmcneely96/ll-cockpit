'use client'

import { useState } from 'react'
import { StandardsBrief, EXAMPLE_STANDARDS } from '@/lib/standards'

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

interface Props { onSubmit: (brief: StandardsBrief) => void; disabled: boolean }

export function StandardsForm({ onSubmit, disabled }: Props) {
  const [form, setForm] = useState<StandardsBrief>(EXAMPLE_STANDARDS)

  const set = (k: keyof StandardsBrief) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const canSubmit = !disabled && form.discipline.trim() && form.standards.trim() && form.question.trim()

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Engineering Discipline *</span>
        <input type="text" style={{ ...FIELD_STYLE, resize: undefined }} value={form.discipline} onChange={set('discipline')} placeholder="e.g. Pressure vessel design" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Relevant Standards *</span>
        <input type="text" style={{ ...FIELD_STYLE, resize: undefined }} value={form.standards} onChange={set('standards')} placeholder="e.g. ASME BPVC Section VIII Div 1, API 520, API 521" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Engineering Question *</span>
        <textarea rows={3} style={FIELD_STYLE} value={form.question} onChange={set('question')} placeholder="The specific question you need answered…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Application Context</span>
        <textarea rows={3} style={FIELD_STYLE} value={form.applicationContext} onChange={set('applicationContext')} placeholder="Real situation: equipment, operating conditions, environment…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Jurisdiction / Regulatory Context</span>
        <textarea rows={2} style={FIELD_STYLE} value={form.jurisdiction} onChange={set('jurisdiction')} placeholder="e.g. US / OSHA, EU / PED, offshore IEC…" disabled={disabled} />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => canSubmit && onSubmit(form)}
          disabled={!canSubmit}
          className="px-5 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all disabled:opacity-40"
          style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-p)', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        >
          Generate Guidance
        </button>
        <button
          onClick={() => setForm(EXAMPLE_STANDARDS)}
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
