/**
 * Sprint 146 — agent_messages coordinator runtime.
 *
 * The message bus layered over the existing DAG. This file owns the
 * emit → route → deliver → process spine. The DAG functions
 * (decomposeTask, persistDecomposition, runAutoWave) are CALLED, not
 * reimplemented here.
 *
 * Status lifecycle:
 *   queued → routing → delivered → processing → done
 *                    ↘ dropped (TTL expired or unknown/inactive to_agent)
 *                                             ↘ failed  (processMessage exception)
 * Terminal states: done, failed, dropped — never re-enter the loop.
 */

import type { CloudflareEnv } from '@/types'
import { decomposeTask, persistDecomposition } from '@/lib/hermes'
import { runAutoWave } from '@/lib/orchestrator'
import { waitUntil } from 'cloudflare:workers'

// ── AgentMessageRow ───────────────────────────────────────────────

export interface AgentMessageRow {
  id: string
  user_id: string
  conversation_id: string
  from_agent: string
  to_agent: string
  via_agent: string
  parent_message_id: string | null
  task_id: string | null
  pipeline_id: string | null
  pipeline_stage: string | null
  message_type: 'request' | 'response' | 'broadcast' | 'event' | 'error'
  priority: number
  subject: string | null
  body: string
  payload_json: string | null
  status: 'queued' | 'routing' | 'delivered' | 'processing' | 'done' | 'failed' | 'dropped'
  error_log: string | null
  retry_count: number
  created_at: number
  routed_at: number | null
  delivered_at: number | null
  processed_at: number | null
  ttl_seconds: number | null
}

// ── emitMessage ───────────────────────────────────────────────────

export interface EmitMessageInput {
  userId: string
  conversationId?: string
  fromAgent: string
  toAgent: string
  viaAgent?: string
  parentMessageId?: string
  taskId?: string
  pipelineId?: string
  pipelineStage?: string
  messageType?: AgentMessageRow['message_type']
  priority?: number
  subject?: string
  body: string
  payloadJson?: string
  ttlSeconds?: number
}

export async function emitMessage(
  env: CloudflareEnv,
  input: EmitMessageInput,
): Promise<{ id: string; conversationId: string }> {
  const id = crypto.randomUUID()
  const conversationId = input.conversationId ?? crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  await env.DB.prepare(
    `INSERT INTO agent_messages
     (id, user_id, conversation_id, from_agent, to_agent, via_agent,
      parent_message_id, task_id, pipeline_id, pipeline_stage,
      message_type, priority, subject, body, payload_json,
      status, error_log, retry_count, created_at, ttl_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', NULL, 0, ?, ?)`,
  )
    .bind(
      id,
      input.userId,
      conversationId,
      input.fromAgent,
      input.toAgent,
      input.viaAgent ?? 'NEXUS',
      input.parentMessageId ?? null,
      input.taskId ?? null,
      input.pipelineId ?? null,
      input.pipelineStage ?? null,
      input.messageType ?? 'request',
      input.priority ?? 5,
      input.subject ?? null,
      input.body,
      input.payloadJson ?? null,
      now,
      input.ttlSeconds ?? null,
    )
    .run()

  return { id, conversationId }
}

// ── getMessage / listMessages ───────────────────────────────────────

export async function getMessage(
  env: CloudflareEnv,
  id: string,
): Promise<AgentMessageRow | null> {
  return env.DB.prepare(`SELECT * FROM agent_messages WHERE id = ?`)
    .bind(id)
    .first<AgentMessageRow>()
}

