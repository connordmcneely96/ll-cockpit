'use client'

import { useState } from 'react'
import { THEMES, type ThemeConfig } from '@/lib/themes'
import { useThemeStore } from '@/stores/themeStore'
import { useDesignStore } from '@/stores/designStore'
import type { GradientLayer, GradientStop, ShadowLayer } from '@/lib/design-tokens'
import { hexAlpha, buildGradientCSS } from '@/lib/design-tokens'
import {
  Check, Palette, Layers, Settings, Bot, Wrench, GitBranch,
  HardDrive, Shield, BookOpen, Bell, Globe, ChevronRight,
  Plus, Trash2, Eye, RotateCcw, Copy, Download, RefreshCw,
} from 'lucide-react'

const SECTIONS = [
  { id:'themes',     label:'Themes',          icon:Palette,   group:'design' },
  { id:'background', label:'Background',       icon:Layers,    group:'design' },
  { id:'colors',     label:'Color Palette',    icon:Palette,   group:'design' },
  { id:'surfaces',   label:'Surfaces',         icon:Layers,    group:'design' },
  { id:'glass',      label:'Glass & Blur',     icon:Eye,       group:'design' },
  { id:'borders',    label:'Borders & Radius', icon:Settings,  group:'design' },
  { id:'shadows',    label:'Shadows',          icon:Layers,    group:'design' },
  { id:'glow',       label:'Glow & Ambient',   icon:Eye,       group:'design' },
  { id:'typography', label:'Typography',       icon:Settings,  group:'design' },
  { id:'motion',     label:'Motion',           icon:Settings,  group:'design' },
  { id:'export',     label:'Export Theme',     icon:Download,  group:'design' },
  { id:'ai-models',  label:'AI Models',        icon:Bot,       group:'system' },
  { id:'mcp',        label:'Tools & MCP',      icon:Wrench,    group:'system' },
  { id:'github',     label:'GitHub',           icon:GitBranch, group:'system' },
  { id:'storage',    label:'Storage',          icon:HardDrive, group:'system' },
  { id:'security',   label:'Security',         icon:Shield,    group:'system' },
  { id:'general',    label:'General',          icon:Settings,  group:'system' },
]

const AI_MODELS = [
  { provider:'ANTHROPIC', models:[
    {id:'claude-haiku-4-5-20251001',name:'Claude Haiku 4.5',caps:['Tools'],size:'small',active:false},
    {id:'claude-sonnet-4-6',name:'Claude Sonnet 4.6',caps:['Tools'],size:'medium',active:true},
    {id:'claude-opus-4-6',name:'Claude Opus 4.6',caps:['Tools'],size:'large',active:false},
  ]},
  { provider:'OPENAI', models:[
    {id:'gpt-5.4-nano',name:'GPT-5.4 Nano',caps:['Tools'],size:'small',active:false},
    {id:'gpt-5.4-mini',name:'GPT-5.4 Mini',caps:['Tools','Vision'],size:'medium',active:false},
    {id:'gpt-5.4',name:'GPT-5.4',caps:['Tools','Vision'],size:'large',active:false},
  ]},
  { provider:'GEMINI', models:[
    {id:'gemini-2.0-flash',name:'Gemini 2.0 Flash',caps:['Tools','Vision'],size:'small',active:false},
    {id:'gemini-2.5-pro',name:'Gemini 2.5 Pro',caps:['Tools','Vision'],size:'large',active:false},
  ]},
  { provider:'WORKERS AI', models:[
    {id:'@cf/meta/llama-3.1-8b-instruct',name:'Llama 3.1 8B',caps:['Tools'],size:'small',active:false},
    {id:'@cf/baai/bge-large-en-v1.5',name:'BGE Large Embeddings',caps:['Embed'],size:'small',active:false},
  ]},
]

