'use client'

import { useState, useRef, useEffect } from 'react'
import { THEMES } from '@/lib/themes'
import { useThemeStore } from '@/stores/themeStore'

const DARK_FIRST = [
  ...THEMES.filter(t => ['dark', 'teal'].includes(t.category)),
  ...THEMES.filter(t => !['dark', 'teal'].includes(t.category)),
]

export default function ThemeSwitcher() {
  const { activeThemeId, setTheme } = useThemeStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = THEMES.find(t => t.id === activeThemeId) ?? THEMES[0]

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs"
        style={{
          height: 28,
          paddingInline: '0.6rem',
          borderRadius: 'var(--d-radius-md)',
          border: '1px solid var(--t-glass-bdr)',
          background: 'var(--t-p-glass)',
          color: 'var(--t-tx2)',
          cursor: 'pointer',
          transition: 'background var(--d-transition)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--t-p) 14%, transparent)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--t-p-glass)')}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: active.preview.primary,
            boxShadow: `0 0 5px ${active.preview.primary}`,
            flexShrink: 0,
          }}
        />
        {active.name}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: 200,
            maxHeight: 320,
            overflowY: 'auto',
            zIndex: 100,
            borderRadius: 'var(--d-radius-lg)',
            border: '1px solid var(--t-glass-bdr)',
            padding: '0.25rem',
          }}
        >
          {DARK_FIRST.map(theme => {
            const isActive = theme.id === activeThemeId
            return (
              <button
                key={theme.id}
                onClick={() => { setTheme(theme.id); setOpen(false) }}
                className="flex items-center gap-2 w-full text-xs text-left"
                style={{
                  padding: '0.45rem 0.6rem',
                  borderRadius: 'var(--d-radius-md)',
                  background: isActive ? 'color-mix(in srgb, var(--t-p) 12%, transparent)' : 'transparent',
                  color: isActive ? 'var(--t-tx1)' : 'var(--t-tx2)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background var(--d-transition)',
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--t-p) 6%, transparent)'
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: theme.preview.primary,
                    flexShrink: 0,
                    boxShadow: isActive ? `0 0 5px ${theme.preview.primary}` : undefined,
                  }}
                />
                <span style={{ flex: 1 }}>{theme.name}</span>
                {isActive && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--t-p)" strokeWidth="3">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
