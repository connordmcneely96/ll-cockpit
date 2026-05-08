export interface ThemeConfig {
  id: string
  name: string
  description: string
  category: 'dark' | 'glass' | 'neon' | 'minimal'
  preview: {
    bg: string
    panel: string
    primary: string
    secondary: string
    text: string
    statusBar: string
  }
  vars: Record<string, string>
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy · electric blue',
    category: 'dark',
    preview: { bg: '#0a0b0f', panel: '#0d0f1a', primary: '#3b82f6', secondary: '#06b6d4', text: '#e2e8f0', statusBar: '#1a2a4a' },
    vars: {
      '--t-bg':    '#0a0b0f', '--t-bg1': '#0d0f1a', '--t-bg2': '#111320', '--t-bg3': '#161928', '--t-bg4': '#1c2035', '--t-bg5': '#232840',
      '--t-p':     '#3b82f6', '--t-p-dim': '#1d4ed8', '--t-p-bright': '#60a5fa', '--t-p-glow': 'rgba(59,130,246,0.22)', '--t-p-glass': 'rgba(59,130,246,0.09)',
      '--t-s':     '#06b6d4', '--t-gold': '#f5c842',
      '--t-tx1':   '#e2e8f0', '--t-tx2': '#94a3b8', '--t-tx3': '#4b5563',
      '--t-bdr':   'rgba(255,255,255,0.06)', '--t-bdr-s': 'rgba(255,255,255,0.12)',
      '--t-glass': 'rgba(11,13,22,0.78)', '--t-glass-bdr': 'rgba(59,130,246,0.14)',
      '--t-sb-bg': '#172038', '--t-sb-tx': '#93c5fd',
      '--t-g1':    'rgba(59,130,246,0.07)', '--t-g2': 'rgba(6,182,212,0.04)',
      '--t-blur':  '22px',
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Pure black · indigo glass',
    category: 'glass',
    preview: { bg: '#080808', panel: '#101010', primary: '#818cf8', secondary: '#c084fc', text: '#f1f5f9', statusBar: '#1e1b4b' },
    vars: {
      '--t-bg':    '#080808', '--t-bg1': '#0e0e0e', '--t-bg2': '#141414', '--t-bg3': '#1a1a1a', '--t-bg4': '#202020', '--t-bg5': '#282828',
      '--t-p':     '#818cf8', '--t-p-dim': '#6366f1', '--t-p-bright': '#a5b4fc', '--t-p-glow': 'rgba(129,140,248,0.22)', '--t-p-glass': 'rgba(129,140,248,0.08)',
      '--t-s':     '#c084fc', '--t-gold': '#fbbf24',
      '--t-tx1':   '#f1f5f9', '--t-tx2': '#94a3b8', '--t-tx3': '#475569',
      '--t-bdr':   'rgba(255,255,255,0.07)', '--t-bdr-s': 'rgba(255,255,255,0.14)',
      '--t-glass': 'rgba(8,8,8,0.82)', '--t-glass-bdr': 'rgba(129,140,248,0.15)',
      '--t-sb-bg': '#1e1b4b', '--t-sb-tx': '#a5b4fc',
      '--t-g1':    'rgba(129,140,248,0.06)', '--t-g2': 'rgba(192,132,252,0.04)',
      '--t-blur':  '28px',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Deep purple · violet shimmer',
    category: 'glass',
    preview: { bg: '#05020f', panel: '#0d0720', primary: '#a78bfa', secondary: '#ec4899', text: '#ede9fe', statusBar: '#2e1065' },
    vars: {
      '--t-bg':    '#05020f', '--t-bg1': '#0d0720', '--t-bg2': '#120b2a', '--t-bg3': '#180f38', '--t-bg4': '#1f1448', '--t-bg5': '#271a5a',
      '--t-p':     '#a78bfa', '--t-p-dim': '#7c3aed', '--t-p-bright': '#c4b5fd', '--t-p-glow': 'rgba(167,139,250,0.24)', '--t-p-glass': 'rgba(167,139,250,0.09)',
      '--t-s':     '#ec4899', '--t-gold': '#fbbf24',
      '--t-tx1':   '#ede9fe', '--t-tx2': '#a78bfa', '--t-tx3': '#6d28d9',
      '--t-bdr':   'rgba(167,139,250,0.12)', '--t-bdr-s': 'rgba(167,139,250,0.22)',
      '--t-glass': 'rgba(5,2,15,0.80)', '--t-glass-bdr': 'rgba(167,139,250,0.18)',
      '--t-sb-bg': '#2e1065', '--t-sb-tx': '#c4b5fd',
      '--t-g1':    'rgba(167,139,250,0.08)', '--t-g2': 'rgba(236,72,153,0.05)',
      '--t-blur':  '26px',
    },
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    description: '80s neon · fuchsia pulse',
    category: 'neon',
    preview: { bg: '#0a0010', panel: '#12001f', primary: '#e879f9', secondary: '#818cf8', text: '#fdf4ff', statusBar: '#3b0764' },
    vars: {
      '--t-bg':    '#0a0010', '--t-bg1': '#12001f', '--t-bg2': '#180030', '--t-bg3': '#20003f', '--t-bg4': '#28004f', '--t-bg5': '#340065',
      '--t-p':     '#e879f9', '--t-p-dim': '#a21caf', '--t-p-bright': '#f0abfc', '--t-p-glow': 'rgba(232,121,249,0.28)', '--t-p-glass': 'rgba(232,121,249,0.10)',
      '--t-s':     '#818cf8', '--t-gold': '#fbbf24',
      '--t-tx1':   '#fdf4ff', '--t-tx2': '#e879f9', '--t-tx3': '#7e22ce',
      '--t-bdr':   'rgba(232,121,249,0.12)', '--t-bdr-s': 'rgba(232,121,249,0.25)',
      '--t-glass': 'rgba(10,0,16,0.82)', '--t-glass-bdr': 'rgba(232,121,249,0.20)',
      '--t-sb-bg': '#3b0764', '--t-sb-tx': '#f0abfc',
      '--t-g1':    'rgba(232,121,249,0.10)', '--t-g2': 'rgba(129,140,248,0.06)',
      '--t-blur':  '24px',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Dark forest · emerald glow',
    category: 'dark',
    preview: { bg: '#020c07', panel: '#040f08', primary: '#10b981', secondary: '#34d399', text: '#d1fae5', statusBar: '#064e3b' },
    vars: {
      '--t-bg':    '#020c07', '--t-bg1': '#040f08', '--t-bg2': '#06140a', '--t-bg3': '#091a0e', '--t-bg4': '#0d2215', '--t-bg5': '#122b1c',
      '--t-p':     '#10b981', '--t-p-dim': '#059669', '--t-p-bright': '#34d399', '--t-p-glow': 'rgba(16,185,129,0.24)', '--t-p-glass': 'rgba(16,185,129,0.09)',
      '--t-s':     '#06b6d4', '--t-gold': '#fbbf24',
      '--t-tx1':   '#d1fae5', '--t-tx2': '#6ee7b7', '--t-tx3': '#065f46',
      '--t-bdr':   'rgba(16,185,129,0.10)', '--t-bdr-s': 'rgba(16,185,129,0.20)',
      '--t-glass': 'rgba(2,12,7,0.82)', '--t-glass-bdr': 'rgba(16,185,129,0.16)',
      '--t-sb-bg': '#064e3b', '--t-sb-tx': '#6ee7b7',
      '--t-g1':    'rgba(16,185,129,0.07)', '--t-g2': 'rgba(6,182,212,0.04)',
      '--t-blur':  '22px',
    },
  },
  {
    id: 'crimson',
    name: 'Crimson',
    description: 'Blood dark · ember accent',
    category: 'neon',
    preview: { bg: '#0f0204', panel: '#160205', primary: '#ef4444', secondary: '#f97316', text: '#fef2f2', statusBar: '#7f1d1d' },
    vars: {
      '--t-bg':    '#0f0204', '--t-bg1': '#160205', '--t-bg2': '#1c0308', '--t-bg3': '#24040c', '--t-bg4': '#2d0510', '--t-bg5': '#380614',
      '--t-p':     '#ef4444', '--t-p-dim': '#b91c1c', '--t-p-bright': '#fca5a5', '--t-p-glow': 'rgba(239,68,68,0.26)', '--t-p-glass': 'rgba(239,68,68,0.10)',
      '--t-s':     '#f97316', '--t-gold': '#fbbf24',
      '--t-tx1':   '#fef2f2', '--t-tx2': '#fca5a5', '--t-tx3': '#991b1b',
      '--t-bdr':   'rgba(239,68,68,0.12)', '--t-bdr-s': 'rgba(239,68,68,0.24)',
      '--t-glass': 'rgba(15,2,4,0.82)', '--t-glass-bdr': 'rgba(239,68,68,0.18)',
      '--t-sb-bg': '#7f1d1d', '--t-sb-tx': '#fca5a5',
      '--t-g1':    'rgba(239,68,68,0.08)', '--t-g2': 'rgba(249,115,22,0.05)',
      '--t-blur':  '22px',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    description: 'Dark bloom · rose quartz',
    category: 'glass',
    preview: { bg: '#0f0208', panel: '#160310', primary: '#f43f5e', secondary: '#fb7185', text: '#fff1f2', statusBar: '#881337' },
    vars: {
      '--t-bg':    '#0f0208', '--t-bg1': '#160310', '--t-bg2': '#1c0416', '--t-bg3': '#24051d', '--t-bg4': '#2d0625', '--t-bg5': '#38082f',
      '--t-p':     '#f43f5e', '--t-p-dim': '#be123c', '--t-p-bright': '#fb7185', '--t-p-glow': 'rgba(244,63,94,0.24)', '--t-p-glass': 'rgba(244,63,94,0.09)',
      '--t-s':     '#c084fc', '--t-gold': '#fbbf24',
      '--t-tx1':   '#fff1f2', '--t-tx2': '#fda4af', '--t-tx3': '#9f1239',
      '--t-bdr':   'rgba(244,63,94,0.12)', '--t-bdr-s': 'rgba(244,63,94,0.22)',
      '--t-glass': 'rgba(15,2,8,0.82)', '--t-glass-bdr': 'rgba(244,63,94,0.18)',
      '--t-sb-bg': '#881337', '--t-sb-tx': '#fda4af',
      '--t-g1':    'rgba(244,63,94,0.08)', '--t-g2': 'rgba(192,132,252,0.04)',
      '--t-blur':  '24px',
    },
  },
  {
    id: 'solar',
    name: 'Solar',
    description: 'Dark amber · molten gold',
    category: 'dark',
    preview: { bg: '#0f0a02', panel: '#160e03', primary: '#f59e0b', secondary: '#fb923c', text: '#fffbeb', statusBar: '#78350f' },
    vars: {
      '--t-bg':    '#0f0a02', '--t-bg1': '#160e03', '--t-bg2': '#1d1304', '--t-bg3': '#261905', '--t-bg4': '#302007', '--t-bg5': '#3d280a',
      '--t-p':     '#f59e0b', '--t-p-dim': '#b45309', '--t-p-bright': '#fcd34d', '--t-p-glow': 'rgba(245,158,11,0.26)', '--t-p-glass': 'rgba(245,158,11,0.10)',
      '--t-s':     '#fb923c', '--t-gold': '#f59e0b',
      '--t-tx1':   '#fffbeb', '--t-tx2': '#fde68a', '--t-tx3': '#92400e',
      '--t-bdr':   'rgba(245,158,11,0.12)', '--t-bdr-s': 'rgba(245,158,11,0.24)',
      '--t-glass': 'rgba(15,10,2,0.82)', '--t-glass-bdr': 'rgba(245,158,11,0.18)',
      '--t-sb-bg': '#78350f', '--t-sb-tx': '#fde68a',
      '--t-g1':    'rgba(245,158,11,0.08)', '--t-g2': 'rgba(251,146,60,0.05)',
      '--t-blur':  '22px',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Carbon black · acid yellow',
    category: 'neon',
    preview: { bg: '#020202', panel: '#080808', primary: '#facc15', secondary: '#a3e635', text: '#fefce8', statusBar: '#422006' },
    vars: {
      '--t-bg':    '#020202', '--t-bg1': '#080808', '--t-bg2': '#0e0e0e', '--t-bg3': '#141414', '--t-bg4': '#1a1a1a', '--t-bg5': '#222222',
      '--t-p':     '#facc15', '--t-p-dim': '#ca8a04', '--t-p-bright': '#fde047', '--t-p-glow': 'rgba(250,204,21,0.28)', '--t-p-glass': 'rgba(250,204,21,0.10)',
      '--t-s':     '#a3e635', '--t-gold': '#facc15',
      '--t-tx1':   '#fefce8', '--t-tx2': '#fde047', '--t-tx3': '#713f12',
      '--t-bdr':   'rgba(250,204,21,0.12)', '--t-bdr-s': 'rgba(250,204,21,0.25)',
      '--t-glass': 'rgba(2,2,2,0.88)', '--t-glass-bdr': 'rgba(250,204,21,0.22)',
      '--t-sb-bg': '#1c1200', '--t-sb-tx': '#fde047',
      '--t-g1':    'rgba(250,204,21,0.07)', '--t-g2': 'rgba(163,230,53,0.05)',
      '--t-blur':  '20px',
    },
  },
  {
    id: 'arctic',
    name: 'Arctic',
    description: 'Ice blue · crystalline',
    category: 'minimal',
    preview: { bg: '#030810', panel: '#060e1a', primary: '#38bdf8', secondary: '#67e8f9', text: '#f0f9ff', statusBar: '#0c4a6e' },
    vars: {
      '--t-bg':    '#030810', '--t-bg1': '#060e1a', '--t-bg2': '#091522', '--t-bg3': '#0d1d2f', '--t-bg4': '#12263d', '--t-bg5': '#18314e',
      '--t-p':     '#38bdf8', '--t-p-dim': '#0284c7', '--t-p-bright': '#7dd3fc', '--t-p-glow': 'rgba(56,189,248,0.24)', '--t-p-glass': 'rgba(56,189,248,0.08)',
      '--t-s':     '#67e8f9', '--t-gold': '#fbbf24',
      '--t-tx1':   '#f0f9ff', '--t-tx2': '#7dd3fc', '--t-tx3': '#0369a1',
      '--t-bdr':   'rgba(56,189,248,0.10)', '--t-bdr-s': 'rgba(56,189,248,0.22)',
      '--t-glass': 'rgba(3,8,16,0.80)', '--t-glass-bdr': 'rgba(56,189,248,0.16)',
      '--t-sb-bg': '#0c4a6e', '--t-sb-tx': '#7dd3fc',
      '--t-g1':    'rgba(56,189,248,0.07)', '--t-g2': 'rgba(103,232,249,0.04)',
      '--t-blur':  '26px',
    },
  },
]

export const DEFAULT_THEME_ID = 'midnight'
export const getTheme = (id: string) => THEMES.find(t => t.id === id) ?? THEMES[0]
