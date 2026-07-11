'use client'

import { useMemo, useState } from 'react'

// The FreeCAD/build123d drawing set for a CAD run lives in the SAME R2 directory
// as that run's part.glb: cad/<tenant>/<executionId>/part_<view>.svg (+ .dxf).
// We derive the four view keys from the glb artifact's storage_ref — no extra
// fetch, no run-scoped API — and serve them via the existing /api/r2/object route.
const VIEWS = [
  { key: 'front', label: 'Front' },
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'iso', label: 'Isometric' },
] as const

export default function DrawingsPanel({ glbStorageRef }: { glbStorageRef: string }) {
  const dir = useMemo(() => {
    const i = glbStorageRef.lastIndexOf('/')
    return i >= 0 ? glbStorageRef.slice(0, i + 1) : ''
  }, [glbStorageRef])

  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const allFailed = VIEWS.every((v) => failed[v.key])

  if (!dir) return null

  const svgUrl = (view: string) => `/api/r2/object/${dir}part_${view}.svg`
  const dxfUrl = (view: string) => `/api/r2/object/${dir}part_${view}.dxf`

  return (
    <div className="border-t border-white/[0.06] bg-base-1">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text3">Engineering drawings</p>
        <p className="font-mono text-[9px] text-text3">DXF: download for CAD import</p>
      </div>
      {allFailed ? (
        <p className="font-mono text-[10px] text-text3 px-4 py-6">Drawings not available yet for this run.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4">
          {VIEWS.map((v) => (
            <div key={v.key} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-base-2 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] uppercase tracking-widest text-text3">{v.label}</span>
                <a
                  href={dxfUrl(v.key)}
                  download
                  className="px-1.5 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30"
                >DXF</a>
              </div>
              {failed[v.key] ? (
                <div className="flex items-center justify-center h-32 font-mono text-[9px] text-text3">— no {v.label.toLowerCase()} view —</div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={svgUrl(v.key)}
                  alt={`${v.label} engineering drawing`}
                  loading="lazy"
                  className="w-full h-32 object-contain bg-white rounded"
                  onError={() => setFailed((f) => ({ ...f, [v.key]: true }))}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
