import { RunnerSection } from '@/lib/agent-runner'

export interface ProposalBrief {
  clientName: string
  projectDescription: string
  requirements: string
  budget: string
  timeline: string
  companyBackground: string
}

export const EXAMPLE_PROPOSAL: ProposalBrief = {
  clientName: 'Offshore Operations Ltd',
  projectDescription: 'AI-assisted predictive maintenance platform for rotating equipment across 3 offshore platforms. Integrates vibration sensors, historian data, and CMMS.',
  requirements: 'Real-time anomaly detection, work order integration with SAP PM, mobile technician app, ATEX zone 1 compliant edge hardware, 99.5% uptime SLA.',
  budget: '$280,000–$350,000 USD for Phase 1 (12 months)',
  timeline: 'Kick-off Q3 2026, Phase 1 go-live Q2 2027, Phase 2 (additional platforms) Q4 2027',
  companyBackground: 'Leadership Legacy Digital — AI-native engineering consultancy. Specialists in industrial AI, Cloudflare edge infrastructure, and API 610/682 rotating equipment.',
}

export const PROPOSAL_SECTIONS: RunnerSection[] = [
  { title: 'Executive Summary',          color: 'var(--t-blue, #3b82f6)' },
  { title: 'Scope of Work',              color: 'var(--t-gold, #f59e0b)' },
  { title: 'Deliverables & Milestones',  color: 'var(--t-green, #22c55e)' },
  { title: 'Commercial Terms',           color: 'var(--t-cyan, #00d4ff)' },
  { title: 'Assumptions & Exclusions',   color: 'var(--t-tx2, #94a3b8)' },
]

export function buildProposalPrompt(brief: ProposalBrief): string {
  return `You are generating a professional engineering services proposal / RFQ response.

CLIENT:
${brief.clientName}

PROJECT DESCRIPTION:
${brief.projectDescription}

REQUIREMENTS:
${brief.requirements}

BUDGET:
${brief.budget}

TIMELINE:
${brief.timeline}

COMPANY BACKGROUND:
${brief.companyBackground}

Produce the proposal in EXACTLY these five sections, each with a markdown H2 header using this exact text:

## Executive Summary
2-3 paragraph executive summary: client problem, proposed solution, why this company is the right partner, headline outcome.

## Scope of Work
Detailed scope: phases, work packages, technical approach. Call out specific technologies and methodologies. What is IN scope.

## Deliverables & Milestones
Milestone-based delivery table: milestone name, deliverable, success criteria, target date. At minimum 4 milestones.

## Commercial Terms
Pricing structure (fixed-fee, T&M, or hybrid), payment schedule, rate card if applicable, retainer terms, expense policy.

## Assumptions & Exclusions
List explicit assumptions made and what is OUT of scope to prevent scope creep. 5+ items each.

Where commercial figures, rates, or timelines involve calculations, you may use LaTeX math notation ($...$) for clarity; otherwise plain professional prose.

Write as a premium engineering consultancy. Be specific, credible, and commercial. No boilerplate filler.`
}
