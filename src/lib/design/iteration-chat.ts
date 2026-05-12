/**
 * Design iteration chat persistence — Sprint 16 v0.3.0.
 *
 * Mirrors src/lib/agent-chat.ts but scoped to a design brief. Used by the
 * iteration agent to load prior context for a brief's refinement conversation
 * and persist user / assistant / tool_result turns.
 */

import type { D1Database } from '@cloudflare/workers-types'
import type {
  DesignChatMessageRow,
  DesignAssistantToolUse,
  DesignToolResult,
} from '@/types/design-iteration'

// Anthropic content blocks accepted on the wire.
export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | DesignAssistantToolUse
  | DesignToolResult

export interface AnthropicTurn {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

/**
 * Replay design chat history as an Anthropic-compatible messages array.
 *
 * Rules used to reconstruct the wire format from D1 rows:
 *   - role='user' with tool_results_json   → user turn carrying tool_result blocks
 *   - role='user' with content              → user turn carrying a single text block
 *   - role='assistant' with tool_calls_json → assistant turn carrying text + tool_use
 *   - role='assistant' with content only    → assistant turn carrying single text block
 */
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
  for (const r of rows.results ?? []) {
    if (r.role === 'tool_result' && r.tool_results_json) {
      const blocks = safeParseArray<DesignToolResult>(r.tool_results_json)
      if (blocks.length > 0) turns.push({ role: 'user', content: blocks })
      continue
    }
    if (r.role === 'assistant') {
      const blocks: AnthropicContentBlock[] = []
      if (r.content && r.content.trim()) blocks.push({ type: 'text', text: r.content })
      if (r.tool_calls_json) {
        const toolUses = safeParseArray<DesignAssistantToolUse>(r.tool_calls_json)
        for (const t of toolUses) blocks.push(t)
      }
      if (blocks.length > 0) turns.push({ role: 'assistant', content: blocks })
      continue
    }
    // role='user' with plain text
    if (r.content && r.content.trim()) {
      turns.push({ role: 'user', content: r.content })
    }
  }
  return turns
}

/**
 * Persist one row. Caller is responsible for ordering (use sequential awaits).
 */
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
