'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { History, MessageSquare, Palette, Cpu, Brain, Trash2, ExternalLink, RefreshCw, FileText } from 'lucide-react'
import { formatCost } from '@/lib/cost'
import { AGENTS } from '@/lib/agents'
import type { AgentChatRow, DesignBriefRow, OrchestratorRunRow } from '@/types'

type Tab = 'chats' | 'design' | 'orchestrator' | 'oracle'

interface OracleItem {
  id: string
  source_id: string
  external_id: string | null
  title: string | null
  url: string
  status: string
  relevance_score: number
  collected_at: number
  processed_at: number | null
  error_log: string | null
}

interface OracleDigest {
  id: string
  digest_date: string
  item_count: number
  item_ids: string
  digest_markdown: string | null
  delivered_at: number | null
  created_at: number
}

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chats', label: 'Agent Chats', icon: MessageSquare },
  { id: 'design', label: 'Design Briefs', icon: Palette },
  { id: 'orchestrator', label: 'Orchestrator Runs', icon: Cpu },
  { id: 'oracle', label: 'Oracle Research', icon: Brain },
]

function formatRelative(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - unixSeconds
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(unixSeconds * 1000).toLocaleDateString()
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
    case 'preview_ready':
    case 'shipped':
    case 'ready':
    case 'embedded':
    case 'summarized':
      return 'text-green border-green/30 bg-green/10'
    case 'building':
    case 'running':
    case 'planning':
    case 'pending':
      return 'text-blue-bright border-blue/30 bg-blue/10'
    case 'failed':
    case 'error':
      return 'text-red border-red/30 bg-red/10'
    case 'archived':
    case 'cancelled':
      return 'text-text3 border-white/10 bg-white/[0.04]'
    default:
      return 'text-text2 border-white/10 bg-white/[0.04]'
  }
}

function hostnameOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url.slice(0, 30) }
}

