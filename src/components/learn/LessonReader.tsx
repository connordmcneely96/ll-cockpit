'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { catInfo } from './TrackGrid'

interface Lesson {
  id: string
  title: string
  category: string
  content: string
  tags: string | null
  source: string | null
  updated_at: number | null
}

const MD = {
  h1: (p: object) => <h1 className="font-mono text-base font-bold text-text1 mt-4 mb-2" {...p} />,
  h2: (p: object) => <h2 className="font-mono text-sm font-bold text-text1 mt-4 mb-2" {...p} />,
  h3: (p: object) => <h3 className="font-mono text-xs font-bold text-text1 mt-3 mb-1.5" {...p} />,
  p: (p: object) => <p className="text-text2 text-[13px] leading-relaxed mb-2.5" {...p} />,
  ul: (p: object) => <ul className="list-disc pl-5 text-text2 text-[13px] mb-2.5 space-y-1" {...p} />,
  ol: (p: object) => <ol className="list-decimal pl-5 text-text2 text-[13px] mb-2.5 space-y-1" {...p} />,
  a: (p: object) => <a className="text-blue hover:underline" {...p} />,
  code: (p: object) => <code className="font-mono text-[12px] bg-base-4 px-1 py-0.5 rounded text-cyan" {...p} />,
  pre: (p: object) => <pre className="font-mono text-[12px] bg-base-4 border border-white/[0.06] rounded-lg p-3 overflow-x-auto mb-2.5" {...p} />,
  blockquote: (p: object) => <blockquote className="border-l-2 border-white/[0.12] pl-3 text-text3 italic mb-2.5" {...p} />,
}

export function LessonReader({ lessonId, onBack, onProgressChange }: { lessonId: string; onBack: () => void; onProgressChange?: () => void }) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [completed, setCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    fetch(`/api/learn/lesson/${lessonId}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string; lesson?: Lesson; completed?: boolean }>)
      .then((d) => { if (d.ok && d.lesson) { setLesson(d.lesson); setCompleted(!!d.completed) } else setError(d.error ?? 'Failed to load') })
      .catch(() => setError('Lesson request timed out'))
      .finally(() => { clearTimeout(timer); setLoading(false) })
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [lessonId])

  const toggle = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/learn/lesson/${lessonId}`, { method: 'POST' })
      const d = await res.json() as { ok: boolean; completed?: boolean }
      if (d.ok) { setCompleted(!!d.completed); onProgressChange?.() }
    } finally { setSaving(false) }
  }

  const tags = (lesson?.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const cat = lesson ? catInfo(lesson.category) : null

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 px-1 pb-3 shrink-0">
        <button onClick={onBack} className="font-mono text-[10px] text-text3 hover:text-blue transition-colors">‹ Back</button>
        {lesson && (
          <button onClick={toggle} disabled={saving}
            className={`px-3 py-1 rounded font-mono text-[10px] border transition-colors disabled:opacity-50 ${completed ? 'text-green border-green/30 bg-green/5' : 'text-text2 border-white/[0.06] bg-base-3 hover:text-blue hover:border-blue/30'}`}>
            {saving ? '…' : completed ? 'Read ✓' : 'Mark as read'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="h-40 rounded-lg bg-base-3 animate-pulse" />
      ) : error ? (
        <p className="font-mono text-[10px] text-red py-12 text-center">{error}</p>
      ) : lesson ? (
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="flex items-center gap-2 mb-2">
            {cat && <span className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded border border-white/[0.06] bg-base-3 ${cat.color}`}>{cat.label}</span>}
          </div>
          <h1 className="font-mono text-lg font-bold text-text1 mb-2">{lesson.title}</h1>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {tags.map((t) => <span key={t} className="font-mono text-[9px] text-text3 bg-base-4 px-1.5 py-0.5 rounded">{t}</span>)}
            </div>
          )}
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MD}>
            {lesson.content}
          </ReactMarkdown>
        </div>
      ) : null}
    </div>
  )
}
