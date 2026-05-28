import type { CloudflareEnv } from '@/types'

export interface DesignBriefSectionRow {
  id: string
  brief_id: string
  subtask_short_id: string
  section_slug: string
  section_type_slug: string | null
  sort_order: number
  settings_json: string | null
  scheme_id: string | null
  status: string
  created_at: number
  updated_at: number
}

export async function listBriefSections(env: CloudflareEnv, briefId: string): Promise<DesignBriefSectionRow[]> {
  const result = await env.DB
    .prepare(
      `SELECT * FROM design_brief_sections
       WHERE brief_id = ? AND status = 'active'
       ORDER BY sort_order ASC`,
    )
    .bind(briefId)
    .all<DesignBriefSectionRow>()
  return result.results ?? []
}

export async function insertBriefSection(
  env: CloudflareEnv,
  args: {
    briefId: string
    subtaskShortId: string
    sectionSlug: string
    sectionTypeSlug: string | null
    sortOrder: number
    settingsJson?: string
  },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await env.DB
    .prepare(
      `INSERT INTO design_brief_sections
         (id, brief_id, subtask_short_id, section_slug, section_type_slug, sort_order, settings_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
       ON CONFLICT(brief_id, subtask_short_id) DO NOTHING`,
    )
    .bind(
      crypto.randomUUID(),
      args.briefId,
      args.subtaskShortId,
      args.sectionSlug,
      // section_type_slug is the hyphenated form of section_slug (matches design_section_types.slug)
      args.sectionSlug.replace(/_/g, '-'),
      args.sortOrder,
      args.settingsJson ?? null,
      now,
      now,
    )
    .run()
}

export async function markBriefSectionRemoved(
  env: CloudflareEnv,
  briefId: string,
  subtaskShortId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await env.DB
    .prepare(
      `UPDATE design_brief_sections
       SET status = 'removed', updated_at = ?
       WHERE brief_id = ? AND subtask_short_id = ?`,
    )
    .bind(now, briefId, subtaskShortId)
    .run()
}

export async function nextSortOrder(env: CloudflareEnv, briefId: string): Promise<number> {
  const row = await env.DB
    .prepare(
      `SELECT MAX(sort_order) AS max_order FROM design_brief_sections
       WHERE brief_id = ? AND status = 'active'`,
    )
    .bind(briefId)
    .first<{ max_order: number | null }>()
  return ((row?.max_order ?? 0) + 10)
}

export async function reorderBriefSections(
  env: CloudflareEnv,
  briefId: string,
  orderedShortIds: string[],
): Promise<void> {
  if (orderedShortIds.length === 0) return
  const now = Math.floor(Date.now() / 1000)
  const stmts = orderedShortIds.map((shortId, i) =>
    env.DB
      .prepare(
        `UPDATE design_brief_sections SET sort_order = ?, updated_at = ? WHERE brief_id = ? AND subtask_short_id = ?`,
      )
      .bind(i * 10, now, briefId, shortId),
  )
  await env.DB.batch(stmts)
}
