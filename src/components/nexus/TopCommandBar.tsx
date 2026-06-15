'use client'

import { useState } from 'react'
import type { TenantData } from './mock'
import ThemeSwitcher from './ThemeSwitcher'

interface Props {
  tenant: TenantData
  onMenuClick?: () => void
  onBrainClick?: () => void
}

export default function TopCommandBar({ tenant, onMenuClick, onBrainClick }: Props) {
  const [query, setQuery] = useState('')

  const deployColor =
    tenant.deployStatus === 'Healthy'
      ? 'var(--d-success)'
      : tenant.deployStatus === 'Degraded'
      ? 'var(--d-warning)'
      : 'var(--d-error)'

  return (
    <header
      className="glass-panel flex items-center gap-3 px-3 md:px-4"
      style={{ height: 52, borderRight: 'none', borderBottom: '1px solid var(--t-glass-bdr)', position: 'relative', zIndex: 50 }}
    >
      {/* Hamburger — opens the nav drawer (below lg only) */}
      <button
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="lg:hidden flex items-center justify-center shrink-0 rounded"
        style={{ width: 38, height: 38, color: 'var(--t-tx2)', borderRadius: 'var(--d-radius-sm)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>

      {/* Breadcrumb (org/project hidden on small) */}
      <nav className="flex items-center gap-1 text-xs shrink-0" aria-label="breadcrumb">
        <span className="hidden sm:inline" style={{ color: 'var(--t-tx2)' }}>{tenant.org}</span>
        <span className="hidden sm:inline" style={{ color: 'var(--t-tx3)' }}>›</span>
        <span className="hidden sm:inline" style={{ color: 'var(--t-tx2)' }}>{tenant.project}</span>
        <span className="hidden sm:inline" style={{ color: 'var(--t-tx3)' }}>›</span>
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{ borderRadius: 'var(--d-radius-sm)', border: '1px solid var(--d-warning)', color: 'var(--d-warning)', background: 'color-mix(in srgb, var(--d-warning) 8%, transparent)' }}
        >
          {tenant.env}
        </span>
      </nav>

      {/* Command input — hidden below md; flex spacer keeps chips right-aligned */}
      <div className="flex-1 flex justify-center">
        <div
          className="glass hidden md:flex items-center gap-2 px-3"
          style={{ width: '100%', maxWidth: 480, height: 34, borderRadius: 'var(--d-radius-md)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t-tx3)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
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
        <span className="hidden xl:inline" style={{ color: 'var(--t-tx2)' }}>{tenant.role}</span>
        <span className="hidden xl:flex items-center gap-1" style={{ color: 'var(--t-tx2)' }}>
          <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: deployColor }} />
          Deploy {tenant.deployStatus}
        </span>
        <span className="hidden xl:inline" style={{ color: 'var(--t-tx2)' }}>Spend {tenant.monthlySpend}</span>
        <ThemeSwitcher />
        {/* Brain toggle — opens the SystemBrain slide-over (below xl only) */}
        <button
          onClick={onBrainClick}
          aria-label="Toggle system brain"
          className="xl:hidden flex items-center justify-center shrink-0 rounded"
          style={{ width: 38, height: 38, color: 'var(--t-tx2)', borderRadius: 'var(--d-radius-sm)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>
        </button>
        <span
          className="flex items-center justify-center text-xs font-semibold rounded-full"
          style={{ width: 28, height: 28, background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-p)', flexShrink: 0 }}
        >
          {tenant.avatarInitials}
        </span>
      </div>
    </header>
  )
}
