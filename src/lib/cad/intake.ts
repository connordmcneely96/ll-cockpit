/**
 * Sprint 196x / S1 — INTAKE: customer prose -> validated PumpShaftDuty.
 *
 * INTAKE is an LLM that READS a customer's prose pump specification and FILLS
 * PumpShaftDutySchema. It COMPUTES NOTHING: populating a validated schema is inside
 * what an agent may do; originating an engineering NUMBER is not. Where the prose is
 * ambiguous or incomplete it ASKS rather than guessing — a guessed duty value is the
 * same failure class as a guessed dimension.
 *
 * This module is NOT a roster agent (do not add it to src/lib/agents.ts) and it wires
 * nothing — the caller supplies env + apiKey and passes the result on.
 *
 * Anthropic access mirrors tool-loop.ts: a self-contained native fetch to
 * api.anthropic.com (never the SDK), 'anthropic-version: 2023-06-01', x-api-key header,
 * an AbortController timeout. The apiKey parameter is the same accessor the rest of the
 * repo uses (callers pass env.ANTHROPIC_API_KEY).
 */
import { z } from 'zod'
import type { CloudflareEnv } from '@/types'
import { PumpShaftDutySchema, type PumpShaftDuty } from './duty'

export interface IntakeAssumption { field: string; value: string; rationale: string }

export type IntakeResult =
  | { status: 'filled'; duty: PumpShaftDuty; assumptions: IntakeAssumption[] }
  | { status: 'needs_clarification'; questions: string[] }
  | { status: 'not_applicable'; reason: string }
  | { status: 'intake_error'; reason: string }

/** Dependency-injection seam: (systemPrompt, userMessage) -> raw model text. Tests inject
 *  a fake so no network / API key is needed; runtime uses the default below. */
export type IntakeLlm = (systemPrompt: string, userMessage: string) => Promise<string>

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const INTAKE_MODEL = 'claude-sonnet-4-5'
const INTAKE_MAX_TOKENS = 1500
const INTAKE_TIMEOUT_MS = 60_000

/**
 * PE-ruled duty-point facts that must be STATED by the customer and may NEVER be
 * silently defaulted. specificGravity defaulting to 1.0 is NON-CONSERVATIVE (a denser
 * fluid raises hydraulic load; assuming water understates it); orientation flips the
 * gravity-load direction. PumpShaftDutySchema declares both as .default(...), so
 * safeParse SILENTLY fills them — schema validation alone cannot tell "the customer said
 * horizontal" from "nobody said anything". Hence the presence gate below runs FIRST.
 */
const MUST_BE_STATED = ['specificGravity', 'orientation'] as const

// Questions asked when a field is not stated. Each names the field and its units.
const QUESTION_FOR: Record<string, string> = {
  specificGravity:
    'What is the specific gravity of the pumped fluid at the design temperature? (dimensionless — do NOT assume water/1.0; a denser fluid raises the hydraulic load)',
  orientation:
    'Is the pump mounted horizontal or vertical? (orientation sets the direction of the gravity load and must be stated)',
  casingType:
    'What is the pump casing type — single_volute, double_volute, diffuser, or concentric?',
}

/** A key counts as absent when it is missing, undefined, or null on the raw JSON object. */
function isAbsent(obj: Record<string, unknown>, key: string): boolean {
  return !(key in obj) || obj[key] === undefined || obj[key] === null
}

