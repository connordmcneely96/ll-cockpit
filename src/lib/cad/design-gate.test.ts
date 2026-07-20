// vitest tests for the Sprint 196D CAD design gate.
// Run with: npx vitest run src/lib/cad/design-gate.test.ts
// (No test runner is wired in package.json as of 196D — ships for CI setup, same
// convention as src/lib/atlas/*.test.ts. Requires the "@/" path alias in the
// vitest config, since cad-convergence imports @/workers/subtask-consumer.)

import { describe, it, expect } from 'vitest'
import { createConvergenceRun, modelerTaskFor } from '../cad-convergence'
import { PumpShaftDutySchema } from './duty'

// ── Fake CloudflareEnv ────────────────────────────────────────────────────────
// A tiny in-memory D1 that records every INSERT (column names parsed from the SQL)
// and answers the one SELECT enqueueReadySubtasks needs. The ENGINEERING_CALCS
// binding is a fake Fetcher whose response is driven by the duty, so these tests
// exercise the HUB gate — not the real solver.

type Row = Record<string, unknown>
function makeFakeDB() {
  const tables: Record<string, Row[]> = { orchestrator_runs: [], cad_convergence_runs: [], agent_subtasks: [] }
  const parseInsert = (sql: string) => {
    const m = sql.match(/INSERT INTO (\w+)\s*\(([^)]*)\)/i)
    return m ? { table: m[1], cols: m[2].split(',').map((s) => s.trim()) } : null
  }
  const prepare = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      run: async () => {
        const ins = parseInsert(sql)
        if (ins && tables[ins.table]) {
          const row: Row = {}
          ins.cols.forEach((c, i) => { row[c] = args[i] })
          tables[ins.table].push(row)
        }
        return { success: true }
      },
      first: async () => null,
      all: async () => {
        if (/SELECT id FROM agent_subtasks/i.test(sql)) {
          const [runId, userId] = args
          return {
            results: tables.agent_subtasks
              .filter((r) => r.pipeline_run_id === runId && r.user_id === userId && r.status === 'ready')
              .map((r) => ({ id: r.id })),
          }
        }
        return { results: [] }
      },
    }),
  })
  return { tables, prepare }
}

