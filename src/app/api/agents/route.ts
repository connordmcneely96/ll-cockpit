import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  // Auth check — return 401 if not logged in
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Read agents from D1
  const { env } = await getCloudflareContext({ async: true })
  const { results } = await env.DB.prepare(
    'SELECT id, name, display_name, role, color, badge, status, can_deploy, read_only FROM agents WHERE status = ? ORDER BY id'
  ).bind('active').all()

  // Check user_agent_permissions in Supabase
  // Phase 1: if no permission rows exist → all agents accessible
  // Phase 2: filter by user's permissions
  const { data: permissions } = await supabase
    .from('user_agent_permissions')
    .select('agent_id, can_access')
    .eq('user_id', user.id)

  const blockedAgents = new Set(
    (permissions || [])
      .filter((p: { agent_id: string; can_access: boolean }) => !p.can_access)
      .map((p: { agent_id: string; can_access: boolean }) => p.agent_id)
  )

  const agents = results.filter(
    (agent: Record<string, unknown>) => !blockedAgents.has(agent.id as string)
  )

  return NextResponse.json({ agents, user_id: user.id })
}
