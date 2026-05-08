'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'
import { getTheme } from '@/lib/themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const {
    activeThemeId, glassBlur, glassOpacity, borderOpacity,
    shadowDepth, gradientIntensity, innerHighlight,
  } = useThemeStore()

  useEffect(() => {
    const theme = getTheme(activeThemeId)
    const root = document.documentElement
    const isDark = theme.category === 'dark'

    // 1. Apply all theme base vars
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))

    // 2. Glass blur
    root.style.setProperty('--t-blur', `${glassBlur}px`)

    // 3. Panel glass background
    if (isDark) {
      root.style.setProperty('--t-panel', `rgba(16,16,20,${glassOpacity})`)
    } else {
      root.style.setProperty('--t-panel', `rgba(255,255,255,${glassOpacity})`)
    }

    // 4. Glass border
    if (isDark) {
      root.style.setProperty('--t-glass-bdr', `rgba(255,255,255,${borderOpacity * 0.12})`)
    } else {
      root.style.setProperty('--t-glass-bdr', `rgba(255,255,255,${borderOpacity})`)
    }

    // 5. Gradient intensity - scale the g1/g2 opacity
    // We re-parse and scale them
    const g1Base = theme.vars['--t-g1'] ?? 'rgba(99,102,241,0.10)'
    const g2Base = theme.vars['--t-g2'] ?? 'rgba(139,92,246,0.07)'
    const scaleAlpha = (rgba: string, mult: number) => {
      const match = rgba.match(/rgba?\(([^)]+)\)/)
      if (!match) return rgba
      const parts = match[1].split(',').map(s => s.trim())
      if (parts.length === 4) {
        const alpha = Math.min(1, parseFloat(parts[3]) * mult)
        return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha.toFixed(3)})`
      }
      return rgba
    }
    root.style.setProperty('--t-g1', scaleAlpha(g1Base, gradientIntensity))
    root.style.setProperty('--t-g2', scaleAlpha(g2Base, gradientIntensity))

    // 6. 3D shadow string
    const s = shadowDepth
    const hl = innerHighlight ? `inset 0 1px 0 rgba(255,255,255,${isDark ? 0.10 : 0.90}),` : ''
    const shadow = isDark
      ? `${hl} 0 1px 2px rgba(0,0,0,${(0.30 * s).toFixed(2)}), 0 4px 12px rgba(0,0,0,${(0.25 * s).toFixed(2)}), 0 16px 40px rgba(0,0,0,${(0.20 * s).toFixed(2)})`
      : `${hl} 0 1px 2px rgba(0,0,0,${(0.04 * s).toFixed(3)}), 0 4px 12px rgba(0,0,0,${(0.08 * s).toFixed(3)}), 0 16px 40px rgba(0,0,0,${(0.06 * s).toFixed(3)})`
    root.style.setProperty('--t-shadow', shadow)

    // 7. Hover shadow (stronger)
    const hoverShadow = isDark
      ? `${hl} 0 2px 4px rgba(0,0,0,${(0.40 * s).toFixed(2)}), 0 8px 24px rgba(0,0,0,${(0.35 * s).toFixed(2)}), 0 32px 64px rgba(0,0,0,${(0.28 * s).toFixed(2)})`
      : `${hl} 0 2px 4px rgba(0,0,0,${(0.06 * s).toFixed(3)}), 0 8px 24px rgba(0,0,0,${(0.12 * s).toFixed(3)}), 0 32px 64px rgba(0,0,0,${(0.08 * s).toFixed(3)})`
    root.style.setProperty('--t-shadow-hover', hoverShadow)

    // 8. data-theme attribute
    root.setAttribute('data-theme', activeThemeId)
    root.setAttribute('data-mode', isDark ? 'dark' : 'light')
  }, [activeThemeId, glassBlur, glassOpacity, borderOpacity, shadowDepth, gradientIntensity, innerHighlight])

  return <>{children}</>
}