export async function listMessages(
  env: CloudflareEnv,
  opts: {
    conversationId?: string
    status?: AgentMessageRow['status']
    toAgent?: string
    limit?: number
  } = {},
): Promise<AgentMessageRow[]> {
  const conditions: string[] = []
  const bindings: (string | number)[] = []

  if (opts.conversationId) {
    conditions.push('conversation_id = ?')
    bindings.push(opts.conversationId)
  }
  if (opts.status) {
    conditions.push('status = ?')
    bindings.push(opts.status)
  }
  if (opts.toAgent) {
    conditions.push('to_agent = ?')
    bindings.push(opts.toAgent)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = opts.limit ?? 100
  const sql = `SELECT * FROM agent_messages ${where} ORDER BY priority ASC, created_at ASC LIMIT ?`
  bindings.push(limit)

  const stmt = env.DB.prepare(sql)
  const result = await stmt.bind(...bindings).all<AgentMessageRow>()
  return result.results ?? []
}

// ── routeMessage ───────────────────────────────────────────────
//
// v1 capability gate checks:
//   ENFORCED: to_agent must exist in agent_registry AND active = 1.
//   ENFORCED: if agents.read_only = 1, message_type = 'request' is blocked
//             (read-only agents cannot receive work requests; broadcasts/events OK).
//   ENFORCED: TTL expiry — drop if created_at + ttl_seconds < now.
//   DEFERRED: per-action gating (can_deploy, can_write_files, can_send_email,
//             can_delete, requires_approval) — these require payload-level
//             intent parsing and will be added in a later sprint once agents
//             have structured action schemas.

export async function routeMessage(
  env: CloudflareEnv,
  messageId: string,
): Promise<{ routed: boolean; reason?: string; status?: string }> {
  const msg = await getMessage(env, messageId)
  if (!msg) return { routed: false, reason: 'not_found' }
  if (msg.status !== 'queued') return { routed: false, reason: 'not_queued' }

  const now = Math.floor(Date.now() / 1000)

  await env.DB.prepare(
    `UPDATE agent_messages SET status = 'routing', routed_at = ? WHERE id = ?`,
  )
    .bind(now, messageId)
    .run()

  // TTL check
  if (msg.ttl_seconds !== null && msg.created_at + msg.ttl_seconds < now) {
    await env.DB.prepare(
      `UPDATE agent_messages SET status = 'dropped', error_log = ? WHERE id = ?`,
    )
      .bind('expired', messageId)
      .run()
    return { routed: false, reason: 'expired', status: 'dropped' }
  }

  // Validate to_agent in agent_registry
  const registryRow = await env.DB.prepare(
    `SELECT agent_name, active FROM agent_registry WHERE agent_name = ? LIMIT 1`,
  )
    .bind(msg.to_agent)
    .first<{ agent_name: string; active: number }>()

  if (!registryRow || !registryRow.active) {
    await env.DB.prepare(
      `UPDATE agent_messages SET status = 'dropped', error_log = ? WHERE id = ?`,
    )
      .bind('unknown or inactive to_agent', messageId)
      .run()
    return { routed: false, reason: 'unknown_or_inactive_to_agent', status: 'dropped' }
  }

  // Capability gate: check agents table for read_only flag
  if (msg.message_type === 'request') {
    const agentRow = await env.DB.prepare(
      `SELECT read_only FROM agents WHERE name = ? LIMIT 1`,
    )
      .bind(msg.to_agent)
      .first<{ read_only: number }>()

    if (agentRow && agentRow.read_only === 1) {
      await env.DB.prepare(
        `UPDATE agent_messages SET status = 'dropped', error_log = ? WHERE id = ?`,
      )
        .bind('to_agent is read_only and cannot accept request messages', messageId)
        .run()
      return { routed: false, reason: 'read_only_agent', status: 'dropped' }
    }
  }

  await env.DB.prepare(
    `UPDATE agent_messages SET status = 'delivered', delivered_at = ? WHERE id = ?`,
  )
    .bind(now, messageId)
    .run()

  return { routed: true, status: 'delivered' }
}

// ── processMessage ─────────────────────────────────────────────
//
// v1 handler dispatch rule (documented):
//   DAG handler: message_type = 'request' AND (payload_json contains
//     { "dispatch_dag": true } OR subject starts with 'TASK:').
//     → calls decomposeTask → persistDecomposition → runAutoWave.
//     → emits a response message threaded back via parent_message_id.
//   Direct handler (fallback): all other messages — for v1, mark done with
//     optional ack. Full agent-side LLM inbox handling is deferred to a
//     future sprint when agents have persistent inbox processors.

export async function processMessage(
  env: CloudflareEnv,
  apiKey: string,
  messageId: string,
): Promise<{ processed: boolean; reason?: string; status?: string; dagRunId?: string }> {
  const msg = await getMessage(env, messageId)
  if (!msg) return { processed: false, reason: 'not_found' }
  if (msg.status !== 'delivered') return { processed: false, reason: 'not_delivered' }

  const now = Math.floor(Date.now() / 1000)

  await env.DB.prepare(
    `UPDATE agent_messages SET status = 'processing' WHERE id = ?`,
  )
    .bind(messageId)
    .run()

  let dagRunId: string | undefined

  try {
    const isDagDispatch = shouldDispatchToDAG(msg)

    if (isDagDispatch) {
      // Bus → DAG → Bus round-trip (async: wave runs in background via waitUntil)
      const decomposed = await decomposeTask(env, apiKey, msg.user_id, msg.body)

      const { runId } = await persistDecomposition(env.DB, {
        userId: msg.user_id,
        originalTask: msg.body,
        decomposition: decomposed.decomposition,
        raw: decomposed.raw,
        inputTokens: decomposed.inputTokens,
        outputTokens: decomposed.outputTokens,
        costUsd: decomposed.costUsd,
        modelId: decomposed.modelId,
      })
      dagRunId = runId

      await env.DB.prepare(
        `UPDATE agent_messages SET task_id = ? WHERE id = ?`,
      )
        .bind(runId, messageId)
        .run()

      // Hand the wave to waitUntil — caller returns immediately after persist.
      // The threaded reply emits when the wave completes in the background.
      waitUntil(
        runAutoWave(env, apiKey, msg.user_id, runId, {})
          .then(async (waveResult) => {
            const summary =
              `DAG run ${runId}: executed=${waveResult.executed}, failed=${waveResult.failed}, ` +
              `cost=$${waveResult.total_cost_usd.toFixed(4)}, stopped=${waveResult.stopped_reason}`

            await emitMessage(env, {
              userId: msg.user_id,
              conversationId: msg.conversation_id,
              fromAgent: msg.to_agent,
              toAgent: msg.from_agent,
              viaAgent: msg.via_agent,
              parentMessageId: msg.id,
              taskId: runId,
              messageType: 'response',
              priority: msg.priority,
              subject: msg.subject ? `RE: ${msg.subject}` : undefined,
              body: summary,
              payloadJson: JSON.stringify({
                run_id: runId,
                executed: waveResult.executed,
                failed: waveResult.failed,
                skipped: waveResult.skipped,
                total_cost_usd: waveResult.total_cost_usd,
                total_tokens: waveResult.total_tokens,
                waves: waveResult.waves,
                stopped_reason: waveResult.stopped_reason,
                finalized: waveResult.finalized ?? false,
                preview_url: waveResult.preview_url ?? null,
              }),
            })
          })
          .catch(async (err) => {
            const errorLog = err instanceof Error ? err.message : String(err)
            await env.DB.prepare(
              `UPDATE agent_messages SET error_log = ? WHERE id = ?`,
            )
              .bind(`wave background error: ${errorLog}`, messageId)
              .run()
          }),
      )
    }
    // Direct handler (v1 fallback): message is acknowledged by marking done.
    // No additional ack message emitted to avoid inflating queue size on
    // non-actionable messages (broadcasts, events, inter-agent notifications).

    await env.DB.prepare(
      `UPDATE agent_messages SET status = 'done', processed_at = ? WHERE id = ?`,
    )
      .bind(now, messageId)
      .run()

    return { processed: true, status: 'done', dagRunId }
  } catch (err) {
    const errorLog = err instanceof Error ? err.message : String(err)
    await env.DB.prepare(
      `UPDATE agent_messages SET status = 'failed', error_log = ?, processed_at = ? WHERE id = ?`,
    )
      .bind(errorLog, now, messageId)
      .run()
    return { processed: false, reason: errorLog, status: 'failed' }
  }
}

function shouldDispatchToDAG(msg: AgentMessageRow): boolean {
  if (msg.message_type !== 'request') return false
  if (msg.subject && msg.subject.startsWith('TASK:')) return true
  if (msg.payload_json) {
    try {
      const payload = JSON.parse(msg.payload_json) as Record<string, unknown>
      if (payload.dispatch_dag === true) return true
    } catch {
      // malformed payload_json — fall through to direct handler
    }
  }
  return false
}

// ── reapStuckMessages ────────────────────────────────────────────

export async function reapStuckMessages(
  env: CloudflareEnv,
  opts: { olderThanSeconds?: number } = {},
): Promise<{ requeued: number; failed: number }> {
  const threshold = opts.olderThanSeconds ?? 300
  const now = Math.floor(Date.now() / 1000)
  const cutoff = now - threshold

  const stuck = await env.DB.prepare(
    `SELECT id, retry_count, error_log FROM agent_messages
     WHERE status IN ('routing','processing')
       AND COALESCE(routed_at, created_at) < ?
     ORDER BY created_at ASC
     LIMIT 100`,
  )
    .bind(cutoff)
    .all<{ id: string; retry_count: number; error_log: string | null }>()

  let requeued = 0
  let failed = 0

  for (const row of stuck.results ?? []) {
    if (row.retry_count < 3) {
      const note = `reaper: requeued at ${now} (attempt ${row.retry_count + 1})`
      const log = row.error_log ? `${row.error_log}\n${note}` : note
      await env.DB.prepare(
        `UPDATE agent_messages
         SET status = 'queued', retry_count = retry_count + 1, error_log = ?
         WHERE id = ?`,
      )
        .bind(log, row.id)
        .run()
      requeued++
    } else {
      await env.DB.prepare(
        `UPDATE agent_messages
         SET status = 'failed', error_log = 'reaper: exceeded max retries'
         WHERE id = ?`,
      )
        .bind(row.id)
        .run()
      failed++
    }
  }

  return { requeued, failed }
}
