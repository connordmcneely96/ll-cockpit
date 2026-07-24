// Citation-grounding enforcement for ATLAS answers. Pure, no I/O.
//
// The old guard only fired when retrieval returned literally zero chunks:
//   rejected = hasEngineeringValues(answer) && sources.length === 0 && !isInsufficient
// So a model asserting engineering values while retrieval returned 5 irrelevant chunks
// could never be rejected. This module instead checks whether the ANSWER IS GROUNDED in
// the retrieved set: it must carry [doc §section] citations, and every cited doc must
// actually be among the retrieved sources.

// Engineering value heuristic: a number followed (or not) by a known unit. Verbatim from
// the former query/route.ts — conservative, default true, only flips on a clear detection.
export const VALUE_WITH_UNIT_RE = /\b\d[\d,.]*\s*(psi|ksi|mpa|kpa|pa|lb|kg|n|mm|in|cm|m|rpm|hz|°f|°c|deg|%|kw|hp|ft)\b/i;

// Formula/symbol heuristic. FIXED from the old pattern, whose `=`-terminated alternatives
// (t\s*=, P\s*=) could never match — the trailing ASCII \b after `=` never holds — and
// whose Greek forms (σ, τ) never matched because JS \b is ASCII-only. Three branches now:
//   1. word-boundary subscript identifiers that already worked (f_y, NPSH, M_p, …)
//   2. bare Greek stress symbols σ / τ (no \b — they are non-ASCII)
//   3. a short identifier immediately followed by `=` (t =, P =, σ handled by branch 2)
export const FORMULA_KEYWORDS_RE = /(\b(f_y|s_e|k_f|L_10|h_f|NPSH|M_p|W_t|Z_x)\b|[στ]|\b[a-zA-Z]_?[a-zA-Z0-9]?\s*=)/i;

/** True when the text asserts an engineering value or formula. */
export function hasEngineeringValues(text: string): boolean {
  return VALUE_WITH_UNIT_RE.test(text) || FORMULA_KEYWORDS_RE.test(text);
}

// Citations come in two shapes because the prompt says `[doc §section]` but the chunk
// list is rendered `[N] doc=<doc> §<section> page=<p>`, so the model also mimics THAT:
//   bare:   [B31.3_piping §304.1.2]
//   doc=:   [doc=pump_hydraulic_design §6, pump_shaft_mechanical_design §(c)]
//   §-only: [§304.1.1]                      (a citation, but names no doc)
// A single bracket may carry MULTIPLE comma-separated docs. Parse in two stages: find any
// bracket group that contains a §, then pull every doc name out of that group.
const CITATION_GROUP_RE = /\[[^\]]*§[^\]]*\]/g;
const DOC_IN_GROUP_RE = /(?:doc\s*=\s*)?([A-Za-z0-9_.\-]+)\s*§/g;

/** Count bracketed citation markers (any `[… § …]` group). §-only groups still count. */
export function countCitationMarkers(text: string): number {
  return Array.from(text.matchAll(CITATION_GROUP_RE)).length;
}

/**
 * Extract the deduped doc names cited in the answer, across both citation shapes and
 * multi-doc groups. A group that names no doc before its § (e.g. "[§304.1.1]") contributes
 * nothing — that is a valid section-only citation, not an error.
 */
export function extractCitedDocs(text: string): string[] {
  const docs = new Set<string>();
  for (const group of text.matchAll(CITATION_GROUP_RE)) {
    for (const m of group[0].matchAll(DOC_IN_GROUP_RE)) {
      if (m[1]) docs.add(m[1]);
    }
  }
  return Array.from(docs);
}

export interface GroundingArgs {
  answerText: string;
  sources: { doc: string }[];
  isInsufficient: boolean;
}

export interface GroundingResult {
  rejected: boolean;
  reject_reason: string | null;
}

const PASS: GroundingResult = { rejected: false, reject_reason: null };

/**
 * Decide whether an answer is grounded in its retrieved sources. Rules, first match wins:
 *   1. insufficient-sources answer            → pass (the model correctly declined)
 *   2. no engineering values asserted         → pass (nothing to ground)
 *   3. asserts values but 0 sources retrieved → reject (the original outage case)
 *   4. asserts values but cites nothing       → reject
 *   5. cites a doc not among retrieved sources → reject, naming the offending doc(s)
 *   6. otherwise                              → pass
 */
export function evaluateGrounding(args: GroundingArgs): GroundingResult {
  const { answerText, sources, isInsufficient } = args;

  if (isInsufficient) return PASS;
  if (!hasEngineeringValues(answerText)) return PASS;

  if (sources.length === 0) {
    return {
      rejected: true,
      reject_reason: "Answer asserts engineering values but no sources were retrieved.",
    };
  }

  // A section-only citation ("[§304.1.1]") is still a citation, so gate rule 4 on the
  // presence of ANY citation marker, not on named docs. Only a FABRICATED doc name
  // (below, rule 5) should trip on doc identity.
  if (countCitationMarkers(answerText) === 0) {
    return {
      rejected: true,
      reject_reason: "Answer asserts engineering values without any [doc §section] citation.",
    };
  }

  const cited = extractCitedDocs(answerText);

  const retrievedDocs = new Set(sources.map((s) => s.doc));
  const unknown = cited.filter((d) => !retrievedDocs.has(d));
  if (unknown.length > 0) {
    return {
      rejected: true,
      reject_reason: `Answer cites documents not present in retrieved sources: ${unknown.join(", ")}.`,
    };
  }

  return PASS;
}
