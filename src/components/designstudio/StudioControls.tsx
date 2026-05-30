'use client'

import { useState } from 'react'

export type StudioStatus = 'idle' | 'loading' | 'loaded' | `error: ${string}`

interface StudioControlsProps {
  url: string | null
  onLoadUrl: (u: string) => void
  wireframe: boolean
  onToggleWireframe: () => void
  autoRotate: boolean
  onToggleAutoRotate: () => void
  bgColor: string
  onSetBgColor: (c: string) => void
  status: StudioStatus
}

const SAMPLES: { label: string; url: string | null }[] = [
  { label: 'Built-in shape', url: null },
  { label: 'Box (Khronos)', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Box/glTF-Binary/Box.glb' },
  { label: 'Duck (Khronos)', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Duck/glTF-Binary/Duck.glb' },
]

const BG_PRESETS: { label: string; color: string }[] = [
  { label: 'Navy', color: '#0a0e14' },
  { label: 'Black', color: '#000000' },
  { label: 'Slate', color: '#1e293b' },
  { label: 'Cyan-dark', color: '#06141a' },
]

function statusTone(status: StudioStatus): string {
  if (status === 'loaded') return 'text-green'
  if (status === 'loading') return 'text-gold'
  if (status.startsWith('error')) return 'text-red'
  return 'text-text3'
}

const label = 'text-text3 font-mono text-[10px] uppercase tracking-wider'
const btn = 'px-2 py-1 rounded font-mono text-[10px] border border-white/[0.06] bg-base-3 text-text2 hover:text-blue hover:border-blue/30 transition-colors'

export function StudioControls({
  url, onLoadUrl, wireframe, onToggleWireframe, autoRotate, onToggleAutoRotate, bgColor, onSetBgColor, status,
}: StudioControlsProps) {
  const [draft, setDraft] = useState('')

  return (
    <div className="bg-base-2 border border-white/[0.06] rounded-lg p-4 flex flex-col gap-4">
      {/* URL loader */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>GLB URL</span>
        <div className="flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) onLoadUrl(draft.trim()) }}
            placeholder="https://…/model.glb"
            className="flex-1 bg-base-3 border border-white/[0.06] rounded px-2 py-1 font-mono text-[10px] text-text1 placeholder:text-text3 outline-none focus:border-blue/30"
          />
          <button onClick={() => { if (draft.trim()) onLoadUrl(draft.trim()) }} disabled={!draft.trim()}
            className="px-3 py-1 rounded font-mono text-[10px] bg-blue/10 text-blue border border-blue/30 hover:bg-blue/20 transition-colors disabled:opacity-40">
            Load Model
          </button>
        </div>
      </div>

      {/* Samples */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>Samples</span>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLES.map((s) => (
            <button key={s.label} onClick={() => onLoadUrl(s.url ?? '')}
              className={`${btn} ${((s.url ?? '') === (url ?? '')) ? 'text-blue border-blue/30' : ''}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>Display</span>
        <div className="flex gap-1.5">
          <button onClick={onToggleWireframe}
            className={`${btn} ${wireframe ? 'text-blue border-blue/30 bg-blue/5' : ''}`}>
            Wireframe {wireframe ? 'On' : 'Off'}
          </button>
          <button onClick={onToggleAutoRotate}
            className={`${btn} ${autoRotate ? 'text-blue border-blue/30 bg-blue/5' : ''}`}>
            Auto-rotate {autoRotate ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Background presets */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>Background</span>
        <div className="flex gap-1.5">
          {BG_PRESETS.map((p) => (
            <button key={p.color} onClick={() => onSetBgColor(p.color)} title={p.label}
              className={`w-7 h-7 rounded border transition-all ${bgColor === p.color ? 'border-blue' : 'border-white/[0.06]'}`}
              style={{ background: p.color }} />
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>Status</span>
        <span className={`font-mono text-[10px] ${statusTone(status)}`}>{status}</span>
      </div>

      {/* CAD hook */}
      <p className="font-mono text-[9px] text-text3 leading-relaxed border-t border-white/[0.06] pt-3">
        Export from build123d with <span className="text-text2">export_gltf(shape, &apos;model.glb&apos;, binary=True)</span> and paste a URL above.
      </p>
    </div>
  )
}
