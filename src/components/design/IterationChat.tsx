'use client'

/**
 * IterationChat — Sprint 16 v0.3.0
 *
 * Conversational refinement panel for a finished design brief. Calls
 * /api/design/briefs/[id]/chat under the hood. Loads prior turns on mount,
 * appends each new turn after the agent responds, and signals the parent to
 * refresh brief detail (preview URL, iteration number, critic score).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface ChatMessageRow {
  id: string
  brief_id: string
  user_id: string
  role: 'user' | 'assistant' | 'tool_result'
  content: string | null
  tool_calls_json: string | null
  tool_results_json: string | null
  iteration_id: string | null
  model_id: string | null
  input_tokens: number
  output_tokens: number
  cost_usd: number
  latency_ms: number | null
  created_at: number
}

interface ToolUseSummary {
  id: string
  name: string
  input: Record<string, unknown>
}

interface ToolResultSummary {
  tool_use_id: string
  content: string
  is_error?: boolean
}

interface PostResponse {
  ok?: boolean
  final_text?: string
  tool_hops?: number
  cost_usd?: number
  input_tokens?: number
  output_tokens?: number
  latency_ms?: number
  error?: string
}

interface Props {
  briefId: string
  /** Called after each successful chat turn so the parent can refresh detail. */
  onTurnCompleted?: () => void
}

export default function IterationChat({ briefId, onTurnCompleted }: Props) {
  const [messages, setMessages] = useState<ChatMessageRow[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTurnSummary, setLastTurnSummary] = useState<{
    tool_hops: number
    cost_usd: number
    latency_ms: number
  } | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  const loadMessages = useCallback(async () => {
    try {
      const r = await fetch(`/api/design/briefs/${briefId}/chat`, { cache: 'no-store' })
      if (!r.ok) return
      const d = (await r.json()) as { messages: ChatMessageRow[] }
      setMessages(d.messages ?? [])
    } catch { /* silent */ }
  }, [briefId])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    setInput('')
    try {
      const res = await fetch(`/api/design/briefs/${briefId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = (await res.json()) as PostResponse
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
      } else {
        setLastTurnSummary({
          tool_hops: data.tool_hops ?? 0,
          cost_usd: data.cost_usd ?? 0,
          latency_ms: data.latency_ms ?? 0,
        })
      }
      await loadMessages()
      onTurnCompleted?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/80 flex flex-col" style={{ minHeight: 360 }}>
      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-violet-300 border border-violet-500/40 rounded px-1.5 py-0.5">
            DESIGNER ITERATE
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Tell me what to change. Color, copy, sections.
          </span>
        </div>
        {lastTurnSummary && (
          <span className="text-[10px] font-mono text-slate-500">
            {lastTurnSummary.tool_hops} tool {lastTurnSummary.tool_hops === 1 ? 'hop' : 'hops'} · ${lastTurnSummary.cost_usd.toFixed(4)} · {(lastTurnSummary.latency_ms / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2" style={{ maxHeight: 440 }}>
        {messages.length === 0 && (
          <div className="text-xs font-mono text-slate-500 italic text-center py-8">
            No messages yet. Try: &quot;make the primary color a deeper teal&quot; or &quot;the hero needs a stronger headline&quot;.
          </div>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        {sending && (
          <div className="text-[10px] font-mono text-slate-500 animate-pulse pl-2">
            DESIGNER ITERATE is working...
          </div>
        )}
      </div>

      {error && (
        <div className="mx-3 mb-2 rounded-md border border-rose-700 bg-rose-900/30 p-2 text-xs text-rose-300 font-mono">
          {error}
        </div>
      )}

      <div className="p-3 border-t border-slate-800 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder='e.g. "make the primary color #0a4d6b and apply it" — ⌘/Ctrl+Enter to send'
          className="flex-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:border-violet-500"
          disabled={sending}
        />
        <button
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="rounded-md font-mono text-xs uppercase tracking-wider px-4 self-stretch transition shadow-lg"
          style={{
            backgroundColor: !sending && input.trim() ? '#8b5cf6' : '#334155',
            color: !sending && input.trim() ? '#0f0a19' : '#64748b',
            cursor: !sending && input.trim() ? 'pointer' : 'not-allowed',
            fontWeight: 700,
          }}
        >
          {sending ? '⏳' : '▶ Send'}
        </button>
      </div>
    </div>
  )
}

function MessageRow({ message }: { message: ChatMessageRow }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-md bg-violet-900/40 border border-violet-700/50 px-3 py-2 text-sm text-slate-100 whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'tool_result') {
    const results: ToolResultSummary[] = safeParseArray(message.tool_results_json)
    if (results.length === 0) return null
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-[11px] font-mono text-slate-400 flex flex-col gap-1">
          {results.map((r, i) => (
            <div key={r.tool_use_id + i} className="flex items-start gap-2">
              <span
                className={
                  r.is_error
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }
              >
                {r.is_error ? '✗' : '✓'}
              </span>
              <span className="line-clamp-3">{truncateToolResult(r.content)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // assistant
  const toolUses: ToolUseSummary[] = safeParseArray(message.tool_calls_json)
  return (
    <div className="flex justify-start flex-col gap-1">
      {message.content && (
        <div className="max-w-[85%] rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200 whitespace-pre-wrap">
          {message.content}
        </div>
      )}
      {toolUses.length > 0 && (
        <div className="max-w-[85%] flex flex-col gap-1">
          {toolUses.map((t) => (
            <div
              key={t.id}
              className="text-[10px] font-mono text-violet-300 border border-violet-700/40 bg-violet-900/20 rounded px-2 py-1"
            >
              → {t.name}
              {Object.keys(t.input).length > 0 && (
                <span className="text-slate-500 ml-2">
                  ({Object.keys(t.input).join(', ')})
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function safeParseArray<T>(raw: string | null): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function truncateToolResult(s: string): string {
  if (s.length <= 240) return s
  return s.slice(0, 237) + '...'
}
