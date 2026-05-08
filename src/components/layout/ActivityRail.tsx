'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Code2, TerminalSquare,
  HardDrive, BarChart2, Bot, GitBranch, Settings,
} from 'lucide-react'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: Code2, label: 'IDE', href: '/ide' },
  { icon: TerminalSquare, label: 'Terminal', href: '/terminal' },
  { icon: HardDrive, label: 'Storage', href: '/storage' },
  { icon: BarChart2, label: 'Analytics', href: '/analytics' },
  { icon: Bot, label: 'Orchestrator', href: '/orchestrator' },
  { icon: GitBranch, label: 'Pipeline', href: '/pipeline' },
]

export function ActivityRail() {
  const pathname = usePathname()

  return (
    <aside
      className="flex flex-col items-center shrink-0 h-full py-2 gap-0.5"
      style={{
        width: 48,
        background: 'var(--t-panel)',
        backdropFilter: 'blur(var(--t-blur))',
        WebkitBackdropFilter: 'blur(var(--t-blur))',
        borderRight: '1px solid var(--t-glass-bdr)',
        boxShadow: 'var(--t-shadow)',
        zIndex: 10,
      }}
    >
      {/* LL Logo mark */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center mb-3 shrink-0"
        style={{
          background: 'var(--t-p-glass)',
          border: '1px solid var(--t-glass-bdr)',
          boxShadow: '0 0 12px var(--t-p-glow)',
        }}
      >
        <span className="font-mono font-bold text-[10px]" style={{ color: 'var(--t-p)' }}>LL</span>
      </div>

      {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className="relative group w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150"
            style={{
              background: isActive ? 'var(--t-p-glass)' : 'transparent',
              color: isActive ? 'var(--t-p)' : 'var(--t-tx3)',
              boxShadow: isActive ? '0 0 10px var(--t-p-glow)' : 'none',
              border: isActive ? '1px solid var(--t-glass-bdr)' : '1px solid transparent',
            }}
          >
            <Icon size={15} strokeWidth={isActive ? 2 : 1.5} />
            {/* Tooltip */}
            <span
              className="absolute left-10 z-50 px-2 py-1 rounded-lg text-[10px] font-mono whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity glass-float"
              style={{ color: 'var(--t-tx1)' }}
            >
              {label}
            </span>
            {isActive && (
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
                style={{ width: 2, height: 16, background: 'var(--t-p)', boxShadow: '0 0 6px var(--t-p-glow)' }}
              />
            )}
          </Link>
        )
      })}

      <div className="flex-1" />
      <Link
        href="/settings"
        title="Settings"
        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
        style={{ color: 'var(--t-tx3)' }}
      >
        <Settings size={14} strokeWidth={1.5} />
      </Link>
    </aside>
  )
}