/** Strip a ```json fence defensively, then JSON.parse. Returns null on any parse failure. */
function parseJson(text: string): Record<string, unknown> | null {
  try {
    let s = (text ?? '').trim()
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const obj = JSON.parse(s)
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Coerce an LLM-provided assumptions array into typed IntakeAssumption[]. */
function toAssumptions(v: unknown): IntakeAssumption[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((o) => ({ field: String(o.field ?? ''), value: String(o.value ?? ''), rationale: String(o.rationale ?? '') }))
}

/** Render Zod issues as a bullet list for the re-prompt. */
function formatIssues(err: z.ZodError): string {
  return err.issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
}

/** Render Zod issues as customer-facing questions (each carries the failing field). */
function issuesToQuestions(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.message} (field: ${i.path.join('.') || '(root)'})`)
}

// The system prompt. Follows the repo's JSON-agent convention: return ONLY valid JSON.
const SYSTEM_PROMPT = `You are INTAKE. You read a customer's prose pump specification and FILL a shaft duty schema. You COMPUTE NOTHING — you never calculate, estimate, infer, convert, or "engineer" a value. You transcribe what the customer explicitly stated and you ASK for what they did not. A guessed value is a defect.

The duty schema (US customary imperial units, field names EXACT):
  power           HP    — required
  speed           RPM   — required
  bearingSpan     in    — required
  material        text  — required (e.g. "AISI 4140")
  head            ft    — required (the derived path needs it)
  flow            gpm   — required (the derived path needs it)
  specificGravity dimensionless — required (see rule below)
  orientation     "horizontal" | "vertical" — required
  casingType      "single_volute" | "double_volute" | "diffuser" | "concentric" — ask if not stated
  dryRunning      boolean — optional
  impellerSource  "derived" | "vendor" — optional (default derived)
  impellerDiameter in    — optional; ONLY with impellerSource="vendor"
  impellerWidth    in    — optional; ONLY with impellerSource="vendor"
  impellerWeight   lb    — optional
  applicationFactor      — optional (service factor)
  minDiameter      in    — optional
  maxDiameter      in    — optional

RULES:
- REQUIRED fields (power, speed, bearingSpan, material, head, flow, specificGravity, orientation) MUST appear in the prose. If any is missing, ASK — do not fill it.
- specificGravity: NEVER assume water. If the fluid is not stated WITH a specific gravity — or is named but no SG is given — ASK. Assuming 1.0 understates hydraulic load for any denser fluid and is non-conservative.
- orientation: never assume. ASK if not stated.
- casingType: ASK if not stated. This is the ONLY field with a conservative default, so it alone need not block once everything else is present.
- If a value appears only as a RANGE or an approximation, ASK for the design point. Do not pick a midpoint.
- NEVER convert units you were not given. If the customer gives metric, ASK for the imperial design point — conversion is computation.
- Omit any field the customer did not state. Do NOT emit a placeholder, a zero, or a guess.

OUTPUT: return ONLY valid JSON — no code fences, no preamble, the first character must be {. Exactly one of:
  {"duty": { ...only the fields you can fill from the prose... }, "assumptions": [{"field":"","value":"","rationale":""}]}
  {"needs_clarification": ["<a specific question naming the missing field and its units>"]}
  {"not_applicable": "<one sentence: why this spec is not an API 610 pump SHAFT duty>"}

Return not_applicable ONLY when the spec is not a rotating pump shaft at all — e.g. a bracket, a cube, a plate, a pressure vessel, or a generic 3D part. Do NOT return not_applicable merely because required fields are missing: a pump-shaft spec with gaps is needs_clarification, never not_applicable.`

/** Default LLM: native fetch to Anthropic, mirroring tool-loop.ts. No tools array — INTAKE
 *  has no tools. A non-2xx or thrown fetch throws, which runSpecIntake maps to intake_error. */
function defaultIntakeLlm(_env: CloudflareEnv, apiKey: string): IntakeLlm {
  return async (systemPrompt, userMessage) => {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), INTAKE_TIMEOUT_MS)
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: INTAKE_MODEL,
          max_tokens: INTAKE_MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal: ac.signal,
      })
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`)
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
      return (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Read a prose spec and fill PumpShaftDutySchema. Never returns a guessed or unvalidated
 * duty as 'filled'. The presence gate (MUST_BE_STATED) runs BEFORE schema validation so a
 * silently-defaultable field cannot pass as stated.
 */
export async function runSpecIntake(args: {
  env: CloudflareEnv
  apiKey: string
  spec: string
  llm?: IntakeLlm
}): Promise<IntakeResult> {
  const llm = args.llm ?? defaultIntakeLlm(args.env, args.apiKey)
  let userMessage = args.spec

  // At most two LLM turns: the initial call, and ONE re-prompt if the duty fails the schema.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw: string
    try {
      raw = await llm(SYSTEM_PROMPT, userMessage)
    } catch (err) {
      // A transport fault is NOT a customer question — surface it as an error.
      return { status: 'intake_error', reason: `INTAKE LLM call failed: ${err instanceof Error ? err.message : String(err)}` }
    }

    const parsed = parseJson(raw)
    if (!parsed) {
      return { status: 'intake_error', reason: 'INTAKE did not return valid JSON: ' + (raw ?? '').slice(0, 200) }
    }

    // Shape 1: the LLM asked its own clarifying questions — pass them through unchanged.
    if (Array.isArray(parsed.needs_clarification) && parsed.needs_clarification.length > 0) {
      return { status: 'needs_clarification', questions: parsed.needs_clarification.map(String) }
    }

    // Shape 1b: the spec is not a pump shaft at all (a bracket, cube, vessel, generic part).
    // Checked here — before the duty gates — so we never demand pump duty from a non-shaft.
    if (typeof parsed.not_applicable === 'string' && parsed.not_applicable.trim().length > 0) {
      return { status: 'not_applicable', reason: parsed.not_applicable }
    }

    // Shape 2: the LLM returned a duty. Gate it in order: presence FIRST, schema SECOND.
    const rawDuty: Record<string, unknown> =
      parsed.duty && typeof parsed.duty === 'object' ? (parsed.duty as Record<string, unknown>) : {}
    const assumptions = toAssumptions(parsed.assumptions)

    // 4a — PRESENCE GATE. specificGravity/orientation must be STATED; a schema default is
    // not a customer statement. If any is absent we ask (and ride the casingType question
    // along), and we do NOT parse or fill.
    const questions: string[] = []
    for (const key of MUST_BE_STATED) {
      if (isAbsent(rawDuty, key)) questions.push(QUESTION_FOR[key])
    }
    if (questions.length > 0) {
      if (isAbsent(rawDuty, 'casingType')) questions.push(QUESTION_FOR.casingType)
      return { status: 'needs_clarification', questions }
    }

    // 4b — casingType is the one permitted default, but it is RECORDED, never silent.
    if (isAbsent(rawDuty, 'casingType')) {
      assumptions.push({
        field: 'casingType',
        value: 'single_volute',
        rationale: 'not stated by customer; single volute is the highest-radial-thrust case (conservative)',
      })
    }

    // 4c — record the applicationFactor default when the customer did not state one.
    if (isAbsent(rawDuty, 'applicationFactor')) {
      assumptions.push({
        field: 'applicationFactor',
        value: '1.5',
        rationale: 'not stated by customer; schema default service factor of 1.5 applied',
      })
    }

    // 4d — SCHEMA GATE. An unvalidated duty is NEVER returned as 'filled'.
    const result = PumpShaftDutySchema.safeParse(rawDuty)
    if (result.success) {
      return { status: 'filled', duty: result.data, assumptions }
    }

    if (attempt === 1) {
      // Re-prompt ONCE with the formatted issues; steps 2-4 re-run on the second response.
      userMessage =
        `${args.spec}\n\nYour previous JSON failed schema validation:\n${formatIssues(result.error)}\n\n` +
        'Correct the duty using ONLY values the customer stated, or ask the customer for the missing/invalid fields. Return ONLY JSON.'
      continue
    }

    // Failed a second time — hand the issues back as clarifying questions, never as 'filled'.
    return { status: 'needs_clarification', questions: issuesToQuestions(result.error) }
  }

  // Unreachable: the loop always returns. Present for exhaustiveness.
  return { status: 'intake_error', reason: 'INTAKE exhausted its attempts without a result' }
}
