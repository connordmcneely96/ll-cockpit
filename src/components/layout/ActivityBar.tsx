'use client'

import { useRouter } from 'next/navigation'

export type Activity = 'dashboard' | 'agents' | 'ide' | 'terminal' | 'pipeline' | 'settings'

interface ActivityBarProps {
  activeActivity: Activity
  onActivityChange: (activity: Activity) => void
}

const NAV_ITEMS: { id: Activity; icon: string; href: string; label: string }[] = [
  { id: 'dashboard', icon: '⊞', href: '/', label: 'Dashboard' },
  { id: 'agents',    icon: '◈', href: '#', label: 'Agents' },
  { id: 'ide',       icon: '</>', href: '/ide', label: 'IDE' },
  { id: 'terminal',  icon: '>_', href: '/terminal', label: 'Terminal' },
  { id: 'pipeline',  icon: '⋮⋮', href: '/pipeline', label: 'Pipeline' },
]

export function ActivityBar({ activeActivity, onActivityChange }: ActivityBarProps) {
  const router = useRouter()

  const handleClick = (id: Activity, href: string) => {
    onActivityChange(id)
    if (href !== '#') router.push(href)
  }

  return (
    <div className="w-12 shrink-0 flex flex-col bg-base-1 border-r border-white/[0.06]">
      {/* Logo */}
      <div className="h-12 flex items-center justify-center border-b border-white/[0.06] shrink-0">
        <div className="w-8 h-8 flex items-center justify-center bg-gold/10 rounded font-condensed font-bold text-gold text-sm leading-none select-none">
          LL
        </div>
      </div>

      {/* Nav icons */}
      <nav className="flex-1 flex flex-col items-center py-2 gap-0.5">
        {NAV_ITEMS.map(({ id, icon, href, label }) => {
          const isActive = activeActivity === id
          return (
            <button
              key={id}
              onClick={() => handleClick(id, href)}
              title={label}
              className={[
                'relative flex items-center justify-center font-mono text-sm transition-colors group',
                'w-12 h-11',
                isActive
                  ? 'text-blue bg-blue/10'
                  : 'text-text3 hover:text-text2 hover:bg-base-3',
              ].join(' ')}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue rounded-r" />
              )}
              <span className="leading-none">{icon}</span>
              {/* Tooltip */}
              <span className="absolute left-full ml-2 px-2 py-1 bg-base-4 border border-white/[0.08] text-text2 text-xs font-mono rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                {label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Settings — pinned to bottom */}
      <div className="flex items-center justify-center pb-3 shrink-0">
        <button
          onClick={() => handleClick('settings', '/settings')}
          title="Settings"
          className={[
            'relative flex items-center justify-center font-mono text-sm transition-colors group',
            'w-12 h-11',
            activeActivity === 'settings'
              ? 'text-blue bg-blue/10'
              : 'text-text3 hover:text-text2 hover:bg-base-3',
          ].join(' ')}
        >
          {activeActivity === 'settings' && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue rounded-r" />
          )}
          <span className="leading-none">⚙</span>
          <span className="absolute left-full ml-2 px-2 py-1 bg-base-4 border border-white/[0.08] text-text2 text-xs font-mono rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Settings
          </span>
        </button>
      </div>
    </div>
  )
}
