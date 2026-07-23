// Sprint 196x / S1 — INTAKE tests. Run with: npx vitest run src/lib/cad/intake.test.ts
//
// These use the injected `llm` seam — NO network, NO real API key. Each test drives a
// fixed model response and asserts INTAKE's gate: it FILLS a complete stated duty, ASKS
// when a required fact is missing, and NEVER returns a guessed or unvalidated duty. The
// load-bearing tests are T3/T4: a schema-VALID duty is still rejected when specificGravity
// or orientation was never stated (they are silently .default(...)ed by the schema).

import { describe, it, expect } from 'vitest'
import type { CloudflareEnv } from '@/types'
import { runSpecIntake, type IntakeLlm } from './intake'

// A fake env / key: the injected llm makes both inert.
const env = {} as unknown as CloudflareEnv
const apiKey = 'test-key'
const spec = 'Customer RFQ narrative for an API 610 pump shaft.'

// Returns the same JSON payload for every call (so the re-prompt path sees it twice).
const fakeLlm = (payload: unknown): IntakeLlm => async () => JSON.stringify(payload)

// A duty the customer fully stated (SG is 1.85, NOT water — proves the stated value
// survives). No casingType and no applicationFactor: those exercise the recorded defaults.
const complete = {
  power: 150,
  speed: 3560,
  bearingSpan: 20,
  material: 'AISI 4140',
  head: 300,
  flow: 1000,
  specificGravity: 1.85,
  orientation: 'horizontal',
}

function omit(o: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const c: Record<string, unknown> = { ...o }
  for (const k of keys) delete c[k]
  return c
}

const run = (payload: unknown) => runSpecIntake({ env, apiKey, spec, llm: fakeLlm(payload) })

describe('INTAKE — fills, asks, and never guesses', () => {
  it('T1: complete spec -> filled with the customer values verbatim', async () => {
    const r = await run({ duty: complete, assumptions: [] })
    expect(r.status).toBe('filled')
    if (r.status !== 'filled') throw new Error('unreachable')
    expect(r.duty.power).toBe(150)
    expect(r.duty.speed).toBe(3560)
    expect(r.duty.bearingSpan).toBe(20)
    expect(r.duty.material).toBe('AISI 4140')
    expect(r.duty.head).toBe(300)
    expect(r.duty.flow).toBe(1000)
    expect(r.duty.specificGravity).toBe(1.85)
    expect(r.duty.orientation).toBe('horizontal')
  })

  it('T2: missing head+flow -> needs_clarification naming both, no duty', async () => {
    const r = await run({ duty: omit(complete, 'head', 'flow'), assumptions: [] })
    expect(r.status).toBe('needs_clarification')
    if (r.status !== 'needs_clarification') throw new Error('unreachable')
    expect(r.questions.some((q) => /head/i.test(q))).toBe(true)
    expect(r.questions.some((q) => /flow/i.test(q))).toBe(true)
    expect(r).not.toHaveProperty('duty')
  })

  it('T3: missing specificGravity -> needs_clarification (even though safeParse would fill it)', async () => {
    const r = await run({ duty: omit(complete, 'specificGravity'), assumptions: [] })
    expect(r.status).toBe('needs_clarification')
    if (r.status !== 'needs_clarification') throw new Error('unreachable')
    expect(r.questions.some((q) => /specific gravity/i.test(q))).toBe(true)
    expect(r).not.toHaveProperty('duty')
  })

  it('T4: missing orientation -> needs_clarification naming orientation', async () => {
    const r = await run({ duty: omit(complete, 'orientation'), assumptions: [] })
    expect(r.status).toBe('needs_clarification')
    if (r.status !== 'needs_clarification') throw new Error('unreachable')
    expect(r.questions.some((q) => /orientation/i.test(q))).toBe(true)
    expect(r).not.toHaveProperty('duty')
  })

  it('T5: only casingType missing -> filled, defaulted single_volute, and RECORDED', async () => {
    const r = await run({ duty: complete, assumptions: [] })
    expect(r.status).toBe('filled')
    if (r.status !== 'filled') throw new Error('unreachable')
    expect(r.duty.casingType).toBe('single_volute')
    const a = r.assumptions.find((x) => x.field === 'casingType')
    expect(a).toBeDefined()
    expect(a && /not stated/i.test(a.rationale)).toBe(true)
  })

  it('T6: SG missing AND casingType missing -> needs_clarification, casingType rides along', async () => {
    const r = await run({ duty: omit(complete, 'specificGravity'), assumptions: [] })
    expect(r.status).toBe('needs_clarification')
    if (r.status !== 'needs_clarification') throw new Error('unreachable')
    expect(r.questions.some((q) => /specific gravity/i.test(q))).toBe(true)
    expect(r.questions.some((q) => /casing/i.test(q))).toBe(true)
  })

  it('T7: applicationFactor absent -> recorded as a 1.5 assumption', async () => {
    const r = await run({ duty: complete, assumptions: [] })
    expect(r.status).toBe('filled')
    if (r.status !== 'filled') throw new Error('unreachable')
    const a = r.assumptions.find((x) => x.field === 'applicationFactor')
    expect(a).toBeDefined()
    expect(a?.value).toBe('1.5')
  })

  it('T8: LLM returns needs_clarification directly -> passed through unchanged', async () => {
    const r = await run({ needs_clarification: ['What is the design flow rate in gpm?'] })
    expect(r.status).toBe('needs_clarification')
    if (r.status !== 'needs_clarification') throw new Error('unreachable')
    expect(r.questions).toEqual(['What is the design flow rate in gpm?'])
  })

  it('T9: schema-invalid duty (orientation "sideways") twice -> not filled, no duty returned', async () => {
    const r = await run({ duty: { ...complete, orientation: 'sideways' }, assumptions: [] })
    expect(r.status).not.toBe('filled')
    expect(r).not.toHaveProperty('duty')
  })

  it('T9b: schema-invalid duty (speed -100) twice -> not filled', async () => {
    const r = await run({ duty: { ...complete, speed: -100 }, assumptions: [] })
    expect(r.status).not.toBe('filled')
    expect(r).not.toHaveProperty('duty')
  })

  it('T10: non-JSON prose -> intake_error (NOT needs_clarification)', async () => {
    const proseLlm: IntakeLlm = async () => 'Honestly you probably want a bigger pump here.'
    const r = await runSpecIntake({ env, apiKey, spec, llm: proseLlm })
    expect(r.status).toBe('intake_error')
  })

  it('T11: fabricated placeholder head:0 -> fails .positive(), not filled', async () => {
    const r = await run({ duty: { ...complete, head: 0 }, assumptions: [] })
    expect(r.status).not.toBe('filled')
    expect(r).not.toHaveProperty('duty')
  })
})
