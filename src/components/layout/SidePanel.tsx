'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AGENT_LIST } from '@/lib/agents'
import type { Activity } from './ActivityBar'

interface SidePanelProps {
  activeActivity: Activity
}

export function SidePanel({ activeActivity }: SidePanelProps) {
  const pathname = usePathname()

  return (
    <div className="w-[220px] shrink-0 flex flex-col bg-base-2 border-r border-white/[0.06]">
      {/* Brand header */}
      <div className="h-12 flex items-center px-3 border-b border-white/[0.06] shrink-0">
        <span className="text-gold font-condensed font-bold tracking-widest uppercase text-[11px]">
          LL COCKPIT
        </span>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {activeActivity === 'agents' ? (
          <div className="py-2">
            <p className="text-text3 font-mono uppercase tracking-widest text-[10px] px-3 pt-1 pb-1.5">
              AGENTS
            </p>
            {AGENT_LIST.map((agent) => {
              const href = `/agent/${agent.name}`
              const isActive = pathname === href
              return (
                <Link
                  key={agent.name}
                  href={href}
                  className={[
                    'relative flex items-center gap-2 px-3 h-8 transition-colors',
                    isActive
                      ? 'bg-blue/10 text-text1'
                      : 'text-text2 hover:bg-base-3',
                  ].join(' ')}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue rounded-r" />
                  )}
                  <span
                    className="w-1.5 h-1.5 rounded-sm shrink-0"
                    style={{ backgroundColor: agent.color }}
                  />
                  <span className="font-mono text-xs truncate flex-1">
                    {agent.displayName}
                  </span>
                  <span className="font-mono text-[10px] text-text3 truncate max-w-[72px]">
                    {agent.role}
                  </span>
                </Link>
              )
            })}
          </div>
        ) : activeActivity === 'ide' ? (
          <div className="py-2">
            <p className="text-text3 font-mono uppercase tracking-widest text-[10px] px-3 pt-1 pb-1.5">
              FILES
            </p>
            <p className="text-text3 font-mono text-[10px] px-3">Coming soon</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center gap-1">
            <p className="text-text3 font-mono text-xs capitalize">{activeActivity}</p>
            <p className="text-text3 font-mono text-[10px]">Coming soon</p>
          </div>
        )}
      </div>
    </div>
  )
}
