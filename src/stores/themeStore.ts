import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_THEME_ID, type ThemeConfig, getTheme } from '@/lib/themes'

interface ThemeStore {
  activeThemeId: string
  glassBlur: number      // 8–32px
  glassOpacity: number   // 0.5–0.95
  panelOpacity: number   // 0.5–0.95
  setTheme: (id: string) => void
  setGlassBlur: (v: number) => void
  setGlassOpacity: (v: number) => void
  setPanelOpacity: (v: number) => void
  getActiveTheme: () => ThemeConfig
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      activeThemeId: DEFAULT_THEME_ID,
      glassBlur: 22,
      glassOpacity: 0.78,
      panelOpacity: 0.82,
      setTheme: (id) => set({ activeThemeId: id }),
      setGlassBlur: (v) => set({ glassBlur: v }),
      setGlassOpacity: (v) => set({ glassOpacity: v }),
      setPanelOpacity: (v) => set({ panelOpacity: v }),
      getActiveTheme: () => getTheme(get().activeThemeId),
    }),
    { name: 'll-theme' }
  )
)
