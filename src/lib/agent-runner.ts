export interface RunnerSection { title: string; color: string }

export function parseSections(full: string, sectionTitles: string[]): { title: string; body: string }[] {
  const result: { title: string; body: string }[] = []
  for (let i = 0; i < sectionTitles.length; i++) {
    const start = full.indexOf(`## ${sectionTitles[i]}`)
    if (start === -1) continue
    const contentStart = start + `## ${sectionTitles[i]}`.length
    const nextStarts = sectionTitles.slice(i + 1)
      .map(s => full.indexOf(`## ${s}`))
      .filter(idx => idx > start)
    const end = nextStarts.length ? Math.min(...nextStarts) : full.length
    result.push({ title: sectionTitles[i], body: full.slice(contentStart, end).trim() })
  }
  return result
}

export const ENGINEERING_RIGOR = `
ENGINEERING RIGOR REQUIREMENTS (mandatory — these prevent costly errors):
- CALCULATIONS: Show every calculation step with explicit units. Carry units through the arithmetic so unit errors are visible. For pressure-based calculations (NPSH, head, etc.) ALWAYS use ABSOLUTE pressure (add atmospheric, ~14.7 psia, to gauge readings) and state which you are using. Double-check that your stated inputs and your stated result are arithmetically consistent before presenting them.
- CITATIONS: NEVER fabricate a specific clause, paragraph, section, or table number. If you are not certain of the exact reference, describe the requirement and write "[VERIFY exact clause in <standard>]" instead of inventing a number. State the standard name and edition only if confident. A wrong citation is worse than no citation.
- MATERIAL/STANDARD SPECIFICS: Only cite an ASTM/API/ISO/NACE grade, table, or limit if confident it is correct. Flag uncertain specifics with "[VERIFY]". Material limits (e.g. NACE MR0175 envelopes) are nuanced — state them as conditional, not absolute, and flag for source check.
- MECHANISMS: Use correct failure-mechanism terminology. Do not apply metal-failure terms (e.g. stress corrosion cracking) to materials where the mechanism differs (e.g. cobalt binder leaching in cemented tungsten carbide).
- ASSUMPTIONS: Where input data is missing, state the assumption explicitly and flag that the conclusion depends on it. Do not invent operating data or history not provided.
- A confidently-stated wrong number or citation can put the user's professional credibility and a client relationship at risk. When uncertain, flag — do not guess.`
