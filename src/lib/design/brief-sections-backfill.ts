import type { CloudflareEnv } from '@/types'
import { slugFromTitle } from './section-slug'
import { listBriefSections, insertBriefSection } from './brief-sections'

export async function backfillBriefSections(
  env: CloudflareEnv,
  briefId: string,
): Promise<{ created: number; alreadyHad: number }> {
  const existing = await listBriefSections(env, briefId)
  if (existing.length > 0) {
    return { created: 0, alreadyHad: existing.length }
  }

  // Resolve the pipeline_run_id via design_iterations.orchestrator_run_id
  const iterRow = await env.DB
    .prepare(
      `SELECT orchestrator_run_id FROM design_iterations
       WHERE brief_id = ? AND orchestrator_run_id IS NOT NULL
       ORDER BY iteration_number ASC LIMIT 1`,
    )
    .bind(briefId)
    .first<{ orchestrator_run_id: string }>()

  if (!iterRow) return { created: 0, alreadyHad: 0 }

  const subtasks = await env.DB
    .prepare(
      `SELECT short_id, title FROM agent_subtasks
       WHERE pipeline_run_id = ? AND agent_name = 'composer' AND status = 'done'
       ORDER BY short_id ASC`,
    )
    .bind(iterRow.orchestrator_run_id)
    .all<{ short_id: string; title: string }>()

  const rows = subtasks.results ?? []
  let created = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const { slug } = slugFromTitle(row.title)
    await insertBriefSection(env, {
      briefId,
      subtaskShortId: row.short_id,
      sectionSlug: slug,
      sectionTypeSlug: null,
      sortOrder: i * 10,
    })
    created++
  }

  return { created, alreadyHad: 0 }
}
