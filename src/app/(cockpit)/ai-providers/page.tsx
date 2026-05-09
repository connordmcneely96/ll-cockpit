'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bot, CheckCircle, XCircle, RefreshCcw, AlertCircle, Zap, Database, Globe } from 'lucide-react'

interface Provider {
  id: string
  provider_key: string
  display_name: string
  secret_name: string
  status: string
  use_cases_json: string
  metadata_json: string
  created_at: string
}

interface AiModel {
  id: string
  provider_key: string
  model_key: string
  display_name: string
  lane: string
  runtime: string
  modality: string
  is_enabled: number
  is_blocked: number
  input_price_per_mtok: number | null
  output_price_per_mtok: number | null
}

interface RoutingPolicy {
  id: string
  policy_key: string
  default_text_model: string | null
  cheap_text_model: string | null
  senior_text_model: string | null
  review_provider: string | null
  router_strategy: string
  blocked_models_json: string
}

interface LiveStatus {
  anthropic: boolean
  openai: boolean
  gemini: boolean
  workers_ai: boolean
}

const LANE_COLORS: Record<string, string> = {
  default_workhorse: '#3b82f6',
  cheap_fast_router: '#10b981',
  senior_reasoning: '#8b5cf6',
  embeddings: '#06b6d4',
  utility_inference: '#f59e0b',
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: any }> = {
  active: { color: '#10b981', label: 'Active', icon: CheckCircle },
  needs_secret: { color: '#f59e0b', label: 'Needs Secret', icon: AlertCircle },
  disabled: { color: '#6b7280', label: 'Disabled', icon: XCircle },
}

