import { describe, it, expect } from 'vitest'
import { PumpShaftDutySchema } from './duty'

// Sprint 196F — steel-family material-alias normalization at intake.
// Assert through the SCHEMA (not normalizeMaterial in isolation): normalization is a
// .transform() on the material field, so every caller of PumpShaftDutySchema gets it free.

// A minimal valid derived-path duty (power/speed/bearingSpan/material + head/flow). Vary
// only `material`; everything else keeps the parse valid so we read back .material.
const BASE = { power: 150, speed: 3560, bearingSpan: 8, head: 300, flow: 1000 }
const parseMaterial = (material: string): string =>
  PumpShaftDutySchema.parse({ ...BASE, material }).material

describe('196F — steel-family material normalization', () => {
  // 1. Bare / spaced / cased / padded forms all normalize to the canonical AISI spelling.
  const FAMILIES: Array<[string, string[]]> = [
    ['AISI 1018', ['1018', '1018 steel', 'AISI 1018', ' 1018 ', '1018 STEEL', 'aisi 1018']],
    ['AISI 1045', ['1045', '1045 steel', 'AISI 1045', ' 1045 ', '1045 STEEL', 'aisi 1045']],
    ['AISI 4140', ['4140', '4140 steel', 'AISI 4140', ' 4140 ', '4140 STEEL', 'aisi 4140']],
    ['AISI 4340', ['4340', '4340 steel', 'AISI 4340', ' 4340 ', '4340 STEEL', 'aisi 4340']],
  ]
  for (const [canonical, forms] of FAMILIES) {
    for (const form of forms) {
      it(`normalizes "${form}" -> ${canonical}`, () => {
        expect(parseMaterial(form)).toBe(canonical)
      })
    }
  }

  // 2. Idempotent: the canonical form parses back to itself.
  it('is idempotent on the canonical form', () => {
    expect(parseMaterial('AISI 4140')).toBe('AISI 4140')
    expect(parseMaterial('AISI 1018')).toBe('AISI 1018')
  })

  // 3. Pass-through on miss — the map never swallows an unknown material or substitutes a
  //    guess; the solver stays the single source of truth on what materials exist.
  it('passes unknown / non-steel materials through UNCHANGED', () => {
    expect(parseMaterial('316 SS')).toBe('316 SS')       // non-steel: solver-side fallback (196F-b)
    expect(parseMaterial('Inconel 718')).toBe('Inconel 718')
    expect(parseMaterial('unobtainium')).toBe('unobtainium')
    expect(parseMaterial('6061-T6')).toBe('6061-T6')
  })

  // 4. Normalization does not disturb the superRefine rules: a derived-path duty with a
  //    normalizable material but missing head/flow still raises insufficient_inputs.
  it('does not disturb superRefine — missing head/flow on the derived path still fails', () => {
    const r = PumpShaftDutySchema.safeParse({ power: 150, speed: 3560, bearingSpan: 8, material: '4140' })
    expect(r.success).toBe(false)
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain('insufficient_inputs')
  })

  // 5. Fixture sanity: the minimal valid derived-path duty parses, and material is normalized.
  it('parses the minimal valid derived-path duty and normalizes its material', () => {
    const r = PumpShaftDutySchema.safeParse({ ...BASE, material: '4140' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.material).toBe('AISI 4140')
  })

  // .strict() still rejects unknown keys (transform on material must not weaken it).
  it('.strict() still rejects an unknown key', () => {
    const r = PumpShaftDutySchema.safeParse({ ...BASE, material: '4140', bogusField: 1 })
    expect(r.success).toBe(false)
  })
})
