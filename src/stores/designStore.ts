import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DesignTokens, GradientLayer, GradientStop, ShadowLayer } from '@/lib/design-tokens'
import { DEFAULT_DESIGN, nanoid6, makeDefaultGradientLayers } from '@/lib/design-tokens'

interface DesignStore extends DesignTokens {
  set: (partial: Partial<DesignTokens>) => void
  reset: () => void
  syncFromTheme: (bgBase: string, primary: string, secondary: string, isDark: boolean) => void

  setGradientLayer: (id: string, patch: Partial<GradientLayer>) => void
  addGradientLayer: () => void
  removeGradientLayer: (id: string) => void
  setGradientStop: (layerId: string, stopId: string, patch: Partial<GradientStop>) => void
  addGradientStop: (layerId: string) => void
  removeGradientStop: (layerId: string, stopId: string) => void

  setShadowLayer: (id: string, patch: Partial<ShadowLayer>) => void
  addShadowLayer: () => void
  removeShadowLayer: (id: string) => void
}

export const useDesignStore = create<DesignStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_DESIGN,

      set: (partial) => set(partial),
      reset: () => set({ ...DEFAULT_DESIGN }),

      // Called by DesignProvider when theme changes and syncWithTheme=true
      syncFromTheme: (bgBase, primary, secondary, isDark) => {
        const { panelAlpha, cardAlpha, elevatedAlpha } = get()
        set({
          bgBase,
          gradientLayers: makeDefaultGradientLayers(primary, secondary),
          glassBorderHex: primary,
          borderHex: primary,
          glowHex: primary,
          statusBgHex: isDark ? darkenHex(bgBase, 0.4) : darkenHex(bgBase, 0.15),
        })
      },

      setGradientLayer: (id, patch) => set(s => ({
        gradientLayers: s.gradientLayers.map(l => l.id === id ? { ...l, ...patch } : l),
      })),
      addGradientLayer: () => set(s => ({
        gradientLayers: [
          ...s.gradientLayers,
          {
            id: nanoid6(), enabled: true, type: 'radial' as const,
            stops: [
              { id: nanoid6(), hex: '#3b82f6', alpha: 0.12, position: 0 },
              { id: nanoid6(), hex: '#000000', alpha: 0, position: 100 },
            ],
            posX: 50, posY: 50, sizeX: 50, sizeY: 50, angle: 0,
          },
        ],
      })),
      removeGradientLayer: (id) => set(s => ({ gradientLayers: s.gradientLayers.filter(l => l.id !== id) })),
      setGradientStop: (layerId, stopId, patch) => set(s => ({
        gradientLayers: s.gradientLayers.map(l => l.id === layerId
          ? { ...l, stops: l.stops.map(st => st.id === stopId ? { ...st, ...patch } : st) } : l
        ),
      })),
      addGradientStop: (layerId) => set(s => ({
        gradientLayers: s.gradientLayers.map(l => l.id === layerId
          ? { ...l, stops: [...l.stops, { id: nanoid6(), hex: '#ffffff', alpha: 0.10, position: 50 }] } : l
        ),
      })),
      removeGradientStop: (layerId, stopId) => set(s => ({
        gradientLayers: s.gradientLayers.map(l => l.id === layerId
          ? { ...l, stops: l.stops.filter(st => st.id !== stopId) } : l
        ),
      })),

      setShadowLayer: (id, patch) => set(s => ({
        shadowLayers: s.shadowLayers.map(l => l.id === id ? { ...l, ...patch } : l),
      })),
      addShadowLayer: () => set(s => ({
        shadowLayers: [
          ...s.shadowLayers,
          { id: nanoid6(), enabled: true, inset: false, x: 0, y: 8, blur: 16, spread: 0, hex: '#000000', alpha: 0.15 },
        ],
      })),
      removeShadowLayer: (id) => set(s => ({ shadowLayers: s.shadowLayers.filter(l => l.id !== id) })),
    }),
    { name: 'll-design-v2' }  // bumped version — clears stale localStorage
  )
)

// Local helper (not exported — keep design-tokens.ts clean)
function darkenHex(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0,2), 16)
  const g = parseInt(h.slice(2,4), 16)
  const b = parseInt(h.slice(4,6), 16)
  const c = (v: number) => Math.max(0, Math.round(v * (1 - amount)))
  return `#${[c(r),c(g),c(b)].map(x => x.toString(16).padStart(2,'0')).join('')}`
}
