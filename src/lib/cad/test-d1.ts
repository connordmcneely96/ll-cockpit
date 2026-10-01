// Real-SQLite D1 stand-in for tests: executes the actual SQL against the actual
// migrations/*.sql (node:sqlite, Node >= 22.5). Unlike design-gate.test.ts's fake,
// a column/bind mismatch or schema drift fails here. Throws (never skips) on old Node.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Migrations that reference tables created outside migrations/ — fail identically on
// a clean DB today. Any OTHER failure is a real defect and throws.
const KNOWN_BROKEN = ['0018_knowledge_embed_tracking.sql', '0027_agent_org_chart.sql']

interface Stmt { run(...a: unknown[]): unknown; get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] }
interface Sqlite { exec(sql: string): void; prepare(sql: string): Stmt }

export async function makeSqliteD1() {
  const major = Number(process.versions.node.split('.')[0])
  if (major < 22) throw new Error(`persistence tests need Node >= 22.5 for node:sqlite; running ${process.version}`)
  // createRequire: vite-node can't resolve the `node:sqlite` specifier and @types/node lacks its typings.
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (p: string) => Sqlite }
  const sqlite = new DatabaseSync(':memory:')
  const dir = path.join(process.cwd(), 'migrations')
  const failed: string[] = []
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    try { sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { failed.push(f) }
  }
  if (failed.join() !== KNOWN_BROKEN.join()) throw new Error(`unexpected migration failures: ${failed.join(', ')}`)
  const prepare = (sql: string) => ({
    bind: (...args: unknown[]) => {
      const st = sqlite.prepare(sql)
      return {
        run: async () => ({ success: true, meta: st.run(...args) }),
        first: async () => (st.get(...args) as unknown) ?? null,
        all: async () => ({ results: st.all(...args) as unknown[] }),
      }
    },
  })
  return { sqlite, prepare }
}
