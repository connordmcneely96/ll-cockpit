'use client'

import { useState } from 'react'
import { THEMES, type ThemeConfig } from '@/lib/themes'
import { useThemeStore } from '@/stores/themeStore'
import { Check, Palette, Sliders, Layers, RefreshCw } from 'lucide-react'

// Mini three-panel IDE preview for each theme card
function ThemePreview({ theme }: { theme: ThemeConfig }) {
  const { bg, panel, primary, text, statusBar } = theme.preview
  return (
    <div className="relative overflow-hidden rounded-md" style={{ height: 80, background: bg }}>
      <div className="flex h-full">
        {/* Activity rail */}
        <div style={{ width: 10, background: `color-mix(in srgb, ${bg} 60%, black)` }} />
        {/* Explorer */}
        <div className="flex flex-col gap-1 p-1" style={{ width: 28, background: panel }}>
          {[70, 50, 60, 45].map((w, i) => (
            <div key={i} className="rounded-sm" style={{ height: 4, width: `${w}%`, background: i === 0 ? `${primary}90` : `${text}18` }} />
          ))}
        </div>
        {/* Center */}
        <div className="flex-1 flex flex-col" style={{ background: bg }}>
          {/* Tab bar */}
          <div className="flex" style={{ height: 14, background: `color-mix(in srgb, ${bg} 70%, black)`, borderBottom: `1px solid ${primary}25` }}>
            <div className="flex items-center px-1.5 gap-1" style={{ borderBottom: `1.5px solid ${primary}`, background: bg }}>
              <div className="rounded-sm" style={{ width: 6, height: 4, background: `${primary}70` }} />
              <div className="rounded-sm" style={{ width: 20, height: 3, background: `${text}40` }} />
            </div>
            <div className="flex items-center px-1.5 gap-1" style={{ background: 'transparent' }}>
              <div className="rounded-sm" style={{ width: 18, height: 3, background: `${text}20` }} />
            </div>
          </div>
          {/* Content */}
          <div className="flex-1 p-1.5 space-y-1">
            {[75, 55, 85, 40, 65].map((w, i) => (
              <div key={i} className="rounded-sm" style={{
                height: 3,
                width: `${w}%`,
                background: i === 3 ? `${primary}60` : i === 1 ? `${theme.preview.secondary}50` : `${text}14`,
              }} />
            ))}
          </div>
        </div>
        {/* Agent panel */}
        <div className="flex flex-col gap-1 p-1" style={{ width: 30, background: panel, borderLeft: `1px solid ${primary}18` }}>
          <div className="rounded-full" style={{ width: 12, height: 12, background: `${primary}30`, border: `1px solid ${primary}50`, margin: '0 auto' }} />
          {[80, 60, 70].map((w, i) => (
            <div key={i} className="rounded-sm" style={{ height: 3, width: `${w}%`, background: `${text}18` }} />
          ))}
          <div className="rounded-sm mt-1" style={{ height: 10, background: `${primary}15`, border: `1px solid ${primary}30` }} />
        </div>
      </div>
      {/* Status bar */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: 6, background: statusBar }} />
    </div>
  )
}

// Single theme card
function ThemeCard({
  theme,
  isActive,
  onHover,
  onLeave,
  onSelect,
}: {
  theme: ThemeConfig
  isActive: boolean
  onHover: () => void
  onLeave: () => void
  onSelect: () => void
}) {
  const categoryColors: Record<string, string> = {
    dark: '#94a3b8', glass: '#818cf8', neon: '#f472b6', minimal: '#67e8f9',
  }

  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="group relative text-left rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: isActive ? `${theme.preview.primary}10` : 'rgba(255,255,255,0.02)',
        border: isActive
          ? `1.5px solid ${theme.preview.primary}`
          : '1.5px solid rgba(255,255,255,0.07)',
        boxShadow: isActive
          ? `0 0 24px ${theme.preview.primary}30, 0 0 4px ${theme.preview.primary}20`
          : 'none',
        transform: isActive ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {/* Preview */}
      <div className="p-2 pb-0">
        <ThemePreview theme={theme} />
      </div>

      {/* Info */}
      <div className="p-3 pt-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-mono font-semibold text-xs" style={{ color: isActive ? theme.preview.primary : 'var(--t-tx1)' }}>
            {theme.name}
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className="font-mono text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-widest"
              style={{
                background: `${categoryColors[theme.category]}15`,
                color: categoryColors[theme.category],
                border: `1px solid ${categoryColors[theme.category]}30`,
              }}
            >
              {theme.category}
            </span>
            {isActive && (
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: theme.preview.primary, boxShadow: `0 0 8px ${theme.preview.primary}` }}
              >
                <Check size={9} strokeWidth={3} color="#000" />
              </span>
            )}
          </div>
        </div>
        <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{theme.description}</p>
      </div>
    </button>
  )
}

// Glass slider
function GlassSlider({
  label, value, min, max, step = 1, format,
  onChange, accentColor,
}: {
  label: string; value: number; min: number; max: number; step?: number
  format: (v: number) => string; onChange: (v: number) => void; accentColor: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px]" style={{ color: 'var(--t-tx2)' }}>{label}</span>
        <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--t-p-glass)', color: accentColor }}>
          {format(value)}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full" style={{ background: 'var(--t-bg3)' }}>
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-75"
          style={{ width: `${pct}%`, background: `linear-gradient(to right, ${accentColor}80, ${accentColor})` }}
        />
        <input
          type="range" min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  )
}

