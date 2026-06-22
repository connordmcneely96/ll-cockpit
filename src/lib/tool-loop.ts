/**
 * Agent tool-execution loop - Sprint 46 (reframed in-lib), Lane B.
 *
 * Self-contained tool_use -> dispatch -> tool_result -> continue loop.
 * Native fetch to api.anthropic.com (never the SDK). Local types - no edits to
 * the shared LLM router or src/types. First slice wires ONE safe, read-only,
 * user-scoped tool (get_pipeline_status); more tools are additive.
 *
 * SAFETY BOUNDARY: the tool_registry table is a CATALOG. THIS module decides
 * what is actually executable via SAFE_TOOLS below. Only tools defined here can
 * run, regardless of what the catalog lists. Write / side-effecting tools must
 * be added behind the PermissionGate (Sprint 7), never directly here.
 *
 * D1Database is a global type in this project (provided by @cloudflare/workers-types);
 * matching permission-gate.ts, it is NOT imported.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-4-5'
const DEFAULT_MAX_TOKENS = 1500
const DEFAULT_MAX_ITERATIONS = 5

// -- Local types: minimal subset of the Anthropic Messages API --------------
interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | { type: string; [k: string]: unknown }

interface AnthropicToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | Array<AnthropicContentBlock | AnthropicToolResultBlock>
}

interface AnthropicToolDef {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

interface AnthropicResponse {
  content: AnthropicContentBlock[]
  stop_reason: string | null
  usage?: { input_tokens: number; output_tokens: number }
}

export interface ToolLoopArgs {
  db: D1Database
  apiKey: string
  userId: string
  userMessage: string
  systemPrompt?: string
  model?: string
  maxTokens?: number
  maxIterations?: number
  /** Optional allowlist of tool_keys this run may use; defaults to all SAFE_TOOLS. */
  allowedTools?: string[]
}

export interface ToolCallRecord {
  tool: string
  input: unknown
  ok: boolean
  resultPreview: string
}

export interface ToolLoopResult {
  ok: boolean
  finalText: string
  stopReason: string | null
  iterations: number
  toolCalls: ToolCallRecord[]
  inputTokens: number
  outputTokens: number
  error?: string
}

type ToolHandler = (
  input: Record<string, unknown>,
  ctx: { db: D1Database; userId: string },
) => Promise<string>

interface SafeTool { def: AnthropicToolDef; handler: ToolHandler }

// -- Executable allowlist. Only these tools can actually run. ----------------
const SAFE_TOOLS: Record<string, SafeTool> = {
  get_pipeline_status: {
    def: {
      name: 'get_pipeline_status',
      description:
        'Read-only snapshot of the revenue pipeline for the current user: counts of leads, pipeline runs, and orchestrator runs grouped by status, plus total estimated lead value in USD. Takes no arguments.',
      input_schema: { type: 'object', properties: {}, required: [] },
    },
    handler: async (_input, { db, userId }) => {
      const leads = await db
        .prepare('SELECT status, COUNT(*) AS n FROM leads WHERE user_id = ? GROUP BY status')
        .bind(userId).all()
      const pipelines = await db
        .prepare('SELECT status, COUNT(*) AS n FROM pipeline_runs WHERE user_id = ? GROUP BY status')
        .bind(userId).all()
      const runs = await db
        .prepare('SELECT status, COUNT(*) AS n FROM orchestrator_runs WHERE user_id = ? GROUP BY status')
        .bind(userId).all()
      const value = await db
        .prepare('SELECT COALESCE(SUM(estimated_value_usd), 0) AS total FROM leads WHERE user_id = ?')
        .bind(userId).first<{ total: number }>()
      return JSON.stringify({
        leads_by_status: leads.results ?? [],
        pipeline_runs_by_status: pipelines.results ?? [],
        orchestrator_runs_by_status: runs.results ?? [],
        total_estimated_lead_value_usd: value?.total ?? 0,
      })
    },
  },
}

