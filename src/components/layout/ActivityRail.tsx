'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Code2,
  HardDrive,
  BarChart2,
  Bot,
  GitBranch,
  Settings,
  TerminalSquare,
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
        background: 'rgba(10, 11, 15, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Logo mark */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 shrink-0"
        style={{
          background: 'rgba(59,130,246,0.15)',
          border: '1px solid rgba(59,130,246,0.3)',
          boxShadow: '0 0 12px rgba(59,130,246,0.2)',
        }}
      >
        <span className="text-blue-400 font-mono text-[10px] font-bold">LL</span>
      </div>

      {/* Nav icons */}
      {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className="w-8 h-8 rounded-md flex items-center justify-center transition-all duration-150 relative group"
            style={{
              background: isActive ? 'rgba(59,130,246,0.18)' : 'transparent',
              color: isActive ? '#60a5fa' : '#4b5563',
              boxShadow: isActive ? '0 0 10px rgba(59,130,246,0.25)' : 'none',
            }}
          >
            <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
            {/* Tooltip */}
            <span
              className="absolute left-10 z-50 px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: 'rgba(22,25,40,0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#94a3b8',
              }}
            >
              {label}
            </span>
            {/* Active indicator */}
            {isActive && (
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r"
                style={{ background: '#3b82f6' }}
              />
            )}
          </Link>
        )
      })}

      <div className="flex-1" />

      {/* Settings pinned bottom */}
      <Link
        href="/settings"
        title="Settings"
        className="w-8 h-8 rounded-md flex items-center justify-center transition-all"
        style={{ color: '#4b5563' }}
      >
        <Settings size={15} strokeWidth={1.5} />
      </Link>
    </aside>
  )
}
