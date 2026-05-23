/**
 * Page Templates Seeder — Sprint 119D
 *
 * Seeds 10 canonical page templates into design_page_templates.
 * Idempotent: INSERT ... ON CONFLICT(slug) DO NOTHING.
 * Concurrent firings are safe — unique constraint on slug prevents duplicates.
 */

import type { CloudflareEnv } from '@/types'

export interface PageTemplateSeedResult {
  seeded: number
  skipped: number
}

interface PageTemplateDef {
  slug: string
  name: string
  category: string
  description: string
  sections: string[]
}

const PAGE_TEMPLATES: PageTemplateDef[] = [
  {
    slug: 'saas-landing',
    name: 'SaaS Landing Page',
    category: 'saas',
    description: 'Classic SaaS conversion page with social proof and pricing.',
    sections: ['Hero', 'Logo Strip', 'Features Grid', 'Social Proof', 'Pricing Table', 'FAQ Accordion', 'CTA Banner', 'Footer Mega'],
  },
  {
    slug: 'agency-homepage',
    name: 'Agency Homepage',
    category: 'agency',
    description: 'Bold agency homepage showcasing work and credibility.',
    sections: ['Hero', 'About Split', 'Features Grid', 'Stats Bar', 'Social Proof', 'CTA Banner', 'Footer Mega'],
  },
  {
    slug: 'portfolio',
    name: 'Portfolio',
    category: 'portfolio',
    description: 'Personal or studio portfolio with featured work and contact.',
    sections: ['Hero', 'About Split', 'Features Grid', 'Social Proof', 'Contact Form', 'Footer Mega'],
  },
  {
    slug: 'product-launch',
    name: 'Product Launch',
    category: 'saas',
    description: 'Focused launch page to drive sign-ups and early adopters.',
    sections: ['Hero', 'Logo Strip', 'Features Grid', 'Social Proof', 'Pricing Table', 'CTA Banner', 'Footer Mega'],
  },
  {
    slug: 'consulting',
    name: 'Consulting',
    category: 'consulting',
    description: 'Professional consulting firm with credentials and team.',
    sections: ['Hero', 'Stats Bar', 'About Split', 'Features Grid', 'Social Proof', 'Team Grid', 'Contact Form', 'Footer Mega'],
  },
  {
    slug: 'event-landing',
    name: 'Event Landing',
    category: 'event',
    description: 'Event or conference page driving registrations.',
    sections: ['Hero', 'About Split', 'Features Grid', 'Social Proof', 'FAQ Accordion', 'CTA Banner', 'Footer Mega'],
  },
  {
    slug: 'startup-mvp',
    name: 'Startup MVP',
    category: 'saas',
    description: 'Minimal viable landing page for early-stage startups.',
    sections: ['Hero', 'Features Grid', 'Social Proof', 'CTA Banner', 'Footer Mega'],
  },
  {
    slug: 'engineering-services',
    name: 'Engineering Services',
    category: 'consulting',
    description: 'Technical services firm with specs, credentials, and RFQ.',
    sections: ['Hero', 'Features Grid', 'Stats Bar', 'Social Proof', 'FAQ Accordion', 'Contact Form', 'Footer Mega'],
  },
  {
    slug: 'local-business',
    name: 'Local Business',
    category: 'local',
    description: 'Local service business with trust signals and contact.',
    sections: ['Hero', 'About Split', 'Social Proof', 'Stats Bar', 'Contact Form', 'Footer Mega'],
  },
  {
    slug: 'coming-soon',
    name: 'Coming Soon',
    category: 'minimal',
    description: 'Minimal pre-launch page with email capture.',
    sections: ['Hero', 'Contact Form'],
  },
]

export async function seedPageTemplates(env: CloudflareEnv): Promise<{ seeded: number; skipped: number }> {
  let seeded = 0
  let skipped = 0

  for (const tpl of PAGE_TEMPLATES) {
    const id = crypto.randomUUID()
    const sections_json = JSON.stringify(tpl.sections)

    const result = await env.DB
      .prepare(
        `INSERT INTO design_page_templates
           (id, slug, name, category, description, sections_json, thumbnail_url, tags, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, unixepoch())
         ON CONFLICT(slug) DO NOTHING`,
      )
      .bind(id, tpl.slug, tpl.name, tpl.category, tpl.description, sections_json)
      .run()

    if ((result.meta?.changes ?? 0) > 0) {
      seeded++
    } else {
      skipped++
    }
  }

  return { seeded, skipped }
}
