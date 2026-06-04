import { RunnerSection, ENGINEERING_RIGOR } from '@/lib/agent-runner'

export interface RfqBrief {
  rfqText: string
  clientContext: string
  ourCapabilities: string
  constraints: string
  deadline: string
}

export const EXAMPLE_RFQ: RfqBrief = {
  rfqText: `REQUEST FOR QUOTATION — Centrifugal Pump Reliability Upgrade Program

Scope: Bidder shall perform an end-to-end reliability uplift on Train A boiler feedwater service (2 × 1500 HP API 610 BB2 pumps, ~14 years in service). Deliverables include vibration baselining, root-cause analysis of recent seal failures, recommended mechanical upgrades, installation oversight, and "improved reliability outcomes" demonstrated within a 90-day post-commissioning window.

Compliance: Work shall comply with all applicable API, ASME, and client-specific engineering standards. Drawings and engineered modifications shall be stamped by a licensed professional engineer. Bidder is responsible for ensuring continued unit availability throughout the engagement.

Schedule: Award expected within 30 days of bid submission. Mobilization within 2 weeks of award. Full program close-out within 16 weeks of mobilization.

Pricing: Lump-sum, all-inclusive. Bidder assumes all risk for scope, schedule, and outcome. No change orders accepted except for client-directed scope additions.

Bid Submission Deadline: 21 days from RFQ issue date.`,
  clientContext: 'Mid-size US refiner, ~150 KBPD capacity, in-house reliability team but no rotating-equipment specialists. Prior bad experience with a large EPC; now prefers smaller specialist firms. Decision-maker is the VP of Reliability.',
  ourCapabilities: 'Leadership Legacy Digital — engineering consultancy specializing in API 610/682 rotating equipment, ASME pressure vessel design, and AI-enabled predictive maintenance on Cloudflare edge infrastructure. Senior consultants with decades of refinery + offshore experience.',
  constraints: 'Small consultancy (founder-led, ~3 engineers). No in-house licensed PE — must subcontract stamping. Remote-first; can mobilize to site for short windows only. No EPC/construction arm. Cannot self-perform installation.',
  deadline: '21 days from RFQ issue (bid submission)',
}

export const RFQ_SECTIONS: RunnerSection[] = [
  { title: 'Requirement Breakdown',        color: 'var(--t-blue, #3b82f6)' },
  { title: 'Risks & Ambiguities',          color: 'var(--t-red, #ef4444)' },
  { title: 'Clarifying Questions',         color: 'var(--t-gold, #f59e0b)' },
  { title: 'Effort & Complexity Drivers',  color: 'var(--t-cyan, #00d4ff)' },
  { title: 'Bid Recommendation',           color: 'var(--t-green, #22c55e)' },
]

export function buildRfqPrompt(brief: RfqBrief): string {
  return `You are a seasoned engineering consultancy principal deciding whether to bid on an inbound RFQ. Analyze the RFQ critically — your job is to help the principal decide BID or NO-BID, and if BID, what must be resolved before submission.

CLIENT RFQ / SPEC TEXT:
${brief.rfqText}

CLIENT CONTEXT:
${brief.clientContext}

OUR CAPABILITIES:
${brief.ourCapabilities}

OUR CONSTRAINTS:
${brief.constraints}

BID DEADLINE:
${brief.deadline}

ANALYSIS RULES:
- Be SPECIFIC to the RFQ text provided. Quote or reference the exact language you're reacting to.
- DO NOT invent requirements not present in the RFQ. If something is missing, flag it as missing rather than assuming.
- Where the RFQ text is insufficient to assess a point, say so explicitly — that itself is a finding.
- Calibrate against OUR capabilities AND OUR constraints. A perfect-fit RFQ for a different firm may be a no-bid for us.
- Be the friction the principal needs. Surface uncomfortable truths (liability exposure, capability gaps, unrealistic terms).

Produce your analysis in EXACTLY these five sections, each with a markdown H2 header using this exact text:

## Requirement Breakdown
Decode the RFQ into a clear itemized list of what is actually being asked for — technical requirements, deliverables, compliance/standards obligations, and implied work the client may not have spelled out. Distinguish EXPLICIT requirements (in the text) from IMPLIED ones (required to deliver but not stated). Flag any explicit→implied gaps.

## Risks & Ambiguities
Flag every vague, contradictory, under-specified, or high-risk item: unclear acceptance criteria, unrealistic timelines, scope-creep traps, liability exposure (e.g. requirements that would need a PE stamp we don't have), unbounded performance guarantees, missing information. Rate each risk's severity: HIGH / MEDIUM / LOW.

## Clarifying Questions
The specific questions to ask the client BEFORE bidding — the ones whose answers most change scope, price, or feasibility. Prioritized list, most-impactful first.

## Effort & Complexity Drivers
What actually drives the cost/effort here — the hard parts, the long-lead items, the specialized expertise required, the things that determine whether the project is a 4-week job or a 4-month job. Where rough effort sizing helps, use LaTeX math notation (inline $...$, block $$...$$) to show the calculation.

## Bid Recommendation
A clear GO / NO-GO / GO-WITH-CONDITIONS recommendation, with reasoning tied to OUR capabilities and constraints.
- If GO: the win themes (why we're the right firm) and the must-resolve items before submission.
- If GO-WITH-CONDITIONS: list the conditions that must be true (or made true via clarifying questions) for the bid to make sense.
- If NO-GO: the specific reasons — capability gaps, unacceptable risk transfer, deal-breaker terms.

${ENGINEERING_RIGOR}

Write for the consultancy principal making the bid decision. Direct, specific, no hedging.`
}
