'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'
import { getTheme } from '@/lib/themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { activeThemeId, glassBlur, glassOpacity, panelOpacity } = useThemeStore()

  useEffect(() => {
    const theme = getTheme(activeThemeId)
    const root = document.documentElement

    // Apply theme CSS variables
    Object.entries(theme.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })

    // Apply glass overrides from sliders
    root.style.setProperty('--t-blur', `${glassBlur}px`)

    // Apply glass opacity to glass-bg
    const base = theme.vars['--t-bg'] ?? '#0a0b0f'
    // Parse hex to rgb for rgba
    const r = parseInt(base.slice(1, 3), 16)
    const g = parseInt(base.slice(3, 5), 16)
    const b = parseInt(base.slice(5, 7), 16)
    root.style.setProperty('--t-glass', `rgba(${r},${g},${b},${glassOpacity})`)
    root.style.setProperty('--t-panel-opacity', String(panelOpacity))

    // Set data-theme for any CSS selectors
    root.setAttribute('data-theme', activeThemeId)
  }, [activeThemeId, glassBlur, glassOpacity, panelOpacity])

  return <>{children}</>
}
