// Claude Sonnet 4-6 pricing
const INPUT_COST_PER_MILLION = 3.0   // $3.00 / 1M input tokens
const OUTPUT_COST_PER_MILLION = 15.0 // $15.00 / 1M output tokens

export const SESSION_TOKEN_LIMIT = 100_000

export function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(3)}¢`
  return `$${usd.toFixed(4)}`
}

export function tokenBudgetPercent(tokensUsed: number): number {
  return Math.min(100, (tokensUsed / SESSION_TOKEN_LIMIT) * 100)
}

export function tokenBudgetColor(tokensUsed: number): 'green' | 'yellow' | 'red' {
  const pct = tokenBudgetPercent(tokensUsed)
  if (pct >= 80) return 'red'
  if (pct >= 50) return 'yellow'
  return 'green'
}
