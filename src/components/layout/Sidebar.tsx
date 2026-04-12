'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUiStore } from '@/stores/uiStore'
import { AGENT_LIST } from '@/lib/agents'

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: '⬡' },
  { href: '/ide', label: 'IDE', icon: '⌨' },
  { href: '/terminal', label: 'Terminal', icon: '>' },
  { href: '/orchestrator', label: 'Orchestrator', icon: '⬡' },
  { href: '/pipeline', label: 'Pipeline', icon: '⋯' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { sidebarCollapsed, toggleSidebar } = useUiStore()

  return (
    <aside
      className={[
        'flex flex-col bg-navy-2 border-r border-gold/12 transition-all duration-200 shrink-0',
        sidebarCollapsed ? 'w-12' : 'w-52',
      ].join(' ')}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between p-3 border-b border-gold/12 h-12">
        {!sidebarCollapsed && (
          <span className="text-gold font-condensed font-bold text-sm tracking-widest uppercase">
            LL COCKPIT
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="text-text3 hover:text-gold transition-colors p-1 rounded hover:bg-white/5 ml-auto"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {/* Main nav */}
        <div className="px-2 space-y-0.5">
          {NAV_LINKS.map(({ href, label, icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors font-mono',
                  active
                    ? 'bg-gold/10 text-gold'
                    : 'text-text3 hover:text-text2 hover:bg-white/5',
                ].join(' ')}
                title={sidebarCollapsed ? label : undefined}
              >
                <span className="text-base w-4 text-center shrink-0">{icon}</span>
                {!sidebarCollapsed && <span>{label}</span>}
              </Link>
            )
          })}
        </div>

        {/* Agents section */}
        {!sidebarCollapsed && (
          <div className="mt-4 px-2">
            <p className="text-text3 text-xs font-mono uppercase tracking-widest px-2 mb-1">
              Agents
            </p>
            <div className="space-y-0.5">
              {AGENT_LIST.map((agent) => {
                const href = `/agent/${agent.name}`
                const active = pathname === href
                return (
                  <Link
                    key={agent.name}
                    href={href}
                    className={[
                      'flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors font-mono',
                      active
                        ? 'bg-gold/10 text-gold'
                        : 'text-text3 hover:text-text2 hover:bg-white/5',
                    ].join(' ')}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: agent.color }}
                    />
                    <span>{agent.displayName}</span>
                    <span className="ml-auto text-text3 text-[10px] truncate max-w-[80px]">
                      {agent.role}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </nav>
    </aside>
  )
}
