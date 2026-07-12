'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Full-screen drawing viewer with real pan/zoom: wheel zooms to the cursor, drag
// pans, buttons zoom in/out/Fit, Esc or ✕ closes. Plain <img> driven by a CSS
// translate/scale transform in React state — no dependency. Scale clamped 0.2–20.
const MIN_SCALE = 0.2
const MAX_SCALE = 20
const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

export default function DrawingViewer({
  src,
  label,
  dxfUrl,
  onClose,
}: {
  src: string
  label: string
  dxfUrl?: string | null
  onClose: () => void
}) {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0) }, [])
  useEffect(() => { reset() }, [src, reset])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onWheel = (e: React.WheelEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left - rect.width / 2
    const cy = e.clientY - rect.top - rect.height / 2
    const next = clamp(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
    const k = next / scale
    // Keep the point under the cursor fixed while zooming.
    setTx((prev) => cx - (cx - prev) * k)
    setTy((prev) => cy - (cy - prev) * k)
    setScale(next)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX - tx, y: e.clientY - ty }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    setTx(e.clientX - drag.current.x)
    setTy(e.clientY - drag.current.y)
  }
  const onPointerUp = () => { drag.current = null }

  const btn = 'px-2 py-0.5 bg-base-4 border border-white/[0.06] text-text2 font-mono text-[9px] rounded hover:text-text1 hover:border-blue/30'

  return (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.08] shrink-0">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text2">{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {dxfUrl && (
            <a href={dxfUrl} download className="px-2 py-0.5 bg-base-4 border border-white/[0.06] text-blue font-mono text-[9px] rounded hover:border-blue/30">DXF</a>
          )}
          <button onClick={() => setScale((s) => clamp(s / 1.3))} className={btn} aria-label="Zoom out">−</button>
          <button onClick={() => setScale((s) => clamp(s * 1.3))} className={btn} aria-label="Zoom in">+</button>
          <button onClick={reset} className={btn}>Fit</button>
          <button onClick={onClose} className={btn}>✕ Close</button>
        </div>
      </div>
      <div
        ref={containerRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="flex-1 min-h-0 overflow-hidden bg-white relative cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={label}
            draggable={false}
            className="object-contain select-none"
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transformOrigin: 'center center',
              maxWidth: '92%',
              maxHeight: '92%',
            }}
          />
        </div>
      </div>
    </div>
  )
}
