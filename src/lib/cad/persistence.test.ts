// γ M1.1 — real-SQLite regression: a grounded run's design_json/design_status survive
// the write and read back from the database (not from an in-memory array).
import { describe, it, expect } from 'vitest'
import { createConvergenceRun } from '../cad-convergence'
import { PumpShaftDutySchema } from './duty'
import { makeSqliteD1 } from './test-d1'

const DUTY = PumpShaftDutySchema.parse({ power: 150, speed: 3560, head: 300, flow: 1000, bearingSpan: 8, material: 'AISI 4140' })
const SOLVED = { diameter: 2.375, length: 24, material: 'AISI 4140', features: [] }

// Mirrors the live calc worker envelope: { success, result, metadata } — `result`, not `data`.
const calcs = { fetch: async () => new Response(JSON.stringify({ success: true, result: SOLVED, metadata: {} }), { status: 200 }) }

describe('M1.1 design_json / design_status persistence (real SQLite)', () => {
  it('grounded run: SELECT returns design_json + design_status=converged', async () => {
    const db = await makeSqliteD1()
    const env = { DB: db, SUBTASK_QUEUE: { send: async () => {} }, ENGINEERING_CALCS: calcs } as never
    const r = await createConvergenceRun(env, 'user-1', 'API 610 pump shaft', 3, false, DUTY)
    if (r.status !== 'created') throw new Error(`expected created, got ${r.status}`)

    const row = db.sqlite.prepare('SELECT design_json, design_status, status, user_id FROM cad_convergence_runs WHERE run_id = ?').get(r.runId) as Record<string, string>
    console.log('READBACK', r.runId, JSON.stringify(row))
    expect(row.design_status).toBe('converged')
    expect(JSON.parse(row.design_json)).toMatchObject({ diameter: 2.375, length: 24, material: 'AISI 4140' })
    expect(row.user_id).toBe('user-1')
  })

  it('ungrounded run: design_json is NULL and design_status=ungrounded', async () => {
    const db = await makeSqliteD1()
    const env = { DB: db, SUBTASK_QUEUE: { send: async () => {} }, ENGINEERING_CALCS: calcs } as never
    const r = await createConvergenceRun(env, 'user-1', 'solid cube 50mm', 3, false)
    const row = db.sqlite.prepare('SELECT design_json, design_status FROM cad_convergence_runs WHERE run_id = ?').get((r as { runId: string }).runId) as Record<string, unknown>
    expect(row).toEqual(expect.objectContaining({ design_json: null, design_status: 'ungrounded' }))
  })
})
