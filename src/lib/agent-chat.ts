/**
 * Agent chat persistence helpers — Sprint 17 v0.3.0.
 *
 * Provides a thin layer over D1 for agent chat threads (agent_chats) and
 * messages (agent_chat_messages). Used by /api/agent/stream to load history,
 * persist turns, and update conversation rollups (counts, costs, preview).
 */

import type { D1Database } from '@cloudflare/workers-types'
import type { AgentChatRow, AgentChatMessageRow } from '@/types'

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Load the message history for a chat as an Anthropic-compatible messages array.
 * Filters out empty assistant turns (e.g. failed/cancelled). Returns oldest-first.
 */
export async function loadChatHistory(
  db: D1Database,
  chatId: string,
  userId: string,
): Promise<AnthropicMessage[]> {
  const rows = await db
    .prepare(
      `SELECT role, content FROM agent_chat_messages
         WHERE chat_id = ? AND user_id = ?
         ORDER BY created_at ASC`,
    )
    .bind(chatId, userId)
    .all<{ role: 'user' | 'assistant'; content: string }>()

  return (rows.results ?? [])
    .filter((r) => r.content && r.content.trim().length > 0)
    .map((r) => ({ role: r.role, content: r.content }))
}

/**
 * Look up a chat row (used for permission check).
 */
export async function getChat(
  db: D1Database,
  chatId: string,
  userId: string,
): Promise<AgentChatRow | null> {
  return db
    .prepare(`SELECT * FROM agent_chats WHERE id = ? AND user_id = ?`)
    .bind(chatId, userId)
    .first<AgentChatRow>()
}

/**
 * Create a new chat row. Title is auto-derived from the first user message
 * (first 60 chars, single-line, ellipsised).
 */
export async function createChat(
  db: D1Database,
  args: {
    userId: string
    agentName: string
    firstUserMessage: string
  },
): Promise<string> {
  const id = crypto.randomUUID()
  const title = deriveTitle(args.firstUserMessage)
  const now = Math.floor(Date.now() / 1000)

  await db
    .prepare(
      `INSERT INTO agent_chats
         (id, user_id, agent_name, title, message_count, total_input_tokens, total_output_tokens, total_cost_usd, last_message_preview, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0.0, ?, ?, ?)`,
    )
    .bind(id, args.userId, args.agentName, title, deriveTitle(args.firstUserMessage), now, now)
    .run()

  return id
}

/**
 * Persist a single message (user or assistant). Updates the chat rollup
 * (message_count, totals, preview, updated_at) atomically afterward.
 */
export async function persistMessage(
  db: D1Database,
  args: {
    chatId: string
    userId: string
    role: 'user' | 'assistant'
    content: string
    toolCallsJson?: string | null
    taskId?: string | null
    modelId?: string | null
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
  },
): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  await db
    .prepare(
      `INSERT INTO agent_chat_messages
         (id, chat_id, user_id, role, content, tool_calls_json, task_id, model_id, input_tokens, output_tokens, cost_usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      args.chatId,
      args.userId,
      args.role,
      args.content,
      args.toolCallsJson ?? null,
      args.taskId ?? null,
      args.modelId ?? null,
      args.inputTokens ?? 0,
      args.outputTokens ?? 0,
      args.costUsd ?? 0,
      now,
    )
    .run()

  // Bump rollup
  await db
    .prepare(
      `UPDATE agent_chats SET
         message_count = message_count + 1,
         total_input_tokens = total_input_tokens + ?,
         total_output_tokens = total_output_tokens + ?,
         total_cost_usd = total_cost_usd + ?,
         last_message_preview = ?,
         updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      args.inputTokens ?? 0,
      args.outputTokens ?? 0,
      args.costUsd ?? 0,
      preview(args.content),
      now,
      args.chatId,
      args.userId,
    )
    .run()

  return id
}

/**
 * List a user's chats. Optional filter by agent_name.
 */
export async function listChats(
  db: D1Database,
  userId: string,
  opts: { agentName?: string; limit?: number } = {},
): Promise<AgentChatRow[]> {
  const limit = Math.min(opts.limit ?? 50, 200)
  if (opts.agentName) {
    const r = await db
      .prepare(
        `SELECT * FROM agent_chats
           WHERE user_id = ? AND agent_name = ?
           ORDER BY updated_at DESC
           LIMIT ?`,
      )
      .bind(userId, opts.agentName, limit)
      .all<AgentChatRow>()
    return r.results ?? []
  }
  const r = await db
    .prepare(
      `SELECT * FROM agent_chats
         WHERE user_id = ?
         ORDER BY updated_at DESC
         LIMIT ?`,
    )
    .bind(userId, limit)
    .all<AgentChatRow>()
  return r.results ?? []
}

/**
 * Full chat detail — chat row + ordered messages.
 */
export async function getChatWithMessages(
  db: D1Database,
  chatId: string,
  userId: string,
): Promise<{ chat: AgentChatRow; messages: AgentChatMessageRow[] } | null> {
  const chat = await getChat(db, chatId, userId)
  if (!chat) return null
  const messages = await db
    .prepare(
      `SELECT * FROM agent_chat_messages
         WHERE chat_id = ? AND user_id = ?
         ORDER BY created_at ASC`,
    )
    .bind(chatId, userId)
    .all<AgentChatMessageRow>()
  return { chat, messages: messages.results ?? [] }
}

/**
 * Delete a chat and all its messages.
 */
export async function deleteChat(
  db: D1Database,
  chatId: string,
  userId: string,
): Promise<{ deleted: boolean; rowsDeleted: number }> {
  const chat = await getChat(db, chatId, userId)
  if (!chat) return { deleted: false, rowsDeleted: 0 }
  await db
    .prepare(`DELETE FROM agent_chat_messages WHERE chat_id = ? AND user_id = ?`)
    .bind(chatId, userId)
    .run()
  await db
    .prepare(`DELETE FROM agent_chats WHERE id = ? AND user_id = ?`)
    .bind(chatId, userId)
    .run()
  return { deleted: true, rowsDeleted: chat.message_count }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function deriveTitle(msg: string): string {
  const single = msg.replace(/\s+/g, ' ').trim()
  if (single.length <= 60) return single
  return single.slice(0, 57).trimEnd() + '…'
}

function preview(content: string): string {
  const single = content.replace(/\s+/g, ' ').trim()
  if (single.length <= 140) return single
  return single.slice(0, 137).trimEnd() + '…'
}
