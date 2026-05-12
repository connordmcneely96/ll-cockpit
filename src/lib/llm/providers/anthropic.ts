/**
 * Anthropic provider adapter. Wraps the existing /v1/messages call pattern
 * used throughout HERMES + orchestrator + leads pipeline.
 */

import type { LLMProvider } from '@/types'

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

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(
        `Anthropic API ${res.status}: ${errText.slice(0, 300)}`,
      )
    }

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
  },
}
