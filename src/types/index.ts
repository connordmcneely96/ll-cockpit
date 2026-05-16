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
  | 'designer'
  | 'composer'
  | 'critic'
  | 'assembler'

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

export interface SSETextEvent { type: 'text'; content: string }
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
  chatId?: string         // Sprint 17 v0.3.0 — returned so client can continue this thread
}
export interface SSEErrorEvent { type: 'error'; message: string }
export type SSEEvent = SSETextEvent | SSEToolCallEvent | SSEDoneEvent | SSEErrorEvent

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

// ── Sprint 17 v0.3.0: Agent Chat Persistence Types ──

export interface AgentChatRow {
  id: string
  user_id: string
  agent_name: string
  title: string | null
  message_count: number
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  last_message_preview: string | null
  created_at: number
  updated_at: number
}

export interface AgentChatMessageRow {
  id: string
  chat_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  tool_calls_json: string | null
  task_id: string | null
  model_id: string | null
  input_tokens: number
  output_tokens: number
  cost_usd: number
  created_at: number
}

// ── Sprint 14: Orchestration Types ──

export type OrchestratorRunStatus =
  | 'planning' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export type SubtaskStatus =
  | 'pending' | 'ready' | 'running' | 'done' | 'failed' | 'blocked' | 'cancelled'

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
  task_type: string | null   // Sprint 18F — model tiering per subtask
  depends_on: string | null
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
  id: string
  agent: string
  title: string
  task: string
  task_type?: string        // Sprint 18F — override default model routing per subtask
  depends_on: string[]
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

// ── Sprint 13: LLM Router Types ──

export type LLMProviderId = 'anthropic' | 'workers-ai' | 'openrouter' | 'ollama-local' | string
export type ModelTier = 'premium' | 'standard' | 'cheap' | 'free'
export type LLMTaskType =
  | 'decompose' | 'review' | 'draft' | 'package' | 'qualify' | 'classify'
  | 'design_language' | 'compose_page' | 'compose_section' | 'compose_simple' | 'compose_complex'
  | 'assemble_page' | 'critique_design'
  | 'default' | string

export interface LLMCompletionInput {
  modelId: string
  systemPrompt?: string
  userMessage: string
  maxTokens?: number
  temperature?: number
}

export interface LLMCompletionResult {
  text: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
  providerId: LLMProviderId
  modelId: string
}

export interface LLMProvider {
  id: LLMProviderId
  complete(
    input: LLMCompletionInput,
    deps: { env: CloudflareEnv; apiKey?: string },
  ): Promise<LLMCompletionResult>
}

export interface AIProviderRow {
  id: string
  display_name: string
  api_base_url: string | null
  auth_method: 'api_key' | 'binding' | 'none'
  api_key_secret_name: string | null
  enabled: number
  created_at: number
}

export interface AIModelRow {
  id: string
  provider_id: string
  display_name: string
  model_string: string
  context_window: number | null
  max_output_tokens: number | null
  cost_per_1k_input_usd: number
  cost_per_1k_output_usd: number
  tier: ModelTier
  license: string | null
  supports_tool_use: number
  supports_vision: number
  supports_json_mode: number
  enabled: number
  notes: string | null
  created_at: number
}

export interface AIRoutingPolicyRow {
  id: string
  agent_name: string
  task_type: string
  primary_model_id: string
  fallback_chain_json: string | null
  priority: number
  enabled: number
  notes: string | null
  created_at: number
  updated_at: number
}

export interface AIRoutingDecisionRow {
  id: string
  user_id: string
  pipeline_run_id: string | null
  subtask_id: string | null
  agent_name: string
  task_type: string
  policy_id: string | null
  selected_model_id: string
  attempted_models_json: string | null
  used_fallback: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  latency_ms: number
  success: number
  error: string | null
  created_at: number
}

// ── Sprint 16: Design Build Types ──

export type DesignBriefStatus = 'draft' | 'building' | 'preview_ready' | 'shipped' | 'archived'
export type DesignIterationStatus = 'building' | 'ready' | 'failed'

export interface DesignBriefInput {
  client_name: string
  business_description: string
  target_audience: string
  mood_tone: string
  style_references?: string[]
  must_have_sections: string
  brand_colors?: string
  constraints?: string
}

export interface DesignBriefRow {
  id: string
  user_id: string
  client_name: string
  business_description: string
  target_audience: string
  mood_tone: string
  style_references: string | null
  must_have_sections: string
  brand_colors: string | null
  constraints: string | null
  status: DesignBriefStatus
  orchestrator_run_id: string | null
  current_iteration: number
  preview_url: string | null
  repo_url: string | null
  pages_deployment_url: string | null
  total_cost_usd: number
  total_tokens: number
  created_at: number
  updated_at: number
}

export interface DesignIterationRow {
  id: string
  brief_id: string
  iteration_number: number
  orchestrator_run_id: string
  client_feedback: string | null
  design_tokens_json: string | null
  page_html: string | null
  critic_score: number | null
  critic_feedback: string | null
  preview_r2_key: string | null
  preview_url: string | null
  status: DesignIterationStatus
  cost_usd: number
  tokens: number
  created_at: number
  completed_at: number | null
}

export interface DesignTokens {
  palette: {
    primary: string
    primary_dark?: string
    primary_light?: string
    accent: string
    background: string
    surface?: string
    text_primary: string
    text_secondary?: string
    border?: string
  }
  typography: {
    display_font: string
    body_font: string
    scale?: Record<string, string>
    // Sprint 18N — typography debt fix (982e66e5)
    // Allow attached design systems (Notion, Stripe, etc) to prescribe a
    // richer font hierarchy beyond display/body, so e.g. Notion's
    // Inter + Lora + JetBrains Mono triad carries through to the rendered
    // HTML. All three optional — existing tokens stay backwards compatible.
    // COMPOSER uses these via Tailwind classes:
    //   font_serif  -> font-serif  (editorial headings, blockquotes, brand)
    //   font_sans   -> font-sans   (overrides body_font if present, body running text)
    //   font_mono   -> font-mono   (code snippets, technical annotations)
    font_serif?: string
    font_sans?: string
    font_mono?: string
  }
  spacing?: {
    scale?: 'tight' | 'comfortable' | 'generous'
    container_max_width?: string
    section_padding?: string
  }
  motion?: {
    transition_speed?: 'fast' | 'normal' | 'slow'
    easing?: string
  }
  rationale?: string
}

export interface DesignSection {
  slug: string
  name: string
  html: string
}

// ── Cloudflare Env ──

export interface CloudflareEnv {
  DB: D1Database
  KV: KVNamespace
  R2: R2Bucket
  KNOWLEDGE_QUEUE: Queue
  AI: Ai
  KNOWLEDGE_VECTORIZE: VectorizeIndex
  ANTHROPIC_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ASSETS: Fetcher
  WORKER_SELF_REFERENCE?: Fetcher
}

export interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: string
  action: () => void
  category: 'nav' | 'agent' | 'tool' | 'system'
}
