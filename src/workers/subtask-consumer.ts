import type { CloudflareEnv, SubtaskMessage } from '@/types'
import { executeOneSubtask } from '@/lib/orchestrator'
import { openGatesForRun } from '@/lib/permission-gate'

/**
 * Enqueue every subtask that is currently `ready` for a run. Shared by the
 * dispatch route (initial kickoff) and the queue consumer (cascade). When
 * !force, human_required subtasks are left for the HITL gate.
 */
export async function enqueueReadySubtasks(
  env: CloudflareEnv,
  runId: string,
  userId: string,
  force: boolean,
): Promise<number> {
  if (!force) {
    await openGatesForRun(env.DB, userId, runId)
  }
  const readyQuery = force
    ? `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' ORDER BY short_id ASC LIMIT 25`
    : `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' AND human_required = 0 ORDER BY short_id ASC LIMIT 25`
  const ready = await env.DB.prepare(readyQuery).bind(runId, userId).all<{ id: string }>()
  const ids = (ready.results ?? []).map((r) => r.id)
  if (ids.length === 0) return 0
  await Promise.all(
    ids.map((id) =>
      env.SUBTASK_QUEUE.send({ subtaskId: id, runId, userId, force } satisfies SubtaskMessage),
    ),
  )
  return ids.length
}

/**
 * Queue consumer. One subtask per message (max_batch_size=1) so each gets its
 * own 15-min consumer invocation. executeOneSubtask already guards status !== 'ready'
 * (returns 'skipped'), so at-least-once redelivery / duplicates are safe no-ops.
 * After execution, enqueue whatever cascadeReady (inside executeOneSubtask) just
 * turned ready.
 */
export async function processSubtaskBatch(
  batch: MessageBatch<SubtaskMessage>,
  env: CloudflareEnv,
): Promise<void> {
  const apiKey = env.ANTHROPIC_API_KEY
  for (const message of batch.messages) {
    const { subtaskId, runId, userId, force } = message.body
    try {
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
      await executeOneSubtask(env, apiKey, userId, subtaskId, { force })
      // cascadeReady already ran inside executeOneSubtask; enqueue newly-ready ones.
      await enqueueReadySubtasks(env, runId, userId, force)
      message.ack()
    } catch (err) {
      console.error(`subtask-consumer failed for ${subtaskId}:`, err)
      message.retry() // up to max_retries (3), then dropped
    }
  }
}
