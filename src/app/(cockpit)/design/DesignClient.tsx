'use client'

import { useCallback, useEffect, useState } from 'react'
import IterationChat from '@/components/design/IterationChat'

interface BriefRow {
  id: string
  client_name: string
  business_description: string
  target_audience: string
  mood_tone: string
  must_have_sections: string
  status: string
  preview_url: string | null
  current_iteration: number
  total_cost_usd: number
  orchestrator_run_id: string | null
  created_at: number
  updated_at: number
}

interface SubtaskRow {
  id: string
  short_id: string
  agent_name: string
  title: string
  status: string
  cost_usd: number
  tokens: number
}

interface BriefDetail {
  brief: BriefRow
  iterations: Array<{
    id: string
    iteration_number: number
    status: string
    critic_score: number | null
    preview_url: string | null
  }>
  run: { id: string; status: string; subtasks_completed: number; subtask_count: number; actual_cost_usd: number } | null
  subtasks: SubtaskRow[]
  finalization: { finalized: boolean; preview_url?: string; critic_score?: number } | null
}

const AGENT_COLOR: Record<string, string> = {
  hermes: 'border-violet-400 text-violet-300',
  designer: 'border-purple-400 text-purple-300',
  composer: 'border-pink-400 text-pink-300',
  critic: 'border-orange-400 text-orange-300',
  sentinel: 'border-rose-400 text-rose-300',
  dispatch: 'border-cyan-400 text-cyan-300',
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-800 text-slate-400 border border-slate-700',
  building: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700 animate-pulse',
  preview_ready: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700',
  shipped: 'bg-cyan-900/40 text-cyan-300 border border-cyan-700',
  archived: 'bg-slate-800 text-slate-500 border border-slate-700',
  pending: 'bg-slate-800 text-slate-400 border border-slate-700',
  ready: 'bg-blue-900/40 text-blue-300 border border-blue-700',
  running: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700 animate-pulse',
  done: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700',
  failed: 'bg-rose-900/50 text-rose-300 border border-rose-700',
}

