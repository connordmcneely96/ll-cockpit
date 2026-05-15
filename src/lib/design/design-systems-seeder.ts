/**
 * Design Systems Seeder — Sprint 18E
 *
 * Fetches DESIGN.md files from VoltAgent/awesome-design-md and seeds them
 * into our design_systems library (D1 metadata + R2 full text).
 *
 * Source: https://github.com/VoltAgent/awesome-design-md/tree/main/design-md
 * Each subdir has a DESIGN.md with YAML frontmatter we parse for metadata.
 *
 * Following VoltAgent's naming convention — they intentionally misspell
 * brand names ("Stripi Inspired" not "Stripe") for trademark safety.
 * We preserve their original names as-stored.
 *
 * Seeded as tenant_id=NULL so all users see the same library.
 * Future user-created systems will use their tenant_id.
 */

import type { CloudflareEnv } from '@/types'

const VOLTAGENT_REPO = 'VoltAgent/awesome-design-md'
const VOLTAGENT_BRANCH = 'main'
const VOLTAGENT_RAW_BASE = `https://raw.githubusercontent.com/${VOLTAGENT_REPO}/${VOLTAGENT_BRANCH}/design-md`
const VOLTAGENT_API_BASE = `https://api.github.com/repos/${VOLTAGENT_REPO}/contents/design-md`

interface DesignSystemFrontmatter {
  version?: string
  name?: string
  description?: string
  colors?: Record<string, string>
}

export interface SeedResult {
  seeded: number
  skipped: number
  failed: number
  errors: string[]
}

/**
 * Minimal YAML frontmatter parser — extracts the leading --- block and
 * pulls the fields we care about. Handles nested colors{} dict via simple
 * line iteration. Avoids pulling in a full YAML parser dependency.
 */
