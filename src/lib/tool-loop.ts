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

import type { CloudflareEnv } from '@/types'
import { retrieve } from './atlas/retrieve'
import { runCadScript, meterCadExec } from './exec/cad-exec'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-4-5'
const DEFAULT_MAX_TOKENS = 1500
const DEFAULT_MAX_ITERATIONS = 5
// Zombie fix: bound every Anthropic call so a hung request can't hold the
// invocation forever (observed cycle-2 modelers stuck at status='running' 37+ min).
const LLM_TIMEOUT_MS = 180_000

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
  env: CloudflareEnv
  apiKey: string
  userId: string
  userMessage: string
  systemPrompt?: string
  model?: string
  maxTokens?: number
  maxIterations?: number
  /** Optional allowlist of tool_keys this run may use; defaults to all SAFE_TOOLS. */
  allowedTools?: string[]
  /** Optional provenance for tool_call_log rows (subtask lane). */
  logContext?: { subtaskId?: string; pipelineRunId?: string; agentName?: string }
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
  ctx: { env: CloudflareEnv; userId: string },
) => Promise<string>

interface SafeTool { def: AnthropicToolDef; handler: ToolHandler }

// -- Executable allowlist. Only these tools can actually run. ----------------
const SAFE_TOOLS: Record<string, SafeTool> = {
  query_knowledge: {
    def: {
      name: 'query_knowledge',
      description:
        'Search the ATLAS engineering knowledge base (RAG over standards, FMEA, calc references). Returns the most relevant chunks with source doc/section/page. Use for engineering/standards questions.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The question or topic to search for.' },
          topK: { type: 'number', description: 'Max chunks to return (1-10, default 5).' },
        },
        required: ['query'],
      },
    },
    handler: async (input, { env }) => {
      const query = typeof input.query === 'string' ? input.query.trim() : ''
      if (!query) return JSON.stringify({ error: 'query is required' })
      const raw = typeof input.topK === 'number' ? input.topK : 5
      const topK = Math.max(1, Math.min(Math.floor(raw), 10))
      // retrieve()'s local VecIndex types returnMetadata looser (string|boolean) than the
      // official VectorizeIndex; the real binding is runtime-compatible. Cast bypasses the
      // too-loose upstream type without modifying the shared atlas/retrieve.ts.
      const chunks = await retrieve(
        { AI: env.AI, ATLAS_RAG: env.ATLAS_RAG } as unknown as Parameters<typeof retrieve>[0],
        query,
        { topK, useRewriter: true },
      )
      return JSON.stringify(chunks.map((c) => ({ doc: c.doc, section: c.section, page: c.page, score: Number(c.score.toFixed(4)), text: c.text ? c.text.slice(0, 800) : null })))
    },
  },
  execute_cad_code: {
    def: {
      name: 'execute_cad_code',
      description:
        'Run a build123d Python script in an isolated CAD sandbox. The script MUST write its final solid to /work/out/ as a binary GLB (export_gltf(part, "/work/out/part.glb", binary=True)). Returns exit_code, stderr, artifacts_produced (list of file names), stdout, and status. If exit_code != 0 or artifacts_produced is empty, read stderr, fix the script, and call this tool again.',
      input_schema: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'Complete build123d Python script. Must create /work/out and export a binary GLB there.' },
        },
        required: ['script'],
      },
    },
    handler: async (input, { env, userId }) => {
      const script = typeof input.script === 'string' ? input.script : ''
      if (!script.trim()) return JSON.stringify({ error: 'script is required' })
      const executionId = crypto.randomUUID()
      const result = await runCadScript(env, { script, tenantId: userId, executionId, timeoutMs: 60000 })
      try { await meterCadExec(env, { tenantId: userId, executionId, result }) } catch {}
      // Parse deterministic OpenCascade-measured metrics emitted by the script as a
      // single 'GEOMETRY_METRICS: {...}' line. Parse from the full (untruncated)
      // stdout so a large log can't clip the metrics line. null if absent/invalid.
      let geometry_metrics: unknown = null
      const stdout = result.stdout ?? ''
      const m = stdout.match(/^GEOMETRY_METRICS:\s*(\{.*\})\s*$/m)
      if (m) {
        try { geometry_metrics = JSON.parse(m[1]) } catch { geometry_metrics = null }
      }
      return JSON.stringify({
        exit_code: result.exit_code,
        status: result.status,
        artifacts_produced: result.artifacts.map((a) => a.name),
        stdout: stdout.slice(0, 1000),
        stderr: (result.stderr ?? '').slice(0, 2000),
        geometry_metrics,
      })
    },
  },
  get_pipeline_status: {
    def: {
      name: 'get_pipeline_status',
      description:
        'Read-only snapshot of the revenue pipeline for the current user: counts of leads, pipeline runs, and orchestrator runs grouped by status, plus total estimated lead value in USD. Takes no arguments.',
      input_schema: { type: 'object', properties: {}, required: [] },
    },
    handler: async (_input, { env, userId }) => {
      const leads = await env.DB
        .prepare('SELECT status, COUNT(*) AS n FROM leads WHERE user_id = ? GROUP BY status')
        .bind(userId).all()
      const pipelines = await env.DB
        .prepare('SELECT status, COUNT(*) AS n FROM pipeline_runs WHERE user_id = ? GROUP BY status')
        .bind(userId).all()
      const runs = await env.DB
        .prepare('SELECT status, COUNT(*) AS n FROM orchestrator_runs WHERE user_id = ? GROUP BY status')
        .bind(userId).all()
      const value = await env.DB
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
  ctx: { env: CloudflareEnv; userId: string },
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
 * Best-effort telemetry row for a tool call or LLM iteration. Logging must NEVER
 * break the loop, so every failure is swallowed. Previews are capped at 300 chars.
 */
async function logToolCall(
  env: CloudflareEnv,
  logContext: ToolLoopArgs['logContext'],
  userId: string,
  toolName: string,
  ok: boolean,
  latencyMs: number,
  inputPreview: string,
  resultPreview: string,
): Promise<void> {
  try {
    await env.DB
      .prepare(
        `INSERT INTO tool_call_log (id, subtask_id, pipeline_run_id, agent_name, user_id, tool_name, ok, latency_ms, input_preview, result_preview, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        logContext?.subtaskId ?? null,
        logContext?.pipelineRunId ?? null,
        logContext?.agentName ?? null,
        userId,
        toolName,
        ok ? 1 : 0,
        latencyMs,
        inputPreview.slice(0, 300),
        resultPreview.slice(0, 300),
        Math.floor(Date.now() / 1000),
      )
      .run()
  } catch {
    // best-effort — telemetry must never break the loop
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

  // Optional Cloudflare AI Gateway routing. Unset env var => byte-identical
  // URL/header behavior to a direct api.anthropic.com call.
  const gatewayBase = (args.env as { ANTHROPIC_GATEWAY_URL?: string }).ANTHROPIC_GATEWAY_URL?.trim()
  const anthropicUrl = gatewayBase ? gatewayBase.replace(/\/$/, '') + '/v1/messages' : ANTHROPIC_URL

  for (let iter = 1; iter <= maxIterations; iter++) {
    const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages, tools }
    if (args.systemPrompt) body.system = args.systemPrompt

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    }
    if (gatewayBase) {
      headers['cf-aig-metadata'] = JSON.stringify({ subtask: args.logContext?.subtaskId ?? null, agent: args.logContext?.agentName ?? null })
    }

    const t0 = Date.now()
    // Bound the request: a hung LLM call aborts after LLM_TIMEOUT_MS instead of
    // zombie-holding the invocation. The abort surfaces through the catch below.
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(anthropicUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ac.signal,
      })
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      const errorStr = isAbort
        ? `network error: timeout ${LLM_TIMEOUT_MS}ms`
        : `network error: ${err instanceof Error ? err.message : String(err)}`
      await logToolCall(args.env, args.logContext, args.userId, '_llm', false, Date.now() - t0, `iter ${iter} model ${model}`, errorStr)
      return {
        ok: false, finalText: '', stopReason, iterations: iter, toolCalls,
        inputTokens, outputTokens,
        error: errorStr,
      }
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const errText = (await res.text()).slice(0, 400)
      const errorStr = `anthropic ${res.status}: ${errText}`
      await logToolCall(args.env, args.logContext, args.userId, '_llm', false, Date.now() - t0, `iter ${iter} model ${model}`, errorStr)
      return {
        ok: false, finalText: '', stopReason, iterations: iter, toolCalls,
        inputTokens, outputTokens,
        error: errorStr,
      }
    }

    const data = (await res.json()) as AnthropicResponse
    const latencyMs = Date.now() - t0
    if (data.usage) {
      inputTokens += data.usage.input_tokens ?? 0
      outputTokens += data.usage.output_tokens ?? 0
    }
    stopReason = data.stop_reason ?? null
    await logToolCall(args.env, args.logContext, args.userId, '_llm', true, latencyMs, `iter ${iter} model ${model}`, `stop=${data.stop_reason} in=${data.usage?.input_tokens ?? 0} out=${data.usage?.output_tokens ?? 0}`)

    // Preserve the assistant turn verbatim (keeps tool_use blocks intact).
    messages.push({ role: 'assistant', content: data.content })

    if (data.stop_reason === 'tool_use') {
      const toolUses = data.content.filter(
        (b): b is AnthropicToolUseBlock => b.type === 'tool_use',
      )
      const resultBlocks: AnthropicToolResultBlock[] = []
      for (const tu of toolUses) {
        const tt0 = Date.now()
        const { ok, content } = await dispatchTool(tu.name, tu.input ?? {}, {
          env: args.env,
          userId: args.userId,
        })
        toolCalls.push({ tool: tu.name, input: tu.input ?? {}, ok, resultPreview: content.slice(0, 200) })
        await logToolCall(args.env, args.logContext, args.userId, tu.name, ok, Date.now() - tt0, JSON.stringify(tu.input ?? {}), content)
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
  atlas: ['query_knowledge'],
  modeler: ['execute_cad_code', 'query_knowledge'],
}

/** Returns the tool_keys an agent may use (empty array = no tools / router path). */
export function getAgentTools(agentName: string): string[] {
  return AGENT_TOOLS[agentName] ?? []
}
