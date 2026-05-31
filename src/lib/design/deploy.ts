/**
 * Sprint 121F — Cloudflare Pages Direct Upload deploy lib.
 *
 * Deploys a brief's page_html to the shared `nexus-designs` Pages project
 * at the path /{briefId}/, yielding a public URL:
 *   https://nexus-designs.pages.dev/{briefId}/
 *
 * Prerequisites (one-time manual setup — see docs/121F-setup.md):
 *   wrangler secret put CLOUDFLARE_API_TOKEN   (scope: Account.Cloudflare Pages:Edit)
 *   wrangler secret put CLOUDFLARE_ACCOUNT_ID  (value: d3dbdd3e1ebbc28edf0ce756d9841490)
 *   Create the `nexus-designs` Pages project once in the Cloudflare dashboard.
 *
 * CF Pages Direct Upload contract (assumption documented):
 *   POST /accounts/{accountId}/pages/projects/{projectName}/deployments
 *   multipart/form-data with two parts:
 *     - "manifest": JSON string mapping file path → SHA-256 hex hash
 *     - A file part named by its SHA-256 hex hash containing the raw file bytes
 *   The API creates a deployment; the response JSON contains `id` (deployment ID).
 *   Files must be uploaded as raw bytes (not base64). Only one file needed here.
 */

import type { CloudflareEnv } from '@/types'

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const PAGES_PROJECT = 'nexus-designs'

export type DeployResult =
  | { ok: true; liveUrl: string; cfDeploymentId: string | null }
  | { ok: false; error: string; code: 'MISSING_SECRETS' | 'CF_API_ERROR' | 'NO_HTML' }

export async function deployBriefToPages(
  env: CloudflareEnv,
  opts: { briefId: string; html: string; iterationNumber: number | null },
): Promise<DeployResult> {
  const { briefId, html } = opts

  if (!html || html.trim().length === 0) {
    return { ok: false, code: 'NO_HTML', error: 'No HTML content to deploy.' }
  }

  const apiToken = env.CLOUDFLARE_API_TOKEN
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  if (!apiToken || !accountId) {
    const missing = [!apiToken && 'CLOUDFLARE_API_TOKEN', !accountId && 'CLOUDFLARE_ACCOUNT_ID']
      .filter(Boolean)
      .join(', ')
    return {
      ok: false,
      code: 'MISSING_SECRETS',
      error: `Missing Cloudflare secrets: ${missing}. Run: wrangler secret put CLOUDFLARE_API_TOKEN and wrangler secret put CLOUDFLARE_ACCOUNT_ID`,
    }
  }

  try {
    const filePath = `/${briefId}/index.html`
    const encoder = new TextEncoder()
    const fileBytes = encoder.encode(html)

    // Compute SHA-256 hex hash of the file content (used as the form field name
    // and as the manifest value per the CF Pages Direct Upload contract).
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBytes)
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const manifest: Record<string, string> = { [filePath]: hashHex }

    const form = new FormData()
    form.append('manifest', JSON.stringify(manifest))
    form.append(hashHex, new Blob([fileBytes], { type: 'text/html' }), 'index.html')

    const url = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${PAGES_PROJECT}/deployments`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}` },
      body: form,
    })

    const bodyText = await res.text()

    if (!res.ok) {
      const snippet = bodyText.slice(0, 400)
      if (res.status === 404 && snippet.includes('project')) {
        return {
          ok: false,
          code: 'CF_API_ERROR',
          error: `Pages project "${PAGES_PROJECT}" not found. Create it once in the Cloudflare Dashboard → Pages → Create a project → Direct Upload, name it "${PAGES_PROJECT}".`,
        }
      }
      return {
        ok: false,
        code: 'CF_API_ERROR',
        error: `Cloudflare Pages API returned ${res.status}: ${snippet}`,
      }
    }

    let cfDeploymentId: string | null = null
    try {
      const data = JSON.parse(bodyText) as { result?: { id?: string } }
      cfDeploymentId = data.result?.id ?? null
    } catch {
      // non-JSON success body — deployment still succeeded
    }

    const liveUrl = `https://${PAGES_PROJECT}.pages.dev/${briefId}/`
    return { ok: true, liveUrl, cfDeploymentId }
  } catch (err) {
    return {
      ok: false,
      code: 'CF_API_ERROR',
      error: `Unexpected error during deploy: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