function parseFrontmatter(md: string): DesignSystemFrontmatter | null {
  if (!md.startsWith('---')) return null
  const end = md.indexOf('\n---', 3)
  if (end === -1) return null
  const fm = md.slice(3, end)
  const out: DesignSystemFrontmatter = {}
  const lines = fm.split('\n')
  let inColors = false
  const colors: Record<string, string> = {}

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line) continue

    if (line.startsWith('colors:')) {
      inColors = true
      continue
    }

    if (inColors) {
      // Indented color entries like:  primary: "#533afd"
      const m = line.match(/^\s+([a-z0-9_-]+):\s*"?([^"]+)"?\s*$/i)
      if (m) {
        colors[m[1]] = m[2]
        continue
      }
      // Non-indented = exited the colors block
      if (!line.startsWith(' ') && !line.startsWith('\t')) {
        inColors = false
      }
    }

    if (line.startsWith('version:')) {
      out.version = line.slice(8).trim().replace(/^["']|["']$/g, '')
    } else if (line.startsWith('name:')) {
      out.name = line.slice(5).trim().replace(/^["']|["']$/g, '')
    } else if (line.startsWith('description:')) {
      out.description = line.slice(12).trim().replace(/^["']|["']$/g, '')
    }
  }

  if (Object.keys(colors).length > 0) out.colors = colors
  return out
}

/**
 * Heuristic category classifier — pattern-matches the description against
 * known keywords. Cheap, no LLM call needed for seeding.
 */
function classifyCategory(slug: string, description: string): string {
  const text = `${slug} ${description}`.toLowerCase()

  if (/\b(crypto|exchange|coinbase|kraken|binance|stripe|payment|fintech|bank|revolut|wise|mastercard)\b/.test(text)) {
    return 'fintech'
  }
  if (/\b(ai|llm|model|cohere|mistral|ollama|elevenlabs|anthropic|claude|gpt|together)\b/.test(text)) {
    return 'ai-llm'
  }
  if (/\b(developer|code|github|vercel|cursor|expo|warp|raycast|terminal|ide)\b/.test(text)) {
    return 'dev-tools'
  }
  if (/\b(figma|framer|webflow|miro|design|creative|airtable)\b/.test(text)) {
    return 'creative'
  }
  if (/\b(linear|notion|cal|zapier|intercom|productivity|saas|workspace)\b/.test(text)) {
    return 'productivity'
  }
  if (/\b(supabase|mongo|sentry|posthog|database|backend|devops|hashicorp|clickhouse|sanity)\b/.test(text)) {
    return 'backend'
  }
  if (/\b(airbnb|nike|shopify|meta|retail|commerce)\b/.test(text)) {
    return 'ecommerce'
  }
  if (/\b(bmw|tesla|ferrari|lamborghini|bugatti|renault|automotive)\b/.test(text)) {
    return 'automotive'
  }
  if (/\b(spotify|pinterest|wired|verge|playstation|apple|spacex|nvidia|ibm|vodafone|uber|consumer|media)\b/.test(text)) {
    return 'consumer-media'
  }
  return 'other'
}

/**
 * Auto-tag from description keywords. Multi-label.
 */
function extractTags(description: string): string[] {
  const text = description.toLowerCase()
  const tags: string[] = []
  const checks: Array<[RegExp, string]> = [
    [/\b(dark|cinematic|noir|black)\b/, 'dark'],
    [/\b(minimal|clean|simple|austerity|stark)\b/, 'minimal'],
    [/\b(bold|vibrant|playful|colorful)\b/, 'vibrant'],
    [/\b(premium|luxury|elegant|editorial)\b/, 'premium'],
    [/\b(monochrome|monochromatic|black and white)\b/, 'monochrome'],
    [/\b(gradient|mesh)\b/, 'gradient'],
    [/\b(brutalist|monumental|uppercase)\b/, 'brutalist'],
    [/\b(warm|cream|terracotta|coral)\b/, 'warm'],
    [/\b(technical|engineering|data|dashboard)\b/, 'technical'],
    [/\b(serif|editorial|magazine)\b/, 'editorial'],
  ]
  for (const [re, tag] of checks) {
    if (re.test(text)) tags.push(tag)
  }
  return tags
}

/**
 * Fetch the list of brand subdirectories from VoltAgent's repo.
 */
async function fetchBrandList(): Promise<string[]> {
  const res = await fetch(VOLTAGENT_API_BASE, {
    headers: {
      'User-Agent': 'NEXUS-Design-Vertical-Seeder',
      'Accept': 'application/vnd.github+json',
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  }
  const data = (await res.json()) as Array<{ type: string; name: string }>
  return data.filter((d) => d.type === 'dir').map((d) => d.name)
}

/**
 * Fetch a single DESIGN.md.
 */
async function fetchDesignMd(slug: string): Promise<string> {
  const url = `${VOLTAGENT_RAW_BASE}/${slug}/DESIGN.md`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NEXUS-Design-Vertical-Seeder' },
  })
  if (!res.ok) throw new Error(`Fetch ${url} → ${res.status}`)
  return res.text()
}

/**
 * Main seeder. Idempotent — skips slugs that already exist for tenant_id=NULL.
 */
export async function seedDesignSystems(env: CloudflareEnv): Promise<SeedResult> {
  const result: SeedResult = { seeded: 0, skipped: 0, failed: 0, errors: [] }
  let brands: string[]
  try {
    brands = await fetchBrandList()
  } catch (err) {
    result.errors.push(`brand list fetch: ${err instanceof Error ? err.message : String(err)}`)
    return result
  }

  for (const slug of brands) {
    try {
      // Skip if already seeded for tenant_id=NULL (system-wide)
      const existing = await env.DB
        .prepare(`SELECT id FROM design_systems WHERE slug = ? AND tenant_id IS NULL LIMIT 1`)
        .bind(slug)
        .first<{ id: string }>()
      if (existing) {
        result.skipped++
        continue
      }

      const md = await fetchDesignMd(slug)
      const fm = parseFrontmatter(md)
      if (!fm || !fm.name) {
        result.failed++
        result.errors.push(`${slug}: no parseable frontmatter`)
        continue
      }

      const description = fm.description ?? ''
      const primaryColor =
        fm.colors?.primary ??
        fm.colors?.['primary-1'] ??
        fm.colors?.brand ??
        fm.colors?.accent ??
        '#000000'

      const category = classifyCategory(slug, description)
      const tags = extractTags(description)
      const r2Key = `design-systems/${slug}/DESIGN.md`
      const id = crypto.randomUUID()
      const now = Math.floor(Date.now() / 1000)

      // Write full markdown to R2
      await env.R2.put(r2Key, md, {
        httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
        customMetadata: {
          source: 'voltagent/awesome-design-md',
          slug,
          seeded_at: String(now),
        },
      })

      // Write metadata to D1
      await env.DB
        .prepare(
          `INSERT INTO design_systems
           (id, slug, name, description, category, primary_color, tags,
            source_url, r2_key, tenant_id, user_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(
          id,
          slug,
          fm.name,
          description,
          category,
          primaryColor,
          JSON.stringify(tags),
          `https://github.com/${VOLTAGENT_REPO}/tree/${VOLTAGENT_BRANCH}/design-md/${slug}`,
          r2Key,
          now,
          now,
        )
        .run()

      result.seeded++
    } catch (err) {
      result.failed++
      result.errors.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}
