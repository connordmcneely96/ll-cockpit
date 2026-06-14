'use client'

import { useState } from 'react'
import type { TenantData } from './mock'
import ThemeSwitcher from './ThemeSwitcher'

interface Props {
  tenant: TenantData
}

export default function TopCommandBar({ tenant }: Props) {
  const [query, setQuery] = useState('')

  const deployColor =
    tenant.deployStatus === 'Healthy'
      ? 'var(--d-success)'
      : tenant.deployStatus === 'Degraded'
      ? 'var(--d-warning)'
      : 'var(--d-error)'

  return (
    <header
      className="glass-panel flex items-center gap-3 px-4"
      style={{ height: 52, borderRight: 'none', borderBottom: '1px solid var(--t-glass-bdr)', position: 'relative', zIndex: 50 }}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs shrink-0" aria-label="breadcrumb">
        <span style={{ color: 'var(--t-tx2)' }}>{tenant.org}</span>
        <span style={{ color: 'var(--t-tx3)' }}>›</span>
        <span style={{ color: 'var(--t-tx2)' }}>{tenant.project}</span>
        <span style={{ color: 'var(--t-tx3)' }}>›</span>
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{
            borderRadius: 'var(--d-radius-sm)',
            border: '1px solid var(--d-warning)',
            color: 'var(--d-warning)',
            background: 'color-mix(in srgb, var(--d-warning) 8%, transparent)',
          }}
        >
          {tenant.env}
        </span>
      </nav>

      {/* Command input */}
      <div className="flex-1 flex justify-center">
        <div
          className="glass flex items-center gap-2 px-3"
          style={{
            width: '100%',
            maxWidth: 480,
            height: 34,
            borderRadius: 'var(--d-radius-md)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t-tx3)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask, search, create, run, deploy…  type @ or /"
            className="bg-transparent outline-none w-full text-xs"
            style={{ color: 'var(--t-tx1)' }}
          />
        </div>
      </div>

      {/* Right chips */}
      <div className="flex items-center gap-2 text-xs shrink-0">
        <span style={{ color: 'var(--t-tx2)' }}>{tenant.role}</span>
        <span className="flex items-center gap-1" style={{ color: 'var(--t-tx2)' }}>
          <span
            className="inline-block rounded-full"
            style={{ width: 7, height: 7, background: deployColor }}
          />
          Deploy {tenant.deployStatus}
        </span>
        <span style={{ color: 'var(--t-tx2)' }}>Spend {tenant.monthlySpend}</span>
        <ThemeSwitcher />
        <span
          className="flex items-center justify-center text-xs font-semibold rounded-full"
          style={{
            width: 28,
            height: 28,
            background: 'var(--t-p-glass)',
            color: 'var(--t-p)',
            border: '1px solid var(--t-p)',
            flexShrink: 0,
          }}
        >
          {tenant.avatarInitials}
        </span>
      </div>
    </header>
  )
}
