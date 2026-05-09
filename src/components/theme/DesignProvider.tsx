'use client'

import { useEffect, useRef } from 'react'
import { useThemeStore } from '@/stores/themeStore'
import { useDesignStore } from '@/stores/designStore'
import { getTheme } from '@/lib/themes'
import { buildGradientCSS, buildShadowCSS, hexAlpha, lighten, darken, derivePanelHex } from '@/lib/design-tokens'

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const { activeThemeId } = useThemeStore()
  const d = useDesignStore()
  const prevThemeId = useRef<string>('')

  useEffect(() => {
    const theme = getTheme(activeThemeId)
    const root = document.documentElement
    const isDark = ['dark', 'teal'].includes(theme.category)

    // ── 1. Theme base CSS vars ──
    Object.entries(theme.vars).forEach(([k,v]) => root.style.setProperty(k,v))
    root.setAttribute('data-theme', activeThemeId)
    root.setAttribute('data-mode', isDark ? 'dark' : 'light')

    // ── 2. Sync from theme on theme switch ──
    if (d.syncWithTheme && activeThemeId !== prevThemeId.current) {
      prevThemeId.current = activeThemeId
      const themeBody = theme.vars['--t-body'] ?? (isDark ? '#070e0b' : '#f8faff')
      const themePrimary = theme.vars['--t-p'] ?? '#3b82f6'
      const themeSecondary = theme.vars['--t-s'] ?? '#06b6d4'
      d.syncFromTheme(themeBody, themePrimary, themeSecondary, isDark)
      return
    }
    prevThemeId.current = activeThemeId

    // ── 3. Background ──
    document.body.style.backgroundColor = d.bgBase
    const gradient = buildGradientCSS(d.gradientLayers)
    const noiseUrl = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${d.noiseOpacity.toFixed(3)}'/%3E%3C/svg%3E")`
    document.body.style.backgroundImage = [gradient !== 'none' ? gradient : '', noiseUrl].filter(Boolean).join(', ')
    document.body.style.backgroundAttachment = 'fixed'
    root.style.setProperty('--t-body', d.bgBase)

    // ── 4. Compute surface fill hex per surface ──
    // If surfaceCustomColors = true: each surface uses its own independent hex
    // If false: all derive from bgBase + elevation (original behaviour)
    const derivedHex = derivePanelHex(d.bgBase, isDark, d.surfaceElevation)
    const S = (customHex: string, alpha: number) =>
      d.surfaceCustomColors
        ? hexAlpha(customHex, alpha)
        : hexAlpha(derivedHex, alpha)

    root.style.setProperty('--d-rail',     S(d.railHex,     d.railAlpha))
    root.style.setProperty('--d-explorer', S(d.explorerHex, d.explorerAlpha))
    root.style.setProperty('--d-topbar',   S(d.topbarHex,   d.topbarAlpha))
    root.style.setProperty('--d-tabbar',   S(d.tabbarHex,   d.tabbarAlpha))
    root.style.setProperty('--d-agent',    S(d.agentHex,    d.agentAlpha))
    root.style.setProperty('--d-panel',    S(d.contentHex,  d.panelAlpha))
    root.style.setProperty('--d-card',     S(d.cardHex,     d.cardAlpha))
    root.style.setProperty('--d-elevated', S(d.elevatedHex, d.elevatedAlpha))
    root.style.setProperty('--t-panel',    S(d.contentHex,  d.panelAlpha))  // legacy compat

    // ── 5. Accents ──
    const primary   = d.overrideAccents ? d.primaryHex   : (theme.vars['--t-p']??d.primaryHex)
    const secondary = d.overrideAccents ? d.secondaryHex : (theme.vars['--t-s']??d.secondaryHex)
    root.style.setProperty('--t-p',        primary)
    root.style.setProperty('--t-p-dim',    darken(primary, 0.25))
    root.style.setProperty('--t-p-bright', lighten(primary, 0.25))
    root.style.setProperty('--t-p-glow',   hexAlpha(primary, d.glowEnabled ? d.glowIntensity : 0.15))
    root.style.setProperty('--t-p-glass',  hexAlpha(primary, 0.09))
    root.style.setProperty('--t-s',        secondary)
    root.style.setProperty('--t-gold',     d.tertiaryHex)
    root.style.setProperty('--d-success',  d.successHex)
    root.style.setProperty('--d-warning',  d.warningHex)
    root.style.setProperty('--d-error',    d.errorHex)
    root.style.setProperty('--d-info',     d.infoHex)

    // ── 6. Text ──
    if (d.overrideText) {
      root.style.setProperty('--t-tx1', d.text1Hex)
      root.style.setProperty('--t-tx2', d.text2Hex)
      root.style.setProperty('--t-tx3', d.text3Hex)
    }

    // ── 7. Glass ──
    root.style.setProperty('--t-blur',      `${d.glassBlur}px`)
    root.style.setProperty('--t-glass-bdr', hexAlpha(d.glassBorderHex, d.glassBorderAlpha))
    root.style.setProperty('--t-bdr',       hexAlpha(d.borderHex, d.borderAlpha))
    root.style.setProperty('--t-bdr-s',     hexAlpha(d.borderHex, Math.min(1, d.borderAlpha*2)))

    // ── 8. Border radius ──
    const r = d.radiusBase
    root.style.setProperty('--d-radius-sm',   `${Math.max(2,r*0.5)}px`)
    root.style.setProperty('--d-radius-md',   `${r}px`)
    root.style.setProperty('--d-radius-lg',   `${r*1.5}px`)
    root.style.setProperty('--d-radius-xl',   `${r*2.5}px`)
    root.style.setProperty('--d-radius-full', '9999px')

    // ── 9. Shadows (includes glow when enabled) ──
    const sh = d.shadowLayers[0]?.hex ?? '#000000'
    const sa = d.shadowLayers[0]?.alpha ?? 0.25
    const glowColor = d.glowFollowsPrimary ? primary : d.glowHex
    const glowStr   = d.glowEnabled && d.hoverGlow
      ? `0 0 ${d.glowSpread}px ${hexAlpha(glowColor, d.glowIntensity)}`
      : ''

    const shadow      = buildShadowCSS(d.shadowPreset, d.shadowLayers, 1,   sh, sa, d.innerHighlight, d.innerHighlightOpacity)
    const shadowHover = buildShadowCSS(d.shadowPreset, d.shadowLayers, 1.6, sh, sa, d.innerHighlight, d.innerHighlightOpacity)
    root.style.setProperty('--t-shadow',       shadow)
    root.style.setProperty('--t-shadow-hover', [shadowHover, glowStr].filter(Boolean).join(', '))

    // Static glow var for elements that want ambient glow always-on
    root.style.setProperty('--d-glow',        d.glowEnabled ? hexAlpha(glowColor, d.glowIntensity) : 'transparent')
    root.style.setProperty('--d-glow-spread', `${d.glowSpread}px`)
    root.style.setProperty('--d-glow-full',   d.glowEnabled ? `0 0 ${d.glowSpread}px ${hexAlpha(glowColor, d.glowIntensity)}` : 'none')

    // ── 10. Status bar ──
    root.style.setProperty('--t-sb-bg', d.statusBgHex)
    root.style.setProperty('--t-sb-tx', d.statusTextHex)

    // ── 11. Motion — applied to ALL .glass-* elements via globals.css ──
    root.style.setProperty('--d-transition',  `${d.transitionMs}ms ease`)
    root.style.setProperty('--d-hover-lift',  `translateY(-${d.hoverLiftPx}px) scale(${d.hoverScale})`)
    root.style.setProperty('--d-hover-scale', `scale(${d.hoverScale})`)

    // ── 12. Typography ──
    root.style.setProperty('--font-sans',      d.bodyFont)
    root.style.setProperty('--font-condensed', d.displayFont)
    root.style.setProperty('--font-mono',      d.monoFont)
    root.style.setProperty('--d-font-size',    `${d.baseFontSize}px`)
    root.style.setProperty('--d-font-weight',  String(d.fontWeightBase))
    root.style.setProperty('--d-letter-spacing', `${d.letterSpacingBase}em`)
    // Apply to body directly
    document.body.style.fontFamily = `'${d.bodyFont}', sans-serif`
    document.body.style.fontSize   = `${d.baseFontSize}px`

  }, [
    activeThemeId, d.syncWithTheme,
    d.bgBase, d.gradientLayers, d.noiseOpacity,
    d.surfaceCustomColors, d.surfaceElevation,
    d.railHex, d.explorerHex, d.topbarHex, d.tabbarHex,
    d.agentHex, d.contentHex, d.cardHex, d.elevatedHex,
    d.railAlpha, d.explorerAlpha, d.topbarAlpha, d.tabbarAlpha,
    d.agentAlpha, d.panelAlpha, d.cardAlpha, d.elevatedAlpha,
    d.overrideAccents, d.primaryHex, d.secondaryHex, d.tertiaryHex,
    d.successHex, d.warningHex, d.errorHex, d.infoHex,
    d.overrideText, d.text1Hex, d.text2Hex, d.text3Hex,
    d.glassBlur, d.glassBorderHex, d.glassBorderAlpha, d.innerHighlight, d.innerHighlightOpacity,
    d.borderHex, d.borderAlpha, d.radiusBase,
    d.shadowPreset, d.shadowLayers,
    d.glowEnabled, d.glowIntensity, d.glowSpread, d.glowHex, d.glowFollowsPrimary,
    d.statusBgHex, d.statusTextHex,
    d.displayFont, d.bodyFont, d.monoFont, d.baseFontSize, d.fontWeightBase, d.letterSpacingBase,
    d.transitionMs, d.hoverLiftPx, d.hoverGlow, d.hoverScale,
  ])

  return <>{children}</>
}
