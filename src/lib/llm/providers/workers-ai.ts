/**
 * Cloudflare Workers AI provider adapter.
 *
 * Uses env.AI.run(modelString, ...) binding. Models are passed by their canonical
 * Cloudflare ids like '@cf/meta/llama-3.3-70b-instruct'.
 *
 * Free tier: ~10K Neurons/day. For 70B chat models that's ~400K tokens/day free.
 * In the registry we set Workers AI model costs to 0 within free tier;
 * router can revise later when we have usage metering.
 */

import type { LLMProvider, CloudflareEnv } from '@/types'

type WorkersAiTextResponse = {
  response?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export const workersAiProvider: LLMProvider = {
  id: 'workers-ai',
  async complete(input, { env }) {
    if (!env.AI) {
      throw new Error(
        'Workers AI provider requires env.AI binding (check wrangler.toml [ai])',
      )
    }

    const start = Date.now()
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
    if (input.systemPrompt) {
      messages.push({ role: 'system', content: input.systemPrompt })
    }
    messages.push({ role: 'user', content: input.userMessage })

    const runOpts: Record<string, unknown> = {
      messages,
      max_tokens: input.maxTokens ?? 2048,
    }
    if (typeof input.temperature === 'number') runOpts.temperature = input.temperature

    // ai.run is strictly typed against the union of supported model ids.
    // We accept arbitrary canonical model strings so cast to a wider runner.
    const ai = env.AI as unknown as {
      run: (model: string, opts: unknown) => Promise<WorkersAiTextResponse>
    }
    const result = await ai.run(input.modelId, runOpts)

    const latencyMs = Date.now() - start
    const text = result.response ?? ''

    const inputTokens =
      result.usage?.prompt_tokens ??
      estimateTokens(messages.map((m) => m.content).join('\n'))
    const outputTokens = result.usage?.completion_tokens ?? estimateTokens(text)

    return {
      text,
      inputTokens,
      outputTokens,
      costUsd: 0,
      latencyMs,
      providerId: 'workers-ai',
      modelId: input.modelId,
    }
  },
}

function estimateTokens(text: string): number {
  // Cheap fallback when provider doesn't echo usage. Roughly 1 token / 4 chars.
  return Math.ceil((text?.length ?? 0) / 4)
}

// Re-exported so router can pass CloudflareEnv without circular import.
export type { CloudflareEnv }
