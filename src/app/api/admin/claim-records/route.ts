/**
 * GET /api/admin/claim-records
 *
 * One-time migration helper: reassigns all rows in agent_chats, agent_chat_messages,
 * design_briefs, and orchestrator_runs that don't belong to the currently authenticated
 * user, transferring them to the current user.
 *
 * Use case: when you sign in on a new computer with a different Supabase session and
 * historical data is orphaned under an older user_id. This is intentionally permissive
 * because ll-cockpit is currently a single-user app — there are no other users to
 * accidentally steal data from.
 *
 * Returns a summary of how many rows were migrated.
 *
 * Safety: requires authentication (must be logged in). Returns counts only, never
 * exposes other users' data content.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { DB } = getBindings()

  // Dry-run first to count what would move
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'

  const counts: Record<string, number> = {}
  const tables = [
    'agent_chats',
    'agent_chat_messages',
    'design_briefs',
    'orchestrator_runs',
    'design_iterations',
    'agent_subtasks',
    'agent_tasks',
    'decompositions',
  ]

  for (const table of tables) {
    // Skip tables that don't have a user_id column
    const colCheck = await DB
      .prepare(`PRAGMA table_info(${table})`)
      .all<{ name: string }>()
    const hasUserId = (colCheck.results ?? []).some((c) => c.name === 'user_id')
    if (!hasUserId) {
      counts[table] = -1   // signal: skipped
      continue
    }

    const before = await DB
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id != ?`)
      .bind(user.id)
      .first<{ n: number }>()

    counts[`${table}_to_migrate`] = before?.n ?? 0

    if (!dryRun && (before?.n ?? 0) > 0) {
      const result = await DB
        .prepare(`UPDATE ${table} SET user_id = ? WHERE user_id != ?`)
        .bind(user.id, user.id)
        .run()
      counts[`${table}_migrated`] = result.meta?.changes ?? 0
    }
  }

  return new Response(
    JSON.stringify(
      {
        ok: true,
        mode: dryRun ? 'dry_run' : 'applied',
        current_user_id: user.id,
        current_user_email: user.email,
        counts,
        next: dryRun
          ? 'Re-call without ?dry=1 to actually migrate'
          : 'Refresh /history — all tabs should now show your data',
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
