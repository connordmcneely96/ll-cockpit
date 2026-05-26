/**
 * Sprint 145A — top-down goal cascade with hard department-routing enforcement.
 *
 * Wraps the existing decompose → persist → runAutoWave pipeline and the
 * Sprint 146 coordinator bus (emitMessage).  Does NOT reimplement any of those
 * functions — only adds the department constraint layer on top.
 *
 * Department inference from goal text is DEFERRED (145B+).
 * Cross-department goals are DEFERRED (v1 = one goal → one department).
 */

import type { CloudflareEnv } from '@/types'
import { emitMessage } from '@/lib/coordinator'
import { decomposeTask, persistDecomposition } from '@/lib/hermes'
import { runAutoWave } from '@/lib/orchestrator'
import {
  type OrgDepartment,
  getDepartmentHead,
  resolveAssignee,
  validateAssignment,
} from '@/lib/agent-org'
import { checkBudget } from '@/lib/agent-budgets'

export type { OrgDepartment }

export interface CascadeGoalInput {
  userId: string
  goal: string
  department: OrgDepartment
  conversationId?: string
}

export interface CascadeGoalResult {
  conversationId: string
  runId: string
  subtaskCount: number
  reassignments: Array<{
    subtaskId: string
    original: string
    reassignedTo: string
  }>
  refused: boolean
  reason?: string
}

export async function cascadeGoal(
  env: CloudflareEnv,
  apiKey: string,
  input: CascadeGoalInput,
): Promise<CascadeGoalResult> {
  const { userId, goal, department } = input
  const now = Math.floor(Date.now() / 1000)

  // Step 1: find the dept_head — needed for both the bus message and fallback reassignment
  const deptHead = await getDepartmentHead(env, department)
  if (!deptHead) {
    throw new Error(`No active dept_head found for department: ${department}`)
  }
  const deptHeadDisplay = deptHead.display_name // e.g. 'SCOUT'

  // Step 2: emit NEXUS → dept_head bus message (goal dispatch)
  // NOTE: dispatch_dag intentionally OMITTED — the cascade runs the wave
  // directly (Step 6). Including dispatch_dag would cause double-execution
  // if this message were ever drained through processMessage.
  const { id: dispatchMsgId, conversationId } = await emitMessage(env, {
    userId,
    conversationId: input.conversationId,
    fromAgent: 'NEXUS',
    toAgent: deptHeadDisplay,
    viaAgent: 'NEXUS',
    messageType: 'request',
    subject: `GOAL: ${goal.slice(0, 120)}`,
    body: goal,
    payloadJson: JSON.stringify({ department }),
  })

  // Step 3: decompose the goal into subtasks (REUSED — not reimplemented)
  const decomposed = await decomposeTask(env, apiKey, userId, goal)

  // Step 4: enforce department routing — hard constraint
  const reassignments: CascadeGoalResult['reassignments'] = []

  for (const subtask of decomposed.decomposition.subtasks) {
    const isValid = await validateAssignment(env, subtask.agent, department)
    if (!isValid) {
      const original = subtask.agent
      // Reassign to a worker in the correct department (capability-aware)
      const replacement = await resolveAssignee(env, department, {})
      const newAgent = replacement
        ? replacement.display_name
        : deptHeadDisplay

      console.log(
        `[cascade] REASSIGN subtask ${subtask.id}: ${original} → ${newAgent} (dept enforcement: ${department})`,
      )

      reassignments.push({ subtaskId: subtask.id, original, reassignedTo: newAgent })
      subtask.agent = newAgent
    }
  }

  // Step 5: persist the (possibly reassigned) decomposition
  const { runId } = await persistDecomposition(env.DB, {
    userId,
    originalTask: goal,
    decomposition: decomposed.decomposition,
    raw: decomposed.raw,
    inputTokens: decomposed.inputTokens,
    outputTokens: decomposed.outputTokens,
    costUsd: decomposed.costUsd,
    modelId: decomposed.modelId,
  })

  // Step 5b: budget gate — check dept head's budget before dispatching the wave.
  // v1 simplification: the dept head is the accountable node; per-subtask-agent
  // checking is a later refinement.
  const deptHeadBudget = await checkBudget(env, deptHead.name, now)
  if (deptHeadBudget.enforced && deptHeadBudget.overLimit && deptHeadBudget.hardStop) {
    await env.DB.prepare(
      `UPDATE orchestrator_runs SET status = 'cancelled' WHERE id = ?`,
    )
      .bind(runId)
      .run()

    const { id: refuseMsgId } = await emitMessage(env, {
      userId,
      conversationId,
      fromAgent: deptHeadDisplay,
      toAgent: 'NEXUS',
      viaAgent: 'NEXUS',
      messageType: 'error',
      subject: `BUDGET: cascade refused, ${department} over limit`,
      body: `${deptHeadDisplay} spent $${deptHeadBudget.spent.toFixed(4)} of $${deptHeadBudget.limit_usd.toFixed(2)} limit (${deptHeadBudget.pct.toFixed(0)}%). Cascade run ${runId} cancelled.`,
    })

    const now2 = Math.floor(Date.now() / 1000)
    await env.DB.prepare(
      `UPDATE agent_messages SET task_id = ?, status = 'done', processed_at = ? WHERE id IN (?, ?)`,
    )
      .bind(runId, now2, dispatchMsgId, refuseMsgId)
      .run()

    return {
      conversationId,
      runId,
      subtaskCount: decomposed.decomposition.subtasks.length,
      reassignments,
      refused: true,
      reason: 'budget_exceeded',
    }
  }

  // Step 6: execute via the existing wave runner
  const waveResult = await runAutoWave(env, apiKey, userId, runId, {})

  // Step 7: emit a threaded response from dept_head back to NEXUS summarising the run
  const summary =
    `[${department.toUpperCase()} cascade] run ${runId}: ` +
    `subtasks=${decomposed.decomposition.subtasks.length}, ` +
    `executed=${waveResult.executed}, failed=${waveResult.failed}, ` +
    `reassignments=${reassignments.length}, ` +
    `cost=$${waveResult.total_cost_usd.toFixed(4)}`

  const { id: responseMsgId } = await emitMessage(env, {
    userId,
    conversationId,
    fromAgent: deptHeadDisplay,
    toAgent: 'NEXUS',
    viaAgent: 'NEXUS',
    messageType: 'response',
    subject: `RE: GOAL: ${goal.slice(0, 100)}`,
    body: summary,
    payloadJson: JSON.stringify({
      run_id: runId,
      department,
      subtask_count: decomposed.decomposition.subtasks.length,
      executed: waveResult.executed,
      failed: waveResult.failed,
      reassignments,
      total_cost_usd: waveResult.total_cost_usd,
      total_tokens: waveResult.total_tokens,
      stopped_reason: waveResult.stopped_reason,
    }),
  })

  // Step 8: backfill task_id + mark both dispatch and response messages terminal.
  // These messages were emitted for traceability — the cascade already ran
  // the wave directly, so they must NOT be re-processed via the drain loop.
  const now3 = Math.floor(Date.now() / 1000)
  await env.DB.prepare(
    `UPDATE agent_messages SET task_id = ?, status = 'done', processed_at = ? WHERE id IN (?, ?)`,
  )
    .bind(runId, now3, dispatchMsgId, responseMsgId)
    .run()

  return {
    conversationId,
    runId,
    subtaskCount: decomposed.decomposition.subtasks.length,
    reassignments,
    refused: false,
  }
}
