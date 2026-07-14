import { z } from 'zod'

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
    // Required — a shaft solve cannot run without these.
    power: z.number(),          // HP
    speed: z.number(),          // RPM
    bearingSpan: z.number(),    // in
    material: z.string(),

    // Optional — refine the solve; the solver derives sensible values when omitted.
    head: z.number().optional(),                 // ft
    flow: z.number().optional(),                 // gpm
    specificGravity: z.number().optional(),
    casingType: z.string().optional(),           // e.g. single_volute | double_volute | diffuser | concentric
    orientation: z.string().optional(),          // e.g. horizontal | vertical
    dryRunning: z.boolean().optional(),
    impellerSource: z.string().optional(),       // e.g. computed | specified
    impellerDiameter: z.number().optional(),     // in
    impellerWidth: z.number().optional(),        // in
    impellerWeight: z.number().optional(),       // lb
    applicationFactor: z.number().optional(),
    minDiameter: z.number().optional(),          // in
    maxDiameter: z.number().optional(),          // in
  })
  .strict()

export type PumpShaftDuty = z.infer<typeof PumpShaftDutySchema>
