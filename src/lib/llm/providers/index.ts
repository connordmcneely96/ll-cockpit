/**
 * LLM provider registry. Each provider exposes a unified `complete()` interface
 * that the router can call regardless of underlying API shape.
 *
 * Cost is intentionally NOT computed by providers — the router does it from the
 * ai_models registry so pricing stays centralized and editable.
 */

import type { LLMProvider, LLMProviderId } from '@/types'
import { anthropicProvider } from './anthropic'
import { workersAiProvider } from './workers-ai'

const PROVIDERS: Record<string, LLMProvider> = {
  anthropic: anthropicProvider,
  'workers-ai': workersAiProvider,
}

export function getProvider(id: LLMProviderId): LLMProvider | undefined {
  return PROVIDERS[id]
}

export function getAllProviders(): LLMProvider[] {
  return Object.values(PROVIDERS)
}

export function listProviderIds(): string[] {
  return Object.keys(PROVIDERS)
}