// The fake solver: closes on a double_volute casing OR a modest head (<= 400 ft),
// otherwise returns the worker's 400 { success:false, error:{ code, message } }. This
// models the discrete lever the pipeline must surface. Envelope shape mirrors the real
// calc worker VERBATIM: success wraps the design under `result` (not `data`), and a
// genuine non-convergence carries error.code 'CALCULATION_ERROR' (not 'INFEASIBLE') so
// solvePumpShaft classifies it as an engineering infeasibility rather than a fault.
function makeFakeEnv() {
  const db = makeFakeDB()
  const env = {
    DB: db,
    SUBTASK_QUEUE: { send: async () => {} },
    ENGINEERING_CALCS: {
      fetch: async (req: Request) => {
        const duty = JSON.parse(await req.text())
        const closes = duty.casingType === 'double_volute' || (typeof duty.head === 'number' && duty.head <= 400)
        if (!closes) {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'CALCULATION_ERROR',
                message: `Design does not close: shaft deflection exceeds the API 610 limit at ${duty.head} ft on a ${duty.casingType} casing. A double_volute casing halves the radial load.`,
              },
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              diameter: 2.375,
              length: 24,
              material: duty.material,
              features: [{ type: 'bearing journal', axialPosition: 2, diameter: 2.0, notes: 'press fit' }],
              checks: [{ criterion: 'deflection', computed: 0.0011, limit: 0.002, citation: 'API 610 6.9.3' }],
              assumptions: [{ parameter: 'specificGravity', basis: 'duty-provided', impact: 'radial load' }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return env as any
}

const CASCADE_DUTY = { power: 150, speed: 3560, head: 300, flow: 1000, bearingSpan: 8, material: 'AISI 4140' }
const INFEASIBLE_DUTY = { power: 200, speed: 3560, head: 1000, flow: 6000, bearingSpan: 10, material: 'AISI 4140', casingType: 'single_volute' }

const subtasksFor = (env: ReturnType<typeof makeFakeEnv>, runId: string) =>
  env.DB.tables.agent_subtasks.filter((r: Row) => r.pipeline_run_id === runId)
const convRow = (env: ReturnType<typeof makeFakeEnv>, runId: string) =>
  env.DB.tables.cad_convergence_runs.find((r: Row) => r.run_id === runId)

describe('196D CAD design gate', () => {
  it('THE GATE: an infeasible duty produces ZERO subtasks and a verbatim diagnosis', async () => {
    const env = makeFakeEnv()
    const r = await createConvergenceRun(env, 'user-1', 'API 610 pump shaft', 3, false, PumpShaftDutySchema.parse(INFEASIBLE_DUTY))

    expect(r.status).toBe('infeasible')
    if (r.status !== 'infeasible') throw new Error('unreachable')
    expect(r.diagnosis.length).toBeGreaterThan(0)
    expect(r.diagnosis).toContain('does not close')

    // The assertion that matters most: NO geometry work was scheduled.
    expect(subtasksFor(env, r.runId).length).toBe(0)
    expect(convRow(env, r.runId)?.design_status).toBe('infeasible')
    expect(convRow(env, r.runId)?.status).toBe('infeasible')
  })

  it('CONVERGED: the Cascade duty solves, persists the design, and creates a modeler+reviewer pair', async () => {
    const env = makeFakeEnv()
    const r = await createConvergenceRun(env, 'user-1', 'API 610 pump shaft', 3, false, PumpShaftDutySchema.parse(CASCADE_DUTY))

    expect(r.status).toBe('created')
    if (r.status !== 'created') throw new Error('unreachable')
    expect(r.designStatus).toBe('converged')

    const row = convRow(env, r.runId)
    expect(row?.design_status).toBe('converged')
    const design = JSON.parse(String(row?.design_json))
    expect(design.diameter).toBeCloseTo(2.375, 3)

    const subs = subtasksFor(env, r.runId)
    expect(subs.length).toBe(2)
    expect(subs.map((s: Row) => s.agent_name).sort()).toEqual(['modeler', 'reviewer'])
  })

  it('TRANSCRIPTION: the modeler task carries the solved diameter and "TRANSCRIBING", not the raw spec', async () => {
    const env = makeFakeEnv()
    const spec = 'Design an API 610 BB2 pump shaft for the Cascade duty per the RFQ narrative.'
    const r = await createConvergenceRun(env, 'user-1', spec, 3, false, PumpShaftDutySchema.parse(CASCADE_DUTY))
    if (r.status !== 'created') throw new Error('expected created')

    const modeler = subtasksFor(env, r.runId).find((s: Row) => s.agent_name === 'modeler')
    const task = String(modeler?.task)
    expect(task).toContain('2.375')
    expect(task).toContain('TRANSCRIBING')
    expect(task).not.toContain(spec)
  })

  it('UNGROUNDED: no duty preserves legacy behaviour (raw-spec task, subtasks created)', async () => {
    const env = makeFakeEnv()
    const spec = 'Design a solid cube, exactly 50 mm on every side.'
    const r = await createConvergenceRun(env, 'user-1', spec, 3, false)

    expect(r.status).toBe('created')
    if (r.status !== 'created') throw new Error('unreachable')
    expect(r.designStatus).toBe('ungrounded')
    expect(convRow(env, r.runId)?.design_status).toBe('ungrounded')

    const subs = subtasksFor(env, r.runId)
    expect(subs.length).toBe(2)
    const modeler = subs.find((s: Row) => s.agent_name === 'modeler')
    expect(String(modeler?.task)).toBe(spec) // raw free-text spec, unchanged
  })

  it('THE DISCRETE LEVER: the same infeasible duty converges with a double_volute casing', async () => {
    const env = makeFakeEnv()
    const lever = PumpShaftDutySchema.parse({ ...INFEASIBLE_DUTY, casingType: 'double_volute' })
    const r = await createConvergenceRun(env, 'user-1', 'API 610 pump shaft', 3, false, lever)

    expect(r.status).toBe('created')
    if (r.status !== 'created') throw new Error('unreachable')
    expect(r.designStatus).toBe('converged')
    expect(subtasksFor(env, r.runId).length).toBe(2)
  })
})

// modelerTaskFor is pure — assert both branches directly.
describe('modelerTaskFor', () => {
  it('returns the raw spec unchanged when there is no design', () => {
    expect(modelerTaskFor('build a cube', null)).toBe('build a cube')
  })
  it('renders a transcription task from the solved design', () => {
    const task = modelerTaskFor('ignored spec', { diameter: 2.375, length: 24, material: 'AISI 4140' })
    expect(task).toContain('SOLVED DESIGN')
    expect(task).toContain('2.375')
    expect(task).toContain('TRANSCRIBING')
    expect(task).toContain('Do NOT call engineering_calc')
  })
})
