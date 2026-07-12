'use client'

import { useEffect, useState } from 'react'
import ModelViewer from '@/components/library/ModelViewer'

interface Artifact {
  id: string
  artifact_name: string | null
  artifact_type: string | null
  format: string | null
  storage_ref: string | null
  size_bytes: number | null
  sentinel_pass: number | null
  created_at: number | null
}
interface Run {
  run_id: string
  spec: string
  max_cycles: number
  cycle: number
  status: string
  created_at: number
  updated_at: number
}
interface ApiResponse { ok: boolean; error?: string; run?: Run; artifacts?: Artifact[] }

const STATUS_COLOR: Record<string, string> = {
  converged: 'text-green border-green/30 bg-green/5',
  running: 'text-blue border-blue/30 bg-blue/5',
  exhausted: 'text-gold border-gold/30 bg-gold/5',
  failed: 'text-red border-red/30 bg-red/5',
}
const VIEW_ORDER = ['front', 'top', 'right', 'iso'] as const
const VIEW_LABEL: Record<string, string> = { front: 'Front', top: 'Top', right: 'Right', iso: 'Isometric' }
const FORMAT_PURPOSE: Record<string, string> = {
  step: 'Import into any CAD system',
  dxf: '2D drafting / CAM',
  glb: '3D web preview',
  svg: 'Drawing image',
}

function fmtBytes(n: number | null): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
function fmtDate(sec: number | null): string {
  if (!sec) return '—'
  return new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}
const r2 = (key: string) => `/api/r2/object/${key}`

export default function CadRunClient({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/cad/runs/${runId}`)
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((d) => {
        if (!alive) return
        if (!d.ok) { setError(d.error ?? 'Failed to load'); return }
        setError(null)
        setRun(d.run ?? null)
        setArtifacts(d.artifacts ?? [])
      })
      .catch(() => alive && setError('Failed to load run'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [runId])

  if (loading) {
    return <div className="p-6"><p className="font-mono text-[10px] text-text3">Loading deliverable…</p></div>
  }
  if (error === 'run not found') {
    return <div className="p-6"><p className="font-mono text-xs text-text2">Run not found.</p></div>
  }
  if (error || !run) {
    return <div className="p-6"><p className="font-mono text-[10px] text-red">{error ?? 'Run not found.'}</p></div>
  }

  const glb = artifacts.find((a) => a.artifact_type === 'cad-model' && a.format === 'glb' && a.storage_ref)
  const sheet = artifacts.find((a) => a.artifact_name === 'part_sheet.svg' && a.storage_ref)
  const viewSvg = (v: string) => artifacts.find((a) => a.artifact_name === `part_${v}.svg` && a.storage_ref)
  const badge = 'px-1.5 py-0.5 font-mono text-[9px] rounded uppercase border'

  return (
    <div className="h-full overflow-auto">
      {/* a) HEADER */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-widest">CAD Deliverable</p>
        <p className="font-mono text-xs text-text1 mt-1 whitespace-pre-wrap break-words">{run.spec}</p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className={`${badge} ${STATUS_COLOR[run.status] ?? 'text-text3 border-white/[0.06] bg-base-4'}`}>{run.status}</span>
          <span className="font-mono text-[10px] text-text3">cycle {run.cycle} of {run.max_cycles}</span>
          <span className="font-mono text-[10px] text-text3">{fmtDate(run.created_at)}</span>
          <span className="font-mono text-[9px] text-text3 truncate">{run.run_id}</span>
        </div>
      </div>

      {/* b) MODEL */}
      <div className="p-4">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-widest mb-2">3D Model</p>
        {glb ? (
          <div className="h-[55vh] rounded-lg overflow-hidden border border-white/[0.06] bg-base-2">
            <ModelViewer src={r2(glb.storage_ref!)} />
          </div>
        ) : (
          <p className="font-mono text-[10px] text-text3 py-6">No model for this run.</p>
        )}
      </div>

      {/* c) DRAWINGS */}
      <div className="px-4 pb-4">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-widest mb-2">Engineering Drawings</p>
        {sheet && (
          <div className="mb-3 rounded-lg border border-white/[0.06] bg-base-2 p-2">
            <p className="font-mono text-[9px] uppercase tracking-widest text-text3 mb-1.5">Sheet (title block)</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r2(sheet.storage_ref!)} alt="engineering sheet" loading="lazy" className="w-full max-h-[70vh] object-contain bg-white rounded" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {VIEW_ORDER.map((v) => {
            const a = viewSvg(v)
            if (!a) return null
            return (
              <div key={v} className="rounded-lg border border-white/[0.06] bg-base-2 p-2">
                <p className="font-mono text-[9px] uppercase tracking-widest text-text3 mb-1.5">{VIEW_LABEL[v]}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r2(a.storage_ref!)} alt={`${VIEW_LABEL[v]} drawing`} loading="lazy" className="w-full h-40 object-contain bg-white rounded" />
              </div>
            )
          })}
        </div>
        {!sheet && VIEW_ORDER.every((v) => !viewSvg(v)) && (
          <p className="font-mono text-[10px] text-text3 py-6">No drawings for this run.</p>
        )}
      </div>

      {/* d) FILES */}
      <div className="px-4 pb-6">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-widest mb-2">Files</p>
        <div className="flex flex-col gap-1.5">
          {artifacts.filter((a) => a.storage_ref).map((a) => (
            <a
              key={a.id}
              href={r2(a.storage_ref!)}
              download
              className="flex items-center gap-3 bg-base-3 border border-white/[0.06] rounded-lg px-3 py-2 hover:border-white/[0.12] transition-colors"
            >
              <span className="font-mono text-[11px] text-text1 truncate flex-1">{a.artifact_name ?? 'artifact'}</span>
              <span className={`${badge} text-cyan border-cyan/30 bg-cyan/5 shrink-0`}>{a.format ?? '—'}</span>
              <span className="font-mono text-[10px] text-text3 shrink-0 hidden sm:inline">{FORMAT_PURPOSE[(a.format ?? '').toLowerCase()] ?? ''}</span>
              <span className="font-mono text-[10px] text-text3 shrink-0 w-16 text-right">{fmtBytes(a.size_bytes)}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
