'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useUiStore } from '@/stores/uiStore'
import { CostMeter } from '@/components/ui/CostMeter'
import { Search } from 'lucide-react'

export function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { openCommandPalette } = useUiStore()

  return (
    <header
      className="flex items-center px-3 gap-3 shrink-0"
      style={{
        height: 38,
        background: 'rgba(8, 9, 14, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Left: brand */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{
            background: 'rgba(245,200,66,0.12)',
            border: '1px solid rgba(245,200,66,0.2)',
          }}
        >
          <span className="font-mono font-bold text-[9px]" style={{ color: '#f5c842' }}>LL</span>
        </div>
        <span className="font-mono font-bold text-[11px] tracking-widest" style={{ color: '#f5c842' }}>
          LL COCKPIT
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* Workspace badge */}
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981', boxShadow: '0 0 4px #10b981' }} />
        <span className="font-mono text-[10px]" style={{ color: '#4b5563' }}>NEXUS PRIME</span>
      </div>

      {/* Center search bar — Cursor-style */}
      <div className="flex-1 flex items-center justify-center">
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 px-3 py-1 rounded transition-all"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: '#374151',
            minWidth: 220,
            maxWidth: 400,
            width: '100%',
          }}
        >
          <Search size={11} strokeWidth={1.5} />
          <span className="font-mono text-[10px] flex-1 text-left">Search or run command…</span>
          <kbd
            className="font-mono text-[9px] px-1 rounded"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#374151' }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: cost + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <CostMeter />
        <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <button
          onClick={() => router.push('/settings')}
          className="font-mono text-xs transition-colors"
          style={{ color: '#374151' }}
          title="Settings"
        >⚙</button>
      </div>
    </header>
  )
}
