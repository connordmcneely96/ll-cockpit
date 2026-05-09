import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DesignTokens, GradientLayer, GradientStop, ShadowLayer } from '@/lib/design-tokens'
import { DEFAULT_DESIGN, nanoid6, makeDefaultGradientLayers, lighten, derivePanelHex } from '@/lib/design-tokens'

function darkenHex(hex: string, amount: number): string {
  const h = hex.replace('#','')
  const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16)
  const c=(v:number)=>Math.max(0,Math.round(v*(1-amount)))
  return `#${[c(r),c(g),c(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}`
}

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
    (set) => ({
      ...DEFAULT_DESIGN,
      set: (partial) => set(partial),
      reset: () => set({ ...DEFAULT_DESIGN }),

      // Called when theme changes + syncWithTheme = true
      // Updates body color, gradients, borders, glow, AND custom surface hex defaults
      syncFromTheme: (bgBase, primary, secondary, isDark) => {
        const panelHex = derivePanelHex(bgBase, isDark, 0.30)
        set({
          bgBase,
          gradientLayers: makeDefaultGradientLayers(primary, secondary),
          glassBorderHex: primary,
          borderHex: primary,
          glowHex: primary,
          statusBgHex: isDark ? darkenHex(bgBase, 0.4) : darkenHex(bgBase, 0.15),
          statusTextHex: isDark ? primary : darkenHex(primary, 0.2),
          // Update custom surface colors to match new theme so they're ready if user enables custom mode
          railHex:     panelHex,
          explorerHex: panelHex,
          topbarHex:   panelHex,
          tabbarHex:   panelHex,
          agentHex:    panelHex,
          contentHex:  panelHex,
          cardHex:     panelHex,
          elevatedHex: lighten(panelHex, 0.15),
        })
      },

      setGradientLayer: (id,patch) => set(s=>({gradientLayers:s.gradientLayers.map(l=>l.id===id?{...l,...patch}:l)})),
      addGradientLayer: () => set(s=>({
        gradientLayers:[...s.gradientLayers,{
          id:nanoid6(),enabled:true,type:'radial' as const,
          stops:[{id:nanoid6(),hex:'#3b82f6',alpha:0.12,position:0},{id:nanoid6(),hex:'#000000',alpha:0,position:100}],
          posX:50,posY:50,sizeX:50,sizeY:50,angle:0,
        }],
      })),
      removeGradientLayer: (id) => set(s=>({gradientLayers:s.gradientLayers.filter(l=>l.id!==id)})),
      setGradientStop: (layerId,stopId,patch) => set(s=>({
        gradientLayers:s.gradientLayers.map(l=>l.id===layerId?{...l,stops:l.stops.map(st=>st.id===stopId?{...st,...patch}:st)}:l),
      })),
      addGradientStop: (layerId) => set(s=>({
        gradientLayers:s.gradientLayers.map(l=>l.id===layerId?{...l,stops:[...l.stops,{id:nanoid6(),hex:'#ffffff',alpha:0.10,position:50}]}:l),
      })),
      removeGradientStop: (layerId,stopId) => set(s=>({
        gradientLayers:s.gradientLayers.map(l=>l.id===layerId?{...l,stops:l.stops.filter(st=>st.id!==stopId)}:l),
      })),
      setShadowLayer: (id,patch) => set(s=>({shadowLayers:s.shadowLayers.map(l=>l.id===id?{...l,...patch}:l)})),
      addShadowLayer: () => set(s=>({shadowLayers:[...s.shadowLayers,{id:nanoid6(),enabled:true,inset:false,x:0,y:8,blur:16,spread:0,hex:'#000000',alpha:0.15}]})),
      removeShadowLayer: (id) => set(s=>({shadowLayers:s.shadowLayers.filter(l=>l.id!==id)})),
    }),
    { name: 'll-design-v4' }  // bumped — clears stale v3
  )
)
