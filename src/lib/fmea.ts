import { RunnerSection, ENGINEERING_RIGOR } from '@/lib/agent-runner'

export interface FmeaBrief {
  equipment: string
  failureModes: string
  operationalContext: string
  criticality: string
  history: string
}

export const EXAMPLE_FMEA: FmeaBrief = {
  equipment: 'API 610 BB2 centrifugal pump, 1000 HP, 3550 RPM, handling sour crude at 200°F',
  failureModes: 'Mechanical seal failure, bearing overheating, impeller cavitation, shaft deflection',
  operationalContext: 'Continuous duty, offshore platform, high H2S environment, redundant standby pump available',
  criticality: 'Production-critical — pump failure causes full unit shutdown. Safety risk due to H2S release potential.',
  history: 'Two mechanical seal failures in past 18 months. Last failure caused 6-hour downtime. Vibration trending high on DE bearing.',
}

export const FMEA_SECTIONS: RunnerSection[] = [
  { title: 'Failure Modes & Effects',   color: 'var(--t-blue, #3b82f6)' },
  { title: 'Critical Items',            color: 'var(--t-red, #ef4444)' },
  { title: 'Recommended Actions',       color: 'var(--t-gold, #f59e0b)' },
  { title: 'Detection & Monitoring',    color: 'var(--t-cyan, #00d4ff)' },
  { title: 'Open Questions',            color: 'var(--t-tx2, #94a3b8)' },
]

export function buildFmeaPrompt(brief: FmeaBrief): string {
  return `You are performing a Failure Mode and Effects Analysis (FMEA) and 8D root-cause investigation.

EQUIPMENT / SYSTEM:
${brief.equipment}

KNOWN OR SUSPECTED FAILURE MODES:
${brief.failureModes}

OPERATIONAL CONTEXT:
${brief.operationalContext}

CRITICALITY:
${brief.criticality}

FAILURE HISTORY & SYMPTOMS:
${brief.history}

Produce your analysis in EXACTLY these five sections, each with a markdown H2 header using this exact text. You MUST include all five sections below with their exact headers, even if a section is brief. Do not merge or omit sections.

## Failure Modes & Effects
For each failure mode: mechanism, effect on system, severity (1-10), occurrence likelihood (1-10), detectability (1-10), RPN = S×O×D. Present as structured list.

## Critical Items
Top failure modes by RPN (threshold RPN ≥ 100 or severity ≥ 8). Explain why each is critical. Safety and production impact.

## Recommended Actions
Corrective and preventive actions prioritized by RPN. Owner role, suggested timeline, expected RPN after action.

## Detection & Monitoring
Condition monitoring plan: sensors, inspection intervals, vibration/temperature thresholds, alarm setpoints. Flag any gaps.

## Open Questions
3-5 engineering questions whose answers would materially change the FMEA. Include data gaps and assumptions made.

Express all quantitative relationships and calculations using LaTeX math notation: inline math wrapped in single dollar signs, block equations in double dollar signs. For example, render the RPN formula as $RPN = S \\times O \\times D$ and show computed values like $RPN = 8 \\times 6 \\times 4 = 192$. Use LaTeX for any stress, flow, or dimensional calculations.

${ENGINEERING_RIGOR}

Be specific. Reference equipment standards where applicable (API 610, API 682, ISO 13709). No generic filler.`
}