const SECTION = ({
  icon: Icon, title, subtitle, children,
}: { icon: any; title: string; subtitle: string; children: React.ReactNode }) => (
  <section
    className="rounded-2xl overflow-hidden"
    style={{
      background: 'var(--t-glass)',
      backdropFilter: 'blur(var(--t-blur))',
      WebkitBackdropFilter: 'blur(var(--t-blur))',
      border: '1px solid var(--t-glass-bdr)',
    }}
  >
    <div
      className="flex items-center gap-3 px-5 py-4"
      style={{ borderBottom: '1px solid var(--t-bdr)' }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-glass-bdr)' }}
      >
        <Icon size={15} style={{ color: 'var(--t-p-bright)' }} />
      </div>
      <div>
        <h2 className="font-mono font-semibold text-xs" style={{ color: 'var(--t-tx1)' }}>{title}</h2>
        <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{subtitle}</p>
      </div>
    </div>
    <div className="p-5">{children}</div>
  </section>
)

export default function SettingsPage() {
  const {
    activeThemeId, glassBlur, glassOpacity, panelOpacity,
    setTheme, setGlassBlur, setGlassOpacity, setPanelOpacity,
  } = useThemeStore()

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const activeTheme = THEMES.find(t => t.id === activeThemeId)!
  const accentColor = activeTheme.preview.primary

  // Live preview on hover
  const handleHover = (theme: ThemeConfig) => {
    setHoveredId(theme.id)
    const root = document.documentElement
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  }

  const handleLeave = () => {
    setHoveredId(null)
    // Restore active theme
    const root = document.documentElement
    Object.entries(activeTheme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  }

  const handleSelect = (theme: ThemeConfig) => {
    setTheme(theme.id)
    setHoveredId(null)
  }

  return (
    <div className="min-h-full p-6 space-y-6" style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="font-condensed font-bold uppercase tracking-wider"
            style={{ fontSize: 22, color: 'var(--t-tx1)' }}
          >
            CMS Configuration
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: 'var(--t-tx3)' }}>
            Appearance, theme system, glass effects, and workspace settings
          </p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-[10px]"
          style={{
            background: 'var(--t-p-glass)',
            border: '1px solid var(--t-glass-bdr)',
            color: accentColor,
            boxShadow: `0 0 16px ${accentColor}20`,
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }} />
          {activeTheme.name} · Active
        </div>
      </div>

      {/* ── Section 1: Color Themes ── */}
      <SECTION icon={Palette} title="Color Themes" subtitle="Select a preset — live preview on hover">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {THEMES.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={theme.id === activeThemeId}
              onHover={() => handleHover(theme)}
              onLeave={handleLeave}
              onSelect={() => handleSelect(theme)}
            />
          ))}
        </div>
      </SECTION>

      {/* ── Section 2: Glass Effects ── */}
      <SECTION icon={Layers} title="Glass Effects" subtitle="Fine-tune the glassmorphic treatment across all panels">
        <div className="space-y-5">
          <GlassSlider
            label="Backdrop Blur"
            value={glassBlur} min={8} max={40} step={1}
            format={v => `${v}px`}
            onChange={setGlassBlur}
            accentColor={accentColor}
          />
          <GlassSlider
            label="Panel Opacity"
            value={Math.round(glassOpacity * 100)} min={40} max={98} step={1}
            format={v => `${v}%`}
            onChange={v => setGlassOpacity(v / 100)}
            accentColor={accentColor}
          />
          <GlassSlider
            label="Surface Opacity"
            value={Math.round(panelOpacity * 100)} min={40} max={98} step={1}
            format={v => `${v}%`}
            onChange={v => setPanelOpacity(v / 100)}
            accentColor={accentColor}
          />
        </div>
      </SECTION>

      {/* ── Section 3: Workspace ── */}
      <SECTION icon={Sliders} title="Workspace" subtitle="Agent permissions, token budget, and system status">
        <div className="space-y-3">
          {[
            { label: 'Token Budget', value: '100,000 / session', note: 'Resets per browser session' },
            { label: 'Default Model', value: 'claude-sonnet-4-5', note: 'Used for all agents unless overridden' },
            { label: 'Streaming', value: 'Enabled', note: 'SSE streaming via native fetch' },
            { label: 'D1 Persistence', value: 'agent_tasks', note: 'Messages stored per completion' },
          ].map(({ label, value, note }) => (
            <div
              key={label}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--t-bdr)' }}
            >
              <div>
                <p className="font-mono text-[11px]" style={{ color: 'var(--t-tx1)' }}>{label}</p>
                <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{note}</p>
              </div>
              <span
                className="font-mono text-[10px] px-2 py-0.5 rounded"
                style={{ background: 'var(--t-p-glass)', color: accentColor, border: '1px solid var(--t-glass-bdr)' }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </SECTION>

      {/* ── Section 4: CMS Sync ── */}
      <SECTION icon={RefreshCw} title="CMS Sync" subtitle="Persist theme to D1 cms_themes table across sessions">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px]" style={{ color: 'var(--t-tx2)' }}>D1 persistence for theme config</p>
            <p className="font-mono text-[9px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>Requires cms_themes migration 0009 — currently localStorage only</p>
          </div>
          <div
            className="px-3 py-1.5 rounded-lg font-mono text-[10px] cursor-not-allowed"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--t-bdr)',
              color: 'var(--t-tx3)',
            }}
          >
            Sync to D1 · Sprint 5
          </div>
        </div>
      </SECTION>
    </div>
  )
}
