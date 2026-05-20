import type { CloudflareEnv } from '@/types'

export type SectionTypeRow = {
  id: string
  slug: string
  name: string
  category: string | null
  description: string | null
  thumbnail_url: string | null
  schema_json: string
  default_props_json: string | null
  created_at: number
}

export type SectionSetting = {
  type: 'text' | 'textarea' | 'color' | 'select' | 'toggle' | 'image_url' | 'icon'
  id: string
  label: string
  default?: string | boolean
  options?: { value: string; label?: string }[]
}

export type SectionSchema = {
  settings: SectionSetting[]
  blocks?: {
    type: string
    name: string
    limit?: number
    settings: SectionSetting[]
  }[]
}

export async function listSectionTypes(
  env: CloudflareEnv,
  opts?: { category?: string },
): Promise<SectionTypeRow[]> {
  let sql = `SELECT id, slug, name, category, description, thumbnail_url,
                    schema_json, default_props_json, created_at
             FROM design_section_types`
  const params: unknown[] = []

  if (opts?.category) {
    sql += ` WHERE category = ?`
    params.push(opts.category)
  }

  sql += ` ORDER BY category ASC, name ASC`

  const result = await env.DB.prepare(sql).bind(...params).all<SectionTypeRow>()
  return result.results ?? []
}

export async function getSectionType(
  env: CloudflareEnv,
  slug: string,
): Promise<SectionTypeRow | null> {
  return env.DB
    .prepare(`SELECT id, slug, name, category, description, thumbnail_url,
                     schema_json, default_props_json, created_at
              FROM design_section_types WHERE slug = ?`)
    .bind(slug)
    .first<SectionTypeRow>()
}
