/**
 * GET /api/admin/claim-records — reassign rows to current user (single-user app).
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

const TABLES = [
  'agent_chats',
  'agent_chat_messages',
  'design_briefs',
  'design_iterations',
  'orchestrator_runs',
  'agent_subtasks',
  'agent_tasks',
  'decompositions',
  'tool_calls',
  'ai_routing_decisions',
] as const

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { DB } = getBindings()
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'

  const results: Array<{ table: string; to_migrate: number; migrated: number; error?: string }> = []

  for (const table of TABLES) {
    try {
      const before = await DB
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id IS NOT NULL AND user_id != ?`)
        .bind(user.id)
        .first<{ n: number }>()

      const toMigrate = before?.n ?? 0
      let migrated = 0

      if (!dryRun && toMigrate > 0) {
        const r = await DB
          .prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NOT NULL AND user_id != ?`)
          .bind(user.id, user.id)
          .run()
        migrated = r.meta?.changes ?? 0
      }

      results.push({ table, to_migrate: toMigrate, migrated })
    } catch (e) {
      results.push({
        table,
        to_migrate: 0,
        migrated: 0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return new Response(
    JSON.stringify(
      {
        ok: true,
        mode: dryRun ? 'dry_run' : 'applied',
        current_user_id: user.id,
        current_user_email: user.email,
        results,
      },
      null, 2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
