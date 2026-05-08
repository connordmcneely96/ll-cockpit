'use client'

import { useState } from 'react'
import { THEMES, type ThemeConfig } from '@/lib/themes'
import { useThemeStore } from '@/stores/themeStore'
import { Check, Palette, Sliders, Layers, RefreshCw, Sun, Moon } from 'lucide-react'

function ThemePreview({ theme }: { theme: ThemeConfig }) {
  const { body, panel, primary, secondary, text, g1, g2 } = theme.preview
  const isDark = theme.category === 'dark'
  const glassPanel = isDark ? 'rgba(22,22,28,0.85)' : panel
  return (
    <div className="rounded-lg overflow-hidden relative" style={{ height: 80, background: body }}>
      {/* Background gradient */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse at 20% 20%, ${g1} 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, ${g2} 0%, transparent 60%)`,
      }} />
      <div className="relative flex h-full">
        {/* Activity rail */}
        <div style={{ width: 10, background: glassPanel, borderRight: `1px solid rgba(255,255,255,${isDark ? 0.08 : 0.60})` }} />
        {/* Explorer */}
        <div className="flex flex-col gap-1 p-1" style={{ width: 28, background: glassPanel, borderRight: `1px solid rgba(255,255,255,${isDark ? 0.06 : 0.50})` }}>
          {[70, 50, 60, 45].map((w, i) => (
            <div key={i} className="rounded-sm" style={{ height: 4, width: `${w}%`, background: i === 0 ? `${primary}99` : `${text}22` }} />
          ))}
        </div>
        {/* Center */}
        <div className="flex-1 flex flex-col">
          {/* Tab bar */}
          <div className="flex" style={{ height: 14, background: glassPanel, borderBottom: `1px solid rgba(255,255,255,${isDark ? 0.06 : 0.50})` }}>
            <div className="flex items-center px-1.5 gap-1" style={{ background: 'rgba(255,255,255,0.55)', borderBottom: `2px solid ${primary}` }}>
              <div className="rounded-sm" style={{ width: 22, height: 3, background: `${text}40` }} />
            </div>
          </div>
          {/* Content lines */}
          <div className="flex-1 p-1.5 space-y-1">
            {[75, 55, 85, 40, 65].map((w, i) => (
              <div key={i} className="rounded-sm" style={{
                height: 3, width: `${w}%`,
                background: i === 3 ? `${primary}70` : i === 1 ? `${secondary}50` : `${text}18`,
              }} />
            ))}
          </div>
        </div>
        {/* Agent panel */}
        <div className="flex flex-col gap-1 p-1" style={{ width: 30, background: glassPanel, borderLeft: `1px solid rgba(255,255,255,${isDark ? 0.06 : 0.50})` }}>
          <div className="rounded-full" style={{ width: 12, height: 12, background: `${primary}30`, border: `1.5px solid ${primary}`, margin: '0 auto', boxShadow: `0 0 6px ${primary}60` }} />
          {[80, 60, 70].map((w, i) => (
            <div key={i} className="rounded-sm" style={{ height: 3, width: `${w}%`, background: `${text}20` }} />
          ))}
        </div>
      </div>
      {/* Status bar */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: 5, background: theme.vars['--t-sb-bg'] ?? '#1e3a5f' }} />
    </div>
  )
}

function ThemeCard({ theme, isActive, onHover, onLeave, onSelect }: {
  theme: ThemeConfig; isActive: boolean
  onHover: () => void; onLeave: () => void; onSelect: () => void
}) {
  const categoryBadge: Record<string, [string, string]> = {
    clean: ['#94a3b8', 'Clean'],
    vivid: ['#f472b6', 'Vivid'],
    warm: ['#fb923c', 'Warm'],
    cool: ['#38bdf8', 'Cool'],
    dark: ['#6366f1', 'Dark'],
  }
  const [badgeColor, badgeLabel] = categoryBadge[theme.category]

  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="text-left rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: isActive ? `${theme.preview.primary}0f` : 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: isActive ? `2px solid ${theme.preview.primary}` : '1.5px solid rgba(255,255,255,0.65)',
        boxShadow: isActive
          ? `0 0 0 4px ${theme.preview.primary}18, 0 4px 24px ${theme.preview.primary}20, inset 0 1px 0 rgba(255,255,255,0.80)`
          : 'inset 0 1px 0 rgba(255,255,255,0.80), 0 2px 8px rgba(0,0,0,0.06)',
        transform: isActive ? 'scale(1.02) translateY(-2px)' : 'scale(1)',
      }}
    >
      <div className="p-2 pb-0"><ThemePreview theme={theme} /></div>
      <div className="p-3 pt-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-mono font-semibold text-xs" style={{ color: isActive ? theme.preview.primary : 'var(--t-tx1)' }}>
            {theme.name}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-widest"
              style={{ background: `${badgeColor}18`, color: badgeColor, border: `1px solid ${badgeColor}30` }}>
              {badgeLabel}
            </span>
            {isActive && (
              <span className="w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: theme.preview.primary, boxShadow: `0 0 10px ${theme.preview.primary}` }}>
                <Check size={9} strokeWidth={3} color="#fff" />
              </span>
            )}
          </div>
        </div>
        <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{theme.description}</p>
      </div>
    </button>
  )
}

function GlassSlider({ label, hint, value, min, max, step = 1, format, onChange, accent }: {
  label: string; hint: string; value: number; min: number; max: number
  step?: number; format: (v: number) => string; onChange: (v: number) => void; accent: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-[11px] font-medium" style={{ color: 'var(--t-tx1)' }}>{label}</span>
          <span className="font-mono text-[9px] ml-2" style={{ color: 'var(--t-tx3)' }}>{hint}</span>
        </div>
        <span className="font-mono text-[10px] px-2 py-0.5 rounded-lg glass-card"
          style={{ color: accent, border: `1px solid ${accent}30` }}>
          {format(value)}
        </span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: 'var(--t-bdr)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)' }}>
        <div className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${pct}%`, background: `linear-gradient(to right, ${accent}80, ${accent})`, boxShadow: `0 0 6px ${accent}60` }} />
        {/* Thumb */}
        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full pointer-events-none"
          style={{
            left: `calc(${pct}% - 8px)`,
            background: '#fff',
            border: `2px solid ${accent}`,
            boxShadow: `0 0 8px ${accent}50, 0 2px 4px rgba(0,0,0,0.12)`,
          }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>
    </div>
  )
}

