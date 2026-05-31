'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Code2, Globe, TerminalSquare,
  HardDrive, BarChart2, Bot, Cpu, Brain, Settings, Palette, History, Wallet, Library, Database, Rocket, Box, GraduationCap,
} from 'lucide-react'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',    href: '/' },
  { icon: Code2,           label: 'IDE',           href: '/ide' },
  { icon: Globe,           label: 'Browser',       href: '/browser' },
  { icon: TerminalSquare,  label: 'Terminal',      href: '/terminal' },
  { icon: HardDrive,       label: 'Storage',       href: '/storage' },
  { icon: Library,         label: 'Library',       href: '/library' },
  { icon: Database,        label: 'D1 Explorer',   href: '/d1-explorer' },
  { icon: BarChart2,       label: 'Analytics',     href: '/analytics' },
  { icon: Wallet,          label: 'Finance',       href: '/finance' },
  { icon: Brain,           label: 'ORACLE',        href: '/oracle' },
  { icon: Rocket,          label: 'Launch Desk',   href: '/launch-desk' },
  { icon: Bot,             label: 'AI Providers',  href: '/ai-providers' },
  { icon: Cpu,             label: 'Orchestrator',  href: '/orchestrator' },
  { icon: Palette,         label: 'Design Build',  href: '/api/design/launch' },
  { icon: Box,             label: 'Design Studio', href: '/design-studio' },
  { icon: GraduationCap,   label: 'Learn',         href: '/learn' },
  { icon: History,         label: 'History',       href: '/history' },
]

export function ActivityRail() {
  const pathname = usePathname()
  return (
    <aside
      className="flex flex-col items-center shrink-0 h-full py-2 gap-0.5"
      style={{
        width: 48,
        background: 'var(--d-rail)',
        backdropFilter: 'blur(var(--t-blur))',
        WebkitBackdropFilter: 'blur(var(--t-blur))',
        borderRight: '1px solid var(--t-glass-bdr)',
        boxShadow: 'var(--t-shadow)',
        zIndex: 10,
      }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center mb-3 shrink-0"
        style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-glass-bdr)', boxShadow: '0 0 12px var(--t-p-glow)' }}
      >
        <span className="font-mono font-bold text-[10px]" style={{ color: 'var(--t-p)' }}>LL</span>
      </div>

      {NAV_ITEMS.map(({ icon: Icon, label, href }, index) => {
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
        return (
          <Fragment key={href}>
            {(index === 1 || index === 9) && (
              <div style={{ width: 20, height: 1, background: 'var(--t-glass-bdr)', margin: '4px auto' }} />
            )}
            <Link
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
              <span
                className="absolute left-10 z-50 px-2 py-1 rounded-lg text-[10px] font-mono whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'var(--d-elevated)', backdropFilter: 'blur(20px)', border: '1px solid var(--t-glass-bdr)', color: 'var(--t-tx1)' }}
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
          </Fragment>
        )
      })}

      <div className="flex-1" />

      <Link
        href="/settings"
        title="Settings"
        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
        style={{ color: pathname === '/settings' ? 'var(--t-p)' : 'var(--t-tx3)' }}
      >
        <Settings size={14} strokeWidth={1.5} />
      </Link>
    </aside>
  )
}
