export interface GradientStop {
  id: string
  hex: string
  alpha: number
  position: number
}

export interface GradientLayer {
  id: string
  enabled: boolean
  type: 'radial' | 'linear' | 'conic'
  stops: GradientStop[]
  posX: number
  posY: number
  sizeX: number
  sizeY: number
  angle: number
}

export interface ShadowLayer {
  id: string
  enabled: boolean
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  hex: string
  alpha: number
}

export interface DesignTokens {
  // ── Background ──
  // When syncWithTheme=true, bgBase + gradientLayers auto-sync from the active theme.
  // When false, use the manually set values below.
  syncWithTheme: boolean
  bgBase: string
  gradientLayers: GradientLayer[]
  noiseOpacity: number

  // ── Accents ──
  overrideAccents: boolean
  primaryHex: string
  secondaryHex: string
  tertiaryHex: string

  // ── Semantic ──
  successHex: string
  warningHex: string
  errorHex: string
  infoHex: string

  // ── Text ──
  overrideText: boolean
  text1Hex: string
  text2Hex: string
  text3Hex: string

  // ── Surfaces ──
  // panelAlpha: 0 = fully transparent (see background), 1 = fully opaque
  // panelHex is auto-derived from bgBase when syncWithTheme=true
  panelAlpha: number
  cardAlpha: number
  elevatedAlpha: number

  // ── Glass ──
  glassBlur: number
  glassBorderHex: string
  glassBorderAlpha: number
  innerHighlight: boolean
  innerHighlightOpacity: number

  // ── Borders ──
  borderHex: string
  borderAlpha: number
  radiusBase: number

  // ── Shadows ──
  shadowLayers: ShadowLayer[]
  shadowPreset: 'none' | 'subtle' | 'soft' | 'raised' | 'floating' | 'dramatic' | 'custom'

  // ── Glow ──
  glowEnabled: boolean
  glowIntensity: number
  glowSpread: number
  glowHex: string
  glowFollowsPrimary: boolean

  // ── Status bar ──
  statusBgHex: string
  statusTextHex: string

  // ── Typography ──
  displayFont: string
  bodyFont: string
  monoFont: string
  baseFontSize: number

  // ── Motion ──
  transitionMs: number
  hoverLiftPx: number
  hoverGlow: boolean
}

// ── Utilities ──
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  if (h.length === 3) {
    return { r: parseInt(h[0]+h[0], 16), g: parseInt(h[1]+h[1], 16), b: parseInt(h[2]+h[2], 16) }
  }
  return { r: parseInt(h.slice(0,2), 16), g: parseInt(h.slice(2,4), 16), b: parseInt(h.slice(4,6), 16) }
}

export function hexAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, alpha)).toFixed(3)})`
}

export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const c = (v: number) => Math.min(255, Math.round(v + (255 - v) * amount))
  return `#${[c(r),c(g),c(b)].map(x => x.toString(16).padStart(2,'0')).join('')}`
}

export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const c = (v: number) => Math.max(0, Math.round(v * (1 - amount)))
  return `#${[c(r),c(g),c(b)].map(x => x.toString(16).padStart(2,'0')).join('')}`
}

// Slightly tint a hex toward white (light themes) or keep dark (dark themes)
export function derivePanelHex(bgBase: string, isDark: boolean): string {
  if (isDark) {
    // For dark themes: lighten the base just slightly so panels are visible above body
    return lighten(bgBase, 0.12)
  } else {
    // For light themes: panel is near-white
    return '#ffffff'
  }
}

export function buildGradientCSS(layers: GradientLayer[]): string {
  const parts = layers
    .filter(l => l.enabled && l.stops.length > 0)
    .map(l => {
      const stops = l.stops.map(s => `${hexAlpha(s.hex, s.alpha)} ${s.position}%`).join(', ')
      if (l.type === 'radial') return `radial-gradient(ellipse ${l.sizeX}% ${l.sizeY}% at ${l.posX}% ${l.posY}%, ${stops})`
      if (l.type === 'linear') return `linear-gradient(${l.angle}deg, ${stops})`
      if (l.type === 'conic') return `conic-gradient(from ${l.angle}deg at ${l.posX}% ${l.posY}%, ${stops})`
      return ''
    })
    .filter(Boolean)
  return parts.length ? parts.join(', ') : 'none'
}

