'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Code2, TerminalSquare, Cpu,
  Bot, HardDrive, BarChart2, Globe, X,
} from 'lucide-react'

const TABS = [
  { icon: LayoutDashboard, label: 'dashboard.tsx', href: '/' },
  { icon: Code2, label: 'ide.tsx', href: '/ide' },
  { icon: Globe, label: 'browser.tsx', href: '/browser' },
  { icon: TerminalSquare, label: 'terminal.tsx', href: '/terminal' },
  { icon: Cpu, label: 'pipeline.tsx', href: '/pipeline' },
  { icon: Bot, label: 'agents.tsx', href: '/orchestrator' },
  { icon: HardDrive, label: 'storage.tsx', href: '/storage' },
  { icon: BarChart2, label: 'analytics.tsx', href: '/analytics' },
]

export function TabBar() {
  const pathname = usePathname()

  return (
    <div
      className="flex items-end shrink-0 overflow-x-auto"
      style={{
        height: 35,
        background: 'var(--t-panel)',
        backdropFilter: 'blur(var(--t-blur))',
        WebkitBackdropFilter: 'blur(var(--t-blur))',
        borderBottom: '1px solid var(--t-bdr)',
      }}
    >
      {TABS.map(({ icon: Icon, label, href }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className="group relative flex items-center gap-1.5 px-3.5 h-full shrink-0 transition-all duration-150"
            style={{
              background: isActive ? 'var(--t-p-glass)' : 'transparent',
              borderRight: '1px solid var(--t-bdr)',
              color: isActive ? 'var(--t-tx1)' : 'var(--t-tx3)',
            }}
          >
            {isActive && (
              <span
                className="absolute top-0 left-0 right-0"
                style={{
                  height: 2,
                  background: `linear-gradient(to right, var(--t-p), var(--t-p-bright))`,
                  boxShadow: '0 0 8px var(--t-p-glow)',
                }}
              />
            )}
            <Icon size={11} strokeWidth={1.5} style={{ color: isActive ? 'var(--t-p)' : 'var(--t-tx3)', flexShrink: 0 }} />
            <span className="font-mono whitespace-nowrap" style={{ fontSize: 11 }}>{label}</span>
            <span
              className="ml-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
              style={{ color: 'var(--t-tx3)' }}
              onClick={e => e.preventDefault()}
            >
              <X size={10} />
            </span>
          </Link>
        )
      })}
      <div className="flex-1" style={{ height: '100%', borderBottom: '1px solid var(--t-bdr)' }} />
    </div>
  )
}
