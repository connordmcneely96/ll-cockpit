'use client'

import { create } from 'zustand'

interface UiState {
  commandPaletteOpen: boolean
  sidebarCollapsed: boolean
  totalSessionTokens: number
  totalSessionCost: number

  openCommandPalette: () => void
  closeCommandPalette: () => void
  toggleSidebar: () => void
  addGlobalTokens: (tokens: number, cost: number) => void
}

export const useUiStore = create<UiState>((set) => ({
  commandPaletteOpen: false,
  sidebarCollapsed: false,
  totalSessionTokens: 0,
  totalSessionCost: 0,

  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  addGlobalTokens: (tokens, cost) =>
    set((state) => ({
      totalSessionTokens: state.totalSessionTokens + tokens,
      totalSessionCost: state.totalSessionCost + cost,
    })),
}))
