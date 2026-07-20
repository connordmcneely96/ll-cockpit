// Pure planning helper for the one-time 'default' → 'library:standards' corpus move.
//
// The re-seed (seed-corpus) writes the SAME docs under systemTenantId() =
// 'library:standards'. This helper plans the removal of the OLD baseline vectors+rows
// still living under 'default' so nothing is orphaned. It is pure (no I/O) so the
// route stays a thin adapter and the count/guard logic is unit-testable.

export interface LibraryRow {
  vector_id: string
  doc: string
}

export interface LibraryExpectation {
  docs: number
  chunks: number
}

export interface LibraryMigrationPlan {
  /** Every vector id to delete from ATLAS_RAG (one per chunk row). */
  vectorIds: string[]
  /** Distinct doc names covered by the plan. */
  docs: string[]
  /** Number of chunk rows to delete. */
  chunkCount: number
  /** True only when the rows match the known baseline shape exactly. */
  matchesExpected: boolean
}

/**
 * Plan the purge of the OLD baseline partition from a set of rag_chunks rows.
 *
 * matchesExpected is a SAFETY guard, not a filter: it is true only when the distinct
 * doc count and the row count both equal the known baseline (docs:14, chunks:81). A
 * caller can surface it on a dry run to confirm the partition looks as expected before
 * deleting anything.
 */
export function planLibraryMigration(
  rows: LibraryRow[],
  expected: LibraryExpectation,
): LibraryMigrationPlan {
  const vectorIds = rows.map((r) => r.vector_id)
  const docs = Array.from(new Set(rows.map((r) => r.doc)))
  const chunkCount = rows.length
  const matchesExpected = docs.length === expected.docs && chunkCount === expected.chunks
  return { vectorIds, docs, chunkCount, matchesExpected }
}
