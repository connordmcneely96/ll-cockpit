'use client'

import { useEffect, useState } from 'react'

export const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  failure_pattern: { label: 'Failure Patterns', color: 'text-red' },
  architecture: { label: 'Architecture', color: 'text-blue' },
  technology: { label: 'Technology', color: 'text-cyan' },
  process: { label: 'Process & Workflow', color: 'text-green' },
  codebase: { label: 'Codebase', color: 'text-gold' },
  build_decision: { label: 'Build Decisions', color: 'text-text2' },
  strategy: { label: 'Strategy', color: 'text-text2' },
}

export function catInfo(category: string) {
  return CATEGORY_MAP[category] ?? { label: category.replace(/_/g, ' '), color: 'text-text2' }
}

interface Track { category: string; total: number }

export function TrackGrid({ onSelectTrack }: { onSelectTrack: (category: string) => void }) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [completed, setCompleted] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    fetch('/api/learn/tracks', { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string; tracks?: Track[]; completed?: number }>)
      .then((d) => { if (d.ok) { setTracks(d.tracks ?? []); setCompleted(d.completed ?? 0) } else setError(d.error ?? 'Failed to load') })
      .catch(() => setError('Tracks request timed out'))
      .finally(() => { clearTimeout(timer); setLoading(false) })
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [])

  const total = tracks.reduce((s, t) => s + t.total, 0)

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 rounded-lg bg-base-3 animate-pulse" />)}
    </div>
  )
  if (error) return <p className="font-mono text-[10px] text-red py-12 text-center">{error}</p>
  if (tracks.length === 0) return (
    <p className="font-mono text-[10px] text-text3 py-12 text-center">No knowledge nodes found.</p>
  )

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] text-text3">{total} lessons · {completed} read</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {tracks.map((t) => {
          const { label, color } = catInfo(t.category)
          return (
            <button key={t.category} onClick={() => onSelectTrack(t.category)}
              className="text-left bg-base-3 border border-white/[0.06] rounded-lg p-4 flex flex-col gap-2 hover:border-white/[0.12] transition-colors">
              <p className={`font-mono text-sm font-semibold ${color}`}>{label}</p>
              <p className="font-mono text-[10px] text-text3">{t.total} {t.total === 1 ? 'lesson' : 'lessons'}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
