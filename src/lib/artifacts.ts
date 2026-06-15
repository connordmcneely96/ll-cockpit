/**
 * Artifact promotion — copies a completed run's deliverable subtask output(s)
 * into artifact_registry (document body stored in R2). Idempotent per run.
 *
 * Deliverable = a done, non-QA subtask with non-empty output that is a leaf of
 * the DAG after QA nodes (sentinel, critic) are removed — i.e. no non-QA subtask
 * depends on it. The run's QA verdict (sentinel preferred, else critic) sets
 * sentinel_pass / quality_score on every artifact for that run.
 */

import type { CloudflareEnv } from '@/types'

// Agents whose output is QA verdict, not a deliverable. Their parsed verdict
// sets sentinel_pass/quality_score on the run's real artifacts.
const QA_AGENTS = new Set(['sentinel', 'critic'])
// Intermediate-only agents in the design pipeline: DESIGNER emits token JSON,
// COMPOSER emits section fragments. The deliverable is always ASSEMBLER's
// stitched page. Never promote these as standalone artifacts.
const INTERMEDIATE_AGENTS = new Set(['designer', 'composer'])
// Union: anything that is never a standalone deliverable.
const NON_DELIVERABLE_AGENTS = new Set([...QA_AGENTS, ...INTERMEDIATE_AGENTS])

const ARTIFACT_TYPE_BY_AGENT: Record<string, string> = {
  atlas: 'engineering',
  herald: 'content',
  forge: 'code',
  reel: 'video',
  intake: 'document',
  anchor: 'report',
  dispatch: 'delivery',
  scout: 'proposal',
  designer: 'design-tokens',
  composer: 'markup',
  assembler: 'webpage',
}

const FORMAT_BY_AGENT: Record<string, string> = {
  composer: 'html',
  assembler: 'html',
  designer: 'json',
}

interface SubtaskRow {
  id: string
  short_id: string
  agent_name: string
  title: string
  task_type: string | null
  depends_on: string | null
  status: string
  output: string | null
  cost_usd: number | null
  completed_at: number | null
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function parseVerdict(output: string | null): { score: number | null; pass: number | null } {
  if (!output) return { score: null, pass: null }
  const raw = output

  // 1) Preferred: structured JSON { score, pass } (possibly fenced or embedded).
  let s = raw.trim()
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    s = fenced[1].trim()
  } else {
    const a = s.indexOf('{')
    const b = s.lastIndexOf('}')
    if (a !== -1 && b > a) s = s.slice(a, b + 1)
  }
  try {
    const j = JSON.parse(s) as { score?: number; pass?: boolean }
    const score = typeof j.score === 'number' ? j.score : null
    const pass =
      typeof j.pass === 'boolean' ? (j.pass ? 1 : 0) : score != null ? (score >= 80 ? 1 : 0) : null
    if (score != null || pass != null) return { score, pass }
  } catch {
    /* fall through to prose extraction */
  }

  // 2) Fallback: pull a "NN/100" (or "score: NN") from prose; derive pass from the
  //    score (>=80), with an explicit FAIL/HOLD/REWORK keyword forcing 0.
  let score: number | null = null
  const m = raw.match(/\b(\d{1,3})\s*\/\s*100\b/) ?? raw.match(/\bscore[:\s]+(\d{1,3})\b/i)
  if (m) {
    const n = Number.parseInt(m[1], 10)
    if (Number.isFinite(n) && n >= 0 && n <= 100) score = n
  }
  let pass: number | null = score != null ? (score >= 80 ? 1 : 0) : null
  if (/\b(FAILED|HOLD|REWORK|REJECTED)\b/i.test(raw)) pass = 0
  return { score, pass }
}

function contentType(fmt: string): string {
  if (fmt === 'html') return 'text/html; charset=utf-8'
  if (fmt === 'json') return 'application/json; charset=utf-8'
  return 'text/markdown; charset=utf-8'
}