export function buildShadowCSS(
  preset: DesignTokens['shadowPreset'],
  layers: ShadowLayer[],
  depth: number,
  hex: string,
  alpha: number,
  hl: boolean,
  hlOpacity: number,
): string {
  const highlight = hl ? `inset 0 1px 0 rgba(255,255,255,${hlOpacity.toFixed(2)})` : ''
  const d = depth
  const presets: Record<DesignTokens['shadowPreset'], string> = {
    none:     '',
    subtle:   `0 1px 2px ${hexAlpha(hex, 0.04*d)}, 0 2px 4px ${hexAlpha(hex, 0.04*d)}`,
    soft:     `0 2px 4px ${hexAlpha(hex, 0.04*d)}, 0 8px 16px ${hexAlpha(hex, 0.07*d)}, 0 16px 32px ${hexAlpha(hex, 0.04*d)}`,
    raised:   `0 4px 8px ${hexAlpha(hex, 0.07*d)}, 0 16px 32px ${hexAlpha(hex, 0.08*d)}, 0 32px 64px ${hexAlpha(hex, 0.06*d)}`,
    floating: `0 8px 16px ${hexAlpha(hex, 0.08*d)}, 0 24px 48px ${hexAlpha(hex, 0.10*d)}, 0 48px 96px ${hexAlpha(hex, 0.08*d)}`,
    dramatic: `0 16px 32px ${hexAlpha(hex, 0.12*d)}, 0 32px 64px ${hexAlpha(hex, 0.14*d)}, 0 64px 128px ${hexAlpha(hex, 0.12*d)}`,
    custom:   layers.filter(l => l.enabled).map(l => {
      const prefix = l.inset ? 'inset ' : ''
      return `${prefix}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${hexAlpha(l.hex, l.alpha)}`
    }).join(', '),
  }
  const shadow = presets[preset] || presets.soft
  return [highlight, shadow].filter(Boolean).join(', ')
}

export function nanoid6(): string {
  return Math.random().toString(36).slice(2, 8)
}

// Default gradient layers — defined as a function so each theme gets fresh copies
export function makeDefaultGradientLayers(primary: string, secondary: string): GradientLayer[] {
  return [
    {
      id: 'gl-1', enabled: true, type: 'radial',
      stops: [
        { id: 'gs-1a', hex: primary, alpha: 0.14, position: 0 },
        { id: 'gs-1b', hex: primary, alpha: 0, position: 100 },
      ],
      posX: 15, posY: 10, sizeX: 55, sizeY: 55, angle: 0,
    },
    {
      id: 'gl-2', enabled: true, type: 'radial',
      stops: [
        { id: 'gs-2a', hex: secondary, alpha: 0.10, position: 0 },
        { id: 'gs-2b', hex: secondary, alpha: 0, position: 100 },
      ],
      posX: 85, posY: 88, sizeX: 55, sizeY: 55, angle: 0,
    },
    {
      id: 'gl-3', enabled: false, type: 'radial',
      stops: [
        { id: 'gs-3a', hex: '#8b5cf6', alpha: 0.08, position: 0 },
        { id: 'gs-3b', hex: '#000000', alpha: 0, position: 100 },
      ],
      posX: 50, posY: 50, sizeX: 40, sizeY: 40, angle: 45,
    },
    {
      id: 'gl-4', enabled: false, type: 'linear',
      stops: [
        { id: 'gs-4a', hex: '#f59e0b', alpha: 0.06, position: 0 },
        { id: 'gs-4b', hex: '#000000', alpha: 0, position: 100 },
      ],
      posX: 50, posY: 50, sizeX: 50, sizeY: 50, angle: 135,
    },
  ]
}

export const DEFAULT_DESIGN: DesignTokens = {
  syncWithTheme: true,   // ← KEY: theme switches sync body color automatically
  bgBase: '#070e0b',
  gradientLayers: makeDefaultGradientLayers('#00c9a7', '#0ea5e9'),
  noiseOpacity: 0.022,

  overrideAccents: false,
  primaryHex: '#00c9a7',
  secondaryHex: '#0ea5e9',
  tertiaryHex: '#f59e0b',

  successHex: '#10b981',
  warningHex: '#f59e0b',
  errorHex: '#ef4444',
  infoHex: '#3b82f6',

  overrideText: false,
  text1Hex: '#e0f2ee',
  text2Hex: '#7ab5a8',
  text3Hex: '#3d6b62',

  // Panel alpha: 0.55 = nice glass transparency, background gradient shows through
  panelAlpha: 0.55,
  cardAlpha: 0.45,
  elevatedAlpha: 0.70,

  glassBlur: 22,
  glassBorderHex: '#00c9a7',
  glassBorderAlpha: 0.18,
  innerHighlight: true,
  innerHighlightOpacity: 0.08,

  borderHex: '#00c9a7',
  borderAlpha: 0.14,
  radiusBase: 10,

  shadowLayers: [
    { id: 'sl-1', enabled: true, inset: false, x: 0, y: 4, blur: 12, spread: 0, hex: '#000000', alpha: 0.25 },
    { id: 'sl-2', enabled: true, inset: false, x: 0, y: 16, blur: 40, spread: 0, hex: '#000000', alpha: 0.18 },
  ],
  shadowPreset: 'raised',

  glowEnabled: true,
  glowIntensity: 0.28,
  glowSpread: 12,
  glowHex: '#00c9a7',
  glowFollowsPrimary: true,

  statusBgHex: '#041008',
  statusTextHex: '#5fe3c8',

  displayFont: 'Barlow Condensed',
  bodyFont: 'Barlow',
  monoFont: 'JetBrains Mono',
  baseFontSize: 14,

  transitionMs: 200,
  hoverLiftPx: 2,
  hoverGlow: true,
}