function Section({ title, subtitle, icon: Icon, children }: {
  title: string; subtitle: string; icon: any; children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl overflow-hidden glass"
      style={{ boxShadow: 'var(--t-shadow)' }}>
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center glass-card">
          <Icon size={15} style={{ color: 'var(--t-p)' }} />
        </div>
        <div>
          <h2 className="font-mono font-semibold text-xs" style={{ color: 'var(--t-tx1)' }}>{title}</h2>
          <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{subtitle}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export default function SettingsPage() {
  const {
    activeThemeId, glassBlur, glassOpacity, borderOpacity,
    shadowDepth, gradientIntensity, innerHighlight,
    setTheme, setGlassBlur, setGlassOpacity, setBorderOpacity,
    setShadowDepth, setGradientIntensity, setInnerHighlight,
  } = useThemeStore()

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const activeTheme = THEMES.find(t => t.id === activeThemeId)!
  const accent = activeTheme.preview.primary

  const handleHover = (theme: ThemeConfig) => {
    setHoveredId(theme.id)
    const root = document.documentElement
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
    root.setAttribute('data-theme', theme.id)
    root.setAttribute('data-mode', theme.category === 'dark' ? 'dark' : 'light')
  }

  const handleLeave = () => {
    setHoveredId(null)
    const root = document.documentElement
    Object.entries(activeTheme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
    root.setAttribute('data-theme', activeThemeId)
    root.setAttribute('data-mode', activeTheme.category === 'dark' ? 'dark' : 'light')
  }

  return (
    <div className="min-h-full p-6 space-y-5" style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-condensed font-bold uppercase tracking-wider" style={{ fontSize: 22, color: 'var(--t-tx1)' }}>
            CMS Configuration
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: 'var(--t-tx3)' }}>
            Appearance · Glass effects · Workspace · Sync
          </p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-[10px] glass"
          style={{ color: accent, boxShadow: `0 0 20px ${accent}20` }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
          {activeTheme.name} · Active
        </div>
      </div>

      {/* ── Section 1: Color Themes ── */}
      <Section icon={Palette} title="Color Themes" subtitle="Hover any card for live preview · click to apply">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))' }}>
          {THEMES.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={theme.id === activeThemeId}
              onHover={() => handleHover(theme)}
              onLeave={handleLeave}
              onSelect={() => { setTheme(theme.id); setHoveredId(null) }}
            />
          ))}
        </div>
      </Section>

      {/* ── Section 2: Glass Effects ── */}
      <Section icon={Layers} title="Glass Depth" subtitle="Granular control over 3D glass layering and light physics">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <GlassSlider label="Backdrop Blur" hint="panel frost" value={glassBlur} min={0} max={40} step={1}
            format={v => `${v}px`} onChange={setGlassBlur} accent={accent} />
          <GlassSlider label="Glass Opacity" hint="panel fill" value={Math.round(glassOpacity * 100)} min={30} max={100}
            format={v => `${v}%`} onChange={v => setGlassOpacity(v / 100)} accent={accent} />
          <GlassSlider label="Border Opacity" hint="glass edge" value={Math.round(borderOpacity * 100)} min={10} max={100}
            format={v => `${v}%`} onChange={v => setBorderOpacity(v / 100)} accent={accent} />
          <GlassSlider label="Shadow Depth" hint="3D lift" value={Math.round(shadowDepth * 100)} min={0} max={300}
            format={v => `${v}%`} onChange={v => setShadowDepth(v / 100)} accent={accent} />
          <GlassSlider label="Gradient Intensity" hint="bg color" value={Math.round(gradientIntensity * 100)} min={0} max={300}
            format={v => `${v}%`} onChange={v => setGradientIntensity(v / 100)} accent={accent} />
          {/* Inner Highlight Toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="font-mono text-[11px] font-medium" style={{ color: 'var(--t-tx1)' }}>Inner Highlight</span>
              <span className="font-mono text-[9px] ml-2" style={{ color: 'var(--t-tx3)' }}>top specular edge</span>
            </div>
            <button
              onClick={() => setInnerHighlight(!innerHighlight)}
              className="relative w-10 h-5 rounded-full transition-all duration-200"
              style={{
                background: innerHighlight ? accent : 'var(--t-bdr)',
                boxShadow: innerHighlight ? `0 0 10px ${accent}60` : 'none',
              }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200"
                style={{
                  left: innerHighlight ? '1.25rem' : '0.125rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.20)',
                }}
              />
            </button>
          </div>
        </div>
      </Section>

      {/* ── Section 3: Presets ── */}
      <Section icon={Sliders} title="Glass Presets" subtitle="One-click surface elevation starting points">
        <div className="flex flex-wrap gap-2">
          {[{
            label: 'Airy', desc: 'Very transparent · soft', values: { blur: 12, opacity: 55, border: 55, shadow: 60, gradient: 80 },
          }, {
            label: 'Frosted', desc: 'Classic glass · balanced', values: { blur: 22, opacity: 80, border: 70, shadow: 100, gradient: 100 },
          }, {
            label: 'Deep', desc: 'Solid · dramatic shadow', values: { blur: 32, opacity: 90, border: 85, shadow: 180, gradient: 130 },
          }, {
            label: 'Crystal', desc: 'Max blur · vivid gradients', values: { blur: 40, opacity: 70, border: 90, shadow: 120, gradient: 200 },
          }].map(({ label, desc, values }) => (
            <button
              key={label}
              onClick={() => {
                setGlassBlur(values.blur)
                setGlassOpacity(values.opacity / 100)
                setBorderOpacity(values.border / 100)
                setShadowDepth(values.shadow / 100)
                setGradientIntensity(values.gradient / 100)
              }}
              className="px-4 py-2.5 rounded-xl text-left transition-all glass-hover"
              style={{ minWidth: 130 }}
            >
              <p className="font-mono text-xs font-semibold" style={{ color: 'var(--t-tx1)' }}>{label}</p>
              <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{desc}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* ── Section 4: Workspace ── */}
      <Section icon={Sun} title="Workspace" subtitle="Runtime configuration">
        <div className="space-y-2">
          {[['Token Budget', '100,000 / session', 'Resets per browser session'],
            ['Default Model', 'claude-sonnet-4-5', 'All agents unless overridden'],
            ['D1 Persistence', 'agent_tasks table', 'Messages stored per completion'],
            ['Streaming', 'SSE · native fetch', 'Anthropic API direct'],
          ].map(([label, value, note]) => (
            <div key={label}
              className="flex items-center justify-between py-2.5 px-3 rounded-xl glass-card"
            >
              <div>
                <p className="font-mono text-[11px]" style={{ color: 'var(--t-tx1)' }}>{label}</p>
                <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{note}</p>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-lg"
                style={{ background: 'var(--t-p-glass)', color: accent, border: `1px solid ${accent}30` }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Section 5: CMS Sync ── */}
      <Section icon={RefreshCw} title="CMS Sync" subtitle="Persist theme to D1 cms_themes · Sprint 5">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px]" style={{ color: 'var(--t-tx2)' }}>
            Currently localStorage only. D1 migration 0009 will sync theme across devices.
          </p>
          <button className="px-3 py-1.5 rounded-xl font-mono text-[10px] glass-card cursor-not-allowed" style={{ color: 'var(--t-tx3)' }}>
            Sync to D1 · Sprint 5
          </button>
        </div>
      </Section>

    </div>
  )
}
