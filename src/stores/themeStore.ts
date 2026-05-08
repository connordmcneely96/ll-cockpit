import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_THEME_ID, type ThemeConfig, getTheme } from '@/lib/themes'

interface ThemeStore {
  activeThemeId: string
  // Granular glass controls
  glassBlur: number         // 0–40px
  glassOpacity: number      // 0.40–1.00 (panel glass opacity)
  borderOpacity: number     // 0.20–1.00 (glass border visibility)
  shadowDepth: number       // 0–2.00 (shadow multiplier)
  gradientIntensity: number // 0–2.00 (bg gradient multiplier)
  innerHighlight: boolean   // top-edge specular highlight
  setTheme: (id: string) => void
  setGlassBlur: (v: number) => void
  setGlassOpacity: (v: number) => void
  setBorderOpacity: (v: number) => void
  setShadowDepth: (v: number) => void
  setGradientIntensity: (v: number) => void
  setInnerHighlight: (v: boolean) => void
  getActiveTheme: () => ThemeConfig
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      activeThemeId: DEFAULT_THEME_ID,
      glassBlur: 22,
      glassOpacity: 0.80,
      borderOpacity: 0.70,
      shadowDepth: 1.0,
      gradientIntensity: 1.0,
      innerHighlight: true,
      setTheme: (id) => set({ activeThemeId: id }),
      setGlassBlur: (v) => set({ glassBlur: v }),
      setGlassOpacity: (v) => set({ glassOpacity: v }),
      setBorderOpacity: (v) => set({ borderOpacity: v }),
      setShadowDepth: (v) => set({ shadowDepth: v }),
      setGradientIntensity: (v) => set({ gradientIntensity: v }),
      setInnerHighlight: (v) => set({ innerHighlight: v }),
      getActiveTheme: () => getTheme(get().activeThemeId),
    }),
    { name: 'll-theme-v2' }
  )
)
