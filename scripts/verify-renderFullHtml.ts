/**
 * Golden-master characterization harness for renderFullHtml.
 *
 * Usage:
 *   npx tsx scripts/verify-renderFullHtml.ts --update   → write golden files
 *   npx tsx scripts/verify-renderFullHtml.ts            → compare against golden files
 *
 * Exit 0 if all fixtures PASS, exit 1 if any FAIL.
 */

import * as fs from 'fs'
import * as path from 'path'
import { renderFullHtml } from '../src/lib/design/pipeline'
import type { DesignTokens, DesignSection } from '../src/types'

// ─── fixtures ────────────────────────────────────────────────────────────────

interface Fixture {
  name: string
  brief: { client_name: string; business_description: string }
  tokens: DesignTokens
  sections: DesignSection[]
  skills?: string[]
  feedbackContext?: { briefId: string; iterationNumber: number | null }
}

// Fixture A — minimal: no dark palette from tokens, no serif/mono fonts, no tweaks panel.
const fixtureMinimal: Fixture = {
  name: 'minimal',
  brief: { client_name: 'Acme Co', business_description: 'Test biz' },
  tokens: {
    palette: {
      primary: '#4f46e5',
      primary_dark: '#4338ca',
      primary_light: '#818cf8',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f8fafc',
      text_primary: '#1e293b',
      text_secondary: '#475569',
      border: '#e2e8f0',
    },
    typography: {
      display_font: 'Inter',
      body_font: 'Inter',
      // no font_serif, no font_mono
    },
  },
  sections: [
    { slug: 'hero', name: 'Hero', html: '<section id="hero"><h1>Welcome to Acme</h1></section>' },
    { slug: 'about', name: 'About', html: '<section id="about"><p>About us content</p></section>' },
  ],
  skills: [],
}

// Fixture B — full: dark palette from tokens, serif/mono fonts, tweaks panel WITH feedback.
const fixtureFull: Fixture = {
  name: 'full',
  brief: { client_name: 'Beta Corp', business_description: 'Enterprise SaaS platform' },
  tokens: {
    palette: {
      primary: '#0ea5e9',
      primary_dark: '#0284c7',
      primary_light: '#38bdf8',
      accent: '#f97316',
      background: '#f8fafc',
      surface: '#ffffff',
      text_primary: '#0f172a',
      text_secondary: '#64748b',
      border: '#cbd5e1',
    },
    typography: {
      display_font: 'Playfair Display',
      body_font: 'Inter',
      font_serif: 'Lora',
      font_mono: 'JetBrains Mono',
    },
    palette_dark: {
      primary: '#38bdf8',
      accent: '#fb923c',
      background: '#0f172a',
      surface: '#1e293b',
      text_primary: '#f1f5f9',
      text_secondary: '#94a3b8',
      border: '#334155',
    },
    palette_accent_alternates: [
      { name: 'Default', hex: '#f97316' },
      { name: 'Complement', hex: '#16c5f9' },
      { name: 'Warm', hex: '#ef4444' },
      { name: 'Cool', hex: '#a855f7' },
      { name: 'Mono', hex: '#9ca3af' },
    ],
  },
  sections: [
    { slug: 'hero', name: 'Hero', html: '<section id="hero"><h1>Power your enterprise</h1></section>' },
    { slug: 'features', name: 'Features', html: '<section id="features"><h2>Key features</h2></section>' },
    { slug: 'contact', name: 'Contact', html: '<section id="contact"><h2>Get in touch</h2></section>' },
  ],
  skills: ['tweaks-panel'],
  feedbackContext: { briefId: 'test-brief-id', iterationNumber: 2 },
}

