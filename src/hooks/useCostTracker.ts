'use client'

import { useUiStore } from '@/stores/uiStore'
import { tokenBudgetPercent, tokenBudgetColor, formatCost, SESSION_TOKEN_LIMIT } from '@/lib/cost'

export function useCostTracker() {
  const { totalSessionTokens, totalSessionCost } = useUiStore()

  const percent = tokenBudgetPercent(totalSessionTokens)
  const color = tokenBudgetColor(totalSessionTokens)
  const remaining = SESSION_TOKEN_LIMIT - totalSessionTokens
  const formattedCost = formatCost(totalSessionCost)

  return {
    totalTokens: totalSessionTokens,
    totalCost: totalSessionCost,
    formattedCost,
    percent,
    color,
    remaining,
    limit: SESSION_TOKEN_LIMIT,
  }
}
