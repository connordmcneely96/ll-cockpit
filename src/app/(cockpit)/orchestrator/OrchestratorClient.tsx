'use client'

import { useCallback, useEffect, useState } from 'react'

interface RunRow {
  id: string
  original_task: string
  summary: string | null
  status: string
  subtask_count: number
  subtasks_completed: number
  subtasks_failed: number
  estimated_cost_usd: number | null
  actual_cost_usd: number
  started_at: number
  last_active_at: number
}

interface SubtaskRow {
  id: string
  short_id: string
  agent_name: string
  title: string
  task: string
  depends_on: string | null
  estimated_cost_usd: number | null
  risk_level: string
  human_required: number
  status: string
  output: string | null
  error_log: string | null
  cost_usd: number
  tokens: number
}

const AGENT_COLOR: Record<string, string> = {
  nexus: 'border-yellow-400 text-yellow-300',
  hermes: 'border-violet-400 text-violet-300',
  scout: 'border-cyan-400 text-cyan-300',
  intake: 'border-emerald-400 text-emerald-300',
  forge: 'border-yellow-400 text-yellow-300',
  builder: 'border-rose-400 text-rose-300',
  atlas: 'border-cyan-400 text-cyan-300',
  herald: 'border-emerald-400 text-emerald-300',
  reel: 'border-yellow-400 text-yellow-300',
  sentinel: 'border-rose-400 text-rose-300',
  dispatch: 'border-cyan-400 text-cyan-300',
  anchor: 'border-emerald-400 text-emerald-300',
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-800 text-slate-400 border border-slate-700',
  ready: 'bg-blue-900/40 text-blue-300 border border-blue-700',
  running: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700 animate-pulse',
  done: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700',
  failed: 'bg-rose-900/50 text-rose-300 border border-rose-700',
  blocked: 'bg-orange-900/40 text-orange-300 border border-orange-700',
  cancelled: 'bg-slate-800 text-slate-500 border border-slate-700',
}

