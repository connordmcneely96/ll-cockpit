'use client'

import { useEffect, useRef } from 'react'

export default function CosmicBackground({ accent, dimmed = false }: { accent: string; dimmed?: boolean }) {
  const starsRef = useRef<HTMLDivElement>(null)
  const motesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stars = starsRef.current
    const motes = motesRef.current
    if (!stars) return
    const W = stars.clientWidth || 1040
    const H = stars.clientHeight || 690
    const sf = document.createDocumentFragment()
    for (let i = 0; i < 80; i++) {
      const s = document.createElement('i')
      const big = Math.random() > 0.88
      const sz = big ? 2 : (Math.random() > 0.5 ? 1.4 : 1)
      s.style.width = sz + 'px'; s.style.height = sz + 'px'
      s.style.left = (Math.random() * W) + 'px'; s.style.top = (Math.random() * H * 1.1) + 'px'
      s.style.opacity = (0.12 + Math.random() * 0.45).toFixed(2)
      if (big) { s.className = 'tw'; s.style.animationDelay = (Math.random() * 4) + 's' }
      sf.appendChild(s)
    }
    stars.appendChild(sf)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (motes && !reduce) {
      for (let j = 0; j < 12; j++) {
        const m = document.createElement('i')
        const ms = 1 + Math.random() * 1.6
        m.style.width = ms + 'px'; m.style.height = ms + 'px'
        m.style.left = (W * 0.30 + Math.random() * W * 0.40) + 'px'
        m.style.opacity = (0.25 + Math.random() * 0.45).toFixed(2)
        const dur = 12 + Math.random() * 14, delay = Math.random() * 14, dx = (Math.random() * 60 - 30) + 'px'
        m.style.setProperty('--dx', dx)
        m.style.animation = `cosmic-float ${dur}s linear ${-delay}s infinite`
        motes.appendChild(m)
      }
    }
    return () => { if (stars) stars.innerHTML = ''; if (motes) motes.innerHTML = '' }
  }, [])

  return (
    <div className={`cosmic-bg${dimmed ? ' dimmed' : ''}`} aria-hidden="true">
      <div className="cosmic-aur v" /><div className="cosmic-aur t" /><div className="cosmic-aur g" />
      <div className="cosmic-beam-wide" /><div className="cosmic-beam-core" /><div className="cosmic-beam-hot" />
      <div className="cosmic-ray l" /><div className="cosmic-ray r" />
      <div className="cosmic-stars" ref={starsRef} />
      <div className="cosmic-motes" ref={motesRef} />
      <div className="cosmic-grain" /><div className="cosmic-vig" />
    </div>
  )
}
