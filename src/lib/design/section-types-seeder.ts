/**
 * Section Types Seeder — Sprint 119A
 *
 * Seeds the 12 canonical section types into design_section_types.
 * Idempotent: INSERT ... ON CONFLICT(slug) DO NOTHING.
 * Concurrent firings are safe — the unique constraint on slug prevents duplicates.
 */

import type { CloudflareEnv } from '@/types'
import type { SectionSchema, SectionSetting } from './section-types'

export interface SeedResult {
  seeded: number
  skipped: number
  failed: number
  errors: string[]
}

interface SectionTypeDef {
  slug: string
  name: string
  category: string
  description: string
  schema: SectionSchema
}

function defaultsFromSettings(settings: SectionSetting[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (const s of settings) {
    if (s.default !== undefined) {
      out[s.id] = s.default
    } else if (s.type === 'toggle') {
      out[s.id] = false
    } else if (s.type === 'select' && s.options && s.options.length > 0) {
      out[s.id] = s.options[0].value
    } else {
      out[s.id] = ''
    }
  }
  return out
}

const SECTION_TYPES: SectionTypeDef[] = [
  {
    slug: 'hero-banner',
    name: 'Hero Banner',
    category: 'hero',
    description: 'Full-width hero section with headline, subheading, optional CTA button, and background image.',
    schema: {
      settings: [
        { type: 'text', id: 'heading', label: 'Heading', default: 'Welcome to Our Platform' },
        { type: 'textarea', id: 'subheading', label: 'Subheading', default: 'The solution built for your success.' },
        { type: 'color', id: 'bg_color', label: 'Background Color', default: '#0a0e1a' },
        {
          type: 'select', id: 'layout', label: 'Layout', default: 'centered',
          options: [
            { value: 'centered', label: 'Centered' },
            { value: 'left-aligned', label: 'Left Aligned' },
            { value: 'split', label: 'Split' },
          ],
        },
        { type: 'image_url', id: 'image', label: 'Background Image', default: '' },
        { type: 'toggle', id: 'show_cta', label: 'Show CTA Button', default: true },
        { type: 'text', id: 'cta_text', label: 'CTA Button Text', default: 'Get Started' },
        { type: 'text', id: 'cta_url', label: 'CTA Button URL', default: '#' },
      ],
    },
  },
  {
    slug: 'features-grid',
    name: 'Features Grid',
    category: 'features',
    description: 'Responsive grid of feature cards, each with an icon, title, and description.',
    schema: {
      settings: [
        { type: 'text', id: 'heading', label: 'Section Heading', default: 'Why Choose Us' },
        {
          type: 'select', id: 'columns', label: 'Columns', default: '3',
          options: [
            { value: '2', label: '2 Columns' },
            { value: '3', label: '3 Columns' },
            { value: '4', label: '4 Columns' },
          ],
        },
      ],
      blocks: [
        {
          type: 'feature-card',
          name: 'Feature Card',
          limit: 6,
          settings: [
            { type: 'text', id: 'title', label: 'Feature Title', default: '' },
            { type: 'textarea', id: 'description', label: 'Description', default: '' },
            { type: 'icon', id: 'icon', label: 'Icon', default: '' },
          ],
        },
      ],
    },
  },
  {
    slug: 'social-proof',
    name: 'Social Proof',
    category: 'social-proof',
    description: 'Testimonials section with grid or carousel layout displaying client quotes and attribution.',
    schema: {
      settings: [
        { type: 'text', id: 'heading', label: 'Section Heading', default: 'What Our Clients Say' },
        {
          type: 'select', id: 'layout', label: 'Layout', default: 'grid',
          options: [
            { value: 'grid', label: 'Grid' },
            { value: 'carousel', label: 'Carousel' },
          ],
        },
      ],
      blocks: [
        {
          type: 'testimonial',
          name: 'Testimonial',
          limit: 9,
          settings: [
            { type: 'textarea', id: 'quote', label: 'Quote', default: '' },
            { type: 'text', id: 'author', label: 'Author Name', default: '' },
            { type: 'text', id: 'role', label: 'Role / Company', default: '' },
            { type: 'image_url', id: 'avatar', label: 'Avatar Image', default: '' },
          ],
        },
      ],
    },
  },
  {
    slug: 'pricing-table',
    name: 'Pricing Table',
    category: 'pricing',
    description: 'Tiered pricing section with plan cards, optional billing toggle, and feature lists.',
    schema: {
      settings: [
        { type: 'text', id: 'heading', label: 'Section Heading', default: 'Simple, Transparent Pricing' },
        { type: 'toggle', id: 'billing_toggle', label: 'Show Annual / Monthly Toggle', default: false },
      ],
      blocks: [
        {
          type: 'plan',
          name: 'Pricing Plan',
          limit: 4,
          settings: [
            { type: 'text', id: 'name', label: 'Plan Name', default: '' },
            { type: 'text', id: 'price', label: 'Price', default: '' },
            { type: 'text', id: 'period', label: 'Billing Period', default: '/month' },
            { type: 'textarea', id: 'features', label: 'Features (one per line)', default: '' },
            { type: 'text', id: 'cta_text', label: 'CTA Button Text', default: 'Get Started' },
            { type: 'toggle', id: 'highlighted', label: 'Highlighted / Featured', default: false },
          ],
        },
      ],
    },
  },
  {
    slug: 'about-split',
    name: 'About Split',
    category: 'about',
    description: 'Two-column about section with body copy on one side and a supporting image on the other.',
    schema: {
      settings: [
        { type: 'text', id: 'heading', label: 'Heading', default: 'About Us' },
        { type: 'textarea', id: 'body', label: 'Body Copy', default: '' },
        { type: 'image_url', id: 'image', label: 'Image', default: '' },
        {
          type: 'select', id: 'image_side', label: 'Image Position', default: 'left',
          options: [
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ],
        },
      ],
    },
  },
  {
    slug: 'stats-bar',
    name: 'Stats Bar',
    category: 'social-proof',
    description: 'Horizontal bar of bold numeric statistics to establish credibility and scale.',
    schema: {
      settings: [
        { type: 'color', id: 'bg_color', label: 'Background Color', default: '#111827' },
      ],
      blocks: [
        {
          type: 'stat',
          name: 'Stat',
          limit: 4,
          settings: [
            { type: 'text', id: 'value', label: 'Value', default: '' },
            { type: 'text', id: 'label', label: 'Label', default: '' },
          ],
        },
      ],
    },
  },
  {
    slug: 'cta-banner',
    name: 'CTA Banner',
    category: 'cta',
    description: 'Full-width call-to-action banner with heading, subheading, and a prominent button.',
    schema: {
      settings: [
        { type: 'text', id: 'heading', label: 'Heading', default: 'Ready to Get Started?' },
        { type: 'textarea', id: 'subheading', label: 'Subheading', default: '' },
        { type: 'text', id: 'cta_text', label: 'Button Text', default: 'Contact Us' },
        { type: 'text', id: 'cta_url', label: 'Button URL', default: '#' },
        { type: 'color', id: 'bg_color', label: 'Background Color', default: '#00d4ff' },
      ],
    },
  },
  {
    slug: 'faq-accordion',
    name: 'FAQ Accordion',
    category: 'faq',
    description: 'Expandable accordion of question-and-answer pairs for frequently asked questions.',
    schema: {
      settings: [
        { type: 'text', id: 'heading', label: 'Section Heading', default: 'Frequently Asked Questions' },
      ],
      blocks: [
        {
          type: 'qa',
          name: 'Q&A Item',
          limit: 12,
          settings: [
            { type: 'text', id: 'question', label: 'Question', default: '' },
            { type: 'textarea', id: 'answer', label: 'Answer', default: '' },
          ],
        },
      ],
    },
  },
  {
    slug: 'team-grid',
    name: 'Team Grid',
    category: 'team',
    description: 'Responsive grid of team member cards with photo, name, role, and bio.',
    schema: {
      settings: [
        { type: 'text', id: 'heading', label: 'Section Heading', default: 'Meet the Team' },
        {
          type: 'select', id: 'columns', label: 'Columns', default: '3',
          options: [
            { value: '2', label: '2 Columns' },
            { value: '3', label: '3 Columns' },
            { value: '4', label: '4 Columns' },
          ],
        },
      ],
      blocks: [
        {
          type: 'member',
          name: 'Team Member',
          limit: 12,
          settings: [
            { type: 'text', id: 'name', label: 'Name', default: '' },
            { type: 'text', id: 'role', label: 'Role / Title', default: '' },
            { type: 'image_url', id: 'photo', label: 'Photo', default: '' },
            { type: 'textarea', id: 'bio', label: 'Short Bio', default: '' },
          ],
        },
      ],
    },
  },
  {
    slug: 'logo-strip',
    name: 'Logo Strip',
    category: 'social-proof',
    description: 'Horizontal strip of partner or client logos to build trust through association.',
    schema: {
      settings: [
        { type: 'text', id: 'heading', label: 'Heading', default: 'Trusted By' },
      ],
      blocks: [
        {
          type: 'logo',
          name: 'Logo',
          limit: 12,
          settings: [
            { type: 'image_url', id: 'image', label: 'Logo Image', default: '' },
            { type: 'text', id: 'alt', label: 'Alt Text', default: '' },
          ],
        },
      ],
    },
  },
  {
    slug: 'contact-form',
    name: 'Contact Form',
    category: 'cta',
    description: 'Simple contact form section with configurable heading, submit button, and success message.',
    schema: {
      settings: [
        { type: 'text', id: 'heading', label: 'Heading', default: 'Get In Touch' },
        { type: 'text', id: 'submit_text', label: 'Submit Button Text', default: 'Send Message' },
        { type: 'text', id: 'success_message', label: 'Success Message', default: "Thank you! We'll be in touch soon." },
      ],
    },
  },
  {
    slug: 'footer-mega',
    name: 'Footer Mega',
    category: 'footer',
    description: 'Multi-column mega footer with company branding, link columns, and copyright notice.',
    schema: {
      settings: [
        { type: 'text', id: 'company_name', label: 'Company Name', default: '' },
        { type: 'text', id: 'tagline', label: 'Tagline', default: '' },
        { type: 'text', id: 'copyright', label: 'Copyright Text', default: '' },
      ],
      blocks: [
        {
          type: 'link-column',
          name: 'Link Column',
          limit: 4,
          settings: [
            { type: 'text', id: 'title', label: 'Column Title', default: '' },
            { type: 'textarea', id: 'links', label: 'Links (one per line, format: Label|URL)', default: '' },
          ],
        },
      ],
    },
  },
]

export async function seedSectionTypes(env: CloudflareEnv): Promise<SeedResult> {
  const result: SeedResult = { seeded: 0, skipped: 0, failed: 0, errors: [] }
  const now = Math.floor(Date.now() / 1000)

  for (const def of SECTION_TYPES) {
    try {
      const schemaJson = JSON.stringify(def.schema)
      const defaultProps = defaultsFromSettings(def.schema.settings)
      const defaultPropsJson = JSON.stringify(defaultProps)
      const id = crypto.randomUUID()

      const { meta } = await env.DB
        .prepare(
          `INSERT INTO design_section_types
           (id, slug, name, category, description, thumbnail_url,
            schema_json, default_props_json, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
           ON CONFLICT(slug) DO NOTHING`,
        )
        .bind(id, def.slug, def.name, def.category, def.description, schemaJson, defaultPropsJson, now)
        .run()

      if (meta.changes > 0) {
        result.seeded++
      } else {
        result.skipped++
      }
    } catch (err) {
      result.failed++
      result.errors.push(`${def.slug}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}
