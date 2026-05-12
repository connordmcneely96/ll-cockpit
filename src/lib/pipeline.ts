/**
 * Pipeline 1 orchestration helpers — Sprint 13 v0.1 routed via LLM Router.
 *
 * qualifyLead now calls route(agent='intake', task='qualify') instead of
 * hard-coded Sonnet. Per the seeded policy, INTAKE defaults to Haiku 4.5 for
 * ~75% cost savings on structured JSON output.
 */

import type { D1Database } from '@cloudflare/workers-types'
import type {
  CloudflareEnv,
  LLMCompletionResult,
} from '@/types'
import { route } from './llm/router'

export interface LeadInput {
  name?: string
  email?: string
  phone?: string
  company?: string
  title?: string
  linkedin_url?: string
  website?: string
  source: 'manual' | 'linkedin' | 'upwork' | 'referral' | 'inbound' | 'cold_email'
  source_url?: string
  source_metadata?: Record<string, unknown>
  raw_notes?: string
}

export interface Qualification {
  score: number
  summary: string
  red_flags: string[]
  next_step: string
  estimated_value_usd: number | null
  probability: number
}

export type PipelineStage =
  | 'captured' | 'qualifying' | 'qualified'
  | 'proposal_drafting' | 'proposal_sent'
  | 'contract_drafting' | 'contract_sent'
  | 'deposit_pending' | 'deposit_paid'
  | 'kickoff_scheduled' | 'active' | 'lost' | 'dormant'

export async function routeMessage(
  db: D1Database,
  args: {
    userId: string
    conversationId: string
    fromAgent: string
    toAgent: string
    messageType: string
    subject: string
    body: string
    payload?: Record<string, unknown>
    pipelineId?: string
    pipelineStage?: string
    priority?: number
    parentMessageId?: string
  },
): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const payloadJson = args.payload ? JSON.stringify(args.payload) : null

  await db
    .prepare(
      `INSERT INTO agent_messages
       (id, user_id, conversation_id, from_agent, to_agent, via_agent,
        parent_message_id, pipeline_id, pipeline_stage, message_type,
        priority, subject, body, payload_json, status, created_at, routed_at, delivered_at)
       VALUES (?, ?, ?, ?, ?, 'NEXUS', ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', ?, ?, ?)`,
    )
    .bind(
      id,
      args.userId,
      args.conversationId,
      args.fromAgent,
      args.toAgent,
      args.parentMessageId ?? null,
      args.pipelineId ?? null,
      args.pipelineStage ?? null,
      args.messageType,
      args.priority ?? 5,
      args.subject,
      args.body,
      payloadJson,
      now,
      now,
      now,
    )
    .run()

  return id
}

export async function completeMessage(
  db: D1Database,
  messageId: string,
  status: 'done' | 'failed' = 'done',
  errorLog?: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  if (status === 'done') {
    await db
      .prepare(`UPDATE agent_messages SET status = 'done', processed_at = ? WHERE id = ?`)
      .bind(now, messageId)
      .run()
  } else {
    await db
      .prepare(
        `UPDATE agent_messages SET status = 'failed', processed_at = ?, error_log = ? WHERE id = ?`,
      )
      .bind(now, errorLog ?? 'unknown', messageId)
      .run()
  }
}

interface StageHistoryEntry {
  stage: string
  entered_at: number
  exited_at?: number
  agent?: string
  message_id?: string
  cost_usd?: number
  notes?: string
}

export async function appendStageHistory(
  db: D1Database,
  pipelineRunId: string,
  entry: StageHistoryEntry,
): Promise<void> {
  const row = await db
    .prepare(`SELECT stage_history FROM pipeline_runs WHERE id = ?`)
    .bind(pipelineRunId)
    .first<{ stage_history: string | null }>()
  const existing: StageHistoryEntry[] = row?.stage_history ? JSON.parse(row.stage_history) : []
  existing.push(entry)
  await db
    .prepare(
      `UPDATE pipeline_runs SET stage_history = ?, current_stage = ?, last_active_at = ? WHERE id = ?`,
    )
    .bind(JSON.stringify(existing), entry.stage, entry.entered_at, pipelineRunId)
    .run()
}

const INTAKE_QUALIFY_PROMPT = `You are INTAKE, the client onboarding specialist for Leadership Legacy Digital (LL).

LL positions as a premium technical partner offering: engineering services (API 610/682 pump design, ASME calcs), AI/full-stack development (Cloudflare Workers, Next.js, agents), CAD services, brand/creative.
Typical engagements: $1,500–$50,000+. Ideal clients have real budgets, technical problems with measurable ROI, and respect domain expertise.

Your job: score this lead 1–10 for fit (10 = perfect: budget + need + decision authority + respect for expertise).

Return ONLY valid JSON matching this exact schema, no other text:
{
  "score": <integer 1-10>,
  "summary": "<2-3 sentence assessment>",
  "red_flags": ["<concern>", ...],
  "next_step": "<single recommended action>",
  "estimated_value_usd": <number or null>,
  "probability": <0.0-1.0 close probability>
}`

export async function qualifyLead(
  env: CloudflareEnv,
  apiKey: string,
  userId: string,
  lead: Record<string, unknown>,
  pipelineRunId?: string,
): Promise<{
  qualification: Qualification
  tokens: number
  costUsd: number
  modelId: string
}> {
  const userMessage = `Lead to qualify:\n\n${JSON.stringify(lead, null, 2)}`

  let result: LLMCompletionResult
  try {
    result = await route({
      agentName: 'intake',
      taskType: 'qualify',
      systemPrompt: INTAKE_QUALIFY_PROMPT,
      userMessage,
      maxTokens: 1024,
      pipelineRunId,
      userId,
      env,
      apiKey,
    })
  } catch (err) {
    throw new Error(
      `Router failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const cleaned = result.text.replace(/```json|```/g, '').trim()
  let qualification: Qualification
  try {
    qualification = JSON.parse(cleaned)
  } catch {
    throw new Error(`INTAKE returned invalid JSON: ${cleaned.slice(0, 200)}`)
  }

  return {
    qualification,
    tokens: result.inputTokens + result.outputTokens,
    costUsd: result.costUsd,
    modelId: result.modelId,
  }
}
