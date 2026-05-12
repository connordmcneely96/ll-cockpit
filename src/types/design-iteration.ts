// Sprint 16 v0.3.0 — Design iteration agent types
//
// Defines the message persistence shape, tool input/output schemas, and the
// shared union types used by /api/design/briefs/[id]/chat and the iteration agent.
//
// All tools are pure functions over D1 + R2 + (optionally) the Anthropic API.
// No tool requires Playwright except analyze_reference_url.

import type { DesignTokens } from './index'

// ── Persistence row (mirrors migrations/0010) ──

export interface DesignChatMessageRow {
  id: string
  brief_id: string
  user_id: string
  role: 'user' | 'assistant' | 'tool_result'
  content: string | null
  tool_calls_json: string | null
  tool_results_json: string | null
  iteration_id: string | null
  model_id: string | null
  input_tokens: number
  output_tokens: number
  cost_usd: number
  latency_ms: number | null
  created_at: number
}

// ── Anthropic message format for the iteration agent ──

export interface DesignAssistantToolUse {
  type: 'tool_use'
  id: string
  name: DesignToolName
  input: Record<string, unknown>
}

export interface DesignToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string                 // stringified result, fed back to the next Anthropic call
  is_error?: boolean
}

// ── Tool catalog ──
//
// Each tool returns a string that gets fed back to Anthropic as a tool_result.
// State changes (D1 writes, R2 uploads) happen inside the tool, not after.

export type DesignToolName =
  | 'regenerate_section'         // re-runs one COMPOSER with refined instructions
  | 'update_design_tokens'       // patches DesignTokens, re-renders affected CSS vars
  | 'splice_section'             // injects/replaces HTML of one section in the assembled page
  | 'assemble_html'              // re-stitches sections into final HTML
  | 'apply_token_to_html'        // re-runs the CSS var block in the <style> with new tokens
  | 'add_section'                // creates a new section slot + runs COMPOSER for it
  | 'remove_section'             // removes a section slot + HTML
  | 'apply_preset'               // applies a saved preset (e.g. "more SaaS", "more luxury")
  | 'analyze_reference_url'      // Playwright + vision: scrapes a URL, extracts design notes
  | 'save_iteration'             // commits the current edit state as a new design_iteration row
  | 'critique'                   // re-runs CRITIC against the current HTML, returns score+notes

export interface DesignToolDefinition {
  name: DesignToolName
  description: string
  input_schema: Record<string, unknown>
  uses_code_execution?: boolean  // splice_section / assemble_html / apply_token_to_html
  requires_playwright?: boolean  // analyze_reference_url
}

// ── Per-tool input/output payloads ──

export interface RegenerateSectionInput {
  section_slug: string
  refinement: string             // e.g. "darker, more luxurious, replace stock photo with abstract gradient"
  preserve_structure?: boolean
}

export interface UpdateDesignTokensInput {
  patch: Partial<DesignTokens>
  rationale?: string
}

export interface SpliceSectionInput {
  section_slug: string
  new_html: string
}

export interface AnalyzeReferenceUrlInput {
  url: string
  focus?: 'layout' | 'color' | 'typography' | 'tone' | 'all'
}

export interface AnalyzeReferenceUrlOutput {
  url: string
  inferred_tokens: Partial<DesignTokens>
  layout_notes: string
  copy_examples: string[]
  screenshot_r2_key: string | null
}

export interface SaveIterationInput {
  client_feedback?: string       // the user's original prompt this iteration came from
  notes?: string
}

export interface CritiqueInput {
  iteration_id?: string          // defaults to current edit state
  focus_areas?: string[]
}

export interface CritiqueOutput {
  score: number                  // 0–100
  verdict: 'PASS' | 'FAIL'
  strengths: string[]
  issues: string[]
  suggestions: string[]
}

// ── Chat request / response payloads ──

export interface DesignChatRequest {
  message: string
  /** If set, continues a prior assistant turn that ended with tool_use blocks. */
  resume_from_message_id?: string
}

export interface DesignChatTurn {
  user_message: DesignChatMessageRow
  assistant_messages: DesignChatMessageRow[]
  iteration_id: string | null
  total_cost_usd: number
  total_tokens: number
  latency_ms: number
}
