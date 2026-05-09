'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart2, RefreshCcw, Activity, Zap, Clock,
  TrendingUp, AlertCircle, Calendar, Filter,
} from 'lucide-react'

interface AnalyticsEvent {
  id: string
  event_name: string
  page_path: string | null
  session_id: string | null
  metadata_json: string
  created_at: string
}

interface AiCompletion {
  id: string
  agent_name: string | null
  model_key: string
  task_type: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  latency_ms: number | null
  success: number
  created_at: string
}

interface Stats {
  totalEvents: number
  totalCompletions: number
  totalCost: number
  totalTokens: number
  avgLatency: number
  successRate: number
  topAgents: { name: string; count: number }[]
  topModels: { model: string; count: number; cost: number }[]
  recentEvents: AnalyticsEvent[]
  recentCompletions: AiCompletion[]
  eventsByHour: { hour: string; count: number }[]
}

function StatCard({ label, value, sub, icon: Icon, accent = 'var(--t-p)' }: {
  label: string; value: string; sub?: string; icon: any; accent?: string
}) {
  return (
    <div className="rounded-2xl p-4" style={{
      background: 'var(--d-card)',
      backdropFilter: 'blur(var(--t-blur))',
      border: '1px solid var(--t-glass-bdr)',
      boxShadow: 'var(--t-shadow)',
    }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>{label}</p>
          <p className="font-condensed font-bold text-2xl mt-1" style={{ color: accent }}>{value}</p>
          {sub && <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
          <Icon size={16} style={{ color: accent }} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  )
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--t-bdr-s)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'events' | 'ai'>('overview')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Parallel fetch both tables
      const [eventsRes, completionsRes, agentTasksRes] = await Promise.all([
        fetch('/api/analytics/events'),
        fetch('/api/analytics/completions'),
        fetch('/api/analytics/agent-tasks'),
      ])

      const [eventsData, completionsData, agentTasksData] = await Promise.all([
        eventsRes.json() as Promise<{ ok: boolean; events?: AnalyticsEvent[]; error?: string }>,
        completionsRes.json() as Promise<{ ok: boolean; completions?: AiCompletion[]; error?: string }>,
        agentTasksRes.json() as Promise<{ ok: boolean; tasks?: any[]; error?: string }>,
      ])

      const events: AnalyticsEvent[] = eventsData.events ?? []
      const completions: AiCompletion[] = completionsData.completions ?? []
      const agentTasks: any[] = agentTasksData.tasks ?? []

      // Compute stats
      const totalCost = completions.reduce((a, c) => a + (c.cost_usd ?? 0), 0)
      const totalTokens = completions.reduce((a, c) => a + (c.input_tokens ?? 0) + (c.output_tokens ?? 0), 0)
      const latencies = completions.filter(c => c.latency_ms).map(c => c.latency_ms!)
      const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0
      const successRate = completions.length ? (completions.filter(c => c.success).length / completions.length) * 100 : 100

      // Top agents from agent_tasks
      const agentCounts: Record<string, number> = {}
      for (const t of agentTasks) {
        if (t.agent_name) agentCounts[t.agent_name] = (agentCounts[t.agent_name] ?? 0) + 1
      }
      const topAgents = Object.entries(agentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))

      // Top models
      const modelMap: Record<string, { count: number; cost: number }> = {}
      for (const c of completions) {
        if (!modelMap[c.model_key]) modelMap[c.model_key] = { count: 0, cost: 0 }
        modelMap[c.model_key].count++
        modelMap[c.model_key].cost += c.cost_usd ?? 0
      }
      const topModels = Object.entries(modelMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([model, v]) => ({ model, ...v }))

      // Events by hour (last 24h)
      const hourBuckets: Record<string, number> = {}
      const now = Date.now()
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now - i * 3600000)
        hourBuckets[`${d.getHours()}:00`] = 0
      }
      for (const e of events) {
        const h = new Date(e.created_at).getHours()
        const key = `${h}:00`
        if (key in hourBuckets) hourBuckets[key]++
      }

      setStats({
        totalEvents: events.length,
        totalCompletions: completions.length,
        totalCost,
        totalTokens,
        avgLatency,
        successRate,
        topAgents,
        topModels,
        recentEvents: events.slice(0, 50),
        recentCompletions: completions.slice(0, 50),
        eventsByHour: Object.entries(hourBuckets).map(([hour, count]) => ({ hour, count })),
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const accent = 'var(--t-p)'

  const EmptyState = ({ label }: { label: string }) => (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Activity size={24} style={{ color: 'var(--t-tx3)' }} />
      <p className="font-mono text-sm font-semibold" style={{ color: 'var(--t-tx2)' }}>{label}</p>
      <p className="font-mono text-[10px] text-center max-w-xs" style={{ color: 'var(--t-tx3)' }}>
        Data will appear here once agents start processing tasks and events are emitted.
      </p>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
        style={{
          background: 'var(--d-topbar)',
          backdropFilter: 'blur(var(--t-blur))',
          borderBottom: '1px solid var(--t-glass-bdr)',
        }}
      >
        <div className="flex items-center gap-3">
          <BarChart2 size={16} style={{ color: 'var(--t-p)' }} />
          <h1 className="font-condensed font-bold uppercase tracking-wider text-base" style={{ color: 'var(--t-tx1)' }}>Analytics</h1>
          {stats && (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
              {stats.totalEvents + stats.totalCompletions} total records
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--t-glass-bdr)' }}>
            {(['overview', 'events', 'ai'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-3 py-1.5 font-mono text-[10px] capitalize transition-all"
                style={{ background: tab === t ? 'var(--t-p-glass)' : 'transparent', color: tab === t ? 'var(--t-p)' : 'var(--t-tx3)' }}>
                {t === 'ai' ? 'AI Usage' : t}
              </button>
            ))}
          </div>
          <button onClick={load} className="w-7 h-7 flex items-center justify-center rounded-xl" style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)', color: '#ef4444' }}>
            <AlertCircle size={14} />
            <span className="font-mono text-[11px]">{error}</span>
          </div>
        )}

        {loading && !stats ? (
          <div className="flex justify-center py-20">
            <RefreshCcw size={20} className="animate-spin" style={{ color: 'var(--t-p)' }} />
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {tab === 'overview' && (
              <div className="space-y-6">
                {/* Stat cards */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                  <StatCard label="Events" value={String(stats?.totalEvents ?? 0)} sub="analytics events" icon={Activity} />
                  <StatCard label="AI Calls" value={String(stats?.totalCompletions ?? 0)} sub="completions" icon={Zap} accent="#8b5cf6" />
                  <StatCard label="Total Cost" value={`$${(stats?.totalCost ?? 0).toFixed(4)}`} sub="this session" icon={TrendingUp} accent="#10b981" />
                  <StatCard label="Tokens Used" value={stats?.totalTokens ? `${((stats.totalTokens) / 1000).toFixed(1)}k` : '0'} sub="in + out" icon={BarChart2} accent="#06b6d4" />
                  <StatCard label="Avg Latency" value={stats?.avgLatency ? `${Math.round(stats.avgLatency)}ms` : '—'} sub="per completion" icon={Clock} accent="#f59e0b" />
                  <StatCard label="Success Rate" value={`${(stats?.successRate ?? 100).toFixed(0)}%`} sub="completions" icon={Activity} accent="#10b981" />
                </div>

                {/* Hour chart */}
                <div className="rounded-2xl p-5" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
                  <p className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--t-tx3)' }}>Events — last 24 hours</p>
                  {stats && stats.eventsByHour.some(b => b.count > 0) ? (
                    <div className="flex items-end gap-0.5 h-20">
                      {stats.eventsByHour.map(({ hour, count }) => {
                        const max = Math.max(...stats.eventsByHour.map(b => b.count), 1)
                        const pct = (count / max) * 100
                        return (
                          <div key={hour} className="flex-1 flex flex-col items-center gap-1 group">
                            <div
                              className="w-full rounded-sm transition-all"
                              style={{
                                height: `${Math.max(pct, 4)}%`,
                                background: count > 0 ? 'var(--t-p)' : 'var(--t-bdr-s)',
                                boxShadow: count > 0 ? '0 0 4px var(--t-p-glow)' : 'none',
                              }}
                              title={`${hour}: ${count} events`}
                            />
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyState label="No events yet" />
                  )}
                </div>

                {/* Top agents + models */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl p-5" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
                    <p className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--t-tx3)' }}>Top Agents</p>
                    {stats && stats.topAgents.length > 0 ? (
                      <div className="space-y-3">
                        {stats.topAgents.map(({ name, count }) => {
                          const max = stats.topAgents[0].count
                          return (
                            <div key={name} className="flex items-center gap-3">
                              <span className="font-mono text-[11px] w-24 truncate" style={{ color: 'var(--t-tx1)' }}>{name}</span>
                              <MiniBar value={count} max={max} color="var(--t-p)" />
                              <span className="font-mono text-[10px] w-6 text-right" style={{ color: 'var(--t-tx3)' }}>{count}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : <EmptyState label="No agent tasks yet" />}
                  </div>

                  <div className="rounded-2xl p-5" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
                    <p className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--t-tx3)' }}>Top Models</p>
                    {stats && stats.topModels.length > 0 ? (
                      <div className="space-y-3">
                        {stats.topModels.map(({ model, count, cost }) => {
                          const max = stats.topModels[0].count
                          return (
                            <div key={model} className="flex items-center gap-3">
                              <span className="font-mono text-[10px] w-28 truncate" style={{ color: 'var(--t-tx1)' }}>{model.split('/').pop()}</span>
                              <MiniBar value={count} max={max} color="#8b5cf6" />
                              <span className="font-mono text-[9px] w-14 text-right" style={{ color: 'var(--t-tx3)' }}>${cost.toFixed(4)}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : <EmptyState label="No AI calls yet" />}
                  </div>
                </div>
              </div>
            )}

            {/* EVENTS TAB */}
            {tab === 'events' && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
                <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                  <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Recent Events · {stats?.totalEvents ?? 0} total</p>
                </div>
                {!stats || stats.recentEvents.length === 0 ? (
                  <EmptyState label="No analytics events yet" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                          {['Event', 'Page', 'Session', 'Time'].map(h => (
                            <th key={h} className="px-5 py-2 text-left font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stats.recentEvents.map((e, i) => (
                          <tr key={e.id} style={{ borderBottom: '1px solid var(--t-bdr)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                            <td className="px-5 py-2.5">
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
                                {e.event_name}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 font-mono text-[10px]" style={{ color: 'var(--t-tx2)' }}>{e.page_path ?? '—'}</td>
                            <td className="px-5 py-2.5 font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{e.session_id?.slice(0, 8) ?? '—'}</td>
                            <td className="px-5 py-2.5 font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{new Date(e.created_at).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* AI USAGE TAB */}
            {tab === 'ai' && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
                <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                  <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>AI Completions · {stats?.totalCompletions ?? 0} total · ${(stats?.totalCost ?? 0).toFixed(4)} spend</p>
                </div>
                {!stats || stats.recentCompletions.length === 0 ? (
                  <EmptyState label="No AI completions logged yet" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                          {['Agent', 'Model', 'Tokens', 'Cost', 'Latency', 'Status', 'Time'].map(h => (
                            <th key={h} className="px-4 py-2 text-left font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stats.recentCompletions.map((c, i) => (
                          <tr key={c.id} style={{ borderBottom: '1px solid var(--t-bdr)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                            <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: 'var(--t-tx1)' }}>{c.agent_name ?? '—'}</td>
                            <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: 'var(--t-tx2)' }}>{c.model_key.split('/').pop()}</td>
                            <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: 'var(--t-tx2)' }}>{((c.input_tokens ?? 0) + (c.output_tokens ?? 0)).toLocaleString()}</td>
                            <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: '#10b981' }}>${(c.cost_usd ?? 0).toFixed(5)}</td>
                            <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: 'var(--t-tx3)' }}>{c.latency_ms ? `${c.latency_ms}ms` : '—'}</td>
                            <td className="px-4 py-2.5">
                              <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: c.success ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: c.success ? '#10b981' : '#ef4444' }}>
                                {c.success ? 'OK' : 'ERR'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{new Date(c.created_at).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
