export interface LaunchBrief {
  productBrief: string
  audience: string
  launchDate: string
  constraints: string
  assets: string
}

export const EXAMPLE_BRIEF: LaunchBrief = {
  productBrief: 'NEXUS Cockpit — an AI-agent-native operations platform for engineering consultancies. Unifies finance, artifacts, SQL, and a persistent AI copilot in one Cloudflare-backed control plane.',
  audience: 'Solo technical founders and small engineering consultancies (1-10 people) who bill for expertise and want to operationalize AI agents.',
  launchDate: '2026-07-01',
  constraints: 'Bootstrapped budget. No paid ads. Founder-led distribution via LinkedIn + technical content.',
  assets: 'Working product demo, founder LinkedIn (engineering audience), a technical blog, the platform itself as proof.',
}

export function buildLaunchPrompt(brief: LaunchBrief): string {
  return `You are producing a complete go-to-market launch plan. Use the brief below.

PRODUCT BRIEF:
${brief.productBrief}

TARGET AUDIENCE:
${brief.audience}

LAUNCH DATE:
${brief.launchDate}

CONSTRAINTS:
${brief.constraints}

AVAILABLE ASSETS:
${brief.assets}

Produce your response in EXACTLY these five sections, each with a markdown H2 header using this exact text:

## Launch Plan
A prioritized, sequenced plan from now to launch date. Phases with concrete actions.

## Risk Register
The top risks to a successful launch, each with likelihood, impact, and a mitigation.

## Owner Checklist
A concrete checklist of tasks the founder must personally own, in execution order.

## Launch Copy
Ready-to-use launch announcement copy: one LinkedIn post, one email subject + body, one short tagline.

## Follow-Up Questions
3-5 sharp questions whose answers would materially improve this plan.

Be specific and actionable. No generic filler. Write for a technical founder.`
}

// Splits HERALD's full markdown response into the 5 known sections by H2 header.
export function parseLaunchSections(full: string): { title: string; body: string }[] {
  const SECTIONS = ['Launch Plan', 'Risk Register', 'Owner Checklist', 'Launch Copy', 'Follow-Up Questions']
  const result: { title: string; body: string }[] = []
  for (let i = 0; i < SECTIONS.length; i++) {
    const start = full.indexOf(`## ${SECTIONS[i]}`)
    if (start === -1) continue
    const contentStart = start + `## ${SECTIONS[i]}`.length
    const nextStarts = SECTIONS.slice(i + 1)
      .map(s => full.indexOf(`## ${s}`))
      .filter(idx => idx > start)
    const end = nextStarts.length ? Math.min(...nextStarts) : full.length
    result.push({ title: SECTIONS[i], body: full.slice(contentStart, end).trim() })
  }
  return result
}
