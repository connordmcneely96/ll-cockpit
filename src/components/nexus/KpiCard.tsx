'use client'

import Sparkline from './viz/Sparkline'
import Delta from './viz/Delta'

interface Props {
  label: string
  value: string
  delta?: number   // percent change, optional
  series?: number[]
  accentBar?: boolean
}

export default function KpiCard({ label, value, delta, series, accentBar = true }: Props) {
  return (
    <div
      className="glass-card flex flex-col overflow-hidden"
      style={{
        borderRadius: 'var(--d-radius-lg)',
        flex: 1,
        minWidth: 140,
        position: 'relative',
        transition: 'box-shadow var(--d-transition), transform var(--d-transition)',
        background: 'color-mix(in srgb, var(--t-p) 5%, var(--d-card))',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.boxShadow = 'var(--t-shadow-hover)'
        el.style.transform = 'var(--d-hover-lift)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.boxShadow = ''
        el.style.transform = ''
      }}
    >
      {accentBar && (
        <div style={{ height: 3, background: 'var(--t-p)', borderRadius: '3px 3px 0 0' }} />
      )}
      <div className="flex flex-col gap-1 px-4 pt-3 pb-0">
        <div className="text-xs" style={{ color: 'var(--t-tx3)', letterSpacing: '0.06em' }}>{label}</div>
        <div className="text-2xl font-bold" style={{ color: 'var(--t-tx1)', fontFamily: 'var(--font-condensed), sans-serif' }}>
          {value}
        </div>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <div className="mt-1 px-1 pb-1" style={{ opacity: 0.85 }}>
        <Sparkline data={series ?? []} width={160} height={44} />
      </div>
    </div>
  )
}
