import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_THEME_ID, type ThemeConfig, getTheme } from '@/lib/themes'

interface ThemeStore {
  activeThemeId: string
  glassBlur: number
  glassOpacity: number
  borderOpacity: number
  shadowDepth: number
  gradientIntensity: number
  innerHighlight: boolean
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
      glassOpacity: 0.88,
      borderOpacity: 0.65,
      shadowDepth: 1.2,
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
    { name: 'll-theme-v3' }
  )
)
