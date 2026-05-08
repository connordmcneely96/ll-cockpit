// ── Types ──
export interface GradientStop {
  id: string
  hex: string    // '#00c9a7'
  alpha: number  // 0–1
  position: number // 0–100
}

export interface GradientLayer {
  id: string
  enabled: boolean
  type: 'radial' | 'linear' | 'conic'
  stops: GradientStop[]
  posX: number    // radial: 0–100
  posY: number
  sizeX: number   // radial: 0–200%
  sizeY: number
  angle: number   // linear/conic: 0–360°
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
  // Background
  bgBase: string
  gradientLayers: GradientLayer[]
  noiseOpacity: number

  // Accents (override theme)
  overrideAccents: boolean
  primaryHex: string
  secondaryHex: string
  tertiaryHex: string

  // Semantic
  successHex: string
  warningHex: string
  errorHex: string
  infoHex: string

  // Text
  overrideText: boolean
  text1Hex: string
  text2Hex: string
  text3Hex: string

  // Surfaces
  panelHex: string
  panelAlpha: number
  cardHex: string
  cardAlpha: number
  elevatedHex: string
  elevatedAlpha: number

  // Glass
  glassBlur: number
  glassBorderHex: string
  glassBorderAlpha: number
  innerHighlight: boolean
  innerHighlightOpacity: number

  // Borders
  borderHex: string
  borderAlpha: number
  radiusBase: number  // 0–24px (sm = x0.5, lg = x2, xl = x3)

  // Shadows (custom layers)
  shadowLayers: ShadowLayer[]
  shadowPreset: 'none' | 'subtle' | 'soft' | 'raised' | 'floating' | 'dramatic' | 'custom'

  // Glow
  glowEnabled: boolean
  glowIntensity: number // 0–1
  glowSpread: number    // 0–40
  glowHex: string
  glowFollowsPrimary: boolean

  // Status bar
  statusBgHex: string
  statusTextHex: string

  // Typography
  displayFont: string
  bodyFont: string
  monoFont: string
  baseFontSize: number // 12–16

  // Motion
  transitionMs: number  // 100–600
  hoverLiftPx: number   // 0–6
  hoverGlow: boolean
}

// ── Utilities ──
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  if (h.length === 3) {
    return {
      r: parseInt(h[0]+h[0], 16),
      g: parseInt(h[1]+h[1], 16),
      b: parseInt(h[2]+h[2], 16),
    }
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

export function hexAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`
}

export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const clamp = (v: number) => Math.min(255, Math.round(v + (255 - v) * amount))
  return `#${[clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('')}`
}

export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const clamp = (v: number) => Math.max(0, Math.round(v * (1 - amount)))
  return `#${[clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('')}`
}

export function buildGradientCSS(layers: GradientLayer[]): string {
  const parts = layers
    .filter(l => l.enabled && l.stops.length > 0)
    .map(l => {
      const stops = l.stops
        .map(s => `${hexAlpha(s.hex, s.alpha)} ${s.position}%`)
        .join(', ')
      if (l.type === 'radial') {
        return `radial-gradient(ellipse ${l.sizeX}% ${l.sizeY}% at ${l.posX}% ${l.posY}%, ${stops})`
      }
      if (l.type === 'linear') {
        return `linear-gradient(${l.angle}deg, ${stops})`
      }
      if (l.type === 'conic') {
        return `conic-gradient(from ${l.angle}deg at ${l.posX}% ${l.posY}%, ${stops})`
      }
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
  const c = hexAlpha(hex, alpha)
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

// ── Defaults ──
export const DEFAULT_DESIGN: DesignTokens = {
  bgBase: '#070e0b',
  gradientLayers: [
    {
      id: 'gl-1',
      enabled: true,
      type: 'radial',
      stops: [
        { id: 'gs-1a', hex: '#00c9a7', alpha: 0.12, position: 0 },
        { id: 'gs-1b', hex: '#070e0b', alpha: 0, position: 100 },
      ],
      posX: 15, posY: 10, sizeX: 50, sizeY: 50, angle: 0,
    },
    {
      id: 'gl-2',
      enabled: true,
      type: 'radial',
      stops: [
        { id: 'gs-2a', hex: '#0ea5e9', alpha: 0.08, position: 0 },
        { id: 'gs-2b', hex: '#070e0b', alpha: 0, position: 100 },
      ],
      posX: 85, posY: 90, sizeX: 50, sizeY: 50, angle: 0,
    },
    { id: 'gl-3', enabled: false, type: 'radial', stops: [{ id: 'gs-3a', hex: '#8b5cf6', alpha: 0.08, position: 0 }, { id: 'gs-3b', hex: '#070e0b', alpha: 0, position: 100 }], posX: 50, posY: 50, sizeX: 40, sizeY: 40, angle: 45 },
    { id: 'gl-4', enabled: false, type: 'linear', stops: [{ id: 'gs-4a', hex: '#f59e0b', alpha: 0.06, position: 0 }, { id: 'gs-4b', hex: '#070e0b', alpha: 0, position: 100 }], posX: 50, posY: 50, sizeX: 50, sizeY: 50, angle: 135 },
  ],
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

  panelHex: '#0a1410',
  panelAlpha: 0.88,
  cardHex: '#0a1410',
  cardAlpha: 0.70,
  elevatedHex: '#ffffff',
  elevatedAlpha: 0.06,

  glassBlur: 22,
  glassBorderHex: '#00c9a7',
  glassBorderAlpha: 0.14,
  innerHighlight: true,
  innerHighlightOpacity: 0.08,

  borderHex: '#00c9a7',
  borderAlpha: 0.12,
  radiusBase: 10,

  shadowLayers: [
    { id: 'sl-1', enabled: true, inset: false, x: 0, y: 4, blur: 12, spread: 0, hex: '#000000', alpha: 0.25 },
    { id: 'sl-2', enabled: true, inset: false, x: 0, y: 16, blur: 40, spread: 0, hex: '#000000', alpha: 0.20 },
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

export function nanoid6(): string {
  return Math.random().toString(36).slice(2, 8)
}
