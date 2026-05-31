'use client'

import { useCallback, useEffect, useState } from 'react'
import { TrackGrid, catInfo } from '@/components/learn/TrackGrid'
import { LessonReader } from '@/components/learn/LessonReader'

interface LessonRow { id: string; title: string; tags: string | null; len: number; completed: number }
type View = 'tracks' | 'lessons' | 'reader'

function minRead(len: number) { return Math.max(1, Math.ceil(len / 600)) }

export default function LearnPage() {
  const [view, setView] = useState<View>('tracks')
  const [category, setCategory] = useState<string | null>(null)
  const [lessonId, setLessonId] = useState<string | null>(null)
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadLessons = useCallback((cat: string) => {
    setLoading(true); setError(null)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    fetch(`/api/learn/lessons?category=${encodeURIComponent(cat)}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string; lessons?: LessonRow[] }>)
      .then((d) => { if (d.ok) setLessons(d.lessons ?? []); else setError(d.error ?? 'Failed to load') })
      .catch(() => setError('Lessons request timed out'))
      .finally(() => { clearTimeout(timer); setLoading(false) })
  }, [])

  useEffect(() => { if (view === 'lessons' && category) loadLessons(category) }, [view, category, loadLessons])

  if (view === 'reader' && lessonId) {
    return (
      <div className="h-full flex flex-col overflow-hidden p-4">
        <LessonReader lessonId={lessonId} onBack={() => setView('lessons')} onProgressChange={() => { if (category) loadLessons(category) }} />
      </div>
    )
  }

  if (view === 'lessons' && category) {
    const { label, color } = catInfo(category)
    return (
      <div className="h-full flex flex-col overflow-auto">
        <div className="px-4 py-3 border-b border-white/[0.06] shrink-0 flex items-center gap-3">
          <button onClick={() => setView('tracks')} className="font-mono text-[10px] text-text3 hover:text-blue transition-colors">‹ Tracks</button>
          <span className={`font-mono text-sm font-semibold ${color}`}>{label}</span>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-base-3 animate-pulse" />)}</div>
          ) : error ? (
            <p className="font-mono text-[10px] text-red py-12 text-center">{error}</p>
          ) : lessons.length === 0 ? (
            <p className="font-mono text-[10px] text-text3 py-12 text-center">No lessons in this track.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {lessons.map((l) => (
                <button key={l.id} onClick={() => { setLessonId(l.id); setView('reader') }}
                  className="text-left bg-base-3 border border-white/[0.06] rounded-lg px-4 py-3 flex items-center justify-between gap-3 hover:border-white/[0.12] transition-colors">
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] text-text1 truncate">{l.title}</p>
                    <p className="font-mono text-[10px] text-text3 mt-0.5">~{minRead(l.len)} min read</p>
                  </div>
                  {l.completed === 1 && <span className="font-mono text-[10px] text-green shrink-0">✓ read</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-widest">Learn</p>
        <p className="text-text2 font-mono text-[10px] mt-0.5">Your knowledge base, as a curriculum</p>
      </div>
      <div className="p-4">
        <TrackGrid onSelectTrack={(c) => { setCategory(c); setView('lessons') }} />
      </div>
    </div>
  )
}
