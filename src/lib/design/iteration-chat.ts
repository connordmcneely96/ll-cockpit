/**
 * Design iteration chat persistence — Sprint 16 v0.3.0.
 *
 * Mirrors src/lib/agent-chat.ts but scoped to a design brief. Used by the
 * iteration agent to load prior context for a brief's refinement conversation
 * and persist user / assistant / tool_result turns.
 *
 * loadDesignChatHistory does a robust replay:
 *   - tool_result blocks without a matching prior tool_use are dropped
 *   - assistant turns with unfulfilled tool_use blocks are stripped of those
 *     blocks before being included (preserves any text content)
 *   - consecutive same-role turns are merged so the API receives a
 *     strictly alternating user/assistant sequence
 */

import type { D1Database } from '@cloudflare/workers-types'
import type {
  DesignChatMessageRow,
  DesignAssistantToolUse,
  DesignToolResult,
} from '@/types/design-iteration'

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | DesignAssistantToolUse
  | DesignToolResult

export interface AnthropicTurn {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export async function loadDesignChatHistory(
  db: D1Database,
  briefId: string,
  userId: string,
): Promise<AnthropicTurn[]> {
  const rows = await db
    .prepare(
      `SELECT role, content, tool_calls_json, tool_results_json
         FROM design_chat_messages
         WHERE brief_id = ? AND user_id = ?
         ORDER BY created_at ASC`,
    )
    .bind(briefId, userId)
    .all<{
      role: 'user' | 'assistant' | 'tool_result'
      content: string | null
      tool_calls_json: string | null
      tool_results_json: string | null
    }>()

  const turns: AnthropicTurn[] = []
  // Tracks tool_use IDs from the most-recent assistant turn that haven't yet
  // been responded to with a tool_result.
  let openToolUseIds = new Set<string>()

  for (const r of rows.results ?? []) {
    if (r.role === 'tool_result' && r.tool_results_json) {
      const allBlocks = safeParseArray<DesignToolResult>(r.tool_results_json)
      const valid = allBlocks.filter((b) => openToolUseIds.has(b.tool_use_id))
      if (valid.length === 0) continue
      pushUserContent(turns, valid)
      valid.forEach((b) => openToolUseIds.delete(b.tool_use_id))
      continue
    }

    if (r.role === 'assistant') {
      const blocks: AnthropicContentBlock[] = []
      if (r.content && r.content.trim()) blocks.push({ type: 'text', text: r.content })
      if (r.tool_calls_json) {
        const toolUses = safeParseArray<DesignAssistantToolUse>(r.tool_calls_json)
        for (const t of toolUses) blocks.push(t)
      }
      if (blocks.length === 0) continue

      // Refresh openToolUseIds with the IDs from THIS assistant turn only.
      // Any prior unfulfilled tool_use IDs are abandoned (their assistant turn
      // gets stripped below if user content follows without tool_results).
      const newOpen = new Set<string>()
      for (const b of blocks) if (b.type === 'tool_use') newOpen.add(b.id)

      // If there were leftover open IDs from a prior assistant turn, strip
      // those tool_use blocks from the prior turn so the API doesn't see
      // unfulfilled tool calls.
      if (openToolUseIds.size > 0) stripUnfulfilledToolUseFromLastAssistant(turns, openToolUseIds)

      const last = turns[turns.length - 1]
      if (last && last.role === 'assistant' && Array.isArray(last.content)) {
        last.content.push(...blocks)
      } else {
        turns.push({ role: 'assistant', content: blocks })
      }
      openToolUseIds = newOpen
      continue
    }

    // role === 'user' with plain text content
    if (!r.content || !r.content.trim()) continue

    // If the previous assistant called tools that never got results, strip
    // those tool_use blocks now (the user moved on without responding to them).
    if (openToolUseIds.size > 0) {
      stripUnfulfilledToolUseFromLastAssistant(turns, openToolUseIds)
      openToolUseIds.clear()
    }

    pushUserText(turns, r.content)
  }

  // Trailing cleanup: if the LAST turn is assistant with unfulfilled tool_use
  // blocks (no tool_result followed), strip them. We do this so the new user
  // message we'll append doesn't trigger a tool_use_without_result error.
  if (openToolUseIds.size > 0) stripUnfulfilledToolUseFromLastAssistant(turns, openToolUseIds)

  // Also drop trailing turns that became empty after stripping.
  while (turns.length > 0) {
    const last = turns[turns.length - 1]
    if (Array.isArray(last.content) && last.content.length === 0) turns.pop()
    else break
  }

  return turns
}

function pushUserContent(turns: AnthropicTurn[], blocks: AnthropicContentBlock[]) {
  const last = turns[turns.length - 1]
  if (last && last.role === 'user') {
    if (typeof last.content === 'string') {
      last.content = [{ type: 'text', text: last.content }, ...blocks]
    } else {
      last.content.push(...blocks)
    }
  } else {
    turns.push({ role: 'user', content: blocks })
  }
}

function pushUserText(turns: AnthropicTurn[], text: string) {
  const last = turns[turns.length - 1]
  if (last && last.role === 'user') {
    // Merge consecutive user messages so the API sees strict alternation.
    if (typeof last.content === 'string') {
      last.content = `${last.content}\n\n${text}`
    } else {
      last.content.push({ type: 'text', text })
    }
    return
  }
  turns.push({ role: 'user', content: text })
}

function stripUnfulfilledToolUseFromLastAssistant(
  turns: AnthropicTurn[],
  openIds: Set<string>,
) {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]
    if (t.role !== 'assistant') continue
    if (!Array.isArray(t.content)) return
    t.content = t.content.filter((b) => b.type !== 'tool_use' || !openIds.has(b.id))
    return
  }
}

export async function persistDesignChatMessage(
  db: D1Database,
  args: {
    briefId: string
    userId: string
    role: 'user' | 'assistant' | 'tool_result'
    content?: string | null
    toolCallsJson?: string | null
    toolResultsJson?: string | null
    iterationId?: string | null
    modelId?: string | null
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    latencyMs?: number | null
  },
): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await db
    .prepare(
      `INSERT INTO design_chat_messages
         (id, brief_id, user_id, role, content, tool_calls_json, tool_results_json,
          iteration_id, model_id, input_tokens, output_tokens, cost_usd, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      args.briefId,
      args.userId,
      args.role,
      args.content ?? null,
      args.toolCallsJson ?? null,
      args.toolResultsJson ?? null,
      args.iterationId ?? null,
      args.modelId ?? null,
      args.inputTokens ?? 0,
      args.outputTokens ?? 0,
      args.costUsd ?? 0,
      args.latencyMs ?? null,
      now,
    )
    .run()
  return id
}

export async function listDesignChatMessages(
  db: D1Database,
  briefId: string,
  userId: string,
): Promise<DesignChatMessageRow[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM design_chat_messages
         WHERE brief_id = ? AND user_id = ?
         ORDER BY created_at ASC`,
    )
    .bind(briefId, userId)
    .all<DesignChatMessageRow>()
  return rows.results ?? []
}

function safeParseArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}
