// vitest tests for Sprint 196D-2: Gate A dimensional teeth + Gate B sees the design.
// Run with: npx vitest run src/lib/cad/gate-teeth.test.ts

import { describe, it, expect } from 'vitest'
import { evaluateGateA, reviewerTaskFor } from '../cad-convergence'
import type { SolvedDesign } from './solve-design'

// Build a GEOMETRY_METRICS line as the MODELER emits it (agents.ts:332): bbox_mm
// is a 3-element [X,Y,Z] array in mm. Omit bbox_mm entirely by passing null.
function metrics(opts: {
  bbox_mm?: number[] | null
  solids?: number
  volume_mm3?: number
  is_valid?: boolean
}): string {
  const obj: Record<string, unknown> = {
    volume_mm3: opts.volume_mm3 ?? 100000,
    faces: 22,
    edges: 39,
    solids: opts.solids ?? 1,
    is_valid: opts.is_valid ?? true,
  }
  if (opts.bbox_mm !== null) obj.bbox_mm = opts.bbox_mm ?? [60.3, 60.3, 577.9]
  return `Build complete.\nGEOMETRY_METRICS: ${JSON.stringify(obj)}\nDone.`
}

const SHAFT: SolvedDesign = { diameter: 2.375, length: 22.75, material: 'AISI 4140' }

describe('evaluateGateA — dimensional teeth (grounded)', () => {
  it('1. GROUNDED + CORRECT: bbox matches solved diameter and length -> PASS', () => {
    const r = evaluateGateA(metrics({ bbox_mm: [60.3, 60.3, 577.9] }), SHAFT)
    expect(r.pass).toBe(true)
    expect(r.failures).toEqual([])
  })

  it('2. GROUNDED + WRONG DIAMETER: bbox [71.2,71.2,577.9] -> FAIL naming measured mm and solved in', () => {
    const r = evaluateGateA(metrics({ bbox_mm: [71.2, 71.2, 577.9] }), SHAFT)
    expect(r.pass).toBe(false)
    const msg = r.failures.join(' | ')
    expect(msg).toContain('71.2')
    expect(msg).toContain('2.375')
    expect(msg).toContain('mm')
  })

  it('3. GROUNDED + THE CUBE: a 50mm cube that passes solids/volume/is_valid -> FAIL', () => {
    const cube = metrics({ bbox_mm: [50, 50, 50], solids: 1, volume_mm3: 125000, is_valid: true })
    const r = evaluateGateA(cube, SHAFT)
    // Today (before teeth) this cube passes Gate A. It must not.
    expect(r.pass).toBe(false)
    expect(r.failures.join(' | ')).toContain('2.375')
  })

  it('4. GROUNDED + bbox_mm missing -> FAIL (fail-closed)', () => {
    const r = evaluateGateA(metrics({ bbox_mm: null }), SHAFT)
    expect(r.pass).toBe(false)
    expect(r.failures.join(' | ')).toContain('fail-closed')
  })

  it('5. GROUNDED + bbox_mm malformed (2 elements) -> FAIL', () => {
    const r = evaluateGateA(metrics({ bbox_mm: [60.3, 60.3] }), SHAFT)
    expect(r.pass).toBe(false)
    expect(r.failures.join(' | ')).toContain('3-element array')
  })

  it('6. UNGROUNDED + the same 50mm cube -> PASS (generic path preserved)', () => {
    const cube = metrics({ bbox_mm: [50, 50, 50], solids: 1, volume_mm3: 125000, is_valid: true })
    const r = evaluateGateA(cube, null)
    expect(r.pass).toBe(true)
  })

  it('keeps the three legacy checks: ungrounded invalid B-rep still fails', () => {
    const bad = evaluateGateA(metrics({ bbox_mm: [50, 50, 50], is_valid: false }), null)
    expect(bad.pass).toBe(false)
    expect(bad.failures.join(' | ')).toContain('is_valid')
  })

  it('length mismatch alone fails a grounded run', () => {
    // diameter OK, length way off (bbox length 900 vs solved 577.9)
    const r = evaluateGateA(metrics({ bbox_mm: [60.3, 60.3, 900] }), SHAFT)
    expect(r.pass).toBe(false)
    expect(r.failures.join(' | ')).toContain('overall length')
  })
})

describe('reviewerTaskFor — Gate B sees the design', () => {
  it('7a. with a design: diameter in BOTH in and mm, and "NOT negotiable"', () => {
    const task = reviewerTaskFor('Design an API 610 pump shaft for the Cascade duty.', SHAFT)
    expect(task).toContain('2.375') // inches
    expect(task).toContain('60.3')  // mm (2.375 * 25.4)
    expect(task).toContain('NOT negotiable')
  })

  it('7b. with null design: legacy free-text task unchanged (byte-identical)', () => {
    const spec = 'Design a solid cube, exactly 50 mm on every side.'
    const expected = `SPEC:\n${spec}\n\nThe upstream MODELER output is provided above as context and includes the measured GEOMETRY_METRICS. Judge the produced geometry against this SPEC and return ONLY your verdict JSON.`
    expect(reviewerTaskFor(spec, null)).toBe(expected)
  })
})
