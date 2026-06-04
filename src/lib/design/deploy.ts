/**
 * Sprint 121F-R2 — Publish a brief to R2 for the nexus-sites serving Worker.
 *
 * Replaces the prior Cloudflare Pages Direct Upload approach (torn out: it had a
 * 100-project account ceiling, every deployment replaced the whole site, and it
 * returned 500 on a sole nested asset — structurally unfit for multi-tenant hosting).
 *
 * Model: the nexus-sites Worker (https://nexus-sites.connorpattern.workers.dev) serves
 * GET /{slug}/ by streaming the R2 object `published/{slug}/index.html` from ll-cockpit-r2.
 * Deploy here = write that object. Publish-gated: only deployed briefs ever land in the
 * `published/` namespace, so unpublished briefs are unreachable. No Cloudflare management
 * API, no CLOUDFLARE_API_TOKEN — the R2 binding does the write.
 */

import type { CloudflareEnv } from '@/types'

const NEXUS_SITES_BASE = 'https://nexus-sites.connorpattern.workers.dev'

export type DeployResult =
  | { ok: true; liveUrl: string; slug: string }
  | { ok: false; error: string; code: 'NO_HTML' | 'R2_ERROR' | 'SLUG_ERROR' }

/**
 * Slugify a client name into a URL-safe slug: lowercase, alphanumeric + hyphens,
 * collapsed/trimmed hyphens, max 40 chars. Falls back to 'site' if empty.
 */
function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/g, '')
  return base.length > 0 ? base : 'site'
}

/**
 * Resolve the slug for a brief.
 * - If the brief already has a deployment with a slug, reuse it (stable redeploys
 *   republish to the SAME url).
 * - Otherwise derive from clientName and ensure uniqueness across design_deployments:
 *   on collision with a DIFFERENT brief, append a briefId fragment of growing length.
 */
export async function resolveSlugForBrief(
  env: CloudflareEnv,
  briefId: string,
  clientName: string,
): Promise<string> {
  // Reuse existing slug for this brief if present (stable redeploys).
  const existing = await env.DB
    .prepare(
      `SELECT slug FROM design_deployments WHERE brief_id = ? AND slug IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(briefId)
    .first<{ slug: string }>()
  if (existing?.slug) return existing.slug

  const base = slugify(clientName)

  // Is the base slug free, or already owned by THIS brief? Then it's usable.
  const clash = await env.DB
    .prepare(`SELECT brief_id FROM design_deployments WHERE slug = ? LIMIT 1`)
    .bind(base)
    .first<{ brief_id: string }>()
  if (!clash || clash.brief_id === briefId) return base

  // Collision with a different brief — append growing briefId fragments until unique.
  const briefFragment = briefId.replace(/-/g, '')
  for (let len = 6; len <= briefFragment.length; len += 2) {
    const candidate = `${base}-${briefFragment.slice(0, len)}`
    const taken = await env.DB
      .prepare(`SELECT brief_id FROM design_deployments WHERE slug = ? LIMIT 1`)
      .bind(candidate)
      .first<{ brief_id: string }>()
    if (!taken || taken.brief_id === briefId) return candidate
  }

  // Exhausted fragments (astronomically unlikely) — full briefId guarantees uniqueness.
  return `${base}-${briefFragment}`
}

export async function publishBriefToR2(
  env: CloudflareEnv,
  opts: { briefId: string; html: string; iterationNumber: number | null; clientName: string },
): Promise<DeployResult> {
  const { briefId, html, clientName } = opts

  if (!html || html.trim().length === 0) {
    return { ok: false, code: 'NO_HTML', error: 'No HTML content to deploy.' }
  }

  let slug: string
  try {
    slug = await resolveSlugForBrief(env, briefId, clientName)
  } catch (err) {
    return {
      ok: false,
      code: 'SLUG_ERROR',
      error: `Failed to resolve slug: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  try {
    await env.R2.put(`published/${slug}/index.html`, html, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
    })
  } catch (err) {
    return {
      ok: false,
      code: 'R2_ERROR',
      error: `Failed to publish to R2: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return { ok: true, liveUrl: `${NEXUS_SITES_BASE}/${slug}/`, slug }
}
