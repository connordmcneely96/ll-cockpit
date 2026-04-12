// ─── Agent Types ─────────────────────────────────────────────────────────────

export type AgentName =
  | 'nexus'
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
  requires_approval: string[] // tool names that need PermissionGate
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

// ─── Message Types ────────────────────────────────────────────────────────────

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

// ─── SSE Event Types ──────────────────────────────────────────────────────────

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

// ─── D1 Row Types ─────────────────────────────────────────────────────────────

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

// ─── Cloudflare Env ───────────────────────────────────────────────────────────

export interface CloudflareEnv {
  DB: D1Database
  KV: KVNamespace
  R2: R2Bucket
  ANTHROPIC_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ASSETS: Fetcher
  WORKER_SELF_REFERENCE: Fetcher
}

// ─── UI Types ─────────────────────────────────────────────────────────────────

export interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: string
  action: () => void
  category: 'nav' | 'agent' | 'tool' | 'system'
}
