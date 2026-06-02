'use client'

import { useState } from 'react'
import { FmeaBrief, EXAMPLE_FMEA } from '@/lib/fmea'

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

interface Props { onSubmit: (brief: FmeaBrief) => void; disabled: boolean }

export function FmeaForm({ onSubmit, disabled }: Props) {
  const [form, setForm] = useState<FmeaBrief>({ equipment: '', failureModes: '', operationalContext: '', criticality: '', history: '' })

  const set = (k: keyof FmeaBrief) => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const canSubmit = !disabled && form.equipment.trim() && form.failureModes.trim()

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Equipment / System *</span>
        <textarea rows={2} style={FIELD_STYLE} value={form.equipment} onChange={set('equipment')} placeholder="e.g. API 610 BB2 centrifugal pump, 1000 HP…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Known or Suspected Failure Modes *</span>
        <textarea rows={3} style={FIELD_STYLE} value={form.failureModes} onChange={set('failureModes')} placeholder="e.g. Mechanical seal failure, bearing overheating…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Operational Context</span>
        <textarea rows={2} style={FIELD_STYLE} value={form.operationalContext} onChange={set('operationalContext')} placeholder="Duty cycle, environment, operating conditions…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Criticality (Safety / Production Impact)</span>
        <textarea rows={2} style={FIELD_STYLE} value={form.criticality} onChange={set('criticality')} placeholder="Production-critical, safety risk, redundancy…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Failure History & Symptoms</span>
        <textarea rows={3} style={FIELD_STYLE} value={form.history} onChange={set('history')} placeholder="Past failures, trending data, maintenance notes…" disabled={disabled} />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => canSubmit && onSubmit(form)}
          disabled={!canSubmit}
          className="px-5 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all disabled:opacity-40"
          style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-p)', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        >
          Run FMEA
        </button>
        <button
          onClick={() => setForm(EXAMPLE_FMEA)}
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
