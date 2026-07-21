// Contract + envelope tests at the calc-worker seam (Sprint 196D / S0).
// Run with: npx vitest run src/lib/cad/solve-design.test.ts
//
// This is the test CLASS that was missing: it exercises the REAL worker envelope
// shape ({ success, result | error }) rather than a hand-built SolvedDesign, and it
// pins ll-cockpit's PumpShaftDutySchema to the worker's known accept/reject behaviour
// so future drift is caught by CI.

import { describe, it, expect } from 'vitest'
import type { CloudflareEnv } from '@/types'
import { solvePumpShaft } from './solve-design'
import { PumpShaftDutySchema, type PumpShaftDuty } from './duty'

// A fake env whose ENGINEERING_CALCS binding returns a canned Response. CALC_SECRET is
// undefined so no auth header is sent (matches the live caller).
const envWith = (status: number, bodyObj: unknown): CloudflareEnv =>
  ({
    CALC_SECRET: undefined,
    ENGINEERING_CALCS: {
      fetch: async () =>
        new Response(JSON.stringify(bodyObj), { status, headers: { 'content-type': 'application/json' } }),
    },
  }) as unknown as CloudflareEnv

// A fake env whose fetch throws — models a transport error / dropped connection.
const envThrows = (): CloudflareEnv =>
  ({
    CALC_SECRET: undefined,
    ENGINEERING_CALCS: { fetch: async () => { throw new Error('connection reset') } },
  }) as unknown as CloudflareEnv

// The duty content is irrelevant to envelope parsing (the fake ignores it), but use a
// real, schema-valid duty so the call site is honest.
const DUTY: PumpShaftDuty = PumpShaftDutySchema.parse({
  power: 150, speed: 3560, bearingSpan: 20, material: 'AISI 4140', head: 300, flow: 1000,
})

describe('GROUP A — solvePumpShaft envelope parsing', () => {
  it('A1: success envelope { result } -> converged with unwrapped dimensions', async () => {
    const env = envWith(200, {
      success: true,
      result: { diameter: 2.375, length: 22.5, material: 'x' },
      metadata: {},
    })
    const outcome = await solvePumpShaft(env, DUTY)
    expect(outcome.status).toBe('converged')
    if (outcome.status !== 'converged') throw new Error('unreachable')
    expect(outcome.design.diameter).toBe(2.375)
    expect(outcome.design.length).toBe(22.5)
  })

  it('A2: CALCULATION_ERROR -> infeasible (an engineering verdict), diagnosis verbatim', async () => {
    const env = envWith(400, {
      success: false,
      error: { code: 'CALCULATION_ERROR', message: 'shaft design infeasible: deflection exceeds API 610 limit' },
      metadata: {},
    })
    const outcome = await solvePumpShaft(env, DUTY)
    expect(outcome.status).toBe('infeasible')
    if (outcome.status !== 'infeasible') throw new Error('unreachable')
    expect(outcome.diagnosis).toContain('infeasible')
  })

  it('A3: VALIDATION_ERROR -> solver_error (a fault, NOT infeasible)', async () => {
    const env = envWith(400, {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'insufficient_inputs: head and flow required' },
      metadata: {},
    })
    const outcome = await solvePumpShaft(env, DUTY)
    expect(outcome.status).toBe('solver_error')
  })

  it('A4: success:true but result missing length -> solver_error (fail-closed)', async () => {
    const env = envWith(200, { success: true, result: { diameter: 2.375 }, metadata: {} })
    const outcome = await solvePumpShaft(env, DUTY)
    expect(outcome.status).toBe('solver_error')
    if (outcome.status !== 'solver_error') throw new Error('unreachable')
    expect(outcome.reason).toContain('no usable dimensions')
  })

  it('A5: 401 UNAUTHORIZED -> solver_error', async () => {
    const env = envWith(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'missing X-Calc-Secret' } })
    const outcome = await solvePumpShaft(env, DUTY)
    expect(outcome.status).toBe('solver_error')
  })

  it('A6: a transport error (fetch throws) -> solver_error', async () => {
    const outcome = await solvePumpShaft(envThrows(), DUTY)
    expect(outcome.status).toBe('solver_error')
    if (outcome.status !== 'solver_error') throw new Error('unreachable')
    expect(outcome.reason).toContain('shaft solver call failed')
  })
})

describe('GROUP B — PumpShaftDutySchema golden contract', () => {
  const valid = { power: 150, speed: 3560, bearingSpan: 20, material: 'AISI 4140', head: 300, flow: 1000 }

  it('B1: a complete derived duty PARSES', () => {
    expect(PumpShaftDutySchema.safeParse(valid).success).toBe(true)
  })

  it('B2: missing head/flow FAILS with insufficient_inputs', () => {
    const r = PumpShaftDutySchema.safeParse({ power: 150, speed: 3560, bearingSpan: 20, material: 'AISI 4140' })
    expect(r.success).toBe(false)
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain('insufficient_inputs')
  })

  it('B3: impellerSource "computed" FAILS (bad enum)', () => {
    const r = PumpShaftDutySchema.safeParse({ ...valid, impellerSource: 'computed' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('impellerSource'))).toBe(true)
  })

  it('B4: derived + impellerDiameter FAILS with unsourced_impeller_geometry', () => {
    const r = PumpShaftDutySchema.safeParse({ ...valid, impellerSource: 'derived', impellerDiameter: 8 })
    expect(r.success).toBe(false)
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain('unsourced_impeller_geometry')
  })
})
