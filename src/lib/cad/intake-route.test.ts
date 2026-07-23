// S2 — route precedence tests. Run with: npx vitest run src/lib/cad/intake-route.test.ts
//
// The route handler (POST) needs Supabase + Cloudflare bindings, so we do NOT drive it
// directly. The precedence was extracted into the pure exported intakeDecision(), which
// imports cleanly in vitest — these tests target THAT. intakeDecision does NO DB work and
// never calls createConvergenceRun; an action of 'run' is exactly what the route turns
// into a createConvergenceRun call, and 'respond' is a short-circuit with NO run. So
// asserting the decision pins the wiring precedence without mocking the framework.

import { describe, it, expect } from 'vitest'
import type { CloudflareEnv } from '@/types'
import { intakeDecision } from '@/app/api/cad/requests/route'
import type { IntakeLlm } from './intake'

const env = {} as unknown as CloudflareEnv

// A fully-stated pump duty (SG is 1.85, not water). No casingType/applicationFactor so the
// schema fills them — proving a 'filled' duty is the SCHEMA-PARSED object, not the raw input.
const complete = {
  power: 150, speed: 3560, bearingSpan: 20, material: 'AISI 4140',
  head: 300, flow: 1000, specificGravity: 1.85, orientation: 'horizontal',
}

// A call-counting fake LLM. intakeDecision passes it through to the real runSpecIntake, so
// if INTAKE is skipped the LLM is never called — which is exactly what several tests assert.
function spyLlm(payload: unknown): { llm: IntakeLlm; calls: () => number } {
  let n = 0
  return { llm: async () => { n++; return JSON.stringify(payload) }, calls: () => n }
}

const PUMP_SPEC = 'API 610 BB2 pump shaft, 150 HP at 3560 RPM, 300 ft head, 1000 gpm, SG 1.85, horizontal.'
const CUBE_SPEC = 'Design a solid cube, exactly 50 mm on every side.'

describe('INTAKE route precedence (intakeDecision)', () => {
  it('W3a: a non-pump spec skips INTAKE (ungrounded, LLM never called)', async () => {
    const s = spyLlm({ duty: complete, assumptions: [] })
    const d = await intakeDecision({ env, spec: CUBE_SPEC, rawDuty: undefined, apiKey: 'test-key', llm: s.llm })
    expect(d.action).toBe('run')
    if (d.action !== 'run') throw new Error('unreachable')
    expect(d.duty).toBeUndefined()
    expect(d.intake).toBe(false)
    expect(s.calls()).toBe(0)
  })

  it('W3b: a pump-shaft spec runs INTAKE (LLM called)', async () => {
    const s = spyLlm({ duty: complete, assumptions: [] })
    const d = await intakeDecision({ env, spec: PUMP_SPEC, rawDuty: undefined, apiKey: 'test-key', llm: s.llm })
    expect(s.calls()).toBeGreaterThan(0)
    expect(d.action).toBe('run')
    if (d.action !== 'run') throw new Error('unreachable')
    expect(d.intake).toBe(true)
  })

  it('W4: a supplied duty is used and INTAKE is never invoked', async () => {
    const s = spyLlm({ not_applicable: 'should never be read' })
    const d = await intakeDecision({ env, spec: PUMP_SPEC, rawDuty: complete, apiKey: 'test-key', llm: s.llm })
    expect(d.action).toBe('run')
    if (d.action !== 'run') throw new Error('unreachable')
    expect(d.intake).toBe(false)
    expect(d.duty?.power).toBe(150)
    expect(s.calls()).toBe(0) // INTAKE never invoked when a duty is supplied
  })

  it('W4b: a supplied INVALID duty returns the existing 400, INTAKE never invoked', async () => {
    const s = spyLlm({ duty: complete, assumptions: [] })
    const d = await intakeDecision({ env, spec: PUMP_SPEC, rawDuty: { power: -5 }, apiKey: 'test-key', llm: s.llm })
    expect(d.action).toBe('respond')
    if (d.action !== 'respond') throw new Error('unreachable')
    expect(d.status).toBe(400)
    expect(d.body.error).toBe('invalid duty')
    expect(s.calls()).toBe(0)
  })

  it('W5: needs_clarification returns a respond with questions and creates NO run', async () => {
    // Duty missing head+flow -> INTAKE returns needs_clarification.
    const missing = { power: 150, speed: 3560, bearingSpan: 20, material: 'AISI 4140', specificGravity: 1.85, orientation: 'horizontal' }
    const s = spyLlm({ duty: missing, assumptions: [] })
    const d = await intakeDecision({ env, spec: PUMP_SPEC, rawDuty: undefined, apiKey: 'test-key', llm: s.llm })
    expect(d.action).toBe('respond') // 'respond' == the route short-circuits, createConvergenceRun NOT called
    if (d.action !== 'respond') throw new Error('unreachable')
    expect(d.status).toBe(200)
    expect(d.body.status).toBe('needs_clarification')
    expect(Array.isArray(d.body.questions)).toBe(true)
    expect((d.body.questions as string[]).length).toBeGreaterThan(0)
  })

  it('W5b: not_applicable falls through to the ungrounded path, not an error', async () => {
    const s = spyLlm({ not_applicable: 'this is a mounting bracket, not a pump shaft' })
    const d = await intakeDecision({ env, spec: PUMP_SPEC, rawDuty: undefined, apiKey: 'test-key', llm: s.llm })
    expect(d.action).toBe('run')
    if (d.action !== 'run') throw new Error('unreachable')
    expect(d.duty).toBeUndefined()
    expect(d.intake).toBe(false)
  })

  it('W5c: intake_error returns a 400 fault', async () => {
    const proseLlm: IntakeLlm = async () => 'honestly, you want a bigger pump'
    const d = await intakeDecision({ env, spec: PUMP_SPEC, rawDuty: undefined, apiKey: 'test-key', llm: proseLlm })
    expect(d.action).toBe('respond')
    if (d.action !== 'respond') throw new Error('unreachable')
    expect(d.status).toBe(400)
    expect(d.body.error).toBe('intake_error')
  })

  it('W6: a missing API key degrades to the ungrounded path (no duty, no 500, LLM never called)', async () => {
    const s = spyLlm({ duty: complete, assumptions: [] })
    const d = await intakeDecision({ env, spec: PUMP_SPEC, rawDuty: undefined, apiKey: undefined, llm: s.llm })
    expect(d.action).toBe('run')
    if (d.action !== 'run') throw new Error('unreachable')
    expect(d.duty).toBeUndefined() // NOT a fabricated duty
    expect(d.intake).toBe(false)
    expect(s.calls()).toBe(0)
  })

  it('W7: a filled duty is the SCHEMA-PARSED duty and assumptions are forwarded', async () => {
    const s = spyLlm({ duty: complete, assumptions: [{ field: 'material', value: 'AISI 4140', rationale: 'stated' }] })
    const d = await intakeDecision({ env, spec: PUMP_SPEC, rawDuty: undefined, apiKey: 'test-key', llm: s.llm })
    expect(d.action).toBe('run')
    if (d.action !== 'run') throw new Error('unreachable')
    expect(d.intake).toBe(true)
    // Schema-parsed: casingType was absent in the input but the schema default is applied.
    expect(d.duty?.casingType).toBe('single_volute')
    expect(d.duty?.specificGravity).toBe(1.85)
    // Assumptions forwarded (INTAKE also records the casingType/applicationFactor defaults).
    expect(d.assumptions?.some((a) => a.field === 'material')).toBe(true)
    expect(d.assumptions?.some((a) => a.field === 'casingType')).toBe(true)
  })
})
