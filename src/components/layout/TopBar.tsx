'use client'

import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const pageLabel = getLabel(pathname)

  return (
    <header className="h-10 bg-base-1 border-b border-white/[0.06] flex items-center px-3 gap-3 shrink-0">
      {/* Left: logo + workspace */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 flex items-center justify-center bg-gold/10 rounded font-condensed font-bold text-gold text-xs leading-none select-none">
          LL
        </div>
        <span className="text-gold font-condensed font-bold text-sm tracking-widest hidden sm:block">
          LL COCKPIT
        </span>
        <div className="w-px h-4 bg-white/[0.08]" />
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-base-3 border border-white/[0.06] rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" />
          <span className="text-text3 font-mono text-[10px]">workspace: NEXUS PRIME</span>
        </div>
      </div>

      {/* Center: breadcrumb */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
          <span className="text-text3">LL COCKPIT</span>
          <span className="text-text3 opacity-40">›</span>
          <span className="text-text2">{pageLabel}</span>
        </div>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <CostMeter />
        <div className="w-px h-4 bg-white/[0.08]" />
        <button
          className="w-7 h-7 flex items-center justify-center text-text3 hover:text-text2 font-mono text-sm rounded hover:bg-base-3 transition-colors"
          title="Globe"
        >
          ⊕
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center text-text3 hover:text-text2 font-mono text-sm rounded hover:bg-base-3 transition-colors"
          title="Layout"
        >
          ⊠
        </button>
        <button
          onClick={() => router.push('/settings')}
          className="w-7 h-7 flex items-center justify-center text-text3 hover:text-text2 font-mono text-sm rounded hover:bg-base-3 transition-colors"
          title="Settings"
        >
          ⚙
        </button>
        <button
          onClick={openCommandPalette}
          className="flex items-center px-2 py-0.5 bg-base-3 border border-white/[0.06] rounded text-text3 text-[10px] font-mono hover:text-text2 hover:border-white/[0.12] transition-colors"
          title="Open command palette"
        >
          ⌘K
        </button>
      </div>
    </header>
  )
}
