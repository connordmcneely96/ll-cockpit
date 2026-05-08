'use client'

import { useState } from 'react'
import { THEMES, type ThemeConfig } from '@/lib/themes'
import { useThemeStore } from '@/stores/themeStore'
import {
  Check, Palette, Layers, Settings, Bot, Wrench, GitBranch,
  HardDrive, Shield, BookOpen, Bell, Globe, RefreshCw, Sliders, ChevronRight,
} from 'lucide-react'

// ── Sidebar nav ──
const SECTIONS = [
  { id: 'themes', label: 'Themes', icon: Palette },
  { id: 'glass', label: 'Glass Effects', icon: Layers },
  { id: 'ai-models', label: 'AI Models', icon: Bot },
  { id: 'mcp', label: 'Tools & MCP', icon: Wrench },
  { id: 'github', label: 'GitHub', icon: GitBranch },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'general', label: 'General', icon: Settings },
  { id: 'network', label: 'Network', icon: Globe },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'docs', label: 'Docs', icon: BookOpen },
]

const AI_MODELS = [
  { provider: 'ANTHROPIC', models: [
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', caps: ['Tools'], size: 'small' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', caps: ['Tools'], size: 'medium' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', caps: ['Tools'], size: 'large' },
  ]},
  { provider: 'OPENAI', models: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', caps: ['Tools', 'Vision'], size: 'small' },
    { id: 'gpt-4o', name: 'GPT-4o', caps: ['Tools', 'Vision'], size: 'medium' },
    { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', caps: ['Tools'], size: 'small' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', caps: ['Tools', 'Vision'], size: 'medium' },
    { id: 'gpt-5.4', name: 'GPT-5.4', caps: ['Tools', 'Vision'], size: 'large' },
  ]},
  { provider: 'GEMINI', models: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', caps: ['Tools', 'Vision'], size: 'small' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', caps: ['Tools', 'Vision'], size: 'large' },
  ]},
]

