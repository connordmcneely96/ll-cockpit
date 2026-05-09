'use client'

import { useRouter } from 'next/navigation'
import { useUiStore } from '@/stores/uiStore'
import { CostMeter } from '@/components/ui/CostMeter'
import { Search } from 'lucide-react'

export function TopBar() {
  const router = useRouter()
  const { openCommandPalette } = useUiStore()
  return (
    <header className="flex items-center px-3 gap-3 shrink-0" style={{
      height: 38,
      background: 'var(--d-topbar)',
      backdropFilter: 'blur(var(--t-blur))',
      WebkitBackdropFilter: 'blur(var(--t-blur))',
      borderBottom: '1px solid var(--t-glass-bdr)',
      boxShadow: 'var(--t-shadow)',
      position: 'relative', zIndex: 20,
    }}>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-glass-bdr)', boxShadow:'0 0 8px var(--t-p-glow)' }}>
          <span className="font-mono font-bold text-[9px]" style={{ color:'var(--t-p)' }}>LL</span>
        </div>
        <span className="font-mono font-bold text-[11px] tracking-widest" style={{ color:'var(--t-gold)' }}>LL COCKPIT</span>
      </div>
      <div className="w-px h-4" style={{ background:'var(--t-bdr)' }} />
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg" style={{ background:'var(--d-card)', border:'1px solid var(--t-glass-bdr)', backdropFilter:'blur(12px)' }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background:'#10b981', boxShadow:'0 0 4px #10b981' }} />
        <span className="font-mono text-[10px]" style={{ color:'var(--t-tx2)' }}>NEXUS PRIME</span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <button onClick={openCommandPalette} className="flex items-center gap-2 px-3 py-1 rounded-xl transition-all" style={{ background:'var(--d-card)', border:'1px solid var(--t-glass-bdr)', backdropFilter:'blur(12px)', color:'var(--t-tx3)', minWidth:220, maxWidth:400, width:'100%' }}>
          <Search size={11} strokeWidth={1.5} />
          <span className="font-mono text-[10px] flex-1 text-left">Search or run command…</span>
          <kbd className="font-mono text-[9px] px-1 py-0.5 rounded-md" style={{ background:'var(--t-p-glass)', color:'var(--t-p)', border:'1px solid var(--t-glass-bdr)' }}>⌘K</kbd>
        </button>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <CostMeter />
        <div className="w-px h-4" style={{ background:'var(--t-bdr)' }} />
        <button onClick={() => router.push('/settings')} className="font-mono text-xs" style={{ color:'var(--t-tx3)' }}>⚙</button>
      </div>
    </header>
  )
}