export function HistoryClient() {
  const [tab, setTab] = useState<Tab>('chats')
  const [chats, setChats] = useState<AgentChatRow[]>([])
  const [briefs, setBriefs] = useState<DesignBriefRow[]>([])
  const [runs, setRuns] = useState<OrchestratorRunRow[]>([])
  const [oracleItems, setOracleItems] = useState<OracleItem[]>([])
  const [oracleDigests, setOracleDigests] = useState<OracleDigest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [chatsRes, briefsRes, runsRes, oracleItemsRes, oracleDigestsRes] = await Promise.all([
        fetch('/api/chats?limit=100'),
        fetch('/api/design/briefs?limit=100'),
        fetch('/api/orchestrator/runs?limit=100'),
        fetch('/api/oracle/items?limit=200'),
        fetch('/api/oracle/digests'),
      ])
      if (chatsRes.ok) {
        const d = (await chatsRes.json()) as { chats: AgentChatRow[] }
        setChats(d.chats ?? [])
      }
      if (briefsRes.ok) {
        const d = (await briefsRes.json()) as { briefs: DesignBriefRow[] }
        setBriefs(d.briefs ?? [])
      }
      if (runsRes.ok) {
        const d = (await runsRes.json()) as { runs: OrchestratorRunRow[] }
        setRuns(d.runs ?? [])
      }
      if (oracleItemsRes.ok) {
        const d = (await oracleItemsRes.json()) as { items: OracleItem[] }
        setOracleItems(d.items ?? [])
      }
      if (oracleDigestsRes.ok) {
        const d = (await oracleDigestsRes.json()) as { ok: boolean; digests: OracleDigest[] }
        setOracleDigests(d.digests ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function handleDeleteChat(id: string) {
    if (!confirm('Delete this chat and all its messages?')) return
    const res = await fetch(`/api/chats/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setChats((cs) => cs.filter((c) => c.id !== id))
    } else {
      alert('Failed to delete chat')
    }
  }

  const oracleCount = oracleItems.length + oracleDigests.length

  return (
    <div className="flex flex-col h-full bg-base text-text1">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-base-2 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <History size={18} className="text-text2" />
          <h1 className="font-condensed font-bold text-base uppercase tracking-wider">History</h1>
          <span className="text-text3 font-mono text-xs">All your runs, briefs, conversations, and research</span>
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-base-3 border border-white/[0.06] hover:border-blue/30 text-text2 hover:text-text1 font-mono text-xs transition-all disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-base-2 border-b border-white/[0.06] px-6 shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => {
          const count =
            id === 'chats' ? chats.length :
            id === 'design' ? briefs.length :
            id === 'orchestrator' ? runs.length :
            oracleCount
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={[
                'flex items-center gap-2 px-4 py-3 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 -mb-px',
                tab === id
                  ? 'border-blue text-text1 bg-base'
                  : 'border-transparent text-text3 hover:text-text2',
              ].join(' ')}
            >
              <Icon size={13} />
              {label}
              <span className="text-text3 font-mono text-[10px]">({count})</span>
            </button>
          )
        })}
      </div>

      {error && (
        <div className="px-6 py-3 bg-red/10 border-b border-red/30 text-red text-sm font-mono">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'chats' && (
          <div className="space-y-2">
            {chats.length === 0 && !loading && (
              <div className="text-center py-12 text-text3 font-mono text-sm">
                No agent chats yet. Open an agent and start a conversation.
              </div>
            )}
            {chats.map((c) => {
              const agent = AGENTS[c.agent_name as keyof typeof AGENTS]
              const color = agent?.color ?? '#888'
              const displayName = agent?.displayName ?? c.agent_name.toUpperCase()
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-4 px-4 py-3 rounded-lg bg-base-2 border border-white/[0.06] hover:border-blue/30 transition-all"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[10px] font-mono uppercase tracking-wider"
                        style={{ color }}
                      >
                        {displayName}
                      </span>
                      <span className="text-text1 font-mono text-sm truncate">
                        {c.title ?? '(untitled)'}
                      </span>
                    </div>
                    {c.last_message_preview && (
                      <p className="text-text3 font-mono text-xs mt-1 truncate">
                        {c.last_message_preview}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-text3 font-mono text-[10px]">
                      {c.message_count} msg
                    </span>
                    <span className="text-text3 font-mono text-[10px]">
                      {formatCost(c.total_cost_usd)}
                    </span>
                    <span className="text-text3 font-mono text-[10px] w-16 text-right">
                      {formatRelative(c.updated_at)}
                    </span>
                    <Link
                      href={`/agent/${c.agent_name}?chat=${c.id}`}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue/20 hover:bg-blue/30 text-blue-bright text-[10px] font-mono"
                    >
                      <ExternalLink size={11} />
                      Continue
                    </Link>
                    <button
                      onClick={() => handleDeleteChat(c.id)}
                      className="p-1.5 rounded-md text-text3 hover:text-red hover:bg-red/10 transition-colors"
                      title="Delete chat"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'design' && (
          <div className="space-y-2">
            {briefs.length === 0 && !loading && (
              <div className="text-center py-12 text-text3 font-mono text-sm">
                No design briefs yet. Go to Design Build to start one.
              </div>
            )}
            {briefs.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-4 px-4 py-3 rounded-lg bg-base-2 border border-white/[0.06] hover:border-blue/30 transition-all"
              >
                <Palette size={14} className="text-purple shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-text1 font-condensed font-bold text-sm truncate">
                      {b.client_name}
                    </span>
                    <span
                      className={[
                        'px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-wider',
                        statusColor(b.status),
                      ].join(' ')}
                    >
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-text3 font-mono text-xs mt-1 truncate">
                    {b.business_description}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-text3 font-mono text-[10px]">
                    iter {b.current_iteration}
                  </span>
                  <span className="text-text3 font-mono text-[10px]">
                    {formatCost(b.total_cost_usd)}
                  </span>
                  <span className="text-text3 font-mono text-[10px] w-16 text-right">
                    {formatRelative(b.updated_at)}
                  </span>
                  {b.preview_url && (
                    <a
                      href={b.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-green/20 hover:bg-green/30 text-green text-[10px] font-mono"
                    >
                      <ExternalLink size={11} />
                      Preview
                    </a>
                  )}
                  <Link
                    href={`/design#brief=${b.id}`}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue/20 hover:bg-blue/30 text-blue-bright text-[10px] font-mono"
                  >
                    Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'orchestrator' && (
          <div className="space-y-2">
            {runs.length === 0 && !loading && (
              <div className="text-center py-12 text-text3 font-mono text-sm">
                No orchestrator runs yet.
              </div>
            )}
            {runs.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-4 px-4 py-3 rounded-lg bg-base-2 border border-white/[0.06] hover:border-blue/30 transition-all"
              >
                <Cpu size={14} className="text-yellow shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-text1 font-mono text-sm truncate">
                      {r.summary ?? r.original_task}
                    </span>
                    <span
                      className={[
                        'px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-wider',
                        statusColor(r.status),
                      ].join(' ')}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-text3 font-mono text-xs mt-1 truncate">
                    {r.subtasks_completed}/{r.subtask_count} subtasks
                    {r.subtasks_failed > 0 && ` · ${r.subtasks_failed} failed`}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-text3 font-mono text-[10px]">
                    {formatCost(r.actual_cost_usd)}
                  </span>
                  <span className="text-text3 font-mono text-[10px] w-16 text-right">
                    {formatRelative(r.last_active_at)}
                  </span>
                  <Link
                    href={`/orchestrator?run=${r.id}`}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue/20 hover:bg-blue/30 text-blue-bright text-[10px] font-mono"
                  >
                    <ExternalLink size={11} />
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'oracle' && (
          <div className="space-y-4">
            {oracleDigests.length > 0 && (
              <div>
                <h3 className="text-text3 font-mono text-[10px] uppercase tracking-wider mb-2 px-1">
                  Digests ({oracleDigests.length})
                </h3>
                <div className="space-y-2">
                  {oracleDigests.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-4 px-4 py-3 rounded-lg bg-base-2 border border-white/[0.06] hover:border-blue/30 transition-all"
                    >
                      <FileText size={14} className="text-cyan shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-text1 font-mono text-sm">
                            Digest for {d.digest_date}
                          </span>
                          <span className="text-text3 font-mono text-[10px]">
                            {d.item_count} items
                          </span>
                        </div>
                        <p className="text-text3 font-mono text-xs mt-1">
                          {d.delivered_at
                            ? `Delivered ${formatRelative(d.delivered_at)}`
                            : `Created ${formatRelative(d.created_at)}`}
                        </p>
                      </div>
                      <Link
                        href={`/oracle?digest=${d.id}`}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue/20 hover:bg-blue/30 text-blue-bright text-[10px] font-mono"
                      >
                        <ExternalLink size={11} />
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-text3 font-mono text-[10px] uppercase tracking-wider mb-2 px-1">
                Research items ({oracleItems.length})
              </h3>
              <div className="space-y-2">
                {oracleItems.length === 0 && !loading && (
                  <div className="text-center py-12 text-text3 font-mono text-sm">
                    No research items yet. Run the Oracle pipeline to collect.
                  </div>
                )}
                {oracleItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg bg-base-2 border border-white/[0.06] hover:border-blue/30 transition-all"
                  >
                    <Brain size={14} className="text-cyan shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-text1 font-mono text-sm truncate">
                          {item.title ?? '(untitled)'}
                        </span>
                        <span
                          className={[
                            'px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-wider shrink-0',
                            statusColor(item.status),
                          ].join(' ')}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-text3 font-mono text-xs mt-1 truncate">
                        {hostnameOf(item.url)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {item.relevance_score > 0 && (
                        <span className="text-text3 font-mono text-[10px]">
                          rel {item.relevance_score.toFixed(2)}
                        </span>
                      )}
                      <span className="text-text3 font-mono text-[10px] w-16 text-right">
                        {formatRelative(item.collected_at)}
                      </span>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue/20 hover:bg-blue/30 text-blue-bright text-[10px] font-mono"
                      >
                        <ExternalLink size={11} />
                        Open
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
