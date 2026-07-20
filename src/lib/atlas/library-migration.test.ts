import { describe, it, expect } from 'vitest'
import { planLibraryMigration } from './library-migration'

// Build N chunk rows spread across `docs` documents (round-robin), with unique
// vector ids so the plan can carry them verbatim to ATLAS_RAG.deleteByIds.
function makeRows(chunks: number, docs: number) {
  return Array.from({ length: chunks }, (_, i) => ({
    vector_id: `library:standards::doc${i % docs}::${i}`,
    doc: `doc${i % docs}`,
  }))
}

describe('planLibraryMigration', () => {
  it('matches the known baseline: 81 chunks across 14 docs', () => {
    const rows = makeRows(81, 14)
    const plan = planLibraryMigration(rows, { docs: 14, chunks: 81 })
    expect(plan.matchesExpected).toBe(true)
    expect(plan.vectorIds).toHaveLength(81)
    expect(plan.docs).toHaveLength(14)
    expect(plan.chunkCount).toBe(81)
  })

  it('carries every vector id verbatim, in row order', () => {
    const rows = [
      { vector_id: 'v-a', doc: 'API610' },
      { vector_id: 'v-b', doc: 'API610' },
      { vector_id: 'v-c', doc: 'ASME' },
    ]
    const plan = planLibraryMigration(rows, { docs: 2, chunks: 3 })
    expect(plan.vectorIds).toEqual(['v-a', 'v-b', 'v-c'])
    expect(plan.docs).toEqual(['API610', 'ASME'])
    expect(plan.matchesExpected).toBe(true)
  })

  it('fails the guard when the set is short', () => {
    const rows = makeRows(40, 14)
    const plan = planLibraryMigration(rows, { docs: 14, chunks: 81 })
    expect(plan.matchesExpected).toBe(false)
    expect(plan.chunkCount).toBe(40)
  })

  it('fails the guard when the doc count is wrong even if chunk count matches', () => {
    const rows = makeRows(81, 13)
    const plan = planLibraryMigration(rows, { docs: 14, chunks: 81 })
    expect(plan.matchesExpected).toBe(false)
    expect(plan.docs).toHaveLength(13)
    expect(plan.chunkCount).toBe(81)
  })

  it('an empty set does not match — nothing to migrate', () => {
    const plan = planLibraryMigration([], { docs: 14, chunks: 81 })
    expect(plan.matchesExpected).toBe(false)
    expect(plan.vectorIds).toHaveLength(0)
    expect(plan.docs).toHaveLength(0)
    expect(plan.chunkCount).toBe(0)
  })
})
