/**
 * POST /api/coordinator/emit
 *
 * Puts a message on the agent bus. Validates that from_agent, to_agent,
 * and body are present, then delegates to emitMessage. Returns the new
 * message id and conversation_id.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { emitMessage } from '@/lib/coordinator'
import type { AgentMessageRow } from '@/lib/coordinator'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let body: {
    from_agent?: string
    to_agent?: string
    body?: string
    conversation_id?: string
    via_agent?: string
    parent_message_id?: string
    task_id?: string
    pipeline_id?: string
    pipeline_stage?: string
    message_type?: AgentMessageRow['message_type']
    priority?: number
    subject?: string
    payload_json?: string
    ttl_seconds?: number
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  if (!body.from_agent || !body.to_agent || !body.body) {
    return new Response(
      JSON.stringify({ error: 'from_agent, to_agent, and body are required' }),
      { status: 400 },
    )
  }

  const env = getBindings()

  const result = await emitMessage(env, {
    userId: user.id,
    conversationId: body.conversation_id,
    fromAgent: body.from_agent,
    toAgent: body.to_agent,
    viaAgent: body.via_agent,
    parentMessageId: body.parent_message_id,
    taskId: body.task_id,
    pipelineId: body.pipeline_id,
    pipelineStage: body.pipeline_stage,
    messageType: body.message_type,
    priority: body.priority,
    subject: body.subject,
    body: body.body,
    payloadJson: body.payload_json,
    ttlSeconds: body.ttl_seconds,
  })

  return new Response(
    JSON.stringify({ id: result.id, conversation_id: result.conversationId }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
