'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Code2, TerminalSquare,
  HardDrive, BarChart2, Bot, GitBranch,
  Cpu, Settings, X
} from 'lucide-react'

const TABS = [
  { icon: LayoutDashboard, label: 'dashboard.tsx', href: '/', size: 14 },
  { icon: Code2,           label: 'ide.tsx',       href: '/ide', size: 14 },
  { icon: TerminalSquare,  label: 'terminal.tsx',  href: '/terminal', size: 14 },
  { icon: Cpu,             label: 'pipeline.tsx',  href: '/pipeline', size: 14 },
  { icon: Bot,             label: 'agents.tsx',    href: '/orchestrator', size: 14 },
  { icon: HardDrive,       label: 'storage.tsx',   href: '/storage', size: 14 },
  { icon: BarChart2,       label: 'analytics.tsx', href: '/analytics', size: 14 },
]

export function TabBar() {
  const pathname = usePathname()

  return (
    <div
      className="flex items-end shrink-0 overflow-x-auto"
      style={{
        height: 35,
        background: 'rgba(9, 10, 16, 0.9)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {TABS.map(({ icon: Icon, label, href }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className="group relative flex items-center gap-1.5 px-4 h-full shrink-0 transition-colors"
            style={{
              background: isActive
                ? 'rgba(13, 15, 26, 1)'
                : 'transparent',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              color: isActive ? '#e2e8f0' : '#4b5563',
              minWidth: 0,
            }}
          >
            {/* Active top accent line */}
            {isActive && (
              <span
                className="absolute top-0 left-0 right-0"
                style={{
                  height: 1,
                  background: 'linear-gradient(to right, #3b82f6, #60a5fa)',
                  boxShadow: '0 0 8px rgba(59,130,246,0.5)',
                }}
              />
            )}

            <Icon
              size={12}
              strokeWidth={1.5}
              style={{ color: isActive ? '#60a5fa' : '#374151', flexShrink: 0 }}
            />
            <span
              className="font-mono whitespace-nowrap"
              style={{ fontSize: 11 }}
            >
              {label}
            </span>

            {/* Hover close button */}
            <span
              className="ml-1 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity rounded"
              style={{ color: '#94a3b8' }}
              onClick={(e) => { e.preventDefault() }}
            >
              <X size={10} />
            </span>
          </Link>
        )
      })}

      {/* Fill remaining space */}
      <div className="flex-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', height: '100%' }} />
    </div>
  )
}