export default function OrchestratorClient() {
  const [task, setTask] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [subtasksByRun, setSubtasksByRun] = useState<Record<string, SubtaskRow[]>>({})
  const [executingId, setExecutingId] = useState<string | null>(null)

  const refreshRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/orchestrator/runs', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { runs: RunRow[] }
      setRuns(data.runs)
    } catch {
      // silent
    }
  }, [])

  const refreshRunDetail = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/orchestrator/runs/${runId}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { subtasks: SubtaskRow[] }
      setSubtasksByRun((prev) => ({ ...prev, [runId]: data.subtasks }))
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    void refreshRuns()
    const i = setInterval(refreshRuns, 5000)
    return () => clearInterval(i)
  }, [refreshRuns])

  useEffect(() => {
    if (!expandedRunId) return
    void refreshRunDetail(expandedRunId)
    const run = runs.find((r) => r.id === expandedRunId)
    if (!run) return
    if (run.status !== 'running') return
    const i = setInterval(() => refreshRunDetail(expandedRunId), 3000)
    return () => clearInterval(i)
  }, [expandedRunId, runs, refreshRunDetail])

  async function dispatch() {
    if (!task.trim()) return
    setDispatching(true)
    setDispatchError(null)
    try {
      const res = await fetch('/api/orchestrator/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task.trim() }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        run_id?: string
        error?: string
        detail?: string
      }
      if (!res.ok || !data.ok) {
        setDispatchError(data.detail ?? data.error ?? `HTTP ${res.status}`)
        return
      }
      setTask('')
      await refreshRuns()
      if (data.run_id) setExpandedRunId(data.run_id)
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : String(err))
    } finally {
      setDispatching(false)
    }
  }

  async function executeSubtask(subtaskId: string, runId: string, force = false) {
    setExecutingId(subtaskId)
    try {
      const url = `/api/orchestrator/subtasks/${subtaskId}/execute${force ? '?force=true' : ''}`
      const res = await fetch(url, { method: 'POST' })
      await res.json().catch(() => null)
    } finally {
      setExecutingId(null)
      await refreshRunDetail(runId)
      await refreshRuns()
    }
  }

  const canDispatch = !dispatching && task.trim().length > 0

  return (
    <div className="flex flex-col gap-6">
      {/* Dispatch form */}
      <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
          New Orchestration — HERMES will decompose into a DAG
        </label>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="e.g. Build a Stripe integration with tests, deploy it, and write a LinkedIn post about it."
          rows={4}
          maxLength={4000}
          className="w-full rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:border-cyan-500"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-mono">
            {task.length} / 4000
          </div>
          <button
            onClick={dispatch}
            disabled={!canDispatch}
            style={{
              backgroundColor: canDispatch ? '#06b6d4' : '#334155',
              color: canDispatch ? '#020617' : '#64748b',
              cursor: canDispatch ? 'pointer' : 'not-allowed',
            }}
            className="rounded-md font-mono text-sm uppercase tracking-wider px-6 py-3 transition hover:brightness-110 font-bold shadow-lg"
          >
            {dispatching ? '⏳ HERMES is planning...' : '▶ Dispatch to HERMES'}
          </button>
        </div>
        {dispatchError && (
          <div className="mt-3 rounded-md border border-rose-700 bg-rose-900/30 p-2 text-xs text-rose-300 font-mono">
            {dispatchError}
          </div>
        )}
      </section>

      {/* Recent runs */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">
          Recent runs ({runs.length})
        </h2>
        {runs.length === 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-500">
            No orchestrations yet. Dispatch your first task above.
          </div>
        )}
        {runs.map((run) => {
          const isOpen = expandedRunId === run.id
          const progress = run.subtask_count > 0
            ? (run.subtasks_completed / run.subtask_count) * 100
            : 0
          return (
            <div
              key={run.id}
              className="rounded-lg border border-slate-700 bg-slate-900/60 overflow-hidden"
            >
              <button
                onClick={() => setExpandedRunId(isOpen ? null : run.id)}
                className="w-full text-left p-4 hover:bg-slate-900 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-mono mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_STYLE[run.status] ?? STATUS_STYLE.pending}`}>
                        {run.status}
                      </span>
                      <span className="text-slate-500">
                        {new Date(run.started_at * 1000).toLocaleString()}
                      </span>
                      <span className="text-slate-500">
                        • {run.subtask_count} subtasks
                      </span>
                      {run.actual_cost_usd > 0 && (
                        <span className="text-slate-500">
                          • ${run.actual_cost_usd.toFixed(4)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-200 line-clamp-2">
                      {run.summary || run.original_task}
                    </div>
                    <div className="mt-2 h-1 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-cyan-400 text-xs font-mono">
                    {isOpen ? '▼' : '▶'}
                  </div>
                </div>
              </button>

              {isOpen && (
                <RunDetail
                  run={run}
                  subtasks={subtasksByRun[run.id] ?? []}
                  executingId={executingId}
                  onExecute={(stId, force) => executeSubtask(stId, run.id, force)}
                />
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

function RunDetail({
  run,
  subtasks,
  executingId,
  onExecute,
}: {
  run: RunRow
  subtasks: SubtaskRow[]
  executingId: string | null
  onExecute: (subtaskId: string, force: boolean) => void
}) {
  return (
    <div className="border-t border-slate-700 p-4 flex flex-col gap-3 bg-slate-950/60">
      <div className="text-xs font-mono text-slate-500">
        Original task: <span className="text-slate-300">{run.original_task}</span>
      </div>

      {subtasks.length === 0 && (
        <div className="text-xs text-slate-500">Loading subtasks...</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {subtasks.map((st) => {
          const deps: string[] = st.depends_on ? JSON.parse(st.depends_on) : []
          const isHitl = st.human_required === 1
          const canExecute = st.status === 'ready'
          const isExecuting = executingId === st.id
          const agentColor = AGENT_COLOR[st.agent_name] ?? 'border-slate-600 text-slate-400'

          const btnBg = canExecute && !isExecuting
            ? (isHitl ? '#d97706' : '#0891b2')   // amber for force, cyan for normal
            : '#1e293b'
          const btnColor = canExecute && !isExecuting
            ? (isHitl ? '#020617' : '#f1f5f9')
            : '#64748b'
          const btnLabel = isExecuting
            ? '⏳ Running...'
            : isHitl
            ? '⚠ Force Execute (HITL)'
            : '▶ Execute'

          return (
            <div
              key={st.id}
              className="rounded-md border border-slate-700 bg-slate-900 p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500">
                    {st.short_id}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${agentColor}`}
                  >
                    {st.agent_name}
                  </span>
                  {isHitl && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-900/40 text-amber-300 border border-amber-700">
                      HITL
                    </span>
                  )}
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${STATUS_STYLE[st.status] ?? STATUS_STYLE.pending}`}
                >
                  {st.status}
                </span>
              </div>

              <div className="text-sm text-slate-200 font-medium">{st.title}</div>
              <div className="text-xs text-slate-400 line-clamp-3">{st.task}</div>

              {deps.length > 0 && (
                <div className="text-[11px] font-mono text-slate-500">
                  depends on: {deps.join(', ')}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 mt-1">
                <div className="text-[11px] font-mono text-slate-500">
                  {st.cost_usd > 0
                    ? `$${st.cost_usd.toFixed(4)} · ${st.tokens} tok`
                    : st.estimated_cost_usd
                    ? `est $${st.estimated_cost_usd.toFixed(2)}`
                    : ''}
                </div>
                <button
                  onClick={() => onExecute(st.id, isHitl)}
                  disabled={!canExecute || isExecuting}
                  style={{
                    backgroundColor: btnBg,
                    color: btnColor,
                    cursor: canExecute && !isExecuting ? 'pointer' : 'not-allowed',
                  }}
                  className="rounded text-xs font-mono uppercase tracking-wider px-3 py-1.5 transition hover:brightness-110 font-semibold"
                >
                  {btnLabel}
                </button>
              </div>

              {st.output && (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer text-cyan-400/80 hover:text-cyan-300">
                    View output
                  </summary>
                  <pre className="mt-2 p-2 bg-slate-950 border border-slate-800 rounded whitespace-pre-wrap font-mono text-[11px] leading-relaxed max-h-96 overflow-auto">
                    {st.output}
                  </pre>
                </details>
              )}
              {st.error_log && (
                <div className="text-xs text-rose-300 bg-rose-900/30 border border-rose-800 rounded p-2 font-mono">
                  {st.error_log}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
