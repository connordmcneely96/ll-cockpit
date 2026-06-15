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
      throw new Error('Anthropic provider requires apiKey or ANTHROPIC_API_KEY env var')
    }

    const start = Date.now()
    const body: Record<string, unknown> = {
      model: input.modelId,
      max_tokens: input.maxTokens ?? 2048,
      // Stream to avoid the non-streaming large-max_tokens / 10-minute request limit.
      // Models support up to 64k output; non-streaming requests are rejected well below that.
      stream: true,
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

      if (res.ok && res.body) {
        // ── Parse the SSE stream: accumulate text deltas + usage ──
        let text = ''
        let inputTokens = 0
        let outputTokens = 0
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            let sep: number
            // SSE events are separated by a blank line ("\n\n")
            while ((sep = buf.indexOf('\n\n')) !== -1) {
              const rawEvent = buf.slice(0, sep)
              buf = buf.slice(sep + 2)
              const dataLine = rawEvent.split('\n').find((l) => l.startsWith('data:'))
              if (!dataLine) continue
              const payload = dataLine.slice(5).trim()
              if (!payload || payload === '[DONE]') continue
              let evt: {
                type?: string
                delta?: { type?: string; text?: string }
                message?: { usage?: { input_tokens?: number; output_tokens?: number } }
                usage?: { output_tokens?: number }
                error?: { message?: string }
              }
              try {
                evt = JSON.parse(payload)
              } catch {
                continue
              }
              switch (evt.type) {
                case 'message_start':
                  inputTokens = evt.message?.usage?.input_tokens ?? inputTokens
                  outputTokens = evt.message?.usage?.output_tokens ?? outputTokens
                  break
                case 'content_block_delta':
                  if (evt.delta?.type === 'text_delta' && typeof evt.delta.text === 'string') {
                    text += evt.delta.text
                  }
                  break
                case 'message_delta':
                  outputTokens = evt.usage?.output_tokens ?? outputTokens
                  break
                case 'error':
                  throw new Error(`Anthropic stream error: ${evt.error?.message ?? 'unknown'}`)
              }
            }
          }
        } finally {
          try {
            reader.releaseLock()
          } catch {
            /* noop */
          }
        }

        const latencyMs = Date.now() - start
        return {
          text,
          inputTokens,
          outputTokens,
          costUsd: 0, // router computes from registry
          latencyMs,
          providerId: 'anthropic',
          modelId: input.modelId,
        }
      }

      // Non-OK (or missing body) — capture for context
      const errText = await res.text()
      lastStatus = res.status
      lastError = errText.slice(0, 300)

      if (!RETRYABLE_STATUSES.has(res.status)) {
        throw new Error(`Anthropic API ${res.status}: ${lastError}`)
      }
      if (attempt === MAX_RETRIES - 1) {
        break
      }
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
