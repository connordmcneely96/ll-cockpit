'use client'

import { useState } from 'react'
import { THEMES, type ThemeConfig } from '@/lib/themes'
import { useThemeStore } from '@/stores/themeStore'
import { useDesignStore } from '@/stores/designStore'
import type { GradientLayer, GradientStop, ShadowLayer } from '@/lib/design-tokens'
import { hexAlpha, buildGradientCSS } from '@/lib/design-tokens'
import {
  Check, Palette, Layers, Settings, Bot, Wrench, GitBranch,
  HardDrive, Shield, BookOpen, Bell, Globe, RefreshCw, ChevronRight,
  Plus, Trash2, Eye, EyeOff, RotateCcw, Copy, Download,
} from 'lucide-react'

const SECTIONS = [
  { id: 'themes',     label: 'Themes',          icon: Palette,    group: 'design' },
  { id: 'background', label: 'Background',       icon: Layers,     group: 'design' },
  { id: 'colors',     label: 'Color Palette',    icon: Palette,    group: 'design' },
  { id: 'surfaces',   label: 'Surfaces',         icon: Layers,     group: 'design' },
  { id: 'glass',      label: 'Glass & Blur',     icon: Eye,        group: 'design' },
  { id: 'borders',    label: 'Borders & Radius', icon: Settings,   group: 'design' },
  { id: 'shadows',    label: 'Shadows',          icon: Layers,     group: 'design' },
  { id: 'glow',       label: 'Glow & Ambient',   icon: Eye,        group: 'design' },
  { id: 'typography', label: 'Typography',       icon: Settings,   group: 'design' },
  { id: 'motion',     label: 'Motion',           icon: Settings,   group: 'design' },
  { id: 'export',     label: 'Export Theme',     icon: Download,   group: 'design' },
  { id: 'ai-models',  label: 'AI Models',        icon: Bot,        group: 'system' },
  { id: 'mcp',        label: 'Tools & MCP',      icon: Wrench,     group: 'system' },
  { id: 'github',     label: 'GitHub',           icon: GitBranch,  group: 'system' },
  { id: 'storage',    label: 'Storage',          icon: HardDrive,  group: 'system' },
  { id: 'security',   label: 'Security',         icon: Shield,     group: 'system' },
  { id: 'general',    label: 'General',          icon: Settings,   group: 'system' },
]

