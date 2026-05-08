import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DesignTokens, GradientLayer, GradientStop, ShadowLayer } from '@/lib/design-tokens'
import { DEFAULT_DESIGN, nanoid6 } from '@/lib/design-tokens'

interface DesignStore extends DesignTokens {
  // Setters — top level
  set: (partial: Partial<DesignTokens>) => void
  reset: () => void

  // Gradient layer actions
  setGradientLayer: (id: string, patch: Partial<GradientLayer>) => void
  addGradientLayer: () => void
  removeGradientLayer: (id: string) => void
  setGradientStop: (layerId: string, stopId: string, patch: Partial<GradientStop>) => void
  addGradientStop: (layerId: string) => void
  removeGradientStop: (layerId: string, stopId: string) => void

  // Shadow layer actions
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

      setGradientLayer: (id, patch) => set(s => ({
        gradientLayers: s.gradientLayers.map(l => l.id === id ? { ...l, ...patch } : l),
      })),

      addGradientLayer: () => set(s => ({
        gradientLayers: [
          ...s.gradientLayers,
          {
            id: nanoid6(),
            enabled: true,
            type: 'radial' as const,
            stops: [
              { id: nanoid6(), hex: '#3b82f6', alpha: 0.10, position: 0 },
              { id: nanoid6(), hex: '#000000', alpha: 0, position: 100 },
            ],
            posX: 50, posY: 50, sizeX: 50, sizeY: 50, angle: 0,
          },
        ],
      })),

      removeGradientLayer: (id) => set(s => ({
        gradientLayers: s.gradientLayers.filter(l => l.id !== id),
      })),

      setGradientStop: (layerId, stopId, patch) => set(s => ({
        gradientLayers: s.gradientLayers.map(l => l.id === layerId
          ? { ...l, stops: l.stops.map(st => st.id === stopId ? { ...st, ...patch } : st) }
          : l
        ),
      })),

      addGradientStop: (layerId) => set(s => ({
        gradientLayers: s.gradientLayers.map(l => l.id === layerId
          ? { ...l, stops: [...l.stops, { id: nanoid6(), hex: '#ffffff', alpha: 0.10, position: 50 }] }
          : l
        ),
      })),

      removeGradientStop: (layerId, stopId) => set(s => ({
        gradientLayers: s.gradientLayers.map(l => l.id === layerId
          ? { ...l, stops: l.stops.filter(st => st.id !== stopId) }
          : l
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

      removeShadowLayer: (id) => set(s => ({
        shadowLayers: s.shadowLayers.filter(l => l.id !== id),
      })),
    }),
    { name: 'll-design-v1' }
  )
)
