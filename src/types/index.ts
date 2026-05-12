// ── Agent Types ──

export type AgentName =
  | 'nexus'
  | 'hermes'
  | 'scout'
  | 'intake'
  | 'forge'
  | 'builder'
  | 'atlas'
  | 'herald'
  | 'reel'
  | 'sentinel'
  | 'dispatch'
  | 'anchor'

export interface AgentPermissions {
  can_deploy: boolean
  can_write_files: boolean
  can_send_email: boolean
  can_delete: boolean
  read_only: boolean
  requires_approval: string[]
}

export interface AgentTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface AgentConfig {
  name: AgentName
  displayName: string
  role: string
  systemPrompt: string
  permissions: AgentPermissions
  color: string
  tools: AgentTool[]
}

// ── Message Types ──

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  toolCalls?: ToolCallEvent[]
  tokens?: number
  costUsd?: number
}

export interface ToolCallEvent {
  id: string
  toolName: string
  input: Record<string, unknown>
  output?: string
  approved?: boolean
  requiresApproval: boolean
}

// ── SSE Event Types ──

export interface SSETextEvent {
  type: 'text'
  content: string
}

export interface SSEToolCallEvent {
  type: 'tool_call'
  id: string
  name: string
  input: Record<string, unknown>
  requiresApproval: boolean
}

export interface SSEDoneEvent {
  type: 'done'
  tokensUsed: number
  costUsd: number
  taskId: string
}

export interface SSEErrorEvent {
  type: 'error'
  message: string
}

export type SSEEvent = SSETextEvent | SSEToolCallEvent | SSEDoneEvent | SSEErrorEvent

// ── D1 Row Types ──

export interface AgentTaskRow {
  id: string
  user_id: string
  agent_name: string
  task_type: string
  input: string
  output: string | null
  status: 'pending' | 'running' | 'complete' | 'error'
  tokens_used: number
  cost_usd: number
  error_log: string | null
  created_at: number
}

export interface AgentSessionRow {
  id: string
  user_id: string
  agent_name: string
  messages: string
  tokens_total: number
  cost_total_usd: number
  created_at: number
}

export interface ToolCallRow {
  id: string
  task_id: string
  user_id: string
  tool_name: string
  tool_input: string
  tool_output: string | null
  user_approved: number
  created_at: number
}

// ── Sprint 14: Orchestration Types ──

export type OrchestratorRunStatus =
  | 'planning'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type SubtaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'done'
  | 'failed'
  | 'blocked'
  | 'cancelled'

export type RiskLevel = 'low' | 'medium' | 'high'

export interface OrchestratorRunRow {
  id: string
  user_id: string
  original_task: string
  summary: string | null
  status: OrchestratorRunStatus
  subtask_count: number
  subtasks_completed: number
  subtasks_failed: number
  estimated_cost_usd: number | null
  estimated_duration_minutes: number | null
  actual_cost_usd: number
  tokens: number
  decomposition_id: string | null
  started_at: number
  last_active_at: number
  completed_at: number | null
}

export interface AgentSubtaskRow {
  id: string
  pipeline_run_id: string
  user_id: string
  short_id: string
  agent_name: string
  title: string
  task: string
  depends_on: string | null         // JSON array of short_ids
  estimated_cost_usd: number | null
  estimated_duration_seconds: number | null
  risk_level: RiskLevel
  human_required: number
  status: SubtaskStatus
  output: string | null
  error_log: string | null
  task_id: string | null
  cost_usd: number
  tokens: number
  started_at: number | null
  completed_at: number | null
  created_at: number
}

export interface DecomposedSubtask {
  id: string                         // short_id assigned by HERMES (e.g. 'st_1')
  agent: string                      // uppercase agent name (e.g. 'FORGE')
  title: string
  task: string                       // detailed instruction
  depends_on: string[]               // array of short_ids
  estimated_cost_usd: number
  estimated_duration_seconds: number
  risk_level: RiskLevel
  human_required: boolean
}

export interface DecompositionResult {
  summary: string
  estimated_total_cost_usd: number
  estimated_duration_minutes: number
  subtasks: DecomposedSubtask[]
}

// ── Cloudflare Env ──
// Keep in sync with wrangler.toml bindings

export interface CloudflareEnv {
  // D1
  DB: D1Database
  // KV
  KV: KVNamespace
  // R2
  R2: R2Bucket
  // Queues
  KNOWLEDGE_QUEUE: Queue
  // Workers AI
  AI: Ai
  // Vectorize
  KNOWLEDGE_VECTORIZE: VectorizeIndex
  // Secrets
  ANTHROPIC_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  // Assets
  ASSETS: Fetcher
  WORKER_SELF_REFERENCE?: Fetcher
}

// ── UI Types ──

export interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: string
  action: () => void
  category: 'nav' | 'agent' | 'tool' | 'system'
}
