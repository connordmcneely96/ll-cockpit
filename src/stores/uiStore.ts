'use client'

import { create } from 'zustand'

interface UiState {
  commandPaletteOpen: boolean
  sidebarCollapsed: boolean
  totalSessionTokens: number
  totalSessionCost: number
  selectedAgent: string | null
  currentWorkspace: string
  workspaces: string[]
  setWorkspace: (ws: string) => void

  // Model routing tier — controls which D1 routing table is used per request.
  // 'standard' = cost-optimised winners (Nano/V4 Flash/GPT-4.1 Mini/Qwen3)
  // 'premium'  = quality-dominant winners (GPT-4.1/Gemini 2.5 Flash/Opus 4.8)
  qualityTier: 'standard' | 'premium'
  setQualityTier: (tier: 'standard' | 'premium') => void

  openCommandPalette: () => void
  closeCommandPalette: () => void
  toggleSidebar: () => void
  addGlobalTokens: (tokens: number, cost: number) => void
  setSelectedAgent: (name: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  commandPaletteOpen: false,
  sidebarCollapsed: false,
  totalSessionTokens: 0,
  totalSessionCost: 0,
  selectedAgent: null,
  currentWorkspace: 'NEXUS PRIME',
  workspaces: ['NEXUS PRIME'],
  qualityTier: 'standard',

  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  addGlobalTokens: (tokens, cost) =>
    set((state) => ({
      totalSessionTokens: state.totalSessionTokens + tokens,
      totalSessionCost: state.totalSessionCost + cost,
    })),
  setSelectedAgent: (name) => set({ selectedAgent: name }),
  setWorkspace: (ws) => set({ currentWorkspace: ws }),
  setQualityTier: (tier) => set({ qualityTier: tier }),
}))
