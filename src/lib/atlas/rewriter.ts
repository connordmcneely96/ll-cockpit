// Query rewriter — "Middle Management" pattern.
// Calls Llama 3.1 8B to expand an engineering question into 3-5 semantic variants.
// On any failure (model error, JSON parse) falls back to [original] so retrieval
// is never blocked by a rewriter failure.

type LlamaEnv = {
  AI: { run: (model: string, opts: { messages: { role: string; content: string }[]; max_tokens: number }) => Promise<{ response?: string }> };
};

const REWRITER_MODEL = "@cf/meta/llama-3.1-8b-instruct";

const SYSTEM_PROMPT =
  "You are an engineering search assistant. Expand the given engineering query into 3 to 5 alternative phrasings that capture synonyms, relevant standard names (ASME, API, NEMA, AGMA, AISC, AWS, ISO), and technical variants. Return ONLY a JSON array of strings with no prose, no markdown fences, no explanation. Example output: [\"variant 1\",\"variant 2\",\"variant 3\"]";

function stripFences(s: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

export async function rewriteQuery(env: LlamaEnv, question: string): Promise<string[]> {
  try {
    const result = await env.AI.run(REWRITER_MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
      max_tokens: 256,
    });

    const raw = result.response?.trim() ?? "";
    if (!raw) return [question];

    const cleaned = stripFences(raw);
    const parsed = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(parsed)) return [question];

    const variants = (parsed as unknown[])
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map(v => v.trim())
      .slice(0, 5);

    if (variants.length === 0) return [question];

    // Always include original as the first element; deduplicate
    const seen = new Set<string>();
    const final: string[] = [];
    for (const v of [question, ...variants]) {
      const key = v.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        final.push(v);
      }
    }

    return final.slice(0, 5);
  } catch {
    // Graceful degradation — rewriter failure must never break retrieval
    return [question];
  }
}