// ── Theme card preview ──
function ThemePreview({ theme }: { theme: ThemeConfig }) {
  const { body, panel, primary, secondary, text } = theme.preview
  const isDark = ['dark', 'teal'].includes(theme.category)
  const glassPanel = isDark ? 'rgba(255,255,255,0.06)' : panel
  return (
    <div className="rounded-lg overflow-hidden relative" style={{ height: 72, background: body }}>
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse at 20% 20%, ${theme.preview.g1} 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, ${theme.preview.g2} 0%, transparent 60%)`,
      }} />
      <div className="relative flex h-full">
        <div style={{ width: 8, background: glassPanel, borderRight: `1px solid ${primary}20` }} />
        <div className="flex flex-col gap-0.5 p-1" style={{ width: 22, background: glassPanel }}>
          {[70, 50, 60, 45].map((w, i) => (
            <div key={i} className="rounded-sm" style={{ height: 3, width: `${w}%`, background: i === 0 ? `${primary}aa` : `${text}20` }} />
          ))}
        </div>
        <div className="flex-1 flex flex-col" style={{ background: 'transparent' }}>
          <div className="flex" style={{ height: 12, background: glassPanel, borderBottom: `1.5px solid ${primary}` }}>
            <div className="flex items-center px-1" style={{ background: `${primary}15` }}>
              <div className="rounded-sm" style={{ width: 18, height: 2, background: `${text}40` }} />
            </div>
          </div>
          <div className="flex-1 p-1 space-y-0.5">
            {[75, 55, 85, 40, 65].map((w, i) => (
              <div key={i} className="rounded-sm" style={{
                height: 2.5, width: `${w}%`,
                background: i === 3 ? `${primary}70` : i === 1 ? `${secondary}50` : `${text}18`,
              }} />
            ))}
          </div>
        </div>
        <div style={{ width: 24, background: glassPanel, borderLeft: `1px solid ${primary}15` }} />
      </div>
      <div className="absolute bottom-0 left-0 right-0" style={{ height: 4, background: theme.vars['--t-sb-bg'] ?? '#0a1114' }} />
    </div>
  )
}

function ThemeCard({ theme, isActive, onHover, onLeave, onSelect }: {
  theme: ThemeConfig; isActive: boolean
  onHover: () => void; onLeave: () => void; onSelect: () => void
}) {
  const categoryColor: Record<string, string> = {
    teal: '#00c9a7', dark: '#818cf8', clean: '#94a3b8', vivid: '#f472b6', warm: '#fb923c', cool: '#38bdf8',
  }
  const cc = categoryColor[theme.category] ?? '#94a3b8'

  return (
    <button onClick={onSelect} onMouseEnter={onHover} onMouseLeave={onLeave}
      className="text-left rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: isActive ? `${theme.preview.primary}12` : 'var(--t-p-glass)',
        border: isActive ? `1.5px solid ${theme.preview.primary}` : '1px solid var(--t-bdr)',
        boxShadow: isActive ? `0 0 0 3px ${theme.preview.primary}18, 0 4px 16px ${theme.preview.primary}18` : 'var(--t-shadow)',
        transform: isActive ? 'scale(1.02) translateY(-1px)' : 'scale(1)',
      }}
    >
      <div className="p-2"><ThemePreview theme={theme} /></div>
      <div className="px-3 pb-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono font-semibold text-[11px]" style={{ color: isActive ? theme.preview.primary : 'var(--t-tx1)' }}>
            {theme.name}
          </span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-full"
              style={{ background: `${cc}18`, color: cc, border: `1px solid ${cc}30` }}>
              {theme.category}
            </span>
            {isActive && <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
              style={{ background: theme.preview.primary, boxShadow: `0 0 8px ${theme.preview.primary}` }}>
              <Check size={8} strokeWidth={3} color="#fff" />
            </span>}
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
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <span className="font-mono text-[11px]" style={{ color: 'var(--t-tx1)' }}>{label}</span>
          <span className="font-mono text-[9px] ml-2" style={{ color: 'var(--t-tx3)' }}>{hint}</span>
        </div>
        <span className="font-mono text-[10px] px-2 py-0.5 rounded-lg"
          style={{ background: 'var(--t-p-glass)', color: accent, border: `1px solid ${accent}30` }}>
          {format(value)}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full" style={{ background: 'var(--t-bdr-s)' }}>
        <div className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${pct}%`, background: `linear-gradient(to right, ${accent}80, ${accent})` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full pointer-events-none"
          style={{ left: `calc(${pct}% - 7px)`, background: '#fff', border: `2px solid ${accent}`, boxShadow: `0 0 6px ${accent}60` }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('themes')
  const {
    activeThemeId, glassBlur, glassOpacity, borderOpacity, shadowDepth, gradientIntensity, innerHighlight,
    setTheme, setGlassBlur, setGlassOpacity, setBorderOpacity, setShadowDepth, setGradientIntensity, setInnerHighlight,
  } = useThemeStore()

  const activeTheme = THEMES.find(t => t.id === activeThemeId)!
  const accent = activeTheme.preview.primary

  const handleHover = (theme: ThemeConfig) => {
    const root = document.documentElement
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
    root.setAttribute('data-theme', theme.id)
    root.setAttribute('data-mode', ['dark', 'teal'].includes(theme.category) ? 'dark' : 'light')
  }
  const handleLeave = () => {
    const root = document.documentElement
    Object.entries(activeTheme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
    root.setAttribute('data-theme', activeThemeId)
    root.setAttribute('data-mode', ['dark', 'teal'].includes(activeTheme.category) ? 'dark' : 'light')
  }

  return (
    <div className="flex h-full">

      {/* ── Left sidebar nav ── */}
      <div
        className="w-52 shrink-0 flex flex-col h-full overflow-y-auto"
        style={{
          background: 'var(--t-panel)',
          backdropFilter: 'blur(var(--t-blur))',
          borderRight: '1px solid var(--t-bdr)',
          boxShadow: 'var(--t-shadow)',
        }}
      >
        <div className="px-4 py-4 shrink-0">
          <h1 className="font-condensed font-bold uppercase tracking-wider text-base" style={{ color: 'var(--t-tx1)' }}>Settings</h1>
          <p className="font-mono text-[9px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>CMS · Appearance · Integrations</p>
        </div>

        {/* User */}
        <div className="px-3 mb-3">
          <div
            className="flex items-center gap-2.5 p-2.5 rounded-xl"
            style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-bdr)' }}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0"
              style={{ background: accent, color: '#fff' }}>CM</div>
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold truncate" style={{ color: 'var(--t-tx1)' }}>Connor McNeely</p>
              <p className="font-mono text-[9px] truncate" style={{ color: 'var(--t-tx3)' }}>Pro Plan</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 mb-2">
          <input
            placeholder="Filter..."
            className="w-full px-3 py-1.5 rounded-lg font-mono text-[11px] outline-none"
            style={{
              background: 'var(--t-p-glass)',
              border: '1px solid var(--t-bdr)',
              color: 'var(--t-tx1)',
            }}
          />
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 space-y-0.5 pb-4">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id
            return (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150"
                style={{
                  background: isActive ? 'var(--t-p-glass)' : 'transparent',
                  color: isActive ? 'var(--t-tx1)' : 'var(--t-tx3)',
                  boxShadow: isActive ? 'var(--t-shadow)' : 'none',
                  border: isActive ? '1px solid var(--t-bdr)' : '1px solid transparent',
                }}
              >
                <Icon size={14} style={{ color: isActive ? accent : 'var(--t-tx3)', flexShrink: 0 }} />
                <span className="font-mono text-[11px] flex-1">{label}</span>
                {isActive && <ChevronRight size={12} style={{ color: 'var(--t-tx3)' }} />}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Right content ── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* THEMES section */}
        {activeSection === 'themes' && (
          <div className="space-y-5">
            <div>
              <h2 className="font-condensed font-bold uppercase tracking-wider text-base" style={{ color: 'var(--t-tx1)' }}>Color Themes</h2>
              <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>Hover any card for live preview · click to apply</p>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))' }}>
              {THEMES.map(theme => (
                <ThemeCard key={theme.id} theme={theme} isActive={theme.id === activeThemeId}
                  onHover={() => handleHover(theme)} onLeave={handleLeave}
                  onSelect={() => setTheme(theme.id)} />
              ))}
            </div>
          </div>
        )}

        {/* GLASS section */}
        {activeSection === 'glass' && (
          <div className="space-y-6">
            <div>
              <h2 className="font-condensed font-bold uppercase tracking-wider text-base" style={{ color: 'var(--t-tx1)' }}>Glass Effects</h2>
              <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>Granular 3D glass depth and light physics</p>
            </div>

            {/* Presets */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--t-tx3)' }}>Presets</p>
              <div className="flex gap-2 flex-wrap">
                {[{
                  label: 'Airy', values: { blur: 12, opacity: 55, border: 55, shadow: 60, gradient: 80 },
                }, {
                  label: 'Frosted', values: { blur: 22, opacity: 80, border: 70, shadow: 100, gradient: 100 },
                }, {
                  label: 'Deep', values: { blur: 32, opacity: 90, border: 85, shadow: 180, gradient: 130 },
                }, {
                  label: 'Crystal', values: { blur: 40, opacity: 70, border: 90, shadow: 120, gradient: 200 },
                }].map(({ label, values }) => (
                  <button key={label}
                    onClick={() => {
                      setGlassBlur(values.blur); setGlassOpacity(values.opacity / 100)
                      setBorderOpacity(values.border / 100); setShadowDepth(values.shadow / 100)
                      setGradientIntensity(values.gradient / 100)
                    }}
                    className="px-4 py-2 rounded-xl font-mono text-[11px] transition-all"
                    style={{
                      background: 'var(--t-p-glass)', border: '1px solid var(--t-bdr)',
                      color: 'var(--t-tx1)', boxShadow: 'var(--t-shadow)',
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-5">
              <GlassSlider label="Backdrop Blur" hint="panel frost" value={glassBlur} min={0} max={40}
                format={v => `${v}px`} onChange={setGlassBlur} accent={accent} />
              <GlassSlider label="Glass Opacity" hint="panel fill" value={Math.round(glassOpacity * 100)} min={30} max={100}
                format={v => `${v}%`} onChange={v => setGlassOpacity(v / 100)} accent={accent} />
              <GlassSlider label="Border Opacity" hint="glass edge" value={Math.round(borderOpacity * 100)} min={10} max={100}
                format={v => `${v}%`} onChange={v => setBorderOpacity(v / 100)} accent={accent} />
              <GlassSlider label="Shadow Depth" hint="3D lift" value={Math.round(shadowDepth * 100)} min={0} max={300}
                format={v => `${v}%`} onChange={v => setShadowDepth(v / 100)} accent={accent} />
              <GlassSlider label="Gradient Intensity" hint="bg color" value={Math.round(gradientIntensity * 100)} min={0} max={300}
                format={v => `${v}%`} onChange={v => setGradientIntensity(v / 100)} accent={accent} />
              <div className="flex items-center justify-between py-1">
                <div>
                  <span className="font-mono text-[11px]" style={{ color: 'var(--t-tx1)' }}>Inner Highlight</span>
                  <span className="font-mono text-[9px] ml-2" style={{ color: 'var(--t-tx3)' }}>top specular edge</span>
                </div>
                <button onClick={() => setInnerHighlight(!innerHighlight)}
                  className="relative w-9 h-5 rounded-full transition-all"
                  style={{ background: innerHighlight ? accent : 'var(--t-bdr-s)', boxShadow: innerHighlight ? `0 0 8px ${accent}60` : 'none' }}
                >
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                    style={{ left: innerHighlight ? '1.1rem' : '0.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.20)' }} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI MODELS section */}
        {activeSection === 'ai-models' && (
          <div className="space-y-6">
            <div>
              <h2 className="font-condensed font-bold uppercase tracking-wider text-base" style={{ color: 'var(--t-tx1)' }}>AI Models</h2>
              <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>Available models by provider · routing lanes configured in D1</p>
            </div>
            {AI_MODELS.map(({ provider, models }) => (
              <div key={provider}>
                <p className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--t-tx3)' }}>{provider}</p>
                <div className="space-y-1.5">
                  {models.map(model => (
                    <div key={model.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{
                        background: model.id === 'claude-sonnet-4-5' ? 'var(--t-p-glass)' : 'var(--t-panel)',
                        border: model.id === 'claude-sonnet-4-5' ? '1px solid var(--t-bdr-s)' : '1px solid var(--t-bdr)',
                        boxShadow: 'var(--t-shadow)',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{
                          background: model.id === 'claude-sonnet-4-5' ? accent : 'var(--t-tx3)',
                          boxShadow: model.id === 'claude-sonnet-4-5' ? `0 0 6px ${accent}` : 'none',
                        }} />
                        <div>
                          <p className="font-mono text-[11px] font-medium" style={{ color: 'var(--t-tx1)' }}>{model.name}</p>
                          <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{model.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {model.caps.map(cap => (
                          <span key={cap} className="font-mono text-[8px] px-2 py-0.5 rounded-md"
                            style={{ background: 'var(--t-p-glass)', color: accent, border: `1px solid ${accent}25` }}>
                            {cap}
                          </span>
                        ))}
                        <span className="font-mono text-[8px] px-2 py-0.5 rounded-md"
                          style={{ background: 'var(--t-bdr)', color: 'var(--t-tx3)' }}>
                          {model.size}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* OTHER SECTIONS — placeholder */}
        {!['themes', 'glass', 'ai-models'].includes(activeSection) && (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-bdr)' }}>
              {(() => { const s = SECTIONS.find(s => s.id === activeSection); return s ? <s.icon size={20} style={{ color: accent }} /> : null })()} 
            </div>
            <p className="font-mono text-xs font-semibold" style={{ color: 'var(--t-tx1)' }}>
              {SECTIONS.find(s => s.id === activeSection)?.label}
            </p>
            <p className="font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>Coming in Sprint 5 · D1 migration 0009</p>
          </div>
        )}

      </div>
    </div>
  )
}
