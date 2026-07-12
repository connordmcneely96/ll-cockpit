'use client'

import { useMemo, useState } from 'react'
import type { Artifact } from './ArtifactCard'

// Renders the real cad-drawing sibling artifacts (already fetched in the Library
// list) for a cad-model .glb: the format='svg' views as a 2x2 grid and the
// format='dxf' views as download links. No key derivation, no extra fetch —
// siblings are matched by run in the Library page and passed in.
const VIEW_ORDER = ['front', 'top', 'right', 'iso'] as const
const VIEW_LABEL: Record<string, string> = { front: 'Front', top: 'Top', right: 'Right', iso: 'Isometric' }

function parseView(a: Artifact): { view: string; ext: string } | null {
  const base = (a.storage_ref ?? '').split('/').pop() ?? ''
  const m = base.match(/part_(front|top|right|iso)\.(svg|dxf)$/i)
  if (!m) return null
  return { view: m[1].toLowerCase(), ext: (a.format ?? m[2]).toLowerCase() }
}

export default function DrawingsPanel({ drawings }: { drawings: Artifact[] }) {
  const { svgByView, dxfByView } = useMemo(() => {
    const svg: Record<string, Artifact> = {}
    const dxf: Record<string, Artifact> = {}
    for (const a of drawings) {
      const p = parseView(a)
      if (!p || !a.storage_ref) continue
      if (p.ext === 'svg') svg[p.view] = a
      else if (p.ext === 'dxf') dxf[p.view] = a
    }
    return { svgByView: svg, dxfByView: dxf }
  }, [drawings])

  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const [zoom, setZoom] = useState<string | null>(null)
  const svgViews = VIEW_ORDER.filter((v) => svgByView[v] && !failed[v])

  const zoomSvg = zoom ? svgByView[zoom] : undefined
  const zoomDxf = zoom ? dxfByView[zoom] : undefined

  return (
    <div className="border-t border-white/[0.06] bg-base-1">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text3">Engineering drawings</p>
        <p className="font-mono text-[9px] text-text3">DXF: download for CAD import · click a view to zoom</p>
      </div>
      {svgViews.length === 0 ? (
        <p className="font-mono text-[10px] text-text3 px-4 py-6">No drawings for this run.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4">
          {svgViews.map((v) => {
            const svg = svgByView[v]
            const dxf = dxfByView[v]
            return (
              <div key={v} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-base-2 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-text3">{VIEW_LABEL[v]}</span>
                  {dxf?.storage_ref && (
                    <a
                      href={`/api/r2/object/${dxf.storage_ref}`}
                      download
                      className="px-1.5 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30"
                    >DXF</a>
                  )}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/r2/object/${svg.storage_ref}`}
                  alt={`${VIEW_LABEL[v]} drawing`}
                  loading="lazy"
                  onClick={() => setZoom(v)}
                  className="w-full h-32 object-contain bg-white rounded cursor-zoom-in"
                  onError={() => setFailed((f) => ({ ...f, [v]: true }))}
                />
              </div>
            )
          })}
        </div>
      )}

      {zoom && zoomSvg?.storage_ref && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setZoom(null)}
        >
          <div
            className="bg-base-2 border border-white/[0.12] rounded-xl w-full max-w-4xl flex flex-col overflow-hidden"
            style={{ height: '82vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.08] shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-widest text-text2">{VIEW_LABEL[zoom]} drawing</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {zoomDxf?.storage_ref && (
                  <a
                    href={`/api/r2/object/${zoomDxf.storage_ref}`}
                    download
                    className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30"
                  >DXF</a>
                )}
                <button
                  onClick={() => setZoom(null)}
                  className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-text2 font-mono text-[9px] rounded hover:text-text1"
                >✕ Close</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-white p-4 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/r2/object/${zoomSvg.storage_ref}`}
                alt={`${VIEW_LABEL[zoom]} drawing enlarged`}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
