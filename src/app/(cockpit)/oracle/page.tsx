'use client'

import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Brain, RefreshCcw, Play, CheckCircle,
  AlertCircle, Database, Zap, FileText,
  ChevronDown, ChevronRight, Clock,
} from 'lucide-react'

interface Source {
  id: string; source_type: string; source_url: string
  source_name: string; active: number; last_checked: number | null
  check_interval_hours: number
}
interface QueueStat { status: string; count: number }
interface DigestInfo { digest_date: string; item_count: number; created_at: number }
interface PipelineStep { step: string; result: any }

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', fetching: '#3b82f6', summarizing: '#8b5cf6',
  summarized: '#06b6d4', vectorized: '#10b981', failed: '#ef4444',
}

export default function OraclePage() {
  const [sources, setSources] = useState<Source[]>([])
  const [queueStats, setQueueStats] = useState<QueueStat[]>([])
  const [latestDigest, setLatestDigest] = useState<DigestInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [pipelineLog, setPipelineLog] = useState<PipelineStep[]>([])
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [latestDigestText, setLatestDigestText] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, digestRes] = await Promise.all([
        fetch('/api/oracle/pipeline'),
        fetch('/api/oracle/digest'),
      ])
      const [status, digest] = await Promise.all([
        statusRes.json() as Promise<{ ok: boolean; sources?: Source[]; queue?: QueueStat[]; latest_digest?: DigestInfo }>,
        digestRes.json() as Promise<{ ok: boolean; digest?: any }>,
      ])
      if (status.ok) {
        setSources(status.sources ?? [])
        setQueueStats(status.queue ?? [])
        setLatestDigest(status.latest_digest ?? null)
      }
      if (digest.ok && digest.digest?.digest_markdown) {
        setLatestDigestText(digest.digest.digest_markdown)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const runPipeline = async () => {
    setRunning(true)
    setPipelineLog([])
    try {
      const res = await fetch('/api/oracle/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { ok: boolean; pipeline?: PipelineStep[] }
      if (data.ok) setPipelineLog(data.pipeline ?? [])
      await loadStatus()
    } finally {
      setRunning(false)
    }
  }

  const totalQueued = queueStats.reduce((a, s) => a + Number(s.count), 0)
  const vectorized = Number(queueStats.find(s => s.status === 'vectorized')?.count ?? 0)
  const pending = Number(queueStats.find(s => s.status === 'pending')?.count ?? 0)
  const failed = Number(queueStats.find(s => s.status === 'failed')?.count ?? 0)

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
        style={{ background: 'var(--d-topbar)', backdropFilter: 'blur(var(--t-blur))', borderBottom: '1px solid var(--t-glass-bdr)' }}>
        <div className="flex items-center gap-3">
          <Brain size={16} style={{ color: 'var(--t-p)' }} />
          <h1 className="font-condensed font-bold uppercase tracking-wider text-base" style={{ color: 'var(--t-tx1)' }}>ORACLE Research</h1>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
            {sources.length} sources · {totalQueued} total
          </span>
          {/* Cost badge */}
          <span className="font-mono text-[9px] px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
            Summarize: FREE · Embed: FREE · Digest: ~$0.001/day
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadStatus} className="w-7 h-7 flex items-center justify-center rounded-xl"
            style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={runPipeline} disabled={running}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl font-mono text-[11px] font-semibold transition-all disabled:opacity-50"
            style={{ background: running ? 'var(--t-bdr-s)' : 'var(--t-p)', color: '#fff', boxShadow: running ? 'none' : '0 0 16px var(--t-p-glow)' }}>
            {running ? <RefreshCcw size={12} className="animate-spin" /> : <Play size={12} />}
            {running ? 'Running…' : 'Run Pipeline Now'}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Sources', value: sources.length, icon: Database, color: 'var(--t-p)' },
            { label: 'Pending', value: pending, icon: Clock, color: '#f59e0b' },
            { label: 'Vectorized', value: vectorized, icon: Zap, color: '#10b981' },
            { label: 'Failed', value: failed, icon: AlertCircle, color: failed > 0 ? '#ef4444' : 'var(--t-tx3)' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl p-4"
              style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>{label}</p>
                  <p className="font-condensed font-bold text-2xl mt-1" style={{ color }}>{value}</p>
                </div>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
                  <Icon size={14} style={{ color }} strokeWidth={1.5} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Queue status bars */}
        {queueStats.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
            <p className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--t-tx3)' }}>Queue by Status</p>
            <div className="space-y-2">
              {queueStats.map(({ status, count }) => (
                <div key={status} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[status] ?? '#6b7280' }} />
                  <span className="font-mono text-[11px] w-24" style={{ color: 'var(--t-tx2)' }}>{status}</span>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--t-bdr-s)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${totalQueued > 0 ? (Number(count) / totalQueued) * 100 : 0}%`,
                      background: STATUS_COLORS[status] ?? '#6b7280',
                    }} />
                  </div>
                  <span className="font-mono text-[10px] w-6 text-right" style={{ color: 'var(--t-tx3)' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Model cost info */}
        <div className="rounded-2xl p-4 flex items-center gap-6"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.20)' }}>
          <Zap size={16} style={{ color: '#10b981', flexShrink: 0 }} />
          <div className="space-y-0.5">
            <p className="font-mono text-[11px] font-semibold" style={{ color: '#10b981' }}>Zero-cost summarization</p>
            <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>
              Summarize: Workers AI Llama 3.1 8B — FREE (10k neurons/day, ~416 items) ·
              Embed: Workers AI BGE — FREE ·
              Digest: Claude Haiku — ~$0.001 once/day
            </p>
          </div>
        </div>

        {/* Sources */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
          <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
            <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Research Sources · {sources.filter(s => s.active).length} active</p>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--t-bdr)' }}>
            {sources.map(s => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.active ? '#10b981' : '#6b7280', boxShadow: s.active ? '0 0 6px #10b981' : 'none' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[11px] font-medium" style={{ color: 'var(--t-tx1)' }}>{s.source_name}</p>
                  <p className="font-mono text-[9px] truncate" style={{ color: 'var(--t-tx3)' }}>{s.source_url}</p>
                </div>
                <span className="font-mono text-[9px] px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
                  {s.source_type}
                </span>
                <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>every {s.check_interval_hours}h</span>
                <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>
                  {s.last_checked ? `${Math.round((Date.now()/1000 - s.last_checked)/3600)}h ago` : 'never'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline run log */}
        {pipelineLog.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Last Pipeline Run</p>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--t-bdr)' }}>
              {pipelineLog.map(({ step, result }) => {
                const ok = result?.ok !== false
                const isExpanded = expandedStep === step
                return (
                  <div key={step}>
                    <button onClick={() => setExpandedStep(isExpanded ? null : step)}
                      className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.02]">
                      {ok
                        ? <CheckCircle size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                        : <AlertCircle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />}
                      <span className="font-mono text-[11px] flex-1" style={{ color: 'var(--t-tx1)' }}>{step}</span>
                      {result?.processed !== undefined && <span className="font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>{result.processed} processed</span>}
                      {result?.vectorized !== undefined && <span className="font-mono text-[10px]" style={{ color: '#10b981' }}>{result.vectorized} vectorized</span>}
                      {isExpanded ? <ChevronDown size={12} style={{ color: 'var(--t-tx3)' }} /> : <ChevronRight size={12} style={{ color: 'var(--t-tx3)' }} />}
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-3">
                        <pre className="font-mono text-[9px] whitespace-pre-wrap rounded-xl p-3 overflow-x-auto"
                          style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--t-tx3)', maxHeight: 300 }}>
                          {JSON.stringify(result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Latest digest — rendered as markdown */}
        {latestDigestText && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>
                Latest Digest · {latestDigest?.digest_date ?? 'Today'} · {latestDigest?.item_count ?? 0} items
              </p>
              <FileText size={13} style={{ color: 'var(--t-p)' }} />
            </div>
            <div className="px-5 py-4 agent-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {latestDigestText}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