async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: { db: D1Database; userId: string },
): Promise<{ ok: boolean; content: string }> {
  const tool = SAFE_TOOLS[name]
  if (!tool) {
    return { ok: false, content: `Tool '${name}' is not available or not permitted.` }
  }
  try {
    const content = await tool.handler(input, ctx)
    return { ok: true, content }
  } catch (err) {
    return { ok: false, content: `Tool '${name}' failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Run the tool-execution loop to completion (or until the iteration cap).
 * Returns the final assistant text plus a record of every tool call made.
 */
export async function runToolLoop(args: ToolLoopArgs): Promise<ToolLoopResult> {
  const model = args.model ?? DEFAULT_MODEL
  const maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS
  const maxIterations = args.maxIterations ?? DEFAULT_MAX_ITERATIONS

  // Resolve executable tool definitions (allowlist intersected with SAFE_TOOLS).
  const requested = args.allowedTools ?? Object.keys(SAFE_TOOLS)
  const tools: AnthropicToolDef[] = []
  for (const k of requested) {
    const t = SAFE_TOOLS[k]
    if (t) tools.push(t.def)
  }

  const messages: AnthropicMessage[] = [{ role: 'user', content: args.userMessage }]
  const toolCalls: ToolCallRecord[] = []
  let inputTokens = 0
  let outputTokens = 0
  let stopReason: string | null = null

  for (let iter = 1; iter <= maxIterations; iter++) {
    const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages, tools }
    if (args.systemPrompt) body.system = args.systemPrompt

    let res: Response
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': args.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      return {
        ok: false, finalText: '', stopReason, iterations: iter, toolCalls,
        inputTokens, outputTokens,
        error: `network error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    if (!res.ok) {
      const errText = (await res.text()).slice(0, 400)
      return {
        ok: false, finalText: '', stopReason, iterations: iter, toolCalls,
        inputTokens, outputTokens,
        error: `anthropic ${res.status}: ${errText}`,
      }
    }

    const data = (await res.json()) as AnthropicResponse
    if (data.usage) {
      inputTokens += data.usage.input_tokens ?? 0
      outputTokens += data.usage.output_tokens ?? 0
    }
    stopReason = data.stop_reason ?? null

    // Preserve the assistant turn verbatim (keeps tool_use blocks intact).
    messages.push({ role: 'assistant', content: data.content })

    if (data.stop_reason === 'tool_use') {
      const toolUses = data.content.filter(
        (b): b is AnthropicToolUseBlock => b.type === 'tool_use',
      )
      const resultBlocks: AnthropicToolResultBlock[] = []
      for (const tu of toolUses) {
        const { ok, content } = await dispatchTool(tu.name, tu.input ?? {}, {
          db: args.db,
          userId: args.userId,
        })
        toolCalls.push({ tool: tu.name, input: tu.input ?? {}, ok, resultPreview: content.slice(0, 200) })
        resultBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content, is_error: !ok })
      }
      messages.push({ role: 'user', content: resultBlocks })
      continue
    }

    const finalText = data.content
      .filter((b): b is AnthropicTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    return { ok: true, finalText, stopReason, iterations: iter, toolCalls, inputTokens, outputTokens }
  }

  return {
    ok: false,
    finalText: '',
    stopReason,
    iterations: maxIterations,
    toolCalls,
    inputTokens,
    outputTokens,
    error: `tool loop exceeded ${maxIterations} iterations without completing`,
  }
}

// -- Per-agent tool enablement -----------------------------------------------
// Maps a (lowercase) agent_name to the tool_keys it may use. Agents absent here
// (or with an empty list) take the unchanged single-shot router path in
// executeOneSubtask. Start conservative: ANCHOR (revenue) gets the read-only
// pipeline status tool. Expanding this map is the additive follow-up.
const AGENT_TOOLS: Record<string, string[]> = {
  anchor: ['get_pipeline_status'],
}

/** Returns the tool_keys an agent may use (empty array = no tools / router path). */
export function getAgentTools(agentName: string): string[] {
  return AGENT_TOOLS[agentName] ?? []
}
