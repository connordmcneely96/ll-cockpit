'use client'

import { useState } from 'react'
import { MaintenanceBrief, EXAMPLE_MAINTENANCE } from '@/lib/maintenance'

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

interface Props { onSubmit: (brief: MaintenanceBrief) => void; disabled: boolean }

export function MaintenanceForm({ onSubmit, disabled }: Props) {
  const [form, setForm] = useState<MaintenanceBrief>(EXAMPLE_MAINTENANCE)

  const set = (k: keyof MaintenanceBrief) => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const canSubmit = !disabled && form.asset.trim() && form.criticality.trim()

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Asset *</span>
        <textarea rows={2} style={FIELD_STYLE} value={form.asset} onChange={set('asset')} placeholder="Equipment under analysis — type, size, age, key components…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Operating Profile</span>
        <textarea rows={3} style={FIELD_STYLE} value={form.operatingProfile} onChange={set('operatingProfile')} placeholder="Duty cycle, load, run hours, fluid, temperatures, environment…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Failure History</span>
        <textarea rows={3} style={FIELD_STYLE} value={form.failureHistory} onChange={set('failureHistory')} placeholder="Known failures, frequencies, root causes, recent trends…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Criticality *</span>
        <textarea rows={2} style={FIELD_STYLE} value={form.criticality} onChange={set('criticality')} placeholder="Consequence of failure — production impact, safety, environmental…" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1">
        <span style={LABEL_STYLE}>Current Maintenance Program</span>
        <textarea rows={3} style={FIELD_STYLE} value={form.currentProgram} onChange={set('currentProgram')} placeholder="Existing PMs, intervals, condition monitoring, spares strategy…" disabled={disabled} />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => canSubmit && onSubmit(form)}
          disabled={!canSubmit}
          className="px-5 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all disabled:opacity-40"
          style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-p)', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        >
          Build Plan
        </button>
        <button
          onClick={() => setForm(EXAMPLE_MAINTENANCE)}
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
