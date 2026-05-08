'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'
import { useDesignStore } from '@/stores/designStore'
import { getTheme } from '@/lib/themes'
import { buildGradientCSS, buildShadowCSS, hexAlpha, lighten, darken } from '@/lib/design-tokens'

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const themeStore = useThemeStore()
  const d = useDesignStore()

  useEffect(() => {
    const theme = getTheme(themeStore.activeThemeId)
    const root = document.documentElement
    const isDark = ['dark', 'teal'].includes(theme.category)

    // ── 1. Base theme vars ──
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
    root.setAttribute('data-theme', themeStore.activeThemeId)
    root.setAttribute('data-mode', isDark ? 'dark' : 'light')

    // ── 2. Background ──
    root.style.setProperty('--t-body', d.bgBase)
    const gradient = buildGradientCSS(d.gradientLayers)
    const noiseUrl = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${d.noiseOpacity.toFixed(3)}'/%3E%3C/svg%3E")`
    document.body.style.backgroundColor = d.bgBase
    document.body.style.backgroundImage = [gradient !== 'none' ? gradient : '', noiseUrl].filter(Boolean).join(', ')
    document.body.style.backgroundAttachment = 'fixed'

    // ── 3. Accent colors ──
    const primary = d.overrideAccents ? d.primaryHex : theme.vars['--t-p'] ?? d.primaryHex
    const secondary = d.overrideAccents ? d.secondaryHex : theme.vars['--t-s'] ?? d.secondaryHex
    root.style.setProperty('--t-p', primary)
    root.style.setProperty('--t-p-dim', darken(primary, 0.25))
    root.style.setProperty('--t-p-bright', lighten(primary, 0.25))
    root.style.setProperty('--t-p-glow', hexAlpha(primary, d.glowEnabled ? d.glowIntensity : 0.15))
    root.style.setProperty('--t-p-glass', hexAlpha(primary, 0.09))
    root.style.setProperty('--t-s', secondary)
    root.style.setProperty('--t-gold', d.tertiaryHex)

    // Semantic
    root.style.setProperty('--d-success', d.successHex)
    root.style.setProperty('--d-warning', d.warningHex)
    root.style.setProperty('--d-error', d.errorHex)
    root.style.setProperty('--d-info', d.infoHex)

    // ── 4. Text colors ──
    if (d.overrideText) {
      root.style.setProperty('--t-tx1', d.text1Hex)
      root.style.setProperty('--t-tx2', d.text2Hex)
      root.style.setProperty('--t-tx3', d.text3Hex)
    }

    // ── 5. Surfaces ──
    root.style.setProperty('--t-panel', hexAlpha(d.panelHex, d.panelAlpha))
    root.style.setProperty('--d-card', hexAlpha(d.cardHex, d.cardAlpha))
    root.style.setProperty('--d-elevated', hexAlpha(d.elevatedHex, d.elevatedAlpha))

    // ── 6. Glass ──
    root.style.setProperty('--t-blur', `${d.glassBlur}px`)
    root.style.setProperty('--t-glass-bdr', hexAlpha(d.glassBorderHex, d.glassBorderAlpha))
    root.style.setProperty('--t-bdr', hexAlpha(d.borderHex, d.borderAlpha))
    root.style.setProperty('--t-bdr-s', hexAlpha(d.borderHex, d.borderAlpha * 2))

    // ── 7. Border radius ──
    const r = d.radiusBase
    root.style.setProperty('--d-radius-sm', `${Math.max(2, r * 0.5)}px`)
    root.style.setProperty('--d-radius-md', `${r}px`)
    root.style.setProperty('--d-radius-lg', `${r * 1.5}px`)
    root.style.setProperty('--d-radius-xl', `${r * 2.5}px`)
    root.style.setProperty('--d-radius-full', '9999px')

    // ── 8. Shadows ──
    const shadow = buildShadowCSS(
      d.shadowPreset, d.shadowLayers, 1,
      d.shadowLayers[0]?.hex ?? '#000000',
      d.shadowLayers[0]?.alpha ?? 0.25,
      d.innerHighlight, d.innerHighlightOpacity,
    )
    const shadowHover = buildShadowCSS(
      d.shadowPreset, d.shadowLayers, 1.6,
      d.shadowLayers[0]?.hex ?? '#000000',
      d.shadowLayers[0]?.alpha ?? 0.25,
      d.innerHighlight, d.innerHighlightOpacity,
    )
    root.style.setProperty('--t-shadow', shadow)
    root.style.setProperty('--t-shadow-hover', shadowHover)

    // ── 9. Glow ──
    const glowColor = d.glowFollowsPrimary ? primary : d.glowHex
    root.style.setProperty('--d-glow', d.glowEnabled ? hexAlpha(glowColor, d.glowIntensity) : 'transparent')
    root.style.setProperty('--d-glow-spread', `${d.glowSpread}px`)

    // ── 10. Status bar ──
    root.style.setProperty('--t-sb-bg', d.statusBgHex)
    root.style.setProperty('--t-sb-tx', d.statusTextHex)

    // ── 11. Motion ──
    root.style.setProperty('--d-transition', `${d.transitionMs}ms ease`)
    root.style.setProperty('--d-hover-lift', `translateY(-${d.hoverLiftPx}px)`)

    // ── 12. Typography ──
    root.style.setProperty('--font-sans', d.bodyFont)
    root.style.setProperty('--font-condensed', d.displayFont)
    root.style.setProperty('--font-mono', d.monoFont)
    root.style.setProperty('--d-font-size', `${d.baseFontSize}px`)

  }, [
    themeStore.activeThemeId,
    d.bgBase, d.gradientLayers, d.noiseOpacity,
    d.overrideAccents, d.primaryHex, d.secondaryHex, d.tertiaryHex,
    d.successHex, d.warningHex, d.errorHex, d.infoHex,
    d.overrideText, d.text1Hex, d.text2Hex, d.text3Hex,
    d.panelHex, d.panelAlpha, d.cardHex, d.cardAlpha, d.elevatedHex, d.elevatedAlpha,
    d.glassBlur, d.glassBorderHex, d.glassBorderAlpha, d.innerHighlight, d.innerHighlightOpacity,
    d.borderHex, d.borderAlpha, d.radiusBase,
    d.shadowPreset, d.shadowLayers,
    d.glowEnabled, d.glowIntensity, d.glowSpread, d.glowHex, d.glowFollowsPrimary,
    d.statusBgHex, d.statusTextHex,
    d.displayFont, d.bodyFont, d.monoFont, d.baseFontSize,
    d.transitionMs, d.hoverLiftPx, d.hoverGlow,
  ])

  return <>{children}</>
}
