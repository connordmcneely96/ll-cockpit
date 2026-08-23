import { z } from 'zod'

// Canonical steel-family aliases → the solver's exact "Available:" spellings.
// Steel only (196F). Keys lowercased+trimmed; values verbatim from the
// engineering-calcs material table. Non-steel is intentionally out of scope —
// it's handled by the solver's fuzzy fallback (196F-b), not a hardcoded intake map.
const STEEL_ALIASES: Record<string, string> = {
  '1018': 'AISI 1018', 'aisi 1018': 'AISI 1018', '1018 steel': 'AISI 1018',
  '1045': 'AISI 1045', 'aisi 1045': 'AISI 1045', '1045 steel': 'AISI 1045',
  '4140': 'AISI 4140', 'aisi 4140': 'AISI 4140', '4140 steel': 'AISI 4140',
  '4340': 'AISI 4340', 'aisi 4340': 'AISI 4340', '4340 steel': 'AISI 4340',
}

function normalizeMaterial(raw: string): string {
  const key = raw.trim().toLowerCase()
  return STEEL_ALIASES[key] ?? raw   // unknown → pass through UNCHANGED (solver still judges it)
}

/**
 * Sprint 196D — the duty becomes DATA.
 *
 * PumpShaftDutySchema mirrors the engineering-calcs worker's ShaftGeometrySchema
 * exactly: the four required inputs a shaft solve cannot run without, plus the
 * optional inputs that refine it. `.strict()` rejects any unknown key so a caller
 * can never smuggle an invented field past the gate (the live failure was a MODELER
 * inventing impellerDiameter/impellerWidth — a strict, typed duty makes that
 * impossible: unknown keys 400, and the solver derives the impeller when it is not
 * given).
 *
 * NOTE: `overhang` is deliberately NOT an input. The seal chamber derives it inside
 * the solver — accepting it here would let a caller override a derived quantity.
 *
 * Units are the calc worker's contract: US customary imperial (HP, RPM, in, lbf, ft).
 */
export const PumpShaftDutySchema = z
  .object({
    // Required — a shaft solve cannot run without these. Physical quantities are
    // strictly positive: a zero or negative power/speed/span is not a valid shaft.
    power: z.number().positive(),          // HP
    speed: z.number().positive(),          // RPM
    bearingSpan: z.number().positive(),    // in
    material: z.string().transform(normalizeMaterial),

    // Optional — refine the solve; the solver derives sensible values when omitted.
    head: z.number().positive().optional(),                 // ft
    flow: z.number().positive().optional(),                 // gpm
    specificGravity: z.number().positive().optional().default(1.0),
    casingType: z.enum(['single_volute', 'double_volute', 'diffuser', 'concentric']).optional().default('single_volute'),
    orientation: z.enum(['horizontal', 'vertical']).optional().default('horizontal'),
    dryRunning: z.boolean().optional(),
    // Valid values are 'derived' | 'vendor'. 'derived' = the solver computes the
    // impeller geometry from head/flow; 'vendor' = the caller supplies measured
    // impellerDiameter AND impellerWidth from a vendor curve.
    impellerSource: z.enum(['derived', 'vendor']).optional().default('derived'),
    impellerDiameter: z.number().positive().optional(),     // in
    impellerWidth: z.number().positive().optional(),        // in
    impellerWeight: z.number().positive().optional(),       // lb
    applicationFactor: z.number().positive().optional().default(1.5),
    minDiameter: z.number().positive().optional(),          // in
    maxDiameter: z.number().positive().optional(),          // in
  })
  .strict()
  // Mirror the worker's four cross-field rules so an invalid duty fails at the door
  // with the same issue the worker would raise, instead of three hops downstream.
  .superRefine((d, ctx) => {
    // 1. The derived path must NOT carry vendor impeller geometry.
    if (d.impellerSource === 'derived' && (d.impellerDiameter !== undefined || d.impellerWidth !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['impellerDiameter'],
        message: 'unsourced_impeller_geometry: impellerDiameter/impellerWidth are only accepted when they come from a vendor — declare impellerSource="vendor" to supply them, or omit them and let the solver derive the impeller',
      })
    }
    // 2. The vendor path requires BOTH impeller dimensions.
    if (d.impellerSource === 'vendor' && (d.impellerDiameter === undefined || d.impellerWidth === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['impellerSource'],
        message: 'vendor_impeller_incomplete: requires BOTH impellerDiameter and impellerWidth',
      })
    }
    // 3. The derived path needs head AND flow to compute the impeller.
    if (d.impellerSource !== 'vendor' && (d.head === undefined || d.flow === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flow'],
        message: 'insufficient_inputs: the derived path requires head (ft) AND flow (gpm)',
      })
    }
    // 4. The vendor path still needs head to compute radial thrust.
    if (d.impellerSource === 'vendor' && d.head === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['head'],
        message: 'insufficient_inputs: head (ft) is required to compute radial thrust',
      })
    }
  })

export type PumpShaftDuty = z.infer<typeof PumpShaftDutySchema>