// ── Primitives ──
function Label({ children, className='' }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-[10px] uppercase tracking-widest ${className}`} style={{color:'var(--t-tx3)'}}>{children}</span>
}
function SectionHeader({ title, subtitle, badge }: { title: string; subtitle: string; badge?: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <h2 className="font-condensed font-bold uppercase tracking-wider text-base" style={{color:'var(--t-tx1)'}}>{title}</h2>
        {badge && <span className="font-mono text-[8px] px-2 py-0.5 rounded-full" style={{background:'var(--d-success)22',color:'var(--d-success)',border:'1px solid var(--d-success)40'}}>{badge}</span>}
      </div>
      <p className="font-mono text-[10px] mt-0.5" style={{color:'var(--t-tx3)'}}>{subtitle}</p>
    </div>
  )
}
function Row({ children, className='' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center gap-3 ${className}`}>{children}</div>
}
function Divider() {
  return <div className="h-px my-4" style={{background:'var(--t-bdr)'}} />
}
function Pill({ label, style={} }: { label: string; style?: React.CSSProperties }) {
  return <span className="font-mono text-[8px] px-2 py-0.5 rounded-full" style={{background:'var(--t-p-glass)',color:'var(--t-p)',border:'1px solid var(--t-bdr)',...style}}>{label}</span>
}
function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={()=>onChange(!value)} className="relative w-9 h-5 rounded-full transition-all shrink-0"
        style={{background:value?'var(--t-p)':'var(--t-bdr-s)',boxShadow:value?'0 0 8px var(--t-p-glow)':'none'}}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{left:value?'1.1rem':'0.1rem',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}} />
      </button>
      {label && <span className="font-mono text-[11px]" style={{color:value?'var(--t-tx1)':'var(--t-tx3)'}}>{label}</span>}
    </div>
  )
}
function Slider({ value, min, max, step=1, onChange, unit='' }: {
  value: number; min: number; max: number; step?: number; onChange:(v:number)=>void; unit?:string
}) {
  const pct = ((value-min)/(max-min))*100
  return (
    <div className="relative flex items-center gap-2 flex-1">
      <div className="flex-1 relative h-1.5 rounded-full" style={{background:'var(--t-bdr-s)'}}>
        <div className="absolute left-0 top-0 h-full rounded-full" style={{width:`${pct}%`,background:'linear-gradient(to right, var(--t-p-dim), var(--t-p))'}} />
        <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full pointer-events-none"
          style={{left:`calc(${pct}% - 7px)`,background:'#fff',border:'2px solid var(--t-p)',boxShadow:'0 0 6px var(--t-p-glow)'}} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>
      <span className="font-mono text-[10px] w-12 text-right shrink-0" style={{color:'var(--t-tx2)'}}>{value}{unit}</span>
    </div>
  )
}
function ColorPicker({ value, alpha, onChange, onAlpha }: {
  value: string; alpha?: number; onChange:(hex:string)=>void; onAlpha?:(a:number)=>void
}) {
  const pct = alpha!==undefined ? Math.round(alpha*100) : null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative w-8 h-8 rounded-xl overflow-hidden shrink-0" style={{background:value,border:'1px solid var(--t-bdr)'}}>
        <input type="color" value={value} onChange={e=>onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>
      <input value={value.toUpperCase()} onChange={e=>{if(/^#[0-9a-fA-F]{0,6}$/.test(e.target.value))onChange(e.target.value)}}
        className="w-24 font-mono text-[11px] px-2 py-1.5 rounded-xl outline-none"
        style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)',color:'var(--t-tx1)'}} />
      {pct!==null && onAlpha && (
        <div className="flex items-center gap-1.5" style={{minWidth:100}}>
          <span className="font-mono text-[9px]" style={{color:'var(--t-tx3)'}}>opacity</span>
          <div className="flex-1 relative h-1.5 rounded-full" style={{background:'var(--t-bdr-s)',minWidth:60}}>
            <div className="absolute left-0 top-0 h-full rounded-full" style={{width:`${pct}%`,background:value}} />
            <input type="range" min={0} max={100} value={pct} onChange={e=>onAlpha(Number(e.target.value)/100)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </div>
          <span className="font-mono text-[10px] w-8 shrink-0" style={{color:'var(--t-tx3)'}}>{pct}%</span>
        </div>
      )}
    </div>
  )
}

function GradientLayerEditor({ layer, layerIdx }: { layer: GradientLayer; layerIdx: number }) {
  const { setGradientLayer, setGradientStop, addGradientStop, removeGradientStop, removeGradientLayer } = useDesignStore()
  const id = layer.id
  return (
    <div className="rounded-xl overflow-hidden mb-3" style={{border:'1px solid var(--t-bdr)',background:'rgba(255,255,255,0.02)'}}>
      <div className="flex items-center gap-2 px-3 py-2" style={{borderBottom:'1px solid var(--t-bdr)'}}>
        <Toggle value={layer.enabled} onChange={v=>setGradientLayer(id,{enabled:v})} />
        <span className="font-mono text-[11px] flex-1" style={{color:'var(--t-tx1)'}}>Layer {layerIdx+1}</span>
        <select value={layer.type} onChange={e=>setGradientLayer(id,{type:e.target.value as GradientLayer['type']})}
          className="font-mono text-[10px] px-2 py-1 rounded-lg outline-none"
          style={{background:'var(--t-panel)',border:'1px solid var(--t-bdr)',color:'var(--t-tx2)'}}>
          <option value="radial">Radial</option>
          <option value="linear">Linear</option>
          <option value="conic">Conic</option>
        </select>
        <button onClick={()=>removeGradientLayer(id)} className="w-6 h-6 flex items-center justify-center">
          <Trash2 size={11} style={{color:'var(--t-tx3)'}} />
        </button>
      </div>
      {layer.enabled && (
        <div className="p-3 space-y-2.5">
          {(layer.type==='radial'||layer.type==='conic')&&(<>
            <Row><Label>X pos</Label><Slider value={layer.posX} min={0} max={100} onChange={v=>setGradientLayer(id,{posX:v})} unit="%" /></Row>
            <Row><Label>Y pos</Label><Slider value={layer.posY} min={0} max={100} onChange={v=>setGradientLayer(id,{posY:v})} unit="%" /></Row>
          </>)}
          {layer.type==='radial'&&(<>
            <Row><Label>Width</Label><Slider value={layer.sizeX} min={5} max={200} onChange={v=>setGradientLayer(id,{sizeX:v})} unit="%" /></Row>
            <Row><Label>Height</Label><Slider value={layer.sizeY} min={5} max={200} onChange={v=>setGradientLayer(id,{sizeY:v})} unit="%" /></Row>
          </>)}
          {(layer.type==='linear'||layer.type==='conic')&&(
            <Row><Label>Angle</Label><Slider value={layer.angle} min={0} max={360} onChange={v=>setGradientLayer(id,{angle:v})} unit="°" /></Row>
          )}
          {/* gradient preview */}
          <div className="rounded-lg h-6 w-full" style={{
            background:(()=>{const s=layer.stops.map(s=>`${hexAlpha(s.hex,s.alpha)} ${s.position}%`).join(', ');return layer.type==='linear'?`linear-gradient(${layer.angle}deg, ${s})`:`radial-gradient(ellipse at 50% 50%, ${s})`})(),
            border:'1px solid var(--t-bdr)',
          }} />
          {/* color stops */}
          <div className="space-y-2">
            <Label>Color Stops</Label>
            {layer.stops.map(stop=>(
              <div key={stop.id} className="flex items-center gap-2 flex-wrap">
                <ColorPicker value={stop.hex} alpha={stop.alpha}
                  onChange={hex=>setGradientStop(id,stop.id,{hex})}
                  onAlpha={a=>setGradientStop(id,stop.id,{alpha:a})} />
                <Row>
                  <span className="font-mono text-[9px]" style={{color:'var(--t-tx3)'}}>pos</span>
                  <Slider value={stop.position} min={0} max={100} onChange={v=>setGradientStop(id,stop.id,{position:v})} unit="%" />
                </Row>
                <button onClick={()=>removeGradientStop(id,stop.id)} className="shrink-0">
                  <Trash2 size={10} style={{color:'var(--t-tx3)'}} />
                </button>
              </div>
            ))}
            <button onClick={()=>addGradientStop(id)} className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded-lg"
              style={{color:'var(--t-p)',background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
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
    <div className="rounded-xl p-3 mb-2" style={{border:'1px solid var(--t-bdr)',background:'rgba(255,255,255,0.02)'}}>
      <div className="flex items-center gap-2 mb-2">
        <Toggle value={layer.enabled} onChange={v=>setShadowLayer(id,{enabled:v})} />
        <span className="font-mono text-[10px] flex-1" style={{color:'var(--t-tx2)'}}>{layer.inset?'Inset':'Drop'} shadow</span>
        <Toggle value={layer.inset} onChange={v=>setShadowLayer(id,{inset:v})} label="inset" />
        <button onClick={()=>removeShadowLayer(id)}><Trash2 size={11} style={{color:'var(--t-tx3)'}} /></button>
      </div>
      {layer.enabled&&(
        <div className="space-y-1.5">
          <Row><Label>X</Label><Slider value={layer.x} min={-40} max={40} onChange={v=>setShadowLayer(id,{x:v})} unit="px" /></Row>
          <Row><Label>Y</Label><Slider value={layer.y} min={-40} max={80} onChange={v=>setShadowLayer(id,{y:v})} unit="px" /></Row>
          <Row><Label>Blur</Label><Slider value={layer.blur} min={0} max={100} onChange={v=>setShadowLayer(id,{blur:v})} unit="px" /></Row>
          <Row><Label>Spread</Label><Slider value={layer.spread} min={-20} max={20} onChange={v=>setShadowLayer(id,{spread:v})} unit="px" /></Row>
          <Row><Label>Color</Label><ColorPicker value={layer.hex} alpha={layer.alpha} onChange={hex=>setShadowLayer(id,{hex})} onAlpha={a=>setShadowLayer(id,{alpha:a})} /></Row>
        </div>
      )}
    </div>
  )
}

function ThemePreview({ theme }: { theme: ThemeConfig }) {
  const isDark = ['dark','teal'].includes(theme.category)
  const gp = isDark ? 'rgba(255,255,255,0.06)' : theme.preview.panel
  return (
    <div className="rounded-lg overflow-hidden relative" style={{height:68,background:theme.preview.body}}>
      <div className="absolute inset-0" style={{background:`radial-gradient(ellipse at 20% 20%, ${theme.preview.g1} 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, ${theme.preview.g2} 0%, transparent 60%)`}} />
      <div className="relative flex h-full">
        <div style={{width:8,background:gp,borderRight:`1px solid ${theme.preview.primary}20`}} />
        <div className="flex flex-col gap-0.5 p-1" style={{width:22,background:gp}}>
          {[70,50,60,45].map((w,i)=><div key={i} className="rounded-sm" style={{height:3,width:`${w}%`,background:i===0?`${theme.preview.primary}cc`:`${theme.preview.text}20`}} />)}
        </div>
        <div className="flex-1 flex flex-col">
          <div className="flex" style={{height:11,background:gp,borderBottom:`2px solid ${theme.preview.primary}`}}>
            <div className="px-1" style={{background:`${theme.preview.primary}15`}}><div className="rounded-sm mt-1.5" style={{width:18,height:2,background:`${theme.preview.text}40`}} /></div>
          </div>
          <div className="flex-1 p-1 space-y-0.5">
            {[75,55,85,40,65].map((w,i)=><div key={i} className="rounded-sm" style={{height:2.5,width:`${w}%`,background:i===3?`${theme.preview.primary}70`:i===1?`${theme.preview.secondary}50`:`${theme.preview.text}18`}} />)}
          </div>
        </div>
        <div style={{width:22,background:gp,borderLeft:`1px solid ${theme.preview.primary}15`}} />
      </div>
      <div className="absolute bottom-0 left-0 right-0" style={{height:4,background:theme.vars['--t-sb-bg']??'#041008'}} />
    </div>
  )
}

const CARD = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl p-4 space-y-4" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>{children}</div>
)

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('themes')
  const { activeThemeId, setTheme } = useThemeStore()
  const d = useDesignStore()
  const activeTheme = THEMES.find(t=>t.id===activeThemeId)!
  const accent = activeTheme.preview.primary

  const handleThemeHover = (theme: ThemeConfig) => {
    const root = document.documentElement
    Object.entries(theme.vars).forEach(([k,v])=>root.style.setProperty(k,v))
    root.setAttribute('data-theme',theme.id)
    root.setAttribute('data-mode',['dark','teal'].includes(theme.category)?'dark':'light')
  }
  const handleThemeLeave = () => {
    const root = document.documentElement
    Object.entries(activeTheme.vars).forEach(([k,v])=>root.style.setProperty(k,v))
    root.setAttribute('data-theme',activeThemeId)
    root.setAttribute('data-mode',['dark','teal'].includes(activeTheme.category)?'dark':'light')
  }
  const exportCSS = () => {
    const root = document.documentElement
    const vars = Array.from(root.style).map(k=>`  ${k}: ${root.style.getPropertyValue(k)};`).join('\n')
    navigator.clipboard.writeText(`:root {\n${vars}\n}`)
  }
  const exportJSON = () => {
    const { set,reset,syncFromTheme,setGradientLayer,addGradientLayer,removeGradientLayer,setGradientStop,addGradientStop,removeGradientStop,setShadowLayer,addShadowLayer,removeShadowLayer,...tokens } = useDesignStore.getState()
    navigator.clipboard.writeText(JSON.stringify(tokens,null,2))
  }

  const BODY_FONTS    = ['Barlow','Inter','Space Grotesk','DM Sans','Outfit','Nunito','Poppins']
  const MONO_FONTS    = ['JetBrains Mono','Fira Code','Source Code Pro','IBM Plex Mono']
  const DISPLAY_FONTS = ['Barlow Condensed','Space Grotesk','Outfit','DM Sans','Inter']

  const SURFACES = [
    {label:'Activity Rail', hexK:'railHex'    as const, alphaK:'railAlpha'     as const, varName:'--d-rail',     desc:'48px left icon strip'},
    {label:'Explorer',      hexK:'explorerHex' as const, alphaK:'explorerAlpha' as const, varName:'--d-explorer', desc:'File tree + agents'},
    {label:'Top Bar',       hexK:'topbarHex'  as const, alphaK:'topbarAlpha'   as const, varName:'--d-topbar',   desc:'Header bar'},
    {label:'Tab Bar',       hexK:'tabbarHex'  as const, alphaK:'tabbarAlpha'   as const, varName:'--d-tabbar',   desc:'File tabs row'},
    {label:'Agent Panel',   hexK:'agentHex'   as const, alphaK:'agentAlpha'    as const, varName:'--d-agent',    desc:'Right chat panel'},
    {label:'Content',       hexK:'contentHex' as const, alphaK:'panelAlpha'    as const, varName:'--d-panel',    desc:'Main content area'},
    {label:'Cards',         hexK:'cardHex'    as const, alphaK:'cardAlpha'     as const, varName:'--d-card',     desc:'Floating cards'},
    {label:'Elevated',      hexK:'elevatedHex' as const,alphaK:'elevatedAlpha' as const, varName:'--d-elevated', desc:'Modals, tooltips'},
  ] as const

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar ── */}
      <div className="w-52 shrink-0 flex flex-col h-full overflow-y-auto"
        style={{background:'var(--t-panel)',backdropFilter:'blur(var(--t-blur))',borderRight:'1px solid var(--t-bdr)',boxShadow:'var(--t-shadow)'}}>
        <div className="px-4 py-4 shrink-0">
          <h1 className="font-condensed font-bold uppercase tracking-wider text-base" style={{color:'var(--t-tx1)'}}>Settings</h1>
          <p className="font-mono text-[9px] mt-0.5" style={{color:'var(--t-tx3)'}}>Design · CMS · Integrations</p>
        </div>
        <div className="px-3 mb-3">
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0" style={{background:accent,color:'#fff'}}>CM</div>
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold truncate" style={{color:'var(--t-tx1)'}}>Connor McNeely</p>
              <p className="font-mono text-[9px]" style={{color:'var(--t-tx3)'}}>Pro Plan</p>
            </div>
          </div>
        </div>
        <div className="px-3 mb-2">
          <input placeholder="Filter..." className="w-full px-3 py-1.5 rounded-xl font-mono text-[11px] outline-none"
            style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)',color:'var(--t-tx1)'}} />
        </div>
        <nav className="flex-1 px-2 space-y-0.5 pb-4">
          {(['design','system'] as const).map(group=>(
            <div key={group}>
              <p className="font-mono text-[8px] uppercase tracking-widest px-2 py-1.5" style={{color:'var(--t-tx3)'}}>   {group==='design'?'Appearance':'Integrations'}</p>
              {SECTIONS.filter(s=>s.group===group).map(({id,label,icon:Icon})=>{
                const isActive=activeSection===id
                return (
                  <button key={id} onClick={()=>setActiveSection(id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150"
                    style={{background:isActive?'var(--t-p-glass)':'transparent',color:isActive?'var(--t-tx1)':'var(--t-tx3)',border:isActive?'1px solid var(--t-bdr)':'1px solid transparent',boxShadow:isActive?'var(--t-shadow)':'none'}}>
                    <Icon size={13} style={{color:isActive?accent:'var(--t-tx3)'}} />
                    <span className="font-mono text-[11px] flex-1">{label}</span>
                    {isActive&&<ChevronRight size={11} style={{color:'var(--t-tx3)'}} />}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="px-3 pb-3">
          <button onClick={()=>d.reset()} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-[10px] transition-all"
            style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)',color:'var(--t-tx3)'}}>
            <RotateCcw size={11} /> Reset to defaults
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* THEMES */}
        {activeSection==='themes' && (
          <div className="space-y-4">
            <SectionHeader title="Color Themes" subtitle="Hover any card for live preview · click to apply" badge="LIVE" />
            <div className="grid gap-3" style={{gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))'}}>
              {THEMES.map(theme=>{
                const isActive=theme.id===activeThemeId
                const cc:Record<string,string>={teal:'#00c9a7',dark:'#818cf8',clean:'#94a3b8',vivid:'#f472b6',warm:'#fb923c',cool:'#38bdf8'}
                return (
                  <button key={theme.id} onClick={()=>setTheme(theme.id)}
                    onMouseEnter={()=>handleThemeHover(theme)} onMouseLeave={handleThemeLeave}
                    className="text-left rounded-2xl overflow-hidden transition-all duration-200"
                    style={{background:isActive?`${theme.preview.primary}12`:'var(--t-p-glass)',border:isActive?`2px solid ${theme.preview.primary}`:'1px solid var(--t-bdr)',boxShadow:isActive?`0 0 0 3px ${theme.preview.primary}18, var(--t-shadow)`:'var(--t-shadow)',transform:isActive?'scale(1.02) translateY(-1px)':'scale(1)'}}>
                    <div className="p-2"><ThemePreview theme={theme} /></div>
                    <div className="px-2.5 pb-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-[11px]" style={{color:isActive?theme.preview.primary:'var(--t-tx1)'}}>{theme.name}</span>
                        {isActive
                          ? <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{background:theme.preview.primary}}><Check size={9} strokeWidth={3} color="#fff" /></span>
                          : <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-full" style={{background:`${cc[theme.category]??'#94a3b8'}18`,color:cc[theme.category]??'#94a3b8',border:`1px solid ${cc[theme.category]??'#94a3b8'}30`}}>{theme.category}</span>}
                      </div>
                      <p className="font-mono text-[9px]" style={{color:'var(--t-tx3)'}}>{theme.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* BACKGROUND */}
        {activeSection==='background' && (
          <div className="space-y-4">
            <SectionHeader title="Background" subtitle="Base color · gradient layers · noise texture" />

            {/* Sync toggle */}
            <CARD>
              <div className="flex items-center justify-between">
                <div>
                  <Toggle value={d.syncWithTheme} onChange={v=>d.set({syncWithTheme:v})} label="Auto-sync from theme" />
                  <p className="font-mono text-[9px] mt-1 ml-11" style={{color:'var(--t-tx3)'}}>
                    {d.syncWithTheme ? 'Background + gradients update when you change theme' : 'Manual control — theme changes do not affect background'}
                  </p>
                </div>
                <RefreshCw size={13} style={{color:d.syncWithTheme?accent:'var(--t-tx3)',opacity:d.syncWithTheme?1:0.3}} />
              </div>
            </CARD>

            <CARD>
              <Label>Base Color</Label>
              <ColorPicker value={d.bgBase} onChange={hex=>d.set({bgBase:hex})} />
            </CARD>

            <div className="rounded-xl p-4" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
              <div className="flex items-center justify-between mb-3">
                <Label>Gradient Layers ({d.gradientLayers.filter(l=>l.enabled).length} active)</Label>
                <button onClick={()=>d.addGradientLayer()} className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded-lg"
                  style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)',color:'var(--t-p)'}}>
                  <Plus size={10} /> Add layer
                </button>
              </div>
              {/* Full-bg preview */}
              <div className="rounded-xl h-20 mb-3" style={{
                background:d.bgBase,
                backgroundImage:buildGradientCSS(d.gradientLayers)!=='none'?buildGradientCSS(d.gradientLayers):undefined,
                border:'1px solid var(--t-bdr)',
              }} />
              {d.gradientLayers.map((layer,i)=><GradientLayerEditor key={layer.id} layer={layer} layerIdx={i} />)}
            </div>

            <CARD>
              <Row><Label>Noise Texture</Label><Slider value={Math.round(d.noiseOpacity*1000)} min={0} max={80} onChange={v=>d.set({noiseOpacity:v/1000})} unit="‰" /></Row>
            </CARD>
          </div>
        )}

        {/* COLORS */}
        {activeSection==='colors' && (
          <div className="space-y-4">
            <SectionHeader title="Color Palette" subtitle="Accent · semantic · text · status bar" />

            <div className="rounded-xl p-4" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Toggle value={d.overrideAccents} onChange={v=>d.set({overrideAccents:v})} label="Override theme accent colors" />
                  <p className="font-mono text-[9px] mt-1 ml-11" style={{color:'var(--t-tx3)'}}>
                    {d.overrideAccents ? 'Using custom colors below' : 'Using colors from active theme'}
                  </p>
                </div>
              </div>
              <div className="space-y-3" style={{opacity:d.overrideAccents?1:0.45,pointerEvents:d.overrideAccents?'auto':'none'}}>
                {([{label:'Primary',k:'primaryHex'},{label:'Secondary',k:'secondaryHex'},{label:'Tertiary / Gold',k:'tertiaryHex'}] as const).map(({label,k})=>(
                  <Row key={k}>
                    <span className="font-mono text-[10px] w-24 shrink-0" style={{color:'var(--t-tx3)'}}>{label}</span>
                    <div className="w-4 h-4 rounded-full shrink-0" style={{background:d[k],boxShadow:`0 0 6px ${d[k]}80`}} />
                    <ColorPicker value={d[k]} onChange={hex=>d.set({[k]:hex})} />
                  </Row>
                ))}
              </div>
            </div>

            <CARD>
              <Label>Semantic Colors</Label>
              {([{label:'Success',k:'successHex'},{label:'Warning',k:'warningHex'},{label:'Error',k:'errorHex'},{label:'Info',k:'infoHex'}] as const).map(({label,k})=>(
                <Row key={k}>
                  <div className="w-3 h-3 rounded-full shrink-0" style={{background:d[k],boxShadow:`0 0 6px ${d[k]}80`}} />
                  <span className="font-mono text-[10px] w-16 shrink-0" style={{color:'var(--t-tx2)'}}>{label}</span>
                  <ColorPicker value={d[k]} onChange={hex=>d.set({[k]:hex})} />
                </Row>
              ))}
            </CARD>

            <div className="rounded-xl p-4" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
              <div className="flex items-center justify-between mb-3">
                <Toggle value={d.overrideText} onChange={v=>d.set({overrideText:v})} label="Override text colors" />
                <p className="font-mono text-[9px]" style={{color:'var(--t-tx3)'}}>{d.overrideText?'Custom':'From theme'}</p>
              </div>
              <div className="space-y-3" style={{opacity:d.overrideText?1:0.45,pointerEvents:d.overrideText?'auto':'none'}}>
                {([{label:'Text primary',k:'text1Hex'},{label:'Text secondary',k:'text2Hex'},{label:'Text muted',k:'text3Hex'}] as const).map(({label,k})=>(
                  <Row key={k}>
                    <span className="font-mono text-[10px] w-28 shrink-0" style={{color:'var(--t-tx2)'}}>{label}</span>
                    <ColorPicker value={d[k]} onChange={hex=>d.set({[k]:hex})} />
                  </Row>
                ))}
              </div>
            </div>

            <CARD>
              <Label>Status Bar</Label>
              <Row><span className="font-mono text-[10px] w-24 shrink-0" style={{color:'var(--t-tx2)'}}>Background</span><ColorPicker value={d.statusBgHex} onChange={hex=>d.set({statusBgHex:hex})} /></Row>
              <Row><span className="font-mono text-[10px] w-24 shrink-0" style={{color:'var(--t-tx2)'}}>Text</span><ColorPicker value={d.statusTextHex} onChange={hex=>d.set({statusTextHex:hex})} /></Row>
            </CARD>
          </div>
        )}

        {/* SURFACES */}
        {activeSection==='surfaces' && (
          <div className="space-y-4">
            <SectionHeader title="Surfaces" subtitle="Independent color + opacity per UI layer · each can look completely different" />

            {/* Color mode toggle */}
            <div className="rounded-xl p-4" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
              <div className="flex items-center justify-between">
                <div>
                  <Toggle value={d.surfaceCustomColors} onChange={v=>d.set({surfaceCustomColors:v})} label={d.surfaceCustomColors?'Custom colors per surface':'Derive all colors from body'} />
                  <p className="font-mono text-[9px] mt-1 ml-11" style={{color:'var(--t-tx3)'}}>
                    {d.surfaceCustomColors
                      ? 'Each surface has its own color — pick anything'
                      : 'All surfaces tint from body color · use elevation slider below'}
                  </p>
                </div>
              </div>
              {!d.surfaceCustomColors && (
                <div className="mt-4">
                  <Row><Label>Surface Elevation</Label></Row>
                  <p className="font-mono text-[9px] mt-1 mb-2" style={{color:'var(--t-tx3)'}}>How much lighter panels appear vs the body color</p>
                  <Row><Slider value={Math.round(d.surfaceElevation*100)} min={0} max={100} onChange={v=>d.set({surfaceElevation:v/100})} unit="%" /></Row>
                </div>
              )}
            </div>

            {/* Live CSS variable preview */}
            <div className="rounded-xl overflow-hidden" style={{border:'1px solid var(--t-bdr)'}}>
              <div className="px-3 py-2" style={{borderBottom:'1px solid var(--t-bdr)',background:'var(--t-p-glass)'}}>
                <Label>Live Surface Preview</Label>
              </div>
              <div className="flex h-10">
                {SURFACES.map(({label,varName})=>(
                  <div key={label} className="flex-1 flex items-center justify-center font-mono text-[7px] border-r last:border-r-0"
                    style={{background:`var(${varName})`,backdropFilter:'blur(var(--t-blur))',borderColor:'var(--t-bdr)',color:'var(--t-tx2)'}}>
                    {label.split(' ')[0]}
                  </div>
                ))}
              </div>
            </div>

            {/* Per-surface controls */}
            <div className="space-y-3">
              {SURFACES.map(({label,hexK,alphaK,desc})=>(
                <div key={hexK} className="rounded-xl p-4" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-mono text-[12px] font-semibold" style={{color:'var(--t-tx1)'}}>{label}</p>
                      <p className="font-mono text-[9px]" style={{color:'var(--t-tx3)'}}>{desc}</p>
                    </div>
                    {/* Swatch preview of current computed value */}
                    <div className="w-8 h-8 rounded-lg border" style={{
                      background: d.surfaceCustomColors ? hexAlpha(d[hexK], d[alphaK]) : undefined,
                      backdropFilter: !d.surfaceCustomColors ? 'blur(8px)' : undefined,
                      borderColor: 'var(--t-bdr)',
                    }} />
                  </div>

                  {/* Color picker — only visible in custom mode */}
                  {d.surfaceCustomColors && (
                    <div className="mb-3">
                      <Label>Fill Color</Label>
                      <div className="mt-2">
                        <ColorPicker value={d[hexK]} onChange={hex=>d.set({[hexK]:hex})} />
                      </div>
                    </div>
                  )}

                  {/* Alpha — always visible */}
                  <Row>
                    <Label>Opacity</Label>
                    <Slider value={Math.round(d[alphaK]*100)} min={0} max={100} onChange={v=>d.set({[alphaK]:v/100})} unit="%" />
                  </Row>
                </div>
              ))}
            </div>

            {/* Quick presets */}
            <div className="rounded-xl p-4" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
              <Label>Quick Presets</Label>
              <div className="flex gap-2 mt-3 flex-wrap">
                {([
                  {label:'Ghost',   values:{surfaceCustomColors:false,surfaceElevation:0.15,railAlpha:0.20,explorerAlpha:0.18,topbarAlpha:0.25,tabbarAlpha:0.18,agentAlpha:0.18,panelAlpha:0.15,cardAlpha:0.12,elevatedAlpha:0.40}},
                  {label:'Frosted', values:{surfaceCustomColors:false,surfaceElevation:0.30,railAlpha:0.60,explorerAlpha:0.52,topbarAlpha:0.65,tabbarAlpha:0.55,agentAlpha:0.52,panelAlpha:0.50,cardAlpha:0.45,elevatedAlpha:0.80}},
                  {label:'Solid',   values:{surfaceCustomColors:false,surfaceElevation:0.45,railAlpha:0.92,explorerAlpha:0.90,topbarAlpha:0.94,tabbarAlpha:0.90,agentAlpha:0.90,panelAlpha:0.88,cardAlpha:0.85,elevatedAlpha:0.98}},
                  {label:'Crystal', values:{surfaceCustomColors:false,surfaceElevation:0.60,railAlpha:0.10,explorerAlpha:0.08,topbarAlpha:0.12,tabbarAlpha:0.08,agentAlpha:0.08,panelAlpha:0.06,cardAlpha:0.05,elevatedAlpha:0.25}},
                ]).map(({label,values})=>(
                  <button key={label} onClick={()=>d.set(values as any)} className="px-4 py-2 rounded-xl font-mono text-xs transition-all"
                    style={{background:'var(--t-panel)',border:'1px solid var(--t-bdr)',boxShadow:'var(--t-shadow)',color:'var(--t-tx1)'}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* GLASS */}
        {activeSection==='glass' && (
          <div className="space-y-4">
            <SectionHeader title="Glass & Blur" subtitle="Backdrop blur · border · inner highlight" badge="WIRED" />
            <CARD>
              <Row><Label>Backdrop Blur</Label><Slider value={d.glassBlur} min={0} max={40} onChange={v=>d.set({glassBlur:v})} unit="px" /></Row>
              <p className="font-mono text-[9px] ml-14" style={{color:'var(--t-tx3)'}}>Higher = more frosted · 0px = no blur effect</p>
              <Divider />
              <Label>Glass Border</Label>
              <ColorPicker value={d.glassBorderHex} alpha={d.glassBorderAlpha} onChange={hex=>d.set({glassBorderHex:hex})} onAlpha={a=>d.set({glassBorderAlpha:a})} />
              <Divider />
              <Toggle value={d.innerHighlight} onChange={v=>d.set({innerHighlight:v})} label="Inner Highlight (top specular edge)" />
              {d.innerHighlight&&<Row><Label>Opacity</Label><Slider value={Math.round(d.innerHighlightOpacity*100)} min={0} max={100} onChange={v=>d.set({innerHighlightOpacity:v/100})} unit="%" /></Row>}
            </CARD>
          </div>
        )}

        {/* BORDERS */}
        {activeSection==='borders' && (
          <div className="space-y-4">
            <SectionHeader title="Borders & Radius" subtitle="Corner radius · border color" badge="WIRED" />
            <CARD>
              <Label>Corner Radius</Label>
              <div className="flex gap-2 mt-3 flex-wrap">
                {[0,4,8,10,12,16,20,24].map(r=>(
                  <button key={r} onClick={()=>d.set({radiusBase:r})} className="w-10 h-10 flex items-center justify-center font-mono text-[9px] transition-all"
                    style={{borderRadius:r,border:d.radiusBase===r?'2px solid var(--t-p)':'1px solid var(--t-bdr)',background:d.radiusBase===r?'var(--t-p-glass)':'transparent',color:'var(--t-tx2)',boxShadow:d.radiusBase===r?'0 0 8px var(--t-p-glow)':'none'}}>
                    {r}
                  </button>
                ))}
              </div>
              <Row className="mt-3"><Label>Custom</Label><Slider value={d.radiusBase} min={0} max={32} onChange={v=>d.set({radiusBase:v})} unit="px" /></Row>
              <Divider />
              <Label>Border Color</Label>
              <ColorPicker value={d.borderHex} alpha={d.borderAlpha} onChange={hex=>d.set({borderHex:hex})} onAlpha={a=>d.set({borderAlpha:a})} />
            </CARD>
          </div>
        )}

        {/* SHADOWS */}
        {activeSection==='shadows' && (
          <div className="space-y-4">
            <SectionHeader title="Shadows" subtitle="Presets · custom layers · depth" badge="WIRED" />
            <div className="rounded-xl p-4" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
              <Label>Preset</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {(['none','subtle','soft','raised','floating','dramatic','custom'] as const).map(s=>(
                  <button key={s} onClick={()=>d.set({shadowPreset:s})} className="py-2 rounded-xl font-mono text-[10px] capitalize transition-all"
                    style={{background:d.shadowPreset===s?'var(--t-p-glass)':'transparent',border:d.shadowPreset===s?'1px solid var(--t-p)':'1px solid var(--t-bdr)',color:d.shadowPreset===s?'var(--t-tx1)':'var(--t-tx3)',boxShadow:d.shadowPreset===s?'0 0 8px var(--t-p-glow)':'none'}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl p-4" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
              <div className="flex items-center justify-between mb-3">
                <Label>Custom Layers</Label>
                <button onClick={()=>d.addShadowLayer()} className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded-lg"
                  style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)',color:'var(--t-p)'}}>
                  <Plus size={10} /> Add
                </button>
              </div>
              {d.shadowLayers.map(l=><ShadowLayerEditor key={l.id} layer={l} />)}
            </div>
          </div>
        )}

        {/* GLOW */}
        {activeSection==='glow' && (
          <div className="space-y-4">
            <SectionHeader title="Glow & Ambient" subtitle="Active glow appears on hover shadow of all glass elements" badge="WIRED" />
            <CARD>
              <Toggle value={d.glowEnabled} onChange={v=>d.set({glowEnabled:v})} label="Enable Glow" />
              {d.glowEnabled&&(<>
                <Divider />
                <Row><Label>Intensity</Label><Slider value={Math.round(d.glowIntensity*100)} min={0} max={100} onChange={v=>d.set({glowIntensity:v/100})} unit="%" /></Row>
                <Row><Label>Spread</Label><Slider value={d.glowSpread} min={0} max={60} onChange={v=>d.set({glowSpread:v})} unit="px" /></Row>
                <Divider />
                <Toggle value={d.glowFollowsPrimary} onChange={v=>d.set({glowFollowsPrimary:v})} label="Follow primary accent color" />
                {!d.glowFollowsPrimary&&<>
                  <Label>Custom Glow Color</Label>
                  <ColorPicker value={d.glowHex} onChange={hex=>d.set({glowHex:hex})} />
                </>}
                <Divider />
                {/* live glow preview */}
                <div className="flex gap-2">
                  {['Always-on',  'Hover only'].map((mode,i)=>(
                    <div key={mode} className="flex-1 h-12 rounded-xl flex items-center justify-center font-mono text-[10px] glass-hover cursor-default"
                      style={{color:'var(--t-tx2)',boxShadow:i===0?'var(--d-glow-full)':'var(--t-shadow)'}}>
                      {mode}
                    </div>
                  ))}
                </div>
              </>)}
            </CARD>
          </div>
        )}

        {/* TYPOGRAPHY */}
        {activeSection==='typography' && (
          <div className="space-y-4">
            <SectionHeader title="Typography" subtitle="All fonts loaded · changes apply to body immediately" badge="WIRED" />
            <CARD>
              {([{label:'Display font',k:'displayFont',opts:DISPLAY_FONTS},{label:'Body font',k:'bodyFont',opts:BODY_FONTS},{label:'Mono font',k:'monoFont',opts:MONO_FONTS}] as const).map(({label,k,opts})=>(
                <div key={k}>
                  <Label>{label}</Label>
                  <select value={d[k]} onChange={e=>d.set({[k]:e.target.value})} className="w-full mt-1.5 font-mono text-[11px] px-3 py-2 rounded-xl outline-none"
                    style={{background:'var(--t-panel)',border:'1px solid var(--t-bdr)',color:'var(--t-tx1)',fontFamily:`'${d[k]}', sans-serif`}}>
                    {opts.map((o:string)=><option key={o} value={o} style={{fontFamily:`'${o}'`}}>{o}</option>)}
                  </select>
                  <p className="font-mono text-[9px] mt-1" style={{color:'var(--t-tx3)',fontFamily:`'${d[k]}'`}}>The quick brown fox jumps over the lazy dog · 1234567890</p>
                </div>
              ))}
              <Divider />
              <Row><Label>Base Font Size</Label><Slider value={d.baseFontSize} min={11} max={16} step={0.5} onChange={v=>d.set({baseFontSize:v})} unit="px" /></Row>
              <Row><Label>Font Weight</Label><Slider value={d.fontWeightBase} min={300} max={600} step={100} onChange={v=>d.set({fontWeightBase:v})} unit="" /></Row>
              <Row><Label>Letter Spacing</Label><Slider value={Math.round(d.letterSpacingBase*1000)} min={-20} max={50} onChange={v=>d.set({letterSpacingBase:v/1000})} unit="‰em" /></Row>
            </CARD>
          </div>
        )}

        {/* MOTION */}
        {activeSection==='motion' && (
          <div className="space-y-4">
            <SectionHeader title="Motion" subtitle="Applied to all .glass elements via CSS var · hover the preview cards" badge="WIRED" />
            <CARD>
              <Row><Label>Transition Speed</Label><Slider value={d.transitionMs} min={50} max={600} onChange={v=>d.set({transitionMs:v})} unit="ms" /></Row>
              <Row><Label>Hover Lift</Label><Slider value={d.hoverLiftPx} min={0} max={8} onChange={v=>d.set({hoverLiftPx:v})} unit="px" /></Row>
              <Row><Label>Hover Scale</Label><Slider value={Math.round(d.hoverScale*100)} min={100} max={105} onChange={v=>d.set({hoverScale:v/100})} unit="%" /></Row>
              <Toggle value={d.hoverGlow} onChange={v=>d.set({hoverGlow:v})} label="Show glow on hover" />
              <Divider />
              {/* Live preview */}
              <Label>Hover these to test</Label>
              <div className="flex gap-3 mt-2">
                {['Card A','Card B','Card C'].map(n=>(
                  <div key={n} className="flex-1 h-12 rounded-xl flex items-center justify-center font-mono text-[11px] glass-hover cursor-pointer"
                    style={{color:'var(--t-tx2)'}}>{n}
                  </div>
                ))}
              </div>
            </CARD>
          </div>
        )}

        {/* EXPORT */}
        {activeSection==='export' && (
          <div className="space-y-4">
            <SectionHeader title="Export Theme" subtitle="Copy as CSS variables or JSON design tokens" />
            <div className="space-y-3">
              {([{label:'Copy CSS Variables',desc:'All active :root custom properties — paste into any project',action:exportCSS,icon:Copy},{label:'Copy JSON Tokens',desc:'Full design token object for version control or import',action:exportJSON,icon:Download}] as const).map(({label,desc,action,icon:Icon})=>(
                <button key={label} onClick={action} className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all glass-hover"
                  style={{border:'1px solid var(--t-bdr)'}}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{background:`${accent}20`,border:'1px solid var(--t-bdr)'}}>
                    <Icon size={14} style={{color:accent}} />
                  </div>
                  <div>
                    <p className="font-mono text-[11px] font-semibold" style={{color:'var(--t-tx1)'}}>{label}</p>
                    <p className="font-mono text-[9px]" style={{color:'var(--t-tx3)'}}>{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI MODELS */}
        {activeSection==='ai-models' && (
          <div className="space-y-5">
            <SectionHeader title="AI Models" subtitle="Provider routing · capability lanes · D1 model registry" />
            {AI_MODELS.map(({provider,models})=>(
              <div key={provider}>
                <Label>{provider}</Label>
                <div className="mt-2 space-y-1.5">
                  {models.map(m=>(
                    <div key={m.id} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                      style={{background:m.active?'var(--t-p-glass)':'var(--t-panel)',border:m.active?'1px solid var(--t-bdr-s)':'1px solid var(--t-bdr)',boxShadow:'var(--t-shadow)'}}>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{background:m.active?accent:'var(--t-tx3)',boxShadow:m.active?`0 0 6px ${accent}`:'none'}} />
                        <div>
                          <p className="font-mono text-[11px] font-medium" style={{color:'var(--t-tx1)'}}>{m.name}</p>
                          <p className="font-mono text-[9px]" style={{color:'var(--t-tx3)'}}>{m.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {m.caps.map(c=><Pill key={c} label={c} />)}
                        <Pill label={m.size} style={{color:'var(--t-tx3)'}} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PLACEHOLDER */}
        {!['themes','background','colors','surfaces','glass','borders','shadows','glow','typography','motion','export','ai-models'].includes(activeSection)&&(
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{background:'var(--t-p-glass)',border:'1px solid var(--t-bdr)'}}>
              {(()=>{const s=SECTIONS.find(s=>s.id===activeSection);return s?<s.icon size={20} style={{color:accent}} />:null})()}
            </div>
            <p className="font-mono text-xs font-semibold" style={{color:'var(--t-tx1)'}}>{SECTIONS.find(s=>s.id===activeSection)?.label}</p>
            <p className="font-mono text-[10px]" style={{color:'var(--t-tx3)'}}>Coming in Sprint 5 · D1 migration 0009</p>
          </div>
        )}
      </div>
    </div>
  )
}
