'use client'

import { useState } from 'react'
import { LaunchBrief, EXAMPLE_BRIEF } from '@/lib/launch-desk'

interface Props {
  onSubmit: (brief: LaunchBrief) => void
  disabled: boolean
}

const LABELS: Record<keyof LaunchBrief, string> = {
  productBrief: 'Product Brief',
  audience: 'Target Audience',
  launchDate: 'Launch Date',
  constraints: 'Constraints',
  assets: 'Available Assets',
}

export function IntakeForm({ onSubmit, disabled }: Props) {
  const [brief, setBrief] = useState<LaunchBrief>({ ...EXAMPLE_BRIEF })

  const set = (key: keyof LaunchBrief) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setBrief(prev => ({ ...prev, [key]: e.target.value }))

  const isEmpty = !brief.productBrief.trim() || !brief.audience.trim() || !brief.launchDate.trim()

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (!isEmpty && !disabled) onSubmit(brief) }}
      className="flex flex-col gap-4 w-full max-w-2xl"
    >
      {(['productBrief', 'audience', 'constraints', 'assets'] as const).map(key => (
        <label key={key} className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color: 'var(--t-tx3)' }}>
            {LABELS[key]}
          </span>
          <textarea
            value={brief[key]}
            onChange={set(key)}
            disabled={disabled}
            rows={key === 'productBrief' ? 3 : 2}
            className="resize-y rounded-lg px-3 py-2 text-[12px] font-mono outline-none transition-colors"
            style={{
              background: 'var(--d-elevated)',
              border: '1px solid var(--t-glass-bdr)',
              color: 'var(--t-tx1)',
            }}
          />
        </label>
      ))}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color: 'var(--t-tx3)' }}>
          {LABELS.launchDate}
        </span>
        <input
          type="date"
          value={brief.launchDate}
          onChange={set('launchDate')}
          disabled={disabled}
          className="rounded-lg px-3 py-2 text-[12px] font-mono outline-none transition-colors w-48"
          style={{
            background: 'var(--d-elevated)',
            border: '1px solid var(--t-glass-bdr)',
            color: 'var(--t-tx1)',
          }}
        />
      </label>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={disabled || isEmpty}
          className="px-5 py-2 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all"
          style={{
            background: disabled || isEmpty ? 'var(--d-elevated)' : 'var(--t-p-glass)',
            color: disabled || isEmpty ? 'var(--t-tx3)' : 'var(--t-p)',
            border: '1px solid var(--t-glass-bdr)',
            boxShadow: disabled || isEmpty ? 'none' : '0 0 10px var(--t-p-glow)',
            cursor: disabled || isEmpty ? 'not-allowed' : 'pointer',
          }}
        >
          Generate Launch Plan
        </button>
        <button
          type="button"
          onClick={() => setBrief({ ...EXAMPLE_BRIEF })}
          disabled={disabled}
          className="text-[10px] font-mono underline transition-colors"
          style={{ color: 'var(--t-tx3)', background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          Reset to example
        </button>
      </div>
    </form>
  )
}
