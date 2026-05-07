'use client'

import { usePathname } from 'next/navigation'
import { useUiStore } from '@/stores/uiStore'
import { CostMeter } from '@/components/ui/CostMeter'

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/ide': 'IDE',
  '/terminal': 'Terminal',
  '/orchestrator': 'Orchestrator',
  '/pipeline': 'Pipeline',
  '/settings': 'Settings',
}

function getLabel(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname]
  if (pathname.startsWith('/agent/')) {
    const name = pathname.split('/agent/')[1]
    return name ? name.toUpperCase() : 'Agent'
  }
  return pathname.split('/').filter(Boolean).pop()?.toUpperCase() ?? 'Cockpit'
}

export function TopBar() {
  const { openCommandPalette } = useUiStore()
  const pathname = usePathname()
  const pageLabel = getLabel(pathname)

  return (
    <header className="h-12 bg-base-2 border-b border-white/[0.06] flex items-center justify-between px-4 shrink-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 font-mono text-[11px]">
        <span className="text-text3">LL COCKPIT</span>
        <span className="text-text3 opacity-50">›</span>
        <span className="text-text2">{pageLabel}</span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        <CostMeter />
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-base-3 border border-white/[0.08] text-text2 text-xs font-mono hover:text-text1 hover:border-white/[0.16] transition-colors"
          title="Open command palette"
        >
          <span>⌘K</span>
        </button>
      </div>
    </header>
  )
}
