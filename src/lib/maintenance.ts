import { RunnerSection, ENGINEERING_RIGOR } from '@/lib/agent-runner'

export interface MaintenanceBrief {
  asset: string
  operatingProfile: string
  failureHistory: string
  criticality: string
  currentProgram: string
}

export const EXAMPLE_MAINTENANCE: MaintenanceBrief = {
  asset: 'API 610 BB2 boiler feedwater pump — 1500 HP, 3550 RPM, 14 years in service. Sleeve bearings, single mechanical seal, flexible disc coupling, induction motor with VFD.',
  operatingProfile: 'Continuous duty (8,400+ run hours/year). Variable load 60–95% BEP via VFD. Pumped fluid: deaerated boiler feedwater, 280°F, 1450 psi discharge. Indoor refinery utility building, ambient 90–105°F.',
  failureHistory: 'Three mechanical seal failures in the last 30 months (avg interval ~10 months). Two outboard bearing replacements at 36k and 48k run hours (last bearing failure preceded by 6 weeks of trending vibration on the DE). One coupling alignment-related shaft rub event after a maintenance-induced misalignment.',
  criticality: 'Production-critical: feeds the high-pressure steam header serving the CDU charge heater. No installed standby. Failure causes a forced unit slowdown within ~30 minutes; full shutdown within 2 hours. Safety risk: high-energy hot water release on catastrophic seal failure.',
  currentProgram: 'Calendar-based PM only: quarterly bearing greasing, annual visual inspection, mechanical seal replaced on failure. No vibration program, no oil analysis, no performance trending. Spares: one shelved mechanical seal kit; bearings not stocked (8-week lead time).',
}

export const MAINTENANCE_SECTIONS: RunnerSection[] = [
  { title: 'Criticality Assessment',            color: 'var(--t-red, #ef4444)' },
  { title: 'Maintenance Strategy by Component', color: 'var(--t-blue, #3b82f6)' },
  { title: 'PM Tasks & Intervals',              color: 'var(--t-green, #22c55e)' },
  { title: 'Condition Monitoring Plan',         color: 'var(--t-cyan, #00d4ff)' },
  { title: 'Spares & Recommendations',          color: 'var(--t-gold, #f59e0b)' },
]

export function buildMaintenancePrompt(brief: MaintenanceBrief): string {
  return `You are a senior reliability engineer applying Reliability-Centered Maintenance (RCM) principles to build a maintenance and condition-monitoring program for the asset described below.

ASSET:
${brief.asset}

OPERATING PROFILE:
${brief.operatingProfile}

FAILURE HISTORY:
${brief.failureHistory}

CRITICALITY:
${brief.criticality}

CURRENT MAINTENANCE PROGRAM:
${brief.currentProgram}

ANALYSIS RULES:
- Reason as a reliability engineer applying RCM logic: for each major component, decide between run-to-failure, time-based, or condition-based maintenance based on consequence of failure AND whether the failure pattern is age-related or random.
- Be SPECIFIC to the asset and operating profile provided. Reference operating hours, fluid, temperatures, run history.
- Cite relevant standards where appropriate — API 610 / 682 for rotating equipment, ISO 18436 / ISO 17359 for condition monitoring, ASME for pressure-bearing components, OEM bulletins where you would normally consult them.
- DO NOT invent failure history or operating data not in the brief. If a recommendation depends on missing information, flag the assumption.
- Be specific about intervals, thresholds, and actions — not generic "monitor regularly" hand-waving.

Produce your plan in EXACTLY these five sections, each with a markdown H2 header using this exact text:

## Criticality Assessment
Assess the consequence AND likelihood of failure for the asset and its major components. Establish a criticality ranking (e.g. CRITICAL / IMPORTANT / STANDARD) tied to production impact, safety, and environmental risk from the brief. This ranking drives every downstream decision.

## Maintenance Strategy by Component
For each major component (bearings, mechanical seal, coupling, motor windings, lubrication system, etc.), recommend a maintenance philosophy: run-to-failure (RTF), time-based / preventive (TBM), or condition-based / predictive (CBM). Justify each choice with RCM logic — failure pattern (age-related vs random), consequence of failure, and detectability.

## PM Tasks & Intervals
Concrete preventive maintenance tasks with recommended intervals (operating hours, cycles, or calendar) — not vague guidance. Where interval logic involves calculations (e.g. bearing $L_{10}$ life, lubrication regrease intervals, seal flush flow rates), show the math inline using LaTeX notation: inline $...$ and block $$...$$ for sized formulas.

## Condition Monitoring Plan
For each parameter (vibration, oil analysis, thermography, performance trending, alignment, etc.): what to measure, where to mount sensors / take samples, alarm and alert thresholds, inspection frequency, and the failure mode each technique addresses. Reference ISO 18436 or equivalent where applicable.

## Spares & Recommendations
Critical spares to hold (with justification tied to criticality + lead time from the brief), and a prioritized list of reliability-improvement recommendations (installed spare, upgraded seal flush plan, vibration baseline, etc.) — sequenced by impact-per-effort.

${ENGINEERING_RIGOR}

Write for a maintenance / reliability manager. Direct, technically grounded, no filler.`
}