export default function DesignClient() {
  const [briefs, setBriefs] = useState<BriefRow[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailById, setDetailById] = useState<Record<string, BriefDetail>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [clientName, setClientName] = useState('')
  const [biz, setBiz] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState('')
  const [sections, setSections] = useState('')
  const [refs, setRefs] = useState('')
  const [colors, setColors] = useState('')
  const [constraints, setConstraints] = useState('')

  const refreshBriefs = useCallback(async () => {
    try {
      const r = await fetch('/api/design/briefs', { cache: 'no-store' })
      if (!r.ok) return
      const d = (await r.json()) as { briefs: BriefRow[] }
      setBriefs(d.briefs)
    } catch { /* silent */ }
  }, [])

  const refreshDetail = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/design/briefs/${id}`, { cache: 'no-store' })
      if (!r.ok) return
      const d = (await r.json()) as BriefDetail
      setDetailById((prev) => ({ ...prev, [id]: d }))
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    void refreshBriefs()
    const i = setInterval(refreshBriefs, 3000)
    return () => clearInterval(i)
  }, [refreshBriefs])

  useEffect(() => {
    if (!expandedId) return
    void refreshDetail(expandedId)
    const brief = briefs.find((b) => b.id === expandedId)
    if (!brief) return
    if (brief.status !== 'building') return
    const i = setInterval(() => refreshDetail(expandedId), 2500)
    return () => clearInterval(i)
  }, [expandedId, briefs, refreshDetail])

  const canSubmit =
    !submitting && clientName.trim() && biz.trim() && audience.trim() && tone.trim() && sections.trim()

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const refList = refs
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      const r = await fetch('/api/design/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName.trim(),
          business_description: biz.trim(),
          target_audience: audience.trim(),
          mood_tone: tone.trim(),
          must_have_sections: sections.trim(),
          style_references: refList.length > 0 ? refList : undefined,
          brand_colors: colors.trim() || undefined,
          constraints: constraints.trim() || undefined,
        }),
      })
      const data = (await r.json()) as { ok?: boolean; brief_id?: string; error?: string; detail?: string }
      if (!r.ok || !data.ok) {
        setError(data.detail ?? data.error ?? `HTTP ${r.status}`)
        return
      }
      setClientName(''); setBiz(''); setAudience(''); setTone('')
      setSections(''); setRefs(''); setColors(''); setConstraints('')
      await refreshBriefs()
      if (data.brief_id) setExpandedId(data.brief_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
          New Brief — HERMES will dispatch DESIGNER → COMPOSER → CRITIC
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Client name *" value={clientName} onChange={setClientName} placeholder="Acme Corp" />
          <FormField label="Business *" value={biz} onChange={setBiz} placeholder="B2B inventory SaaS for mid-market manufacturing" />
          <FormField label="Target audience *" value={audience} onChange={setAudience} placeholder="Operations directors at 50–500-employee manufacturers" />
          <FormField label="Mood / tone *" value={tone} onChange={setTone} placeholder="Modern, confident, technical, premium" />
          <FormField label="Must-have sections *" value={sections} onChange={setSections} placeholder="Hero, features, testimonials, pricing, contact" full />
          <FormTextarea label="Style references (one URL per line)" value={refs} onChange={setRefs} placeholder={"https://linear.app\nhttps://vercel.com\nhttps://stripe.com"} />
          <FormField label="Brand colors (optional)" value={colors} onChange={setColors} placeholder="Use brand: #1a5dab primary, white accents" />
          <FormField label="Constraints (optional)" value={constraints} onChange={setConstraints} placeholder="Must work on mobile, no animations" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs font-mono text-slate-500">
            Pipeline: DESIGNER tokens → COMPOSER HTML → CRITIC review. Auto-executes.
          </div>
          <button
            onClick={submit}
            disabled={!canSubmit}
            style={{
              backgroundColor: canSubmit ? '#06b6d4' : '#334155',
              color: canSubmit ? '#020617' : '#64748b',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
            className="rounded-md font-mono text-sm uppercase tracking-wider px-6 py-3 transition hover:brightness-110 font-bold shadow-lg"
          >
            {submitting ? '⏳ Dispatching to HERMES...' : '▶ Generate Design Build'}
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded-md border border-rose-700 bg-rose-900/30 p-2 text-xs text-rose-300 font-mono">
            {error}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">
          Recent briefs ({briefs.length})
        </h2>
        {briefs.length === 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-500">
            No design briefs yet. Submit your first above.
          </div>
        )}
        {briefs.map((b) => {
          const isOpen = expandedId === b.id
          const detail = detailById[b.id]
          const canIterate = b.status === 'preview_ready' || b.status === 'shipped'
          return (
            <div key={b.id} className="rounded-lg border border-slate-700 bg-slate-900/60 overflow-hidden">
              <button
                onClick={() => setExpandedId(isOpen ? null : b.id)}
                className="w-full text-left p-4 hover:bg-slate-900 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-mono mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_STYLE[b.status] ?? STATUS_STYLE.draft}`}>
                        {b.status.replace('_', ' ')}
                      </span>
                      <span className="text-slate-500">{new Date(b.created_at * 1000).toLocaleString()}</span>
                      {b.total_cost_usd > 0 && (
                        <span className="text-slate-500">• ${b.total_cost_usd.toFixed(4)}</span>
                      )}
                      <span className="text-slate-500">• iter {b.current_iteration}</span>
                    </div>
                    <div className="text-sm text-slate-200 font-medium">{b.client_name}</div>
                    <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">{b.business_description}</div>
                  </div>
                  <div className="text-cyan-400 text-xs font-mono">{isOpen ? '▼' : '▶'}</div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-700 p-4 flex flex-col gap-3 bg-slate-950/60">
                  {b.preview_url && (
                    <a
                      href={b.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-sm font-mono uppercase tracking-wider px-4 py-3 text-center transition shadow-lg"
                    >
                      🌐 Open Preview — {b.preview_url}
                    </a>
                  )}

                  {canIterate && (
                    <IterationChat
                      briefId={b.id}
                      onTurnCompleted={() => refreshDetail(b.id)}
                    />
                  )}

                  {!detail && <div className="text-xs text-slate-500">Loading...</div>}

                  {detail?.run && (
                    <div className="text-xs font-mono text-slate-500">
                      Run {detail.run.id.slice(0, 8)}… • {detail.run.status} • {detail.run.subtasks_completed}/{detail.run.subtask_count} subtasks • ${detail.run.actual_cost_usd.toFixed(4)}
                    </div>
                  )}

                  {detail?.subtasks && detail.subtasks.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {detail.subtasks.map((st) => {
                        const color = AGENT_COLOR[st.agent_name] ?? 'border-slate-600 text-slate-400'
                        return (
                          <div key={st.id} className="rounded border border-slate-700 bg-slate-900 p-2 text-xs flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border ${color}`}>
                                {st.agent_name}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${STATUS_STYLE[st.status] ?? STATUS_STYLE.pending}`}>
                                {st.status}
                              </span>
                            </div>
                            <div className="text-slate-300 line-clamp-2">{st.title}</div>
                            {st.cost_usd > 0 && (
                              <div className="text-[10px] font-mono text-slate-500">${st.cost_usd.toFixed(4)} • {st.tokens} tok</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {detail?.iterations && detail.iterations.length > 0 && (
                    <div className="text-xs font-mono text-slate-500">
                      Iterations: {detail.iterations.map((i) => (
                        <span key={i.id} className="ml-2">
                          v{i.iteration_number} ({i.status}{i.critic_score !== null ? ` • score ${i.critic_score}` : ''})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

function FormField({ label, value, onChange, placeholder, full }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  full?: boolean
}) {
  return (
    <label className={`flex flex-col gap-1 ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-cyan-500"
      />
    </label>
  )
}

function FormTextarea({ label, value, onChange, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:border-cyan-500"
      />
    </label>
  )
}
