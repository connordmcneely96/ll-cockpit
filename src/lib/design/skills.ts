// Sprint 18Y-Followup — Canonical allowlist of skill slugs that the rendered
// HTML knows how to inject. Adding a new skill: (1) implement the injection
// inside renderFullHtml in src/lib/design/pipeline.ts, (2) add the slug here,
// (3) optionally surface a chip in DesignClient.tsx.
//
// IMPORTANT: the strings here must EXACTLY match the substring checks done
// inside renderFullHtml (currently `skills.includes('tweaks-panel')`).
// Drift between this allowlist and renderFullHtml = silent panel-stripping.
export const KNOWN_SKILLS = ['tweaks-panel'] as const
export type KnownSkill = (typeof KNOWN_SKILLS)[number]

// Sprint 18Y-Followup — Validate body.skills against KNOWN_SKILLS allowlist.
// Returns the canonical JSON-stringified array (or null for empty/missing)
// and an error string on rejection. Single source of truth — both POST and
// PATCH consume this so the validation contract stays uniform.
export function validateSkills(input: unknown):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: null }
  if (!Array.isArray(input)) {
    return { ok: false, error: 'skills must be an array of strings or omitted' }
  }
  if (input.length === 0) return { ok: true, value: null }
  for (const item of input) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'every entry in skills must be a string' }
    }
    if (!(KNOWN_SKILLS as readonly string[]).includes(item)) {
      return {
        ok: false,
        error: `unknown skill "${item}". Known skills: ${KNOWN_SKILLS.join(', ')}`,
      }
    }
  }
  // Dedupe — set semantics, ordering preserved by first-occurrence
  const unique = Array.from(new Set(input as string[]))
  return { ok: true, value: JSON.stringify(unique) }
}
