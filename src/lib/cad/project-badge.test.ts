// Sprint 196E-1 — contract tests for the projected CAD trust-badge.
// Run with: npx vitest run src/lib/cad/project-badge.test.ts
//
// These pin projectBadge to the frozen VerticalStage §3 table VERBATIM. The expected
// matrix below is HAND-CODED from that table — it is NEVER computed with the function
// under test, so a logic change cannot silently move the goalposts.

import { describe, it, expect } from 'vitest'
import {
  projectBadge,
  statusDetailFor,
  type RunStatus,
  type DesignStatus,
  type BadgeState,
} from './project-badge'

const RUN: RunStatus[] = ['pending', 'running', 'converged', 'exhausted', 'failed', 'infeasible']
// Column order for every EXPECTED row below.
const DESIGN: DesignStatus[] = ['converged', 'infeasible', 'solver_error', 'ungrounded', null]

// §3 table, transcribed by hand. Rows keyed by RunStatus; each array is indexed by DESIGN.
//                       converged     infeasible     solver_error  ungrounded    null
const EXPECTED: Record<RunStatus, BadgeState[]> = {
  pending:    ['pending',    'infeasible', 'failed', 'pending',    'pending'],
  running:    ['running',    'infeasible', 'failed', 'running',    'running'],
  converged:  ['converged',  'infeasible', 'failed', 'pending',    'pending'],
  exhausted:  ['exhausted',  'exhausted',  'exhausted', 'exhausted', 'exhausted'],
  failed:     ['failed',     'failed',     'failed', 'failed',     'failed'],
  infeasible: ['infeasible', 'infeasible', 'failed', 'infeasible', 'infeasible'],
}

describe('projectBadge — §3 contract', () => {
  it('1. exhaustive cartesian product (6 RunStatus × 5 DesignStatus) matches the table', () => {
    for (const run of RUN) {
      DESIGN.forEach((design, j) => {
        expect(projectBadge(run, design)).toBe(EXPECTED[run][j])
      })
    }
  })

  it('2. DEFECT-FIX INVARIANT: only (converged,converged) is ever green', () => {
    for (const run of RUN) {
      for (const design of DESIGN) {
        const isGreen = projectBadge(run, design) === 'converged'
        expect(isGreen).toBe(run === 'converged' && design === 'converged')
      }
    }
  })

  it('3. (converged,ungrounded) and (converged,null) are pending, never green', () => {
    expect(projectBadge('converged', 'ungrounded')).toBe('pending')
    expect(projectBadge('converged', null)).toBe('pending')
  })

  it('4. exhausted × every DesignStatus -> exhausted, never failed (Lane 5 correction)', () => {
    for (const design of DESIGN) {
      expect(projectBadge('exhausted', design)).toBe('exhausted')
    }
    // pinned corner: exhausted must win over solver_error (table lists it above).
    expect(projectBadge('exhausted', 'solver_error')).toBe('exhausted')
  })

  it('5. solver_error on either axis -> failed (for every non-exhausted run)', () => {
    // design axis = solver_error
    for (const run of ['pending', 'running', 'converged', 'infeasible'] as RunStatus[]) {
      expect(projectBadge(run, 'solver_error')).toBe('failed')
    }
    // run axis = solver_error (not a valid RunStatus -> fail-closed -> failed)
    expect(projectBadge('solver_error', null)).toBe('failed')
    expect(projectBadge('solver_error', 'converged')).toBe('failed')
  })

  it('6. garbage/unknown runStatus -> failed (fail-closed)', () => {
    expect(projectBadge('weird', null)).toBe('failed')
    expect(projectBadge(undefined, undefined)).toBe('failed')
    expect(projectBadge(null, null)).toBe('failed')
    expect(projectBadge('', 'ungrounded')).toBe('failed')
    expect(projectBadge('CONVERGED', 'converged')).toBe('failed') // case-sensitive
  })

  it('7. live D1 fixture rows project correctly', () => {
    expect(projectBadge('converged', 'converged')).toBe('converged')
    expect(projectBadge('converged', 'ungrounded')).toBe('pending')
    expect(projectBadge('converged', null)).toBe('pending') // ×24 legacy rows
    expect(projectBadge('infeasible', 'infeasible')).toBe('infeasible')
  })
})

describe('statusDetailFor', () => {
  it('8a. exhausted with cycle/max -> "exhausted 3/3"', () => {
    expect(statusDetailFor({ runStatus: 'exhausted', designStatus: null, cycle: 3, maxCycles: 3 })).toBe('exhausted 3/3')
  })

  it('8b. converged + ungrounded -> "ungrounded — no duty"', () => {
    expect(statusDetailFor({ runStatus: 'converged', designStatus: 'ungrounded' })).toBe('ungrounded — no duty')
  })

  it('8c. converged + null -> "legacy — no design"', () => {
    expect(statusDetailFor({ runStatus: 'converged', designStatus: null })).toBe('legacy — no design')
  })

  it('8d. solver_error -> "solver fault"; otherwise empty', () => {
    expect(statusDetailFor({ runStatus: 'failed', designStatus: 'solver_error' })).toBe('solver fault')
    expect(statusDetailFor({ runStatus: 'running', designStatus: 'converged' })).toBe('')
    // exhausted without cycle/max falls through to empty (no partial detail).
    expect(statusDetailFor({ runStatus: 'exhausted', designStatus: null })).toBe('')
  })
})
