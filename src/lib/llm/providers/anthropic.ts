/**
 * Anthropic provider adapter — Sprint 18G v1.1 with retry/backoff
 *
 * Retries 429 (rate_limit_error) and 529 (overloaded_error) with exponential
 * backoff before giving up. Other errors propagate immediately so the router
 * can try a fallback model.
 *
 * Retry strategy:
 *   - 3 attempts max per model
 *   - Backoff: 1s, 3s, 9s (3x exponential)
 *   - 429: parse `retry-after` header if present, else exponential
 *   - 529: pure exponential (Anthropic overloaded, no precise timing)
 *   - Anything else: throw immediately (no retry — let router fallback)
 */

import type { LLMProvider } from '@/types'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000  // 1 second
const BACKOFF_MULTIPLIER = 3

const RETRYABLE_STATUSES = new Set([429, 529])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Compute delay before retry attempt N (0-indexed).
 * If server provides Retry-After header (in seconds), honor it.
 * Otherwise exponential backoff.
 */
function computeBackoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number.parseInt(retryAfterHeader, 10)
    if (Number.isFinite(seconds) && seconds > 0 && seconds < 60) {
      return seconds * 1000
    }
  }
  return BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt)
}

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',
  async complete(input, { env, apiKey }) {
    const key = apiKey ?? env.ANTHROPIC_API_KEY
    if (!key) {
      throw new Error(
        'Anthropic provider requires apiKey or ANTHROPIC_API_KEY env var',
      )
    }

    const start = Date.now()
    const body: Record<string, unknown> = {
      model: input.modelId,
      max_tokens: input.maxTokens ?? 2048,
      messages: [{ role: 'user', content: input.userMessage }],
    }
    if (input.systemPrompt) body.system = input.systemPrompt
    if (typeof input.temperature === 'number') body.temperature = input.temperature

    let lastError: string | null = null
    let lastStatus: number | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = (await res.json()) as {
          content: Array<{ type: string; text?: string }>
          usage: { input_tokens: number; output_tokens: number }
        }
        const latencyMs = Date.now() - start
        const text = data.content.find((c) => c.type === 'text')?.text ?? ''
        return {
          text,
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          costUsd: 0, // router computes from registry
          latencyMs,
          providerId: 'anthropic',
          modelId: input.modelId,
        }
      }

      // Non-OK response — capture body for context
      const errText = await res.text()
      lastStatus = res.status
      lastError = errText.slice(0, 300)

      // Decide whether to retry
      if (!RETRYABLE_STATUSES.has(res.status)) {
        // Non-retryable error — let router fall back to next model
        throw new Error(`Anthropic API ${res.status}: ${lastError}`)
      }

      // Retryable — but did we exhaust attempts?
      if (attempt === MAX_RETRIES - 1) {
        break
      }

      // Wait and retry
      const retryAfter = res.headers.get('retry-after')
      const delayMs = computeBackoffMs(attempt, retryAfter)
      console.warn(
        `Anthropic ${res.status} on ${input.modelId} (attempt ${attempt + 1}/${MAX_RETRIES}). ` +
        `Retrying after ${delayMs}ms. retry-after=${retryAfter}`,
      )
      await sleep(delayMs)
    }

    throw new Error(
      `Anthropic API ${lastStatus} after ${MAX_RETRIES} retries: ${lastError ?? 'no body'}`,
    )
  },
}