/**
 * Promote a completed run's deliverables to artifact_registry. Idempotent:
 * returns 0 immediately if the run isn't 'completed' or already has artifacts.
 * Returns the number of artifacts written.
 */
export async function promoteArtifactsForRun(env: CloudflareEnv, runId: string): Promise<number> {
  const db = env.DB

  const run = await db
    .prepare(`SELECT id, user_id, status FROM orchestrator_runs WHERE id = ?`)
    .bind(runId)
    .first<{ id: string; user_id: string; status: string }>()
  if (!run || run.status !== 'completed') return 0

  // Idempotency: skip if this run already has artifacts (execution_id = runId).
  const existing = await db
    .prepare(`SELECT COUNT(*) AS n FROM artifact_registry WHERE execution_id = ?`)
    .bind(runId)
    .first<{ n: number }>()
  if ((existing?.n ?? 0) > 0) return 0

  const subRows = await db
    .prepare(
      `SELECT id, short_id, agent_name, title, task_type, depends_on, status, output, cost_usd, completed_at
       FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ?`,
    )
    .bind(runId, run.user_id)
    .all<SubtaskRow>()
  const subs = subRows.results ?? []
  if (subs.length === 0) return 0

  // Run-level QA verdict (sentinel preferred, else critic).
  const qa =
    subs.find((s) => s.agent_name === 'sentinel' && s.status === 'done' && s.output) ??
    subs.find((s) => s.agent_name === 'critic' && s.status === 'done' && s.output)
  const verdict = parseVerdict(qa?.output ?? null)

  // short_ids depended upon by NON-QA subtasks = interior nodes of the non-QA subgraph.
  const dependedUponByNonQA = new Set<string>()
  for (const s of subs) {
    if (NON_DELIVERABLE_AGENTS.has(s.agent_name)) continue
    const deps: string[] = s.depends_on ? JSON.parse(s.depends_on) : []
    for (const d of deps) dependedUponByNonQA.add(d)
  }

  const deliverables = subs.filter(
    (s) =>
      s.status === 'done' &&
      !!s.output &&
      s.output.trim().length > 0 &&
      !NON_DELIVERABLE_AGENTS.has(s.agent_name) &&
      !dependedUponByNonQA.has(s.short_id),
  )
  if (deliverables.length === 0) return 0

  const now = Math.floor(Date.now() / 1000)
  let written = 0

  for (const s of deliverables) {
    const output = s.output as string
    const fmt = FORMAT_BY_AGENT[s.agent_name] ?? 'md'
    const ext = fmt === 'html' ? 'html' : fmt === 'json' ? 'json' : 'md'
    const key = `artifacts/${runId}/${s.short_id}.${ext}`
    const artifactId = `${runId}:${s.short_id}`
    const artifactType =
      s.task_type && s.task_type !== 'default'
        ? s.task_type
        : ARTIFACT_TYPE_BY_AGENT[s.agent_name] ?? 'document'
    const sizeBytes = new TextEncoder().encode(output).length
    const hash = await sha256Hex(output)

    // Store the document body in R2. If the put fails, skip this artifact (don't write a dangling row).
    try {
      await env.R2.put(key, output, { httpMetadata: { contentType: contentType(fmt) } })
    } catch {
      continue
    }

    await db
      .prepare(
        `INSERT OR IGNORE INTO artifact_registry
          (id, execution_id, producing_agent, artifact_type, artifact_name,
           storage_type, storage_ref, r2_bucket, format, content_hash, size_bytes,
           quality_score, sentinel_pass, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'r2', ?, 'll-cockpit-r2', ?, ?, ?, ?, ?, 'active', ?)`,
      )
      .bind(
        artifactId,
        runId,
        s.agent_name,
        artifactType,
        s.title,
        key,
        fmt,
        hash,
        sizeBytes,
        verdict.score,
        verdict.pass,
        s.completed_at ?? now,
      )
      .run()
    written++
  }

  return written
}