// Fixture C — tweaks-no-feedback: tweaks panel active but no feedbackContext (derived dark + accents).
const fixtureTweaksNoFeedback: Fixture = {
  name: 'tweaks-no-feedback',
  brief: { client_name: 'Gamma LLC', business_description: 'Creative agency services' },
  tokens: {
    palette: {
      primary: '#7c3aed',
      primary_dark: '#6d28d9',
      primary_light: '#a78bfa',
      accent: '#10b981',
      background: '#fafafa',
      surface: '#ffffff',
      text_primary: '#111827',
      text_secondary: '#6b7280',
      border: '#d1d5db',
    },
    typography: {
      display_font: 'Montserrat',
      body_font: 'Source Sans Pro',
      font_serif: 'Playfair Display',
      font_mono: 'Fira Code',
    },
    // No palette_dark → deriveDarkPalette() runs; no palette_accent_alternates → generateAccentAlternates() runs
  },
  sections: [
    { slug: 'hero', name: 'Hero', html: '<section id="hero"><h1>Creative solutions</h1></section>' },
    { slug: 'services', name: 'Services', html: '<section id="services"><h2>Our services</h2></section>' },
  ],
  skills: ['tweaks-panel'],
  // feedbackContext deliberately absent → panel renders v1 layout (no feedback section)
}

const FIXTURES: Fixture[] = [fixtureMinimal, fixtureFull, fixtureTweaksNoFeedback]

// ─── year scrub ──────────────────────────────────────────────────────────────

// renderFullHtml embeds `new Date().getFullYear()` in the footer copyright.
// Scrub the 4-digit year to the token YEAR so golden files are stable across years.
// Targeted replace on the copyright line only to avoid false positives elsewhere.
function scrubYear(html: string): string {
  return html.replace(
    /(© )\d{4}( )/g,
    '$1YEAR$2',
  )
}

// ─── diff helper ─────────────────────────────────────────────────────────────

function firstDiff(
  aLines: string[],
  bLines: string[],
): { lineNo: number; context: string } | null {
  const maxLen = Math.max(aLines.length, bLines.length)
  for (let i = 0; i < maxLen; i++) {
    if (aLines[i] !== bLines[i]) {
      const ctx: string[] = []
      for (let j = Math.max(0, i - 5); j <= Math.min(maxLen - 1, i + 5); j++) {
        const prefix = j === i ? '>>> ' : '    '
        const golden = aLines[j] ?? '(missing)'
        const fresh  = bLines[j] ?? '(missing)'
        ctx.push(`${prefix}L${j + 1}  GOLDEN: ${JSON.stringify(golden)}`)
        if (j === i) {
          ctx.push(`${prefix}L${j + 1}  FRESH:  ${JSON.stringify(fresh)}`)
        }
      }
      return { lineNo: i + 1, context: ctx.join('\n') }
    }
  }
  return null
}

// ─── main ────────────────────────────────────────────────────────────────────

const GOLDEN_DIR = path.join(__dirname, '__golden__')
const isUpdate = process.argv.includes('--update')
let anyFail = false

if (isUpdate) {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true })
}

for (const fixture of FIXTURES) {
  const goldenPath = path.join(GOLDEN_DIR, `renderFullHtml.${fixture.name}.html`)

  const raw = renderFullHtml({
    brief: fixture.brief,
    tokens: fixture.tokens,
    sections: fixture.sections,
    skills: fixture.skills,
    feedbackContext: fixture.feedbackContext,
  })
  const output = scrubYear(raw)

  if (isUpdate) {
    fs.writeFileSync(goldenPath, output, 'utf8')
    console.log(`WRITTEN: ${fixture.name}`)
  } else {
    if (!fs.existsSync(goldenPath)) {
      console.log(`FAIL: ${fixture.name} — golden file missing (run --update first)`)
      anyFail = true
      continue
    }
    const golden = fs.readFileSync(goldenPath, 'utf8')
    const goldenLines = golden.split('\n')
    const outputLines = output.split('\n')
    const diff = firstDiff(goldenLines, outputLines)
    if (diff) {
      console.log(`FAIL: ${fixture.name} — first diff at line ${diff.lineNo}`)
      console.log(diff.context)
      anyFail = true
    } else {
      console.log(`PASS: ${fixture.name}`)
    }
  }
}

if (!isUpdate && anyFail) process.exit(1)
