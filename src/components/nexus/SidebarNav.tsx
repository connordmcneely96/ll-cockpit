import type { NavGroup } from './mock'

interface Props {
  navGroups: NavGroup[]
  currentPath?: string
}

export default function SidebarNav({ navGroups, currentPath = '/nexus' }: Props) {
  return (
    <aside
      className="glass-panel flex flex-col h-full overflow-y-auto"
      style={{ width: 240, borderRight: '1px solid var(--t-glass-bdr)', borderLeft: 'none' }}
    >
      {/* Brand */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
        <div
          className="text-sm font-bold tracking-wide"
          style={{
            fontFamily: 'var(--font-condensed), sans-serif',
            fontWeight: 700,
            color: 'var(--t-tx1)',
            letterSpacing: '0.04em',
          }}
        >
          NEXUS PRIME
        </div>
        <div
          className="text-xs mt-0.5"
          style={{ color: 'var(--t-tx3)', letterSpacing: '0.12em' }}
        >
          AI OPERATING SYSTEM
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-4">
        {navGroups.map(group => (
          <div key={group.id}>
            <div
              className="px-2 mb-1 text-xs font-semibold uppercase"
              style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}
            >
              {group.label}
            </div>
            <ul className="flex flex-col gap-0.5">
              {group.items.map(item => {
                const isActive = item.active || item.href === currentPath
                return (
                  <li key={item.id}>
                    <a
                      href={item.href}
                      className="flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all"
                      style={{
                        borderRadius: 'var(--d-radius-sm)',
                        transition: 'all var(--d-transition)',
                        background: isActive ? 'var(--t-p-glass)' : 'transparent',
                        color: isActive ? 'var(--t-p)' : 'var(--t-tx2)',
                        fontWeight: isActive ? 500 : 400,
                        border: isActive ? '1px solid var(--t-p)' : '1px solid transparent',
                      }}
                    >
                      {isActive && (
                        <span
                          className="inline-block rounded-full shrink-0"
                          style={{ width: 5, height: 5, background: 'var(--t-p)' }}
                        />
                      )}
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