const AI_MODELS = [
  { provider: 'ANTHROPIC', models: [
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', caps: ['Tools'], size: 'small', active: false },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', caps: ['Tools'], size: 'medium', active: true },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', caps: ['Tools'], size: 'large', active: false },
  ]},
  { provider: 'OPENAI', models: [
    { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', caps: ['Tools'], size: 'small', active: false },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', caps: ['Tools', 'Vision'], size: 'medium', active: false },
    { id: 'gpt-5.4', name: 'GPT-5.4', caps: ['Tools', 'Vision'], size: 'large', active: false },
  ]},
  { provider: 'GEMINI', models: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', caps: ['Tools', 'Vision'], size: 'small', active: false },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', caps: ['Tools', 'Vision'], size: 'large', active: false },
  ]},
  { provider: 'WORKERS AI', models: [
    { id: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', caps: ['Tools'], size: 'small', active: false },
    { id: '@cf/baai/bge-large-en-v1.5', name: 'BGE Large Embeddings', caps: ['Embed'], size: 'small', active: false },
  ]},
]

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-[10px] uppercase tracking-widest ${className}`} style={{ color: 'var(--t-tx3)' }}>{children}</span>
}
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-condensed font-bold uppercase tracking-wider text-base" style={{ color: 'var(--t-tx1)' }}>{title}</h2>
      <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>{subtitle}</p>
    </div>
  )
}
function Row({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center gap-3 ${className}`}>{children}</div>
}
function Divider() {
  return <div className="h-px my-4" style={{ background: 'var(--t-bdr)' }} />
}
function Pill({ label, style = {} }: { label: string; style?: React.CSSProperties }) {
  return <span className="font-mono text-[8px] px-2 py-0.5 rounded-full" style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-bdr)', ...style }}>{label}</span>
}
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="relative w-9 h-5 rounded-full transition-all shrink-0"
      style={{ background: value ? 'var(--t-p)' : 'var(--t-bdr-s)', boxShadow: value ? '0 0 8px var(--t-p-glow)' : 'none' }}>
      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: value ? '1.1rem' : '0.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  )
}
function Slider({ value, min, max, step = 1, onChange, unit = '' }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="relative flex items-center gap-2 flex-1">
      <div className="flex-1 relative h-1.5 rounded-full" style={{ background: 'var(--t-bdr-s)' }}>
        <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(to right, var(--t-p-dim), var(--t-p))' }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full pointer-events-none"
          style={{ left: `calc(${pct}% - 7px)`, background: '#fff', border: '2px solid var(--t-p)', boxShadow: '0 0 6px var(--t-p-glow)' }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>
      <span className="font-mono text-[10px] w-12 text-right shrink-0" style={{ color: 'var(--t-tx2)' }}>{value}{unit}</span>
    </div>
  )
}
function ColorPicker({ value, alpha, onChange, onAlpha }: {
  value: string; alpha?: number; onChange: (hex: string) => void; onAlpha?: (a: number) => void
}) {
  const pct = alpha !== undefined ? Math.round(alpha * 100) : null
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8 rounded-xl overflow-hidden shrink-0" style={{ background: value, border: '1px solid var(--t-bdr)' }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>
      <input value={value.toUpperCase()} onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value) }}
        className="w-24 font-mono text-[11px] px-2 py-1.5 rounded-xl outline-none"
        style={{ background: 'var(--t-p-glass)', border: '1px solid var(--t-bdr)', color: 'var(--t-tx1)' }} />
      {pct !== null && onAlpha && (
        <div className="flex items-center gap-1.5 flex-1">
          <div className="flex-1 relative h-1.5 rounded-full" style={{ background: 'var(--t-bdr-s)' }}>
            <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${pct}%`, background: value }} />
            <input type="range" min={0} max={100} value={pct} onChange={e => onAlpha(Number(e.target.value)/100)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </div>
          <span className="font-mono text-[10px] w-9 shrink-0" style={{ color: 'var(--t-tx3)' }}>{pct}%</span>
        </div>
      )}
    </div>
  )
}

function GradientLayerEditor({ layer, layerIdx }: { layer: GradientLayer; layerIdx: number }) {
  const { setGradientLayer, setGradientStop, addGradientStop, removeGradientStop, removeGradientLayer } = useDesignStore()
  const id = layer.id
  return (
    <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid var(--t-bdr)', background: 'var(--t-p-glass)' }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--t-bdr)' }}>
        <Toggle value={layer.enabled} onChange={v => setGradientLayer(id, { enabled: v })} />
        <span className="font-mono text-[11px] flex-1" style={{ color: 'var(--t-tx1)' }}>Layer {layerIdx + 1}</span>
        <select value={layer.type} onChange={e => setGradientLayer(id, { type: e.target.value as GradientLayer['type'] })}
          className="font-mono text-[10px] px-2 py-1 rounded-lg outline-none"
          style={{ background: 'var(--t-panel)', border: '1px solid var(--t-bdr)', color: 'var(--t-tx2)' }}>
          <option value="radial">Radial</option>
          <option value="linear">Linear</option>
          <option value="conic">Conic</option>
        </select>
        <button onClick={() => removeGradientLayer(id)} className="w-6 h-6 flex items-center justify-center">
          <Trash2 size={11} style={{ color: 'var(--t-tx3)' }} />
        </button>
      </div>
      {layer.enabled && (
        <div className="p-3 space-y-2.5">
          {(layer.type === 'radial' || layer.type === 'conic') && (<>
            <Row><Label>X</Label><Slider value={layer.posX} min={0} max={100} onChange={v => setGradientLayer(id, { posX: v })} unit="%" /></Row>
            <Row><Label>Y</Label><Slider value={layer.posY} min={0} max={100} onChange={v => setGradientLayer(id, { posY: v })} unit="%" /></Row>
          </>)}
          {layer.type === 'radial' && (<>
            <Row><Label>W</Label><Slider value={layer.sizeX} min={5} max={200} onChange={v => setGradientLayer(id, { sizeX: v })} unit="%" /></Row>
            <Row><Label>H</Label><Slider value={layer.sizeY} min={5} max={200} onChange={v => setGradientLayer(id, { sizeY: v })} unit="%" /></Row>
          </>)}
          {(layer.type === 'linear' || layer.type === 'conic') && (
            <Row><Label>Angle</Label><Slider value={layer.angle} min={0} max={360} onChange={v => setGradientLayer(id, { angle: v })} unit="°" /></Row>
          )}
          <div className="rounded-lg h-5 w-full" style={{
            background: (() => {
              const stops = layer.stops.map(s => `${hexAlpha(s.hex, s.alpha)} ${s.position}%`).join(', ')
              return layer.type === 'linear' ? `linear-gradient(${layer.angle}deg, ${stops})` : `radial-gradient(ellipse at 50% 50%, ${stops})`
            })(),
            border: '1px solid var(--t-bdr)',
          }} />
          <div className="space-y-2">
            <Label>Color Stops</Label>
            {layer.stops.map(stop => (
              <div key={stop.id} className="flex items-center gap-2">
                <ColorPicker value={stop.hex} alpha={stop.alpha} onChange={hex => setGradientStop(id, stop.id, { hex })} onAlpha={a => setGradientStop(id, stop.id, { alpha: a })} />
                <div className="flex items-center gap-1.5 w-28">
                  <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>pos</span>
                  <Slider value={stop.position} min={0} max={100} onChange={v => setGradientStop(id, stop.id, { position: v })} unit="%" />
                </div>
                <button onClick={() => removeGradientStop(id, stop.id)}><Trash2 size={10} style={{ color: 'var(--t-tx3)' }} /></button>
              </div>
            ))}
            <button onClick={() => addGradientStop(id)} className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded-lg"
              style={{ color: 'var(--t-p)', background: 'var(--t-p-glass)', border: '1px solid var(--t-bdr)' }}>
              <Plus size={10} /> Add stop
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ShadowLayerEditor({ layer }: { layer: ShadowLayer }) {
  const { setShadowLayer, removeShadowLayer } = useDesignStore()
  const id = layer.id
  return (
    <div className="rounded-xl p-3 mb-2" style={{ border: '1px solid var(--t-bdr)', background: 'var(--t-p-glass)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Toggle value={layer.enabled} onChange={v => setShadowLayer(id, { enabled: v })} />
        <span className="font-mono text-[10px] flex-1" style={{ color: 'var(--t-tx2)' }}>{layer.inset ? 'Inset' : 'Drop'} shadow</span>
        <Toggle value={layer.inset} onChange={v => setShadowLayer(id, { inset: v })} />
        <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>inset</span>
        <button onClick={() => removeShadowLayer(id)}><Trash2 size={11} style={{ color: 'var(--t-tx3)' }} /></button>
      </div>
      {layer.enabled && (
        <div className="space-y-1.5">
          <Row><Label>X</Label><Slider value={layer.x} min={-40} max={40} onChange={v => setShadowLayer(id, { x: v })} unit="px" /></Row>
          <Row><Label>Y</Label><Slider value={layer.y} min={-40} max={80} onChange={v => setShadowLayer(id, { y: v })} unit="px" /></Row>
          <Row><Label>Blur</Label><Slider value={layer.blur} min={0} max={100} onChange={v => setShadowLayer(id, { blur: v })} unit="px" /></Row>
          <Row><Label>Spread</Label><Slider value={layer.spread} min={-20} max={20} onChange={v => setShadowLayer(id, { spread: v })} unit="px" /></Row>
          <Row><Label>Color</Label><ColorPicker value={layer.hex} alpha={layer.alpha} onChange={hex => setShadowLayer(id, { hex })} onAlpha={a => setShadowLayer(id, { alpha: a })} /></Row>
        </div>
      )}
    </div>
  )
}

function ThemePreview({ theme }: { theme: ThemeConfig }) {
  const isDark = ['dark', 'teal'].includes(theme.category)
  const glassPanel = isDark ? 'rgba(255,255,255,0.06)' : theme.preview.panel
  return (
    <div className="rounded-lg overflow-hidden relative" style={{ height: 68, background: theme.preview.body }}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 20% 20%, ${theme.preview.g1} 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, ${theme.preview.g2} 0%, transparent 60%)` }} />
      <div className="relative flex h-full">
        <div style={{ width: 8, background: glassPanel, borderRight: `1px solid ${theme.preview.primary}20` }} />
        <div className="flex flex-col gap-0.5 p-1" style={{ width: 22, background: glassPanel }}>
          {[70,50,60,45].map((w,i) => <div key={i} className="rounded-sm" style={{ height:3, width:`${w}%`, background: i===0?`${theme.preview.primary}cc`:`${theme.preview.text}20` }} />)}
        </div>
        <div className="flex-1 flex flex-col">
          <div className="flex" style={{ height:11, background:glassPanel, borderBottom:`2px solid ${theme.preview.primary}` }}>
            <div className="px-1" style={{ background:`${theme.preview.primary}15` }}><div className="rounded-sm mt-1.5" style={{ width:18, height:2, background:`${theme.preview.text}40` }} /></div>
          </div>
          <div className="flex-1 p-1 space-y-0.5">
            {[75,55,85,40,65].map((w,i) => <div key={i} className="rounded-sm" style={{ height:2.5, width:`${w}%`, background: i===3?`${theme.preview.primary}70`:i===1?`${theme.preview.secondary}50`:`${theme.preview.text}18` }} />)}
          </div>
        </div>
        <div style={{ width:22, background:glassPanel, borderLeft:`1px solid ${theme.preview.primary}15` }} />
      </div>
      <div className="absolute bottom-0 left-0 right-0" style={{ height:4, background: theme.vars['--t-sb-bg']??'#041008' }} />
    </div>
  )
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('themes')
  const { activeThemeId, setTheme } = useThemeStore()
  const d = useDesignStore()
  const activeTheme = THEMES.find(t => t.id === activeThemeId)!
  const accent = activeTheme.preview.primary

  const handleThemeHover = (theme: ThemeConfig) => {
    const root = document.documentElement
    Object.entries(theme.vars).forEach(([k,v]) => root.style.setProperty(k,v))
    root.setAttribute('data-theme', theme.id)
    root.setAttribute('data-mode', ['dark','teal'].includes(theme.category)?'dark':'light')
  }
  const handleThemeLeave = () => {
    const root = document.documentElement
    Object.entries(activeTheme.vars).forEach(([k,v]) => root.style.setProperty(k,v))
    root.setAttribute('data-theme', activeThemeId)
    root.setAttribute('data-mode', ['dark','teal'].includes(activeTheme.category)?'dark':'light')
  }
  const exportCSS = () => {
    const root = document.documentElement
    const vars = Array.from(root.style).map(k=>`  ${k}: ${root.style.getPropertyValue(k)};`).join('\n')
    navigator.clipboard.writeText(`:root {\n${vars}\n}`)
  }
  const exportJSON = () => {
    const { set, reset, setGradientLayer, addGradientLayer, removeGradientLayer, setGradientStop, addGradientStop, removeGradientStop, setShadowLayer, addShadowLayer, removeShadowLayer, syncFromTheme, ...tokens } = useDesignStore.getState()
    navigator.clipboard.writeText(JSON.stringify(tokens, null, 2))
  }

  const FONT_OPTIONS = ['Barlow','Inter','Space Grotesk','DM Sans','Outfit','Nunito','Poppins']
  const MONO_OPTIONS = ['JetBrains Mono','Fira Code','Source Code Pro','Cascadia Code','IBM Plex Mono']
  const DISPLAY_OPTIONS = ['Barlow Condensed','Space Grotesk','Outfit','DM Sans','Inter']

  return (
    <div className="flex h-full overflow-hidden">

      {/* Sidebar */}
      <div className="w-52 shrink-0 flex flex-col h-full overflow-y-auto"
        style={{ background:'var(--t-panel)', backdropFilter:'blur(var(--t-blur))', borderRight:'1px solid var(--t-bdr)', boxShadow:'var(--t-shadow)' }}>
        <div className="px-4 py-4 shrink-0">
          <h1 className="font-condensed font-bold uppercase tracking-wider text-base" style={{ color:'var(--t-tx1)' }}>Settings</h1>
          <p className="font-mono text-[9px] mt-0.5" style={{ color:'var(--t-tx3)' }}>Design · CMS · Integrations</p>
        </div>
        <div className="px-3 mb-3">
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0" style={{ background:accent, color:'#fff' }}>CM</div>
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold truncate" style={{ color:'var(--t-tx1)' }}>Connor McNeely</p>
              <p className="font-mono text-[9px]" style={{ color:'var(--t-tx3)' }}>Pro Plan</p>
            </div>
          </div>
        </div>
        <div className="px-3 mb-2">
          <input placeholder="Filter..." className="w-full px-3 py-1.5 rounded-xl font-mono text-[11px] outline-none"
            style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)', color:'var(--t-tx1)' }} />
        </div>
        <nav className="flex-1 px-2 space-y-0.5 pb-4">
          {(['design','system'] as const).map(group => (
            <div key={group}>
              <p className="font-mono text-[8px] uppercase tracking-widest px-2 py-1.5" style={{ color:'var(--t-tx3)' }}>
                {group==='design'?'Appearance':'Integrations'}
              </p>
              {SECTIONS.filter(s=>s.group===group).map(({ id, label, icon:Icon }) => {
                const isActive = activeSection === id
                return (
                  <button key={id} onClick={() => setActiveSection(id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150"
                    style={{ background:isActive?'var(--t-p-glass)':'transparent', color:isActive?'var(--t-tx1)':'var(--t-tx3)', border:isActive?'1px solid var(--t-bdr)':'1px solid transparent', boxShadow:isActive?'var(--t-shadow)':'none' }}>
                    <Icon size={13} style={{ color:isActive?accent:'var(--t-tx3)' }} />
                    <span className="font-mono text-[11px] flex-1">{label}</span>
                    {isActive && <ChevronRight size={11} style={{ color:'var(--t-tx3)' }} />}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="px-3 pb-3">
          <button onClick={() => d.reset()} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-[10px] transition-all"
            style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)', color:'var(--t-tx3)' }}>
            <RotateCcw size={11} /> Reset to defaults
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* THEMES */}
        {activeSection === 'themes' && (
          <div className="space-y-4">
            <SectionHeader title="Color Themes" subtitle="Hover any card for live preview · click to apply" />
            <div className="grid gap-3" style={{ gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {THEMES.map(theme => {
                const isActive = theme.id === activeThemeId
                const cc: Record<string,string> = { teal:'#00c9a7', dark:'#818cf8', clean:'#94a3b8', vivid:'#f472b6', warm:'#fb923c', cool:'#38bdf8' }
                return (
                  <button key={theme.id} onClick={() => setTheme(theme.id)}
                    onMouseEnter={() => handleThemeHover(theme)} onMouseLeave={handleThemeLeave}
                    className="text-left rounded-2xl overflow-hidden transition-all duration-200"
                    style={{ background:isActive?`${theme.preview.primary}12`:'var(--t-p-glass)', border:isActive?`2px solid ${theme.preview.primary}`:'1px solid var(--t-bdr)', boxShadow:isActive?`0 0 0 3px ${theme.preview.primary}18, var(--t-shadow)`:'var(--t-shadow)', transform:isActive?'scale(1.02) translateY(-1px)':'scale(1)' }}>
                    <div className="p-2"><ThemePreview theme={theme} /></div>
                    <div className="px-2.5 pb-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-[11px]" style={{ color:isActive?theme.preview.primary:'var(--t-tx1)' }}>{theme.name}</span>
                        {isActive
                          ? <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background:theme.preview.primary }}><Check size={9} strokeWidth={3} color="#fff" /></span>
                          : <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-full" style={{ background:`${cc[theme.category]??'#94a3b8'}18`, color:cc[theme.category]??'#94a3b8', border:`1px solid ${cc[theme.category]??'#94a3b8'}30` }}>{theme.category}</span>}
                      </div>
                      <p className="font-mono text-[9px]" style={{ color:'var(--t-tx3)' }}>{theme.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* BACKGROUND */}
        {activeSection === 'background' && (
          <div className="space-y-4">
            <SectionHeader title="Background" subtitle="Base color · gradient layers · noise texture" />
            <div className="rounded-xl p-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Label>Base Color</Label>
              <div className="mt-2"><ColorPicker value={d.bgBase} onChange={hex => d.set({ bgBase: hex })} /></div>
            </div>
            <div className="rounded-xl p-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <div className="flex items-center justify-between mb-3">
                <Label>Gradient Layers</Label>
                <button onClick={() => d.addGradientLayer()} className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded-lg" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)', color:'var(--t-p)' }}>
                  <Plus size={10} /> Add layer
                </button>
              </div>
              <div className="rounded-xl h-16 mb-3" style={{ background:d.bgBase, backgroundImage:buildGradientCSS(d.gradientLayers)!=='none'?buildGradientCSS(d.gradientLayers):undefined, border:'1px solid var(--t-bdr)' }} />
              {d.gradientLayers.map((layer,i) => <GradientLayerEditor key={layer.id} layer={layer} layerIdx={i} />)}
            </div>
            <div className="rounded-xl p-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Row><Label>Noise Overlay</Label><Slider value={Math.round(d.noiseOpacity*1000)} min={0} max={80} onChange={v => d.set({ noiseOpacity:v/1000 })} unit="‰" /></Row>
            </div>
          </div>
        )}

        {/* COLORS */}
        {activeSection === 'colors' && (
          <div className="space-y-4">
            <SectionHeader title="Color Palette" subtitle="Accent · semantic · text · status bar" />
            <div className="rounded-xl p-4 space-y-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Row><Toggle value={d.overrideAccents} onChange={v => d.set({ overrideAccents:v })} /><Label>Override theme accents</Label></Row>
              <div className="space-y-3">
                {([{label:'Primary',k:'primaryHex'},{label:'Secondary',k:'secondaryHex'},{label:'Tertiary',k:'tertiaryHex'}] as const).map(({label,k}) => (
                  <Row key={k}><span className="font-mono text-[10px] w-20 shrink-0" style={{ color:'var(--t-tx3)' }}>{label}</span><ColorPicker value={d[k]} onChange={hex => d.set({[k]:hex})} /></Row>
                ))}
              </div>
            </div>
            <div className="rounded-xl p-4 space-y-3" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Label>Semantic Colors</Label>
              {([{label:'Success',k:'successHex'},{label:'Warning',k:'warningHex'},{label:'Error',k:'errorHex'},{label:'Info',k:'infoHex'}] as const).map(({label,k}) => (
                <Row key={k}>
                  <span className="font-mono text-[10px] w-16 shrink-0" style={{ color:'var(--t-tx2)' }}>{label}</span>
                  <ColorPicker value={d[k]} onChange={hex => d.set({[k]:hex})} />
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ background:d[k], boxShadow:`0 0 6px ${d[k]}80` }} />
                </Row>
              ))}
            </div>
            <div className="rounded-xl p-4 space-y-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Row><Toggle value={d.overrideText} onChange={v => d.set({ overrideText:v })} /><Label>Override text colors</Label></Row>
              {([{label:'Primary',k:'text1Hex'},{label:'Secondary',k:'text2Hex'},{label:'Muted',k:'text3Hex'}] as const).map(({label,k}) => (
                <Row key={k}><span className="font-mono text-[10px] w-16 shrink-0" style={{ color:'var(--t-tx2)' }}>{label}</span><ColorPicker value={d[k]} onChange={hex => d.set({[k]:hex})} /></Row>
              ))}
            </div>
            <div className="rounded-xl p-4 space-y-3" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Label>Status Bar</Label>
              <Row><span className="font-mono text-[10px] w-16 shrink-0" style={{ color:'var(--t-tx2)' }}>Background</span><ColorPicker value={d.statusBgHex} onChange={hex => d.set({ statusBgHex:hex })} /></Row>
              <Row><span className="font-mono text-[10px] w-16 shrink-0" style={{ color:'var(--t-tx2)' }}>Text</span><ColorPicker value={d.statusTextHex} onChange={hex => d.set({ statusTextHex:hex })} /></Row>
            </div>
          </div>
        )}

        {/* SURFACES — FIXED — no longer references panelHex/cardHex/elevatedHex */}
        {activeSection === 'surfaces' && (
          <div className="space-y-4">
            <SectionHeader title="Surfaces" subtitle="Per-layer glass opacity · all derive tint from body color" />

            {/* Surface elevation */}
            <div className="rounded-xl p-4 space-y-3" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <div>
                <Label>Surface Elevation</Label>
                <p className="font-mono text-[9px] mt-1" style={{ color:'var(--t-tx3)' }}>How much lighter panels are vs body color · 0% = invisible · 100% = maximum lift</p>
              </div>
              <Row><Slider value={Math.round(d.surfaceElevation*100)} min={0} max={100} onChange={v => d.set({ surfaceElevation:v/100 })} unit="%" /></Row>
            </div>

            {/* Per-surface alpha */}
            <div className="rounded-xl p-4 space-y-5" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <div className="flex items-center justify-between">
                <Label>Per-Layer Glass Opacity</Label>
                <p className="font-mono text-[9px]" style={{ color:'var(--t-tx3)' }}>0% = see-through · 100% = solid</p>
              </div>

              {/* Visual opacity spectrum preview */}
              <div className="flex gap-px h-6 rounded-lg overflow-hidden" style={{ border:'1px solid var(--t-bdr)' }}>
                {([{l:'Rail',a:d.railAlpha},{l:'Exp',a:d.explorerAlpha},{l:'Top',a:d.topbarAlpha},{l:'Tab',a:d.tabbarAlpha},{l:'Agent',a:d.agentAlpha},{l:'Panel',a:d.panelAlpha},{l:'Card',a:d.cardAlpha},{l:'Float',a:d.elevatedAlpha}]).map(({l,a}) => (
                  <div key={l} className="flex-1 flex items-center justify-center font-mono text-[7px]"
                    style={{ background:`rgba(255,255,255,${a*0.25})`, color:'var(--t-tx3)' }}>{Math.round(a*100)}</div>
                ))}
              </div>

              <Divider />

              {([{label:'Activity Rail',k:'railAlpha',desc:'48px left icon strip'},{label:'Explorer Panel',k:'explorerAlpha',desc:'File tree + agents'},{label:'Top Bar',k:'topbarAlpha',desc:'LL Cockpit header'},{label:'Tab Bar',k:'tabbarAlpha',desc:'File tabs row'},{label:'Agent Panel',k:'agentAlpha',desc:'Right chat panel'},{label:'Content / Panel',k:'panelAlpha',desc:'Main content + generic panels'},{label:'Cards',k:'cardAlpha',desc:'Floating cards'},{label:'Elevated',k:'elevatedAlpha',desc:'Modals, tooltips'}] as const).map(({label,k,desc}) => (
                <div key={k}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="font-mono text-[11px]" style={{ color:'var(--t-tx1)' }}>{label}</span>
                      <span className="font-mono text-[9px] ml-2" style={{ color:'var(--t-tx3)' }}>{desc}</span>
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-lg" style={{ background:'var(--t-p-glass)', color:accent, border:`1px solid ${accent}30` }}>
                      {Math.round(d[k]*100)}%
                    </span>
                  </div>
                  <Row><Slider value={Math.round(d[k]*100)} min={0} max={100} onChange={v => d.set({[k]:v/100})} unit="%" /></Row>
                </div>
              ))}
            </div>

            {/* Presets */}
            <div className="rounded-xl p-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Label>Glass Presets</Label>
              <div className="flex gap-2 mt-3 flex-wrap">
                {[
                  { label:'Ghost', desc:'Nearly invisible', values:{surfaceElevation:0.15,railAlpha:0.25,explorerAlpha:0.20,topbarAlpha:0.30,tabbarAlpha:0.20,agentAlpha:0.20,panelAlpha:0.18,cardAlpha:0.15,elevatedAlpha:0.45} },
                  { label:'Frosted', desc:'Classic glass', values:{surfaceElevation:0.30,railAlpha:0.60,explorerAlpha:0.52,topbarAlpha:0.65,tabbarAlpha:0.55,agentAlpha:0.52,panelAlpha:0.50,cardAlpha:0.45,elevatedAlpha:0.80} },
                  { label:'Solid', desc:'Opaque panels', values:{surfaceElevation:0.45,railAlpha:0.92,explorerAlpha:0.90,topbarAlpha:0.94,tabbarAlpha:0.90,agentAlpha:0.90,panelAlpha:0.88,cardAlpha:0.85,elevatedAlpha:0.98} },
                  { label:'Crystal', desc:'Max transparency', values:{surfaceElevation:0.50,railAlpha:0.12,explorerAlpha:0.10,topbarAlpha:0.15,tabbarAlpha:0.10,agentAlpha:0.10,panelAlpha:0.08,cardAlpha:0.06,elevatedAlpha:0.30} },
                ].map(({label,desc,values}) => (
                  <button key={label} onClick={() => d.set(values)} className="px-4 py-2.5 rounded-xl text-left transition-all" style={{ background:'var(--t-panel)', border:'1px solid var(--t-bdr)', boxShadow:'var(--t-shadow)', minWidth:110 }}>
                    <p className="font-mono text-[11px] font-semibold" style={{ color:'var(--t-tx1)' }}>{label}</p>
                    <p className="font-mono text-[9px]" style={{ color:'var(--t-tx3)' }}>{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* GLASS */}
        {activeSection === 'glass' && (
          <div className="space-y-4">
            <SectionHeader title="Glass & Blur" subtitle="Backdrop blur · border · inner highlight" />
            <div className="rounded-xl p-4 space-y-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Row><Label>Backdrop Blur</Label><Slider value={d.glassBlur} min={0} max={40} onChange={v => d.set({ glassBlur:v })} unit="px" /></Row>
              <Divider />
              <Row><Label>Border Color</Label><ColorPicker value={d.glassBorderHex} alpha={d.glassBorderAlpha} onChange={hex => d.set({ glassBorderHex:hex })} onAlpha={a => d.set({ glassBorderAlpha:a })} /></Row>
              <Divider />
              <Row><Toggle value={d.innerHighlight} onChange={v => d.set({ innerHighlight:v })} /><Label>Inner Highlight</Label></Row>
              {d.innerHighlight && <Row><Label>Opacity</Label><Slider value={Math.round(d.innerHighlightOpacity*100)} min={0} max={100} onChange={v => d.set({ innerHighlightOpacity:v/100 })} unit="%" /></Row>}
            </div>
          </div>
        )}

        {/* BORDERS */}
        {activeSection === 'borders' && (
          <div className="space-y-4">
            <SectionHeader title="Borders & Radius" subtitle="Corner radius · border color" />
            <div className="rounded-xl p-4 space-y-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <div>
                <Label>Corner Radius</Label>
                <div className="flex gap-3 mt-3 flex-wrap">
                  {[0,4,8,12,16,20,24].map(r => (
                    <button key={r} onClick={() => d.set({ radiusBase:r })} className="w-10 h-10 flex items-center justify-center font-mono text-[9px] transition-all"
                      style={{ borderRadius:r, border:d.radiusBase===r?'2px solid var(--t-p)':'1px solid var(--t-bdr)', background:d.radiusBase===r?'var(--t-p-glass)':'transparent', color:'var(--t-tx2)', boxShadow:d.radiusBase===r?'0 0 8px var(--t-p-glow)':'none' }}>
                      {r}px
                    </button>
                  ))}
                </div>
                <Row className="mt-3"><Label>Custom</Label><Slider value={d.radiusBase} min={0} max={32} onChange={v => d.set({ radiusBase:v })} unit="px" /></Row>
              </div>
              <Divider />
              <Row><Label>Border Color</Label><ColorPicker value={d.borderHex} alpha={d.borderAlpha} onChange={hex => d.set({ borderHex:hex })} onAlpha={a => d.set({ borderAlpha:a })} /></Row>
            </div>
          </div>
        )}

        {/* SHADOWS */}
        {activeSection === 'shadows' && (
          <div className="space-y-4">
            <SectionHeader title="Shadows" subtitle="Presets · custom layers · depth" />
            <div className="rounded-xl p-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Label>Preset</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(['none','subtle','soft','raised','floating','dramatic','custom'] as const).map(s => (
                  <button key={s} onClick={() => d.set({ shadowPreset:s })} className="py-2 rounded-xl font-mono text-[10px] capitalize transition-all"
                    style={{ background:d.shadowPreset===s?'var(--t-p-glass)':'transparent', border:d.shadowPreset===s?'1px solid var(--t-p)':'1px solid var(--t-bdr)', color:d.shadowPreset===s?'var(--t-tx1)':'var(--t-tx3)', boxShadow:d.shadowPreset===s?'0 0 8px var(--t-p-glow)':'none' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl p-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <div className="flex items-center justify-between mb-3">
                <Label>Custom Shadow Layers</Label>
                <button onClick={() => d.addShadowLayer()} className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded-lg" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)', color:'var(--t-p)' }}>
                  <Plus size={10} /> Add
                </button>
              </div>
              {d.shadowLayers.map(l => <ShadowLayerEditor key={l.id} layer={l} />)}
            </div>
          </div>
        )}

        {/* GLOW */}
        {activeSection === 'glow' && (
          <div className="space-y-4">
            <SectionHeader title="Glow & Ambient" subtitle="Accent glow · intensity · spread" />
            <div className="rounded-xl p-4 space-y-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Row><Toggle value={d.glowEnabled} onChange={v => d.set({ glowEnabled:v })} /><Label>Enable Glow</Label></Row>
              {d.glowEnabled && (<>
                <Row><Label>Intensity</Label><Slider value={Math.round(d.glowIntensity*100)} min={0} max={100} onChange={v => d.set({ glowIntensity:v/100 })} unit="%" /></Row>
                <Row><Label>Spread</Label><Slider value={d.glowSpread} min={0} max={60} onChange={v => d.set({ glowSpread:v })} unit="px" /></Row>
                <Row><Toggle value={d.glowFollowsPrimary} onChange={v => d.set({ glowFollowsPrimary:v })} /><Label>Follow primary color</Label></Row>
                {!d.glowFollowsPrimary && <Row><Label>Glow Color</Label><ColorPicker value={d.glowHex} onChange={hex => d.set({ glowHex:hex })} /></Row>}
              </>)}
            </div>
          </div>
        )}

        {/* TYPOGRAPHY */}
        {activeSection === 'typography' && (
          <div className="space-y-4">
            <SectionHeader title="Typography" subtitle="Font families · base size" />
            <div className="rounded-xl p-4 space-y-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              {([{label:'Display',k:'displayFont',opts:DISPLAY_OPTIONS},{label:'Body',k:'bodyFont',opts:FONT_OPTIONS},{label:'Mono',k:'monoFont',opts:MONO_OPTIONS}] as const).map(({label,k,opts}) => (
                <Row key={k}>
                  <span className="font-mono text-[10px] w-16 shrink-0" style={{ color:'var(--t-tx2)' }}>{label}</span>
                  <select value={d[k]} onChange={e => d.set({[k]:e.target.value})} className="flex-1 font-mono text-[11px] px-3 py-2 rounded-xl outline-none"
                    style={{ background:'var(--t-panel)', border:'1px solid var(--t-bdr)', color:'var(--t-tx1)' }}>
                    {opts.map((o:string) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Row>
              ))}
              <Divider />
              <Row><Label>Base Font Size</Label><Slider value={d.baseFontSize} min={11} max={16} step={0.5} onChange={v => d.set({ baseFontSize:v })} unit="px" /></Row>
            </div>
          </div>
        )}

        {/* MOTION */}
        {activeSection === 'motion' && (
          <div className="space-y-4">
            <SectionHeader title="Motion" subtitle="Transitions · hover effects" />
            <div className="rounded-xl p-4 space-y-4" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              <Row><Label>Transition</Label><Slider value={d.transitionMs} min={50} max={600} onChange={v => d.set({ transitionMs:v })} unit="ms" /></Row>
              <Row><Label>Hover Lift</Label><Slider value={d.hoverLiftPx} min={0} max={8} onChange={v => d.set({ hoverLiftPx:v })} unit="px" /></Row>
              <Row><Toggle value={d.hoverGlow} onChange={v => d.set({ hoverGlow:v })} /><Label>Hover glow effect</Label></Row>
            </div>
          </div>
        )}

        {/* EXPORT */}
        {activeSection === 'export' && (
          <div className="space-y-4">
            <SectionHeader title="Export Theme" subtitle="Copy as CSS variables or JSON design tokens" />
            <div className="space-y-3">
              {([{label:'Copy CSS Variables',desc:'All active CSS custom properties as :root block',action:exportCSS,icon:Copy},{label:'Copy JSON Tokens',desc:'Full design token object for version control or import',action:exportJSON,icon:Download}] as const).map(({label,desc,action,icon:Icon}) => (
                <button key={label} onClick={action} className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all"
                  style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)', boxShadow:'var(--t-shadow)' }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background:`${accent}20`, border:'1px solid var(--t-bdr)' }}>
                    <Icon size={14} style={{ color:accent }} />
                  </div>
                  <div>
                    <p className="font-mono text-[11px] font-semibold" style={{ color:'var(--t-tx1)' }}>{label}</p>
                    <p className="font-mono text-[9px]" style={{ color:'var(--t-tx3)' }}>{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI MODELS */}
        {activeSection === 'ai-models' && (
          <div className="space-y-5">
            <SectionHeader title="AI Models" subtitle="Provider routing · capability lanes · D1 model registry" />
            {AI_MODELS.map(({provider,models}) => (
              <div key={provider}>
                <Label>{provider}</Label>
                <div className="mt-2 space-y-1.5">
                  {models.map(m => (
                    <div key={m.id} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                      style={{ background:m.active?'var(--t-p-glass)':'var(--t-panel)', border:m.active?'1px solid var(--t-bdr-s)':'1px solid var(--t-bdr)', boxShadow:'var(--t-shadow)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ background:m.active?accent:'var(--t-tx3)', boxShadow:m.active?`0 0 6px ${accent}`:'none' }} />
                        <div>
                          <p className="font-mono text-[11px] font-medium" style={{ color:'var(--t-tx1)' }}>{m.name}</p>
                          <p className="font-mono text-[9px]" style={{ color:'var(--t-tx3)' }}>{m.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {m.caps.map(c => <Pill key={c} label={c} />)}
                        <Pill label={m.size} style={{ color:'var(--t-tx3)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PLACEHOLDER */}
        {!['themes','background','colors','surfaces','glass','borders','shadows','glow','typography','motion','export','ai-models'].includes(activeSection) && (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background:'var(--t-p-glass)', border:'1px solid var(--t-bdr)' }}>
              {(()=>{ const s=SECTIONS.find(s=>s.id===activeSection); return s?<s.icon size={20} style={{ color:accent }} />:null })()}
            </div>
            <p className="font-mono text-xs font-semibold" style={{ color:'var(--t-tx1)' }}>{SECTIONS.find(s=>s.id===activeSection)?.label}</p>
            <p className="font-mono text-[10px]" style={{ color:'var(--t-tx3)' }}>Coming in Sprint 5 · D1 migration 0009</p>
          </div>
        )}

      </div>
    </div>
  )
}
