import type { CloudflareEnv } from '@/types'
import { engineeringPack } from './domain-packs/engineering'

export async function seedEngineeringPack(env: CloudflareEnv): Promise<{ seeded: number; skipped: number }> {
  let seeded = 0
  let skipped = 0
  const now = Math.floor(Date.now() / 1000)

  for (const block of engineeringPack) {
    const meta = await env.DB.prepare(
      `INSERT INTO design_section_types
         (id, slug, name, category, description, thumbnail_url,
          schema_json, default_props_json, source, render_strategy,
          template_html, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name,
         category = excluded.category,
         description = excluded.description,
         schema_json = excluded.schema_json,
         default_props_json = excluded.default_props_json,
         render_strategy = excluded.render_strategy,
         template_html = excluded.template_html`,
    )
      .bind(
        crypto.randomUUID(),
        block.slug,
        block.name,
        block.category,
        block.description,
        block.schema_json,
        block.default_props_json,
        'domain-pack:engineering',
        block.render_strategy,
        block.template_html,
        now,
      )
      .run()

    if ((meta.meta?.changes ?? 0) > 0) seeded++
    else skipped++
  }

  return { seeded, skipped }
}