export default function AiProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<AiModel[]>([])
  const [policy, setPolicy] = useState<RoutingPolicy | null>(null)
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dbRes, liveRes] = await Promise.all([
        fetch('/api/ai-providers/data'),
        fetch('/api/ai/providers'),
      ])
      const [dbData, liveData] = await Promise.all([
        dbRes.json() as Promise<{ ok: boolean; providers?: Provider[]; models?: AiModel[]; policy?: RoutingPolicy; error?: string }>,
        liveRes.json() as Promise<{ ok: boolean; providers?: any }>,
      ])
      if (!dbData.ok) throw new Error(dbData.error)
      setProviders(dbData.providers ?? [])
      setModels(dbData.models ?? [])
      setPolicy(dbData.policy ?? null)
      if (liveData.ok && liveData.providers) {
        setLiveStatus({
          anthropic: liveData.providers.anthropic?.configured ?? false,
          openai: liveData.providers.openai?.configured ?? false,
          gemini: liveData.providers.gemini?.configured ?? false,
          workers_ai: liveData.providers.workers_ai?.configured ?? true,
        })
      }
      // Auto-select first provider
      if (dbData.providers && dbData.providers.length > 0) {
        setSelectedProvider(prev => prev ?? dbData.providers![0].provider_key)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filteredModels = selectedProvider
    ? models.filter(m => m.provider_key === selectedProvider)
    : models

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
          <Bot size={16} style={{ color: 'var(--t-p)' }} />
          <h1 className="font-condensed font-bold uppercase tracking-wider text-base" style={{ color: 'var(--t-tx1)' }}>AI Providers</h1>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
            {providers.length} providers · {models.length} models
          </span>
        </div>
        <button onClick={load} className="w-7 h-7 flex items-center justify-center rounded-xl" style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
          <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)', color: '#ef4444' }}>
            <AlertCircle size={14} />
            <span className="font-mono text-[11px]">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><RefreshCcw size={20} className="animate-spin" style={{ color: 'var(--t-p)' }} /></div>
        ) : (
          <>
            {/* Provider cards */}
            <div className="grid grid-cols-2 gap-4">
              {providers.map(p => {
                const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.disabled
                const StatusIcon = cfg.icon
                const live = liveStatus?.[p.provider_key as keyof LiveStatus]
                const providerModels = models.filter(m => m.provider_key === p.provider_key)
                const useCases: string[] = JSON.parse(p.use_cases_json ?? '[]')
                const isSelected = selectedProvider === p.provider_key

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProvider(isSelected ? null : p.provider_key)}
                    className="rounded-2xl p-5 text-left transition-all"
                    style={{
                      background: isSelected ? 'var(--t-p-glass)' : 'var(--d-card)',
                      backdropFilter: 'blur(var(--t-blur))',
                      border: isSelected ? '1.5px solid var(--t-p)' : '1px solid var(--t-glass-bdr)',
                      boxShadow: isSelected ? '0 0 0 3px var(--t-p-glow), var(--t-shadow)' : 'var(--t-shadow)',
                    }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-mono font-semibold text-sm" style={{ color: 'var(--t-tx1)' }}>{p.display_name}</p>
                        <p className="font-mono text-[9px] mt-0.5" style={{ color: 'var(--t-tx3)' }}>{p.secret_name}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* Live secret status */}
                        <div className="w-2 h-2 rounded-full" style={{
                          background: live ? '#10b981' : '#f59e0b',
                          boxShadow: live ? '0 0 6px #10b981' : '0 0 4px #f59e0b',
                        }} />
                        {/* DB status */}
                        <span className="flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 rounded-full"
                          style={{ background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                          <StatusIcon size={9} />
                          {cfg.label}
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-1">
                        <Database size={10} style={{ color: 'var(--t-tx3)' }} />
                        <span className="font-mono text-[10px]" style={{ color: 'var(--t-tx2)' }}>{providerModels.length} models</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Zap size={10} style={{ color: 'var(--t-tx3)' }} />
                        <span className="font-mono text-[10px]" style={{ color: 'var(--t-tx2)' }}>
                          {providerModels.filter(m => m.is_enabled).length} active
                        </span>
                      </div>
                    </div>

                    {/* Use cases */}
                    <div className="flex flex-wrap gap-1">
                      {useCases.map(uc => (
                        <span key={uc} className="font-mono text-[8px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--t-p-glass)', color: 'var(--t-p)', border: '1px solid var(--t-glass-bdr)' }}>
                          {uc}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Routing policy */}
            {policy && (
              <div className="rounded-2xl p-5" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Globe size={13} style={{ color: 'var(--t-p)' }} />
                  <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>Routing Policy · {policy.policy_key} · {policy.router_strategy}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Default / Workhorse', model: policy.default_text_model, lane: 'default_workhorse' },
                    { label: 'Cheap / Fast', model: policy.cheap_text_model, lane: 'cheap_fast_router' },
                    { label: 'Senior / Reasoning', model: policy.senior_text_model, lane: 'senior_reasoning' },
                  ].map(({ label, model, lane }) => (
                    <div key={label} className="rounded-xl p-3" style={{ background: 'var(--t-p-glass)', border: `1px solid ${LANE_COLORS[lane] ?? 'var(--t-bdr)'}30` }}>
                      <p className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: LANE_COLORS[lane] ?? 'var(--t-tx3)' }}>{label}</p>
                      <p className="font-mono text-[11px]" style={{ color: 'var(--t-tx1)' }}>{model ?? '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Model list */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--d-card)', backdropFilter: 'blur(var(--t-blur))', border: '1px solid var(--t-glass-bdr)', boxShadow: 'var(--t-shadow)' }}>
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--t-glass-bdr)' }}>
                <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-tx3)' }}>
                  Models {selectedProvider ? `· ${selectedProvider}` : '· all providers'}
                </p>
                {selectedProvider && (
                  <button onClick={() => setSelectedProvider(null)} className="font-mono text-[9px]" style={{ color: 'var(--t-p)' }}>Show all</button>
                )}
              </div>
              {filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Bot size={20} style={{ color: 'var(--t-tx3)' }} />
                  <p className="font-mono text-[11px]" style={{ color: 'var(--t-tx3)' }}>No models found</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--t-bdr)' }}>
                  {filteredModels.map(m => (
                    <div key={m.id} className="flex items-center gap-4 px-5 py-3 transition-all hover:bg-white/[0.02]">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{
                        background: m.is_enabled && !m.is_blocked ? '#10b981' : '#6b7280',
                        boxShadow: m.is_enabled && !m.is_blocked ? '0 0 6px #10b981' : 'none',
                      }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[11px] font-medium" style={{ color: 'var(--t-tx1)' }}>{m.display_name}</p>
                        <p className="font-mono text-[9px]" style={{ color: 'var(--t-tx3)' }}>{m.model_key}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] px-2 py-0.5 rounded-full"
                          style={{ background: `${LANE_COLORS[m.lane] ?? '#6b7280'}18`, color: LANE_COLORS[m.lane] ?? '#6b7280', border: `1px solid ${LANE_COLORS[m.lane] ?? '#6b7280'}30` }}>
                          {m.lane.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'var(--t-bdr)', color: 'var(--t-tx3)' }}>
                          {m.runtime}
                        </span>
                        {m.is_blocked ? (
                          <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>blocked</span>
                        ) : null}
                      </div>
                      {m.input_price_per_mtok && (
                        <p className="font-mono text-[9px] w-24 text-right" style={{ color: 'var(--t-tx3)' }}>
                          ${m.input_price_per_mtok}/M in
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
