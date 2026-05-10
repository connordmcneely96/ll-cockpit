'use client'

import '@/app/oracle-digest.css'
import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Brain, RefreshCcw, Play, CheckCircle, AlertCircle,
  Database, Zap, FileText, ChevronDown, ChevronRight,
  Clock, Shield, ShieldOff, History, X, ExternalLink,
  Youtube, Rss,
} from 'lucide-react'

interface Source {
  id: string; source_type: string; source_url: string
  source_name: string; active: number; last_checked: number | null
  check_interval_hours: number
}
interface QueueStat { status: string; count: number }
interface DigestInfo { digest_date: string; item_count: number; created_at: number }
interface PipelineStep { step: string; result: any; skipped?: boolean }
interface PipelineConfig { key: string; value: string; label: string; description: string }
interface DigestRecord { id: string; digest_date: string; item_count: number; digest_markdown: string; created_at: number }

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', fetching: '#3b82f6', summarizing: '#8b5cf6',
  summarized: '#06b6d4', vectorized: '#10b981', failed: '#ef4444',
}

const KILL_SWITCH_ORDER = ['cron_enabled', 'fetch_enabled', 'summarize_enabled', 'vectorize_enabled', 'digest_enabled']

export default function OraclePage() {
  const [sources, setSources] = useState<Source[]>([])
  const [queueStats, setQueueStats] = useState<QueueStat[]>([])
  const [latestDigest, setLatestDigest] = useState<DigestInfo | null>(null)
  const [config, setConfig] = useState<PipelineConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [pipelineLog, setPipelineLog] = useState<PipelineStep[]>([])
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [latestDigestText, setLatestDigestText] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'sources'>('overview')
  const [digestHistory, setDigestHistory] = useState<DigestRecord[]>([])
  const [selectedDigest, setSelectedDigest] = useState<DigestRecord | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, digestRes] = await Promise.all([
        fetch('/api/oracle/pipeline'),
        fetch('/api/oracle/digest'),
      ])
      const [status, digest] = await Promise.all([
        statusRes.json() as Promise<{ ok: boolean; sources?: Source[]; queue?: QueueStat[]; latest_digest?: DigestInfo; config?: PipelineConfig[] }>,
        digestRes.json() as Promise<{ ok: boolean; digest?: any }>,
      ])
      if (status.ok) {
        setSources(status.sources ?? [])
        setQueueStats(status.queue ?? [])
        setLatestDigest(status.latest_digest ?? null)
        setConfig(status.config ?? [])
      }
      if (digest.ok && digest.digest?.digest_markdown) {
        setLatestDigestText(digest.digest.digest_markdown)
        setLatestDigest(prev => prev ?? { digest_date: digest.digest.digest_date, item_count: digest.digest.item_count, created_at: digest.digest.created_at })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/oracle/digests')
      const data = await res.json() as { ok: boolean; digests?: DigestRecord[] }
      if (data.ok) setDigestHistory(data.digests ?? [])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => { if (activeTab === 'history') loadHistory() }, [activeTab, loadHistory])

  const runPipeline = async () => {
    setRunning(true)
    setPipelineLog([])
    try {
      const res = await fetch('/api/oracle/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const data = await res.json() as { ok: boolean; pipeline?: PipelineStep[] }
      if (data.ok && data.pipeline) {
        setPipelineLog(data.pipeline)

        // ✔ Extract digest directly from pipeline response — no second fetch needed
        const digestStep = data.pipeline.find(s => s.step.startsWith('digest'))
        if (digestStep?.result?.digest) {
          setLatestDigestText(digestStep.result.digest)
          setLatestDigest(prev => ({
            digest_date: digestStep.result.date ?? prev?.digest_date ?? '',
            item_count: digestStep.result.itemCount ?? prev?.item_count ?? 0,
            created_at: Math.floor(Date.now() / 1000),
          }))
        }
      }
      // Refresh queue stats
      await loadStatus()
    } finally {
      setRunning(false)
    }
  }

  const toggleSwitch = async (key: string, currentValue: boolean) => {
    setTogglingKey(key)
    try {
      const res = await fetch('/api/oracle/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: !currentValue }),
      })
      if (res.ok) {
        setConfig(prev => prev.map(c => c.key === key ? { ...c, value: !currentValue ? '1' : '0' } : c))
      }
    } finally {
      setTogglingKey(null)
    }
  }

  const totalQueued = queueStats.reduce((a, s) => a + Number(s.count), 0)
  const vectorized = Number(queueStats.find(s => s.status === 'vectorized')?.count ?? 0)
  const pending = Number(queueStats.find(s => s.status === 'pending')?.count ?? 0)
  const failed = Number(queueStats.find(s => s.status === 'failed')?.count ?? 0)
  const cronEnabled = config.find(c => c.key === 'cron_enabled')?.value === '1'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ background: 'var(--d-topbar)', backdropFilter: 'blur(var(--t-blur))', borderBottom: '1px solid var(--t-glass-bdr)' }}>
        <div className="flex items-center gap-3">
          <Brain size={16} style={{ color: 'var(--t-p)' }} />
          <h1 className="font-condensed font-bold uppercase tracking-wider text-base" style={{ color: 'var(--t-tx1)' }}>ORACLE Research</h1>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
            {sources.filter(s => s.active).length} sources · {totalQueued} total
          </span>
          <span className="flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 rounded-full"
            style={{ background: cronEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: cronEnabled ? '#10b981' : '#ef4444', border: `1px solid ${cronEnabled ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
            {cronEnabled ? <Shield size={9} /> : <ShieldOff size={9} />}
            {cronEnabled ? 'Cron Active' : 'Cron Paused'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--t-glass-bdr)' }}>
            {(['overview', 'history', 'sources'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-3 py-1.5 font-mono text-[10px] capitalize transition-all"
                style={{ background: activeTab === tab ? 'var(--t-p-glass)' : 'transparent', color: activeTab === tab ? 'var(--t-p)' : 'var(--t-tx3)' }}>
                {tab}
              </button>
            ))}
          </div>
          <button onClick={loadStatus} className="w-7 h-7 flex items-center justify-center rounded-xl"
            style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={runPipeline} disabled={running}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl font-mono text-[11px] font-semibold transition-all disabled:opacity-50"
            style={{ background: running ? 'var(--t-bdr-s)' : 'var(--t-p)', color: '#fff', boxShadow: running ? 'none' : '0 0 16px var(--t-p-glow)' }}>
            {running ? <RefreshCcw size={12} className="animate-spin" /> : <Play size={12} />}
            {running ? 'Running…' : 'Run Now'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">

            {/* Kill switches */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                <div className="flex items-center gap-2">
                  <Shield size={13} style={{ color: 'var(--t-p)' }} />
                  <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Emergency Controls</p>
                </div>
                <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>Cron respects these · Manual runs always execute</p>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--t-bdr)' }}>
                {KILL_SWITCH_ORDER.map(key => {
                  const item = config.find(c => c.key === key)
                  if (!item) return null
                  const isOn = item.value === '1'
                  const isMaster = key === 'cron_enabled'
                  return (
                    <div key={key} className="flex items-center justify-between px-5 py-3"
                      style={{ background: isMaster && !isOn ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                      <div className="flex items-center gap-3">
                        {isMaster
                          ? isOn ? <Shield size={14} style={{ color: '#10b981' }} /> : <ShieldOff size={14} style={{ color: '#ef4444' }} />
                          : <div className="w-2 h-2 rounded-full" style={{ background: isOn ? '#10b981' : '#6b7280', boxShadow: isOn ? '0 0 6px #10b981' : 'none' }} />}
                        <div>
                          <p className="font-mono text-[12px] font-semibold" style={{ color: isMaster ? (isOn ? '#10b981' : '#ef4444') : 'var(--t-tx1)' }}>
                            {item.label}{isMaster ? ' — MASTER SWITCH' : ''}
                          </p>
                          <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{item.description}</p>
                        </div>
                      </div>
                      <button onClick={() => toggleSwitch(key, isOn)} disabled={togglingKey === key}
                        className="relative w-11 h-6 rounded-full transition-all disabled:opacity-50"
                        style={{ background: isOn ? (isMaster ? '#10b981' : 'var(--t-p)') : '#4b5563', boxShadow: isOn ? `0 0 10px ${isMaster ? '#10b981' : 'var(--t-p-glow)'}` : 'none' }}>
                        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow"
                          style={{ left: isOn ? '1.35rem' : '0.1rem' }} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Sources', value: sources.filter(s => s.active).length, icon: Database, color: 'var(--t-p)' },
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

            {/* Queue bars */}
            {queueStats.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
                <p className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--t-tx3)' }}>Queue by Status</p>
                <div className="space-y-2">
                  {queueStats.map(({ status, count }) => (
                    <div key={status} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[status] ?? '#6b7280' }} />
                      <span className="font-mono text-[11px] w-24" style={{ color: 'var(--t-tx2)' }}>{status}</span>
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--t-bdr-s)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${totalQueued > 0 ? (Number(count) / totalQueued) * 100 : 0}%`, background: STATUS_COLORS[status] ?? '#6b7280' }} />
                      </div>
                      <span className="font-mono text-[10px] w-6 text-right" style={{ color: 'var(--t-tx3)' }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost banner */}
            <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.20)' }}>
              <Zap size={16} style={{ color: '#10b981', flexShrink: 0 }} />
              <div>
                <p className="font-mono text-[11px] font-semibold" style={{ color: '#10b981' }}>Near-zero cost pipeline</p>
                <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>
                  Fetch: $0 · Summarize: Workers AI Llama 3.1 8B — FREE · Embed: Workers AI BGE — FREE · Digest: Claude Haiku — ~$0.001/day
                </p>
              </div>
            </div>

            {/* Pipeline log */}
            {pipelineLog.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
                <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                  <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Last Pipeline Run</p>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--t-bdr)' }}>
                  {pipelineLog.map(({ step, result, skipped }) => {
                    const ok = result?.ok !== false
                    const isExpanded = expandedStep === step
                    return (
                      <div key={step}>
                        <button onClick={() => setExpandedStep(isExpanded ? null : step)}
                          className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.02]">
                          {skipped ? <div className="w-3 h-3 rounded-full" style={{ background: '#6b7280' }} />
                            : ok ? <CheckCircle size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                                 : <AlertCircle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />}
                          <span className="font-mono text-[11px] flex-1" style={{ color: skipped ? 'var(--t-tx3)' : 'var(--t-tx1)' }}>{step}</span>
                          {result?.processed !== undefined && <span className="font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>{result.processed} processed</span>}
                          {result?.vectorized !== undefined && <span className="font-mono text-[10px]" style={{ color: '#10b981' }}>{result.vectorized} vectorized</span>}
                          {result?.itemCount !== undefined && <span className="font-mono text-[10px]" style={{ color: 'var(--t-p)' }}>{result.itemCount} items in brief</span>}
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

            {/* Today's digest */}
            {latestDigestText && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
                <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                  <div className="flex items-center gap-2">
                    <FileText size={13} style={{ color: 'var(--t-p)' }} />
                    <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>
                      Morning Brief · {latestDigest?.digest_date} · {latestDigest?.item_count} items
                    </p>
                  </div>
                  <button onClick={() => setActiveTab('history')} className="font-mono text-[9px]" style={{ color: 'var(--t-p)' }}>All history →</button>
                </div>
                <div className="px-6 py-5 oracle-digest">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{latestDigestText}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="flex" style={{ minHeight: '100%' }}>
            <div className="w-64 shrink-0 overflow-y-auto" style={{ borderRight: '1px solid var(--t-glass-bdr)' }}>
              {historyLoading ? (
                <div className="flex justify-center py-8"><RefreshCcw size={16} className="animate-spin" style={{ color: 'var(--t-p)' }} /></div>
              ) : digestHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 px-4 text-center">
                  <History size={20} style={{ color: 'var(--t-tx3)' }} />
                  <p className="font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>No digests yet · Run the pipeline to generate your first morning brief</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--t-bdr)' }}>
                  {digestHistory.map(digest => (
                    <button key={digest.id} onClick={() => setSelectedDigest(digest)}
                      className="w-full text-left px-4 py-3 transition-all"
                      style={{ background: selectedDigest?.id === digest.id ? 'var(--t-p-glass)' : 'transparent', borderLeft: selectedDigest?.id === digest.id ? '2px solid var(--t-p)' : '2px solid transparent' }}>
                      <p className="font-mono text-[11px] font-semibold" style={{ color: selectedDigest?.id === digest.id ? 'var(--t-p)' : 'var(--t-tx1)' }}>{digest.digest_date}</p>
                      <p className="font-mono text-[9px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>{digest.item_count} items</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {!selectedDigest ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <History size={28} style={{ color: 'var(--t-tx3)' }} />
                  <p className="font-mono text-sm" style={{ color: 'var(--t-tx2)' }}>Select a digest</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-condensed font-bold text-lg" style={{ color: 'var(--t-tx1)' }}>Morning Brief — {selectedDigest.digest_date}</h2>
                      <p className="font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>{selectedDigest.item_count} items · stored in R2 + D1</p>
                    </div>
                    <button onClick={() => setSelectedDigest(null)} className="w-7 h-7 flex items-center justify-center rounded-xl" style={{ color: 'var(--t-tx3)' }}><X size={14} /></button>
                  </div>
                  <div className="oracle-digest">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedDigest.digest_markdown}</ReactMarkdown>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* SOURCES TAB */}
        {activeTab === 'sources' && (
          <div className="p-6">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
              <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Sources · {sources.filter(s => s.active).length} active</p>
              </div>
              <div className="px-5 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--t-bdr)', background: 'rgba(245,158,11,0.04)' }}>
                <Rss size={11} style={{ color: '#f59e0b' }} />
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: '#f59e0b' }}>RSS Feeds ({sources.filter(s => s.source_type === 'rss').length})</span>
              </div>
              {sources.filter(s => s.source_type === 'rss').map(s => (
                <div key={s.id} className="flex items-center gap-4 px-5 py-3" style={{ borderBottom: '1px solid var(--t-bdr)' }}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.active ? '#10b981' : '#6b7280', boxShadow: s.active ? '0 0 6px #10b981' : 'none' }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[11px] font-medium" style={{ color: 'var(--t-tx1)' }}>{s.source_name}</p>
                    <p className="font-mono text-[9px] truncate" style={{ color: 'var(--t-tx3)' }}>{s.source_url}</p>
                  </div>
                  <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>every {s.check_interval_hours}h</span>
                  <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{s.last_checked ? `${Math.round((Date.now()/1000 - s.last_checked)/3600)}h ago` : 'never'}</span>
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} style={{ color: 'var(--t-tx3)' }} /></a>
                </div>
              ))}
              <div className="px-5 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--t-bdr)', borderTop: '1px solid var(--t-glass-bdr)', background: 'rgba(239,68,68,0.04)' }}>
                <Youtube size={11} style={{ color: '#ef4444' }} />
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: '#ef4444' }}>YouTube Channels ({sources.filter(s => s.source_type === 'youtube_channel').length})</span>
              </div>
              {sources.filter(s => s.source_type === 'youtube_channel').map(s => (
                <div key={s.id} className="flex items-center gap-4 px-5 py-3" style={{ borderBottom: '1px solid var(--t-bdr)' }}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.active ? '#10b981' : '#6b7280', boxShadow: s.active ? '0 0 6px #10b981' : 'none' }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[11px] font-medium" style={{ color: 'var(--t-tx1)' }}>{s.source_name}</p>
                    <p className="font-mono text-[9px] truncate" style={{ color: 'var(--t-tx3)' }}>{s.source_url}</p>
                  </div>
                  <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>every {s.check_interval_hours}h</span>
                  <span className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{s.last_checked ? `${Math.round((Date.now()/1000 - s.last_checked)/3600)}h ago` : 'never'}</span>
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} style={{ color: 'var(--t-tx3)' }} /></a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
