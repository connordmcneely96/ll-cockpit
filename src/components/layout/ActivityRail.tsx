'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Code2, HardDrive, Activity, Bot, Wrench, Settings } from 'lucide-react'
import type { ElementType } from 'react'

const navItems: { icon: ElementType; label: string; href: string }[] = [
  { icon: Home, label: 'Dashboard', href: '/' },
  { icon: Code2, label: 'IDE', href: '/ide' },
  { icon: HardDrive, label: 'Storage', href: '/storage' },
  { icon: Activity, label: 'Analytics', href: '/analytics' },
  { icon: Bot, label: 'Agents', href: '/orchestrator' },
  { icon: Wrench, label: 'MCP Tools', href: '/settings' },
]

export function ActivityRail() {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col items-center w-12 shrink-0 h-full bg-base-1/80 backdrop-blur-xl border-r border-white/[0.06] py-2 gap-1">
      {/* Logo mark */}
      <div className="w-8 h-8 rounded-lg bg-blue/20 border border-blue/30 flex items-center justify-center mb-3 shrink-0">
        <span className="text-blue font-mono text-xs font-bold">LL</span>
      </div>

      {navItems.map((item) => {
        const isActive = item.href === '/'
          ? pathname === '/'
          : pathname === item.href || pathname.startsWith(item.href + '/')
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
              isActive
                ? 'bg-blue/20 text-blue shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                : 'text-text3 hover:text-text2 hover:bg-white/[0.06]'
            }`}
          >
            <Icon size={16} />
          </Link>
        )
      })}

      <div className="flex-1" />

      <Link
        href="/settings"
        title="Settings"
        className="w-8 h-8 rounded-md flex items-center justify-center text-text3 hover:text-text2 hover:bg-white/[0.06] transition-all"
      >
        <Settings size={16} />
      </Link>
    </aside>
  )
}
