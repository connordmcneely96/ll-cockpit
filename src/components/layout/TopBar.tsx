'use client'

import { useUiStore } from '@/stores/uiStore'
import { CostMeter } from '@/components/ui/CostMeter'

interface TopBarProps {
  title?: string
}

export function TopBar({ title = 'LL Cockpit' }: TopBarProps) {
  const { openCommandPalette } = useUiStore()

  return (
    <header className="h-12 bg-navy-2 border-b border-gold/12 flex items-center justify-between px-4 shrink-0">
      {/* Left: page title */}
      <h1 className="text-text2 font-condensed font-semibold text-sm uppercase tracking-wider">
        {title}
      </h1>

      {/* Right: cost meter + cmd palette trigger */}
      <div className="flex items-center gap-4">
        <CostMeter />
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-navy-4 border border-gold/12 text-text3 text-xs font-mono hover:text-text1 hover:border-gold/30 transition-colors"
          title="Open command palette"
        >
          <span>⌘</span>
          <span>K</span>
        </button>
      </div>
    </header>
  )
}
