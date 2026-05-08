export interface ThemeConfig {
  id: string
  name: string
  description: string
  category: 'clean' | 'vivid' | 'warm' | 'cool' | 'dark'
  preview: {
    body: string
    panel: string
    primary: string
    secondary: string
    text: string
    g1: string
    g2: string
  }
  vars: Record<string, string>
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'pearl',
    name: 'Pearl',
    description: 'Crisp white · electric blue',
    category: 'clean',
    preview: { body: '#f8faff', panel: 'rgba(255,255,255,0.82)', primary: '#3b82f6', secondary: '#06b6d4', text: '#0f172a', g1: 'rgba(59,130,246,0.12)', g2: 'rgba(6,182,212,0.08)' },
    vars: {
      '--t-body': '#f8faff',
      '--t-g1': 'rgba(59,130,246,0.12)',
      '--t-g2': 'rgba(6,182,212,0.07)',
      '--t-p': '#3b82f6', '--t-p-dim': '#1d4ed8', '--t-p-bright': '#60a5fa',
      '--t-p-glow': 'rgba(59,130,246,0.22)', '--t-p-glass': 'rgba(59,130,246,0.08)',
      '--t-s': '#06b6d4', '--t-gold': '#f59e0b',
      '--t-tx1': '#0f172a', '--t-tx2': '#475569', '--t-tx3': '#94a3b8',
      '--t-bdr': 'rgba(0,0,0,0.07)', '--t-bdr-s': 'rgba(0,0,0,0.14)',
      '--t-sb-bg': '#1e3a5f', '--t-sb-tx': '#bfdbfe',
      '--t-blur': '22px',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Soft white · violet shimmer',
    category: 'vivid',
    preview: { body: '#faf5ff', panel: 'rgba(255,255,255,0.80)', primary: '#8b5cf6', secondary: '#ec4899', text: '#1e1b4b', g1: 'rgba(139,92,246,0.12)', g2: 'rgba(236,72,153,0.08)' },
    vars: {
      '--t-body': '#faf5ff',
      '--t-g1': 'rgba(139,92,246,0.13)',
      '--t-g2': 'rgba(236,72,153,0.08)',
      '--t-p': '#8b5cf6', '--t-p-dim': '#6d28d9', '--t-p-bright': '#a78bfa',
      '--t-p-glow': 'rgba(139,92,246,0.24)', '--t-p-glass': 'rgba(139,92,246,0.08)',
      '--t-s': '#ec4899', '--t-gold': '#f59e0b',
      '--t-tx1': '#1e1b4b', '--t-tx2': '#4c1d95', '--t-tx3': '#7c3aed',
      '--t-bdr': 'rgba(109,40,217,0.08)', '--t-bdr-s': 'rgba(109,40,217,0.18)',
      '--t-sb-bg': '#2e1065', '--t-sb-tx': '#ddd6fe',
      '--t-blur': '24px',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm cream · molten orange',
    category: 'warm',
    preview: { body: '#fff8f2', panel: 'rgba(255,255,255,0.82)', primary: '#f97316', secondary: '#ef4444', text: '#431407', g1: 'rgba(249,115,22,0.12)', g2: 'rgba(239,68,68,0.08)' },
    vars: {
      '--t-body': '#fff8f2',
      '--t-g1': 'rgba(249,115,22,0.13)',
      '--t-g2': 'rgba(239,68,68,0.08)',
      '--t-p': '#f97316', '--t-p-dim': '#c2410c', '--t-p-bright': '#fb923c',
      '--t-p-glow': 'rgba(249,115,22,0.24)', '--t-p-glass': 'rgba(249,115,22,0.08)',
      '--t-s': '#ef4444', '--t-gold': '#f59e0b',
      '--t-tx1': '#431407', '--t-tx2': '#7c2d12', '--t-tx3': '#9a3412',
      '--t-bdr': 'rgba(194,65,12,0.08)', '--t-bdr-s': 'rgba(194,65,12,0.16)',
      '--t-sb-bg': '#431407', '--t-sb-tx': '#fed7aa',
      '--t-blur': '22px',
    },
  },
  {
    id: 'bloom',
    name: 'Bloom',
    description: 'Petal white · rose quartz',
    category: 'vivid',
    preview: { body: '#fff0f5', panel: 'rgba(255,255,255,0.80)', primary: '#f43f5e', secondary: '#fb7185', text: '#4c0519', g1: 'rgba(244,63,94,0.12)', g2: 'rgba(251,113,133,0.08)' },
    vars: {
      '--t-body': '#fff0f5',
      '--t-g1': 'rgba(244,63,94,0.13)',
      '--t-g2': 'rgba(251,113,133,0.08)',
      '--t-p': '#f43f5e', '--t-p-dim': '#be123c', '--t-p-bright': '#fb7185',
      '--t-p-glow': 'rgba(244,63,94,0.24)', '--t-p-glass': 'rgba(244,63,94,0.08)',
      '--t-s': '#c084fc', '--t-gold': '#f59e0b',
      '--t-tx1': '#4c0519', '--t-tx2': '#881337', '--t-tx3': '#9f1239',
      '--t-bdr': 'rgba(190,18,60,0.08)', '--t-bdr-s': 'rgba(190,18,60,0.16)',
      '--t-sb-bg': '#881337', '--t-sb-tx': '#fecdd3',
      '--t-blur': '24px',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Mint white · emerald depth',
    category: 'cool',
    preview: { body: '#f2fdf7', panel: 'rgba(255,255,255,0.80)', primary: '#10b981', secondary: '#06b6d4', text: '#022c22', g1: 'rgba(16,185,129,0.12)', g2: 'rgba(6,182,212,0.07)' },
    vars: {
      '--t-body': '#f2fdf7',
      '--t-g1': 'rgba(16,185,129,0.13)',
      '--t-g2': 'rgba(6,182,212,0.07)',
      '--t-p': '#10b981', '--t-p-dim': '#059669', '--t-p-bright': '#34d399',
      '--t-p-glow': 'rgba(16,185,129,0.24)', '--t-p-glass': 'rgba(16,185,129,0.08)',
      '--t-s': '#06b6d4', '--t-gold': '#f59e0b',
      '--t-tx1': '#022c22', '--t-tx2': '#065f46', '--t-tx3': '#047857',
      '--t-bdr': 'rgba(5,150,105,0.08)', '--t-bdr-s': 'rgba(5,150,105,0.16)',
      '--t-sb-bg': '#064e3b', '--t-sb-tx': '#a7f3d0',
      '--t-blur': '22px',
    },
  },
  {
    id: 'sky',
    name: 'Sky',
    description: 'Ice white · crystalline cyan',
    category: 'cool',
    preview: { body: '#f0f9ff', panel: 'rgba(255,255,255,0.80)', primary: '#38bdf8', secondary: '#818cf8', text: '#082f49', g1: 'rgba(56,189,248,0.12)', g2: 'rgba(129,140,248,0.07)' },
    vars: {
      '--t-body': '#f0f9ff',
      '--t-g1': 'rgba(56,189,248,0.13)',
      '--t-g2': 'rgba(129,140,248,0.07)',
      '--t-p': '#38bdf8', '--t-p-dim': '#0284c7', '--t-p-bright': '#7dd3fc',
      '--t-p-glow': 'rgba(56,189,248,0.24)', '--t-p-glass': 'rgba(56,189,248,0.08)',
      '--t-s': '#818cf8', '--t-gold': '#f59e0b',
      '--t-tx1': '#082f49', '--t-tx2': '#0c4a6e', '--t-tx3': '#0369a1',
      '--t-bdr': 'rgba(2,132,199,0.08)', '--t-bdr-s': 'rgba(2,132,199,0.16)',
      '--t-sb-bg': '#0c4a6e', '--t-sb-tx': '#bae6fd',
      '--t-blur': '26px',
    },
  },
  {
    id: 'solar',
    name: 'Solar',
    description: 'Warm ivory · liquid gold',
    category: 'warm',
    preview: { body: '#fffbeb', panel: 'rgba(255,255,255,0.82)', primary: '#f59e0b', secondary: '#fb923c', text: '#451a03', g1: 'rgba(245,158,11,0.12)', g2: 'rgba(251,146,60,0.08)' },
    vars: {
      '--t-body': '#fffbeb',
      '--t-g1': 'rgba(245,158,11,0.13)',
      '--t-g2': 'rgba(251,146,60,0.08)',
      '--t-p': '#f59e0b', '--t-p-dim': '#b45309', '--t-p-bright': '#fcd34d',
      '--t-p-glow': 'rgba(245,158,11,0.26)', '--t-p-glass': 'rgba(245,158,11,0.09)',
      '--t-s': '#fb923c', '--t-gold': '#f59e0b',
      '--t-tx1': '#451a03', '--t-tx2': '#78350f', '--t-tx3': '#92400e',
      '--t-bdr': 'rgba(180,83,9,0.08)', '--t-bdr-s': 'rgba(180,83,9,0.16)',
      '--t-sb-bg': '#78350f', '--t-sb-tx': '#fde68a',
      '--t-blur': '22px',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    description: 'Petal mist · fuchsia glow',
    category: 'vivid',
    preview: { body: '#fff0f8', panel: 'rgba(255,255,255,0.80)', primary: '#e879f9', secondary: '#f43f5e', text: '#4a044e', g1: 'rgba(232,121,249,0.12)', g2: 'rgba(244,63,94,0.08)' },
    vars: {
      '--t-body': '#fff0f8',
      '--t-g1': 'rgba(232,121,249,0.13)',
      '--t-g2': 'rgba(244,63,94,0.08)',
      '--t-p': '#e879f9', '--t-p-dim': '#a21caf', '--t-p-bright': '#f0abfc',
      '--t-p-glow': 'rgba(232,121,249,0.26)', '--t-p-glass': 'rgba(232,121,249,0.09)',
      '--t-s': '#f43f5e', '--t-gold': '#f59e0b',
      '--t-tx1': '#4a044e', '--t-tx2': '#701a75', '--t-tx3': '#86198f',
      '--t-bdr': 'rgba(162,28,175,0.08)', '--t-bdr-s': 'rgba(162,28,175,0.18)',
      '--t-sb-bg': '#4a044e', '--t-sb-tx': '#f5d0fe',
      '--t-blur': '24px',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    description: 'Clean white · indigo precision',
    category: 'clean',
    preview: { body: '#f8fafc', panel: 'rgba(255,255,255,0.86)', primary: '#6366f1', secondary: '#8b5cf6', text: '#0f172a', g1: 'rgba(99,102,241,0.10)', g2: 'rgba(139,92,246,0.07)' },
    vars: {
      '--t-body': '#f8fafc',
      '--t-g1': 'rgba(99,102,241,0.10)',
      '--t-g2': 'rgba(139,92,246,0.07)',
      '--t-p': '#6366f1', '--t-p-dim': '#4f46e5', '--t-p-bright': '#818cf8',
      '--t-p-glow': 'rgba(99,102,241,0.22)', '--t-p-glass': 'rgba(99,102,241,0.07)',
      '--t-s': '#8b5cf6', '--t-gold': '#f59e0b',
      '--t-tx1': '#0f172a', '--t-tx2': '#334155', '--t-tx3': '#64748b',
      '--t-bdr': 'rgba(0,0,0,0.07)', '--t-bdr-s': 'rgba(0,0,0,0.14)',
      '--t-sb-bg': '#1e1b4b', '--t-sb-tx': '#c7d2fe',
      '--t-blur': '20px',
    },
  },
  {
    id: 'noir',
    name: 'Noir',
    description: 'Carbon black · steel glass',
    category: 'dark',
    preview: { body: '#080808', panel: 'rgba(20,20,24,0.85)', primary: '#e2e8f0', secondary: '#818cf8', text: '#f8fafc', g1: 'rgba(129,140,248,0.08)', g2: 'rgba(99,102,241,0.05)' },
    vars: {
      '--t-body': '#080808',
      '--t-g1': 'rgba(129,140,248,0.07)',
      '--t-g2': 'rgba(99,102,241,0.04)',
      '--t-p': '#e2e8f0', '--t-p-dim': '#94a3b8', '--t-p-bright': '#f8fafc',
      '--t-p-glow': 'rgba(226,232,240,0.14)', '--t-p-glass': 'rgba(226,232,240,0.05)',
      '--t-s': '#818cf8', '--t-gold': '#fbbf24',
      '--t-tx1': '#f8fafc', '--t-tx2': '#cbd5e1', '--t-tx3': '#475569',
      '--t-bdr': 'rgba(255,255,255,0.08)', '--t-bdr-s': 'rgba(255,255,255,0.16)',
      '--t-sb-bg': '#0f0f14', '--t-sb-tx': '#cbd5e1',
      '--t-blur': '28px',
    },
  },
]

export const DEFAULT_THEME_ID = 'pearl'
export const getTheme = (id: string) => THEMES.find(t => t.id === id) ?? THEMES[0]
