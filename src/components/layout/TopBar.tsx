'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useUiStore } from '@/stores/uiStore'
import { CostMeter } from '@/components/ui/CostMeter'

const PAGE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/ide': 'IDE',
  '/terminal': 'Terminal',
  '/orchestrator': 'Orchestrator',
  '/pipeline': 'Pipeline',
  '/settings': 'Settings',
}

export function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { openCommandPalette } = useUiStore()
  const pageLabel = PAGE_LABELS[pathname] ?? 'Cockpit'

  return (
    <header className="h-10 bg-base-1 border-b border-white/[0.06] flex items-center px-4 gap-4 shrink-0">
      {/* Left: logo + workspace */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 flex items-center justify-center bg-gold/10 rounded font-condensed font-bold text-gold text-xs leading-none select-none">
          LL
        </div>
        <span className="text-gold font-condensed font-bold text-sm tracking-widest uppercase hidden sm:block">
          LL COCKPIT
        </span>
        <div className="w-px h-4 bg-white/[0.08] hidden sm:block" />
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-base-3 border border-white/[0.06] rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" />
          <span className="text-text3 font-mono text-[10px]">workspace: NEXUS PRIME</span>
        </div>
      </div>

      {/* Center: breadcrumb */}
      <div className="flex-1 flex items-center justify-center">
        <span className="text-text3 font-mono text-[10px]">
          LL COCKPIT
          <span className="text-text3/40 mx-1.5">›</span>
          <span className="text-text2">{pageLabel}</span>
        </span>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <CostMeter />
        <div className="w-px h-4 bg-white/[0.08]" />
        <button className="text-text3 hover:text-text2 transition-colors font-mono text-sm" title="Globe">⊕</button>
        <button className="text-text3 hover:text-text2 transition-colors font-mono text-sm" title="Layout">⊠</button>
        <button
          onClick={() => router.push('/settings')}
          className="text-text3 hover:text-text2 transition-colors font-mono text-sm"
          title="Settings"
        >⚙</button>
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-1 px-2 py-0.5 bg-base-3 border border-white/[0.06] rounded text-text3 font-mono text-[10px] hover:text-text2 hover:border-white/[0.12] transition-colors"
        >
          ⌘K
        </button>
      </div>
    </header>
  )
}
