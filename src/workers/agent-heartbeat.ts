import type { CloudflareEnv } from '@/types'

// Agent heartbeat — runs on the */15 * * * * cron.
// Reaps orchestrator runs stuck in 'running' with no activity past the stall threshold.
// Runs that are genuinely alive update last_active_at on each step, so they are never reaped.
const STALL_THRESHOLD_SECONDS = 1800 // 30 min without a heartbeat ⇒ presumed dead

export async function runAgentHeartbeat(env: CloudflareEnv): Promise<void> {
  const res = await env.DB.prepare(
    `UPDATE orchestrator_runs
        SET status = 'failed',
            summary = COALESCE(summary, '') || ' [auto-reaped: stalled, no heartbeat > 30m]',
            completed_at = unixepoch()
      WHERE status = 'running'
        AND last_active_at < (unixepoch() - ?)`
  ).bind(STALL_THRESHOLD_SECONDS).run()
  const reaped = res.meta?.changes ?? 0
  console.log(`[agent-heartbeat] reaped ${reaped} stalled orchestrator run(s)`)
}
