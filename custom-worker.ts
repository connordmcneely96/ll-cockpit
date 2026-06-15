// @ts-ignore `.open-next/worker.js` is generated at build time by `opennextjs build`
import { default as handler } from './.open-next/worker.js'
import { scheduled as oracleScheduled } from './src/workers/oracle-cron'
import { runAgentHeartbeat } from './src/workers/agent-heartbeat'
import type { CloudflareEnv } from '@/types'

export default {
  fetch: handler.fetch,

  async scheduled(controller: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    // */15 — agent heartbeat / reaper
    if (controller.cron === '*/15 * * * *') {
      await runAgentHeartbeat(env)
      return
    }
    // 0 13 * * *  and  0 * * * *  — ORACLE pipeline
    // oracle-cron uses the older ScheduledEvent type annotation; cast to satisfy its signature
    await oracleScheduled(controller as unknown as ScheduledEvent, env, ctx)
  },
} satisfies ExportedHandler<CloudflareEnv>
